import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createCrmAdminClient } from '@/lib/crm/supabase/admin';
import { logger } from '@/lib/utils/logger';
import type {
  CanalOrigine,
  InitiateurContact,
  JalonCalendrierKey,
  RoleDecisionContact,
  TypeFormation,
  TypeProspect,
} from '@/lib/utils/constants';
import type { Database, Json } from '@/types/database';

export type PassationSynthese =
  Database['public']['Tables']['document_synthese']['Row'];

/**
 * Recommandation d'affectation (section 8) : table dédiée, RLS
 * pipeline/admin uniquement — jamais lisible par le CDP affecté.
 */
export type PassationReco =
  Database['public']['Tables']['document_synthese_reco']['Row'];

type Supabase = SupabaseClient<Database>;

/**
 * Snapshot versionné du document de synthèse de passation, figé dans
 * `document_synthese.contenu` à la génération. Autoporteur : le rendu PDF et
 * la consultation ne re-lisent JAMAIS les tables commerciales (qui
 * disparaîtront en Phase 2 CRM). Les clés d'enums sont stockées brutes, les
 * labels sont appliqués au rendu.
 *
 * Les saisies manuelles du Développeur (sections 6 et 8) ne font PAS partie du
 * snapshot : elles vivent dans des colonnes dédiées de `document_synthese`
 * (cf. SyntheseSaisies) pour que la section 8 ne transite jamais vers le CDP.
 */
export interface SyntheseSnapshotV2 {
  version: 2;
  meta: {
    referenceDossier: string;
    numeroContrat: string | null;
    dateSignature: string | null;
    dateProduction: string;
    developpeur: string | null;
    tunnel: TypeProspect | null;
  };
  identite: {
    raisonSociale: string;
    formeJuridique: string | null;
    siren: string | null;
    siret: string | null;
    siege: string | null;
    codeNaf: string | null;
    nafLibelle: string | null;
    region: string | null;
    siteWeb: string | null;
    effectif: string | null;
    nbImplantations: number | null;
    caDernierExercice: number | null;
  };
  contacts: Array<{
    nom: string;
    poste: string | null;
    email: string | null;
    telephone: string | null;
    role: RoleDecisionContact | null;
    sensibilites: string | null;
  }>;
  historique: {
    canal: CanalOrigine | null;
    datePremierContact: string | null;
    initiateur: InitiateurContact | null;
    evolution: string | null;
    rdvs: Array<{
      date: string | null;
      type: string | null;
      statut: string | null;
      objet: string | null;
    }>;
  };
  engagements: {
    perimetre: string | null;
    formationsRncp: string[];
    typeFormation: TypeFormation | null;
    tauxNpec: number | null;
    dureeAns: number | null;
    moisDemarrage: number | null;
    volumeAn1: number | null;
    volumeAn2: number | null;
    volumeAn3: number | null;
    volumeGarantiSeuil: number | null;
    leviers: string[];
  };
  calendrier: Partial<Record<JalonCalendrierKey, string>>;
  documents: Array<{ label: string; present: boolean }>;
}

/**
 * Saisies manuelles du Développeur : section 6 sur document_synthese
 * (points_vigilance, promesses_orales), section 8 sur document_synthese_reco.
 * Vue agrégée consommée par le rendu PDF (variante complète uniquement pour
 * la partie section 8).
 */
export type SyntheseSaisies = Pick<
  PassationSynthese,
  'points_vigilance' | 'promesses_orales'
> &
  Pick<
    PassationReco,
    | 'typologie_client'
    | 'charge_previsionnelle'
    | 'risque_churn'
    | 'cdp_ideal'
    | 'cdp_a_eviter'
    | 'notes_inter_equipe'
  >;

const DOCUMENTS_JOINTS_LABELS = [
  'Contrat-cadre signé (PDF)',
  'Annexe 2 - Rémunération (PDF)',
  'Présentation Soluvia personnalisée (PDF)',
  'Mail de cadrage (PDF)',
  "Fichier AlternaRH + résultats d'éligibilité",
  'Mail post-audit (PDF)',
  'Mail post-signature (PDF)',
] as const;

function str(v: unknown): string | null {
  return typeof v === 'string' && v !== '' ? v : null;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function strArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}

/** Dernière synthèse de passation produite pour un prospect (ou null). */
export async function getSyntheseByProspect(
  prospectId: string,
): Promise<PassationSynthese | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('document_synthese')
    .select('*')
    .eq('prospect_id', prospectId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.error('queries.passation', 'getSyntheseByProspect failed', {
      prospectId,
      error,
    });
    return null;
  }
  return data;
}

/**
 * Construit le snapshot V2 depuis la fiche prospect. SEULE fonction de ce
 * module couplée aux tables commerciales : en Phase 2 CRM, une
 * `buildSyntheseSnapshotFromOpportunite` la remplacera sans toucher au rendu
 * ni au workflow. Renvoie null si le prospect est introuvable.
 */
export async function buildSyntheseSnapshotFromProspect(
  supabase: Supabase,
  prospectId: string,
): Promise<{
  snapshot: SyntheseSnapshotV2;
  clientId: string | null;
  commercialId: string | null;
  signature: { id: string; signedAt: string | null } | null;
} | null> {
  const { data: prospect, error } = await supabase
    .from('prospects')
    .select('*')
    .eq('id', prospectId)
    .single();

  if (error || !prospect) {
    logger.error('queries.passation', 'buildSyntheseSnapshot prospect failed', {
      prospectId,
      error,
    });
    return null;
  }

  const [contactsRes, rdvsRes, signatureRes] = await Promise.all([
    supabase
      .from('prospect_contacts')
      .select('*')
      .eq('prospect_id', prospectId)
      .order('created_at', { ascending: true }),
    supabase
      .from('rdv_commerciaux')
      .select('*')
      .eq('prospect_id', prospectId)
      .order('date_prevue', { ascending: true }),
    supabase
      .from('signature_requests')
      .select('id, signed_at, signed_document_path')
      .eq('prospect_id', prospectId)
      .eq('statut', 'signee')
      .order('signed_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  let developpeur: string | null = null;
  if (prospect.commercial_id) {
    const { data } = await supabase
      .from('users')
      .select('nom, prenom')
      .eq('id', prospect.commercial_id)
      .maybeSingle();
    if (data) developpeur = `${data.prenom} ${data.nom}`;
  }

  let raisonSociale = prospect.nom;
  if (prospect.client_id) {
    const { data } = await supabase
      .from('clients')
      .select('raison_sociale')
      .eq('id', prospect.client_id)
      .maybeSingle();
    if (data?.raison_sociale) raisonSociale = data.raison_sociale;
  }

  const signature = signatureRes.data;
  const referenceYear = new Date(
    signature?.signed_at ?? prospect.created_at,
  ).getFullYear();

  const calendrierRaw =
    prospect.calendrier_previsionnel &&
    typeof prospect.calendrier_previsionnel === 'object' &&
    !Array.isArray(prospect.calendrier_previsionnel)
      ? (prospect.calendrier_previsionnel as Record<string, unknown>)
      : {};
  const calendrier: Partial<Record<JalonCalendrierKey, string>> = {};
  for (const [k, v] of Object.entries(calendrierRaw)) {
    const s = str(v);
    if (s) calendrier[k as JalonCalendrierKey] = s;
  }

  const snapshot: SyntheseSnapshotV2 = {
    version: 2,
    meta: {
      referenceDossier: `SLV-${referenceYear}-${prospect.id.slice(0, 8).toUpperCase()}`,
      numeroContrat: str(prospect.numero_contrat),
      dateSignature: signature?.signed_at ?? null,
      dateProduction: new Date().toISOString(),
      developpeur,
      tunnel: prospect.type_prospect,
    },
    identite: {
      raisonSociale,
      formeJuridique: str(prospect.forme_juridique),
      siren: str(prospect.siren),
      siret: str(prospect.siret),
      siege: str(prospect.adresse),
      codeNaf: str(prospect.code_naf),
      nafLibelle: str(prospect.naf_libelle),
      region: str(prospect.region),
      siteWeb: str(prospect.site_web),
      effectif: str(prospect.effectif_tranche),
      nbImplantations: num(prospect.nb_implantations),
      caDernierExercice: num(prospect.ca_dernier_exercice),
    },
    contacts: (contactsRes.data ?? []).map((c) => ({
      nom: c.nom,
      poste: str(c.poste),
      email: str(c.email),
      telephone: str(c.telephone),
      role: (c.role_decision as RoleDecisionContact | null) ?? null,
      sensibilites: str(c.sensibilites),
    })),
    historique: {
      canal: (prospect.canal_origine as CanalOrigine | null) ?? null,
      datePremierContact: str(prospect.date_premier_contact),
      initiateur: (prospect.initiateur as InitiateurContact | null) ?? null,
      evolution: str(prospect.historique_synthese),
      rdvs: (rdvsRes.data ?? []).map((r) => ({
        date: r.date_realisee ?? r.date_prevue,
        type: r.type_rdv,
        statut: r.statut,
        objet: str(r.objet),
      })),
    },
    engagements: {
      perimetre: str(prospect.perimetre_missions),
      formationsRncp: strArray(prospect.formations_rncp),
      typeFormation: (prospect.type_formation as TypeFormation | null) ?? null,
      tauxNpec: num(prospect.taux_npec),
      dureeAns: num(prospect.duree_contrat_ans),
      moisDemarrage: num(prospect.mois_demarrage),
      volumeAn1: num(prospect.volume_an1),
      volumeAn2: num(prospect.volume_an2),
      volumeAn3: num(prospect.volume_an3),
      volumeGarantiSeuil: num(prospect.volume_garanti_seuil),
      leviers: strArray(prospect.leviers),
    },
    calendrier,
    documents: DOCUMENTS_JOINTS_LABELS.map((label, i) => ({
      label,
      present: i === 0 ? Boolean(signature?.signed_document_path) : false,
    })),
  };

  return {
    snapshot,
    clientId: prospect.client_id,
    commercialId: prospect.commercial_id,
    signature: signature
      ? { id: signature.id, signedAt: signature.signed_at }
      : null,
  };
}

/**
 * Jumeau de `buildSyntheseSnapshotFromProspect` côté CRM (Phase 2, pont A2).
 * Construit le snapshot V2 depuis une opportunité `crm.*` (compte enrichi INSEE,
 * contacts, RDV, champs négociation) au lieu d'un prospect. Lit `crm` via un
 * client admin service-role (le schéma `crm` n'est pas couvert par la RLS
 * `public`), et `public.users`/`public.clients` via l'admin public. Renvoie null
 * si l'opportunité est introuvable. La signature reste null en Lot B (elle
 * deviendra client-based en Lot C).
 */
export async function buildSyntheseSnapshotFromOpportunite(
  oppId: string,
): Promise<{
  snapshot: SyntheseSnapshotV2;
  clientId: string | null;
  commercialId: string | null;
  signature: { id: string; signedAt: string | null } | null;
} | null> {
  const crm = createCrmAdminClient();
  const pub = createAdminClient();

  const { data: opp, error } = await crm
    .from('opportunites')
    .select('*')
    .eq('id', oppId)
    .single();
  if (error || !opp) {
    logger.error(
      'queries.passation',
      'buildSyntheseSnapshot opportunite failed',
      {
        oppId,
        error,
      },
    );
    return null;
  }

  const [compteRes, contactsRes, rdvsRes, adressesRes] = await Promise.all([
    crm.from('comptes').select('*').eq('id', opp.compte_id).maybeSingle(),
    crm
      .from('contacts')
      .select('*')
      .eq('compte_id', opp.compte_id)
      .order('created_at', { ascending: true }),
    crm
      .from('rdv')
      .select('*')
      .eq('opportunite_id', oppId)
      .order('debut', { ascending: true }),
    crm
      .from('adresses')
      .select('*')
      .eq('compte_id', opp.compte_id)
      .order('principal', { ascending: false }),
  ]);
  const compte = compteRes.data;
  const adressePrincipale = (adressesRes.data ?? [])[0] ?? null;

  let developpeur: string | null = null;
  if (opp.owner_id) {
    const { data } = await pub
      .from('users')
      .select('nom, prenom')
      .eq('id', opp.owner_id)
      .maybeSingle();
    if (data) developpeur = `${data.prenom} ${data.nom}`.trim();
  }

  let raisonSociale = compte?.nom ?? '-';
  if (opp.client_id) {
    const { data } = await pub
      .from('clients')
      .select('raison_sociale')
      .eq('id', opp.client_id)
      .maybeSingle();
    if (data?.raison_sociale) raisonSociale = data.raison_sociale;
  }

  const referenceYear = new Date(opp.created_at).getFullYear();

  const calendrierRaw =
    opp.calendrier_previsionnel &&
    typeof opp.calendrier_previsionnel === 'object' &&
    !Array.isArray(opp.calendrier_previsionnel)
      ? (opp.calendrier_previsionnel as Record<string, unknown>)
      : {};
  const calendrier: Partial<Record<JalonCalendrierKey, string>> = {};
  for (const [k, v] of Object.entries(calendrierRaw)) {
    const s = str(v);
    if (s) calendrier[k as JalonCalendrierKey] = s;
  }

  const snapshot: SyntheseSnapshotV2 = {
    version: 2,
    meta: {
      referenceDossier: `SLV-${referenceYear}-${opp.id.slice(0, 8).toUpperCase()}`,
      numeroContrat: str(opp.numero_contrat),
      dateSignature: null,
      dateProduction: new Date().toISOString(),
      developpeur,
      tunnel: (opp.type_prospect as TypeProspect | null) ?? null,
    },
    identite: {
      raisonSociale,
      formeJuridique: str(compte?.forme_juridique),
      siren: str(compte?.siren),
      siret: str(compte?.siret),
      siege: str(compte?.adresse),
      codeNaf: str(compte?.code_naf),
      nafLibelle: str(compte?.naf_libelle),
      region: str(adressePrincipale?.region),
      siteWeb: str(compte?.site_web),
      effectif: str(compte?.effectif_tranche),
      nbImplantations: num(compte?.nb_implantations),
      caDernierExercice: num(compte?.ca_dernier_exercice),
    },
    contacts: (contactsRes.data ?? []).map((c) => ({
      nom: `${c.prenom ?? ''} ${c.nom ?? ''}`.trim() || '-',
      poste: str(c.fonction),
      email: str(c.email),
      telephone: str(c.telephone),
      role: (c.role_decision as RoleDecisionContact | null) ?? null,
      sensibilites: str(c.sensibilites),
    })),
    historique: {
      canal: (opp.canal_origine as CanalOrigine | null) ?? null,
      datePremierContact: str(opp.date_premier_contact),
      initiateur: (opp.initiateur as InitiateurContact | null) ?? null,
      evolution: str(opp.historique_synthese),
      rdvs: (rdvsRes.data ?? []).map((r) => ({
        date: r.debut,
        type: null,
        statut: r.statut,
        objet: str(r.titre),
      })),
    },
    engagements: {
      perimetre: str(opp.perimetre_missions),
      formationsRncp: strArray(opp.formations_rncp),
      typeFormation: (opp.type_formation as TypeFormation | null) ?? null,
      tauxNpec: num(opp.taux_npec),
      dureeAns: num(opp.duree_contrat_ans),
      moisDemarrage: num(opp.mois_demarrage),
      volumeAn1: num(opp.volume_an1),
      volumeAn2: num(opp.volume_an2),
      volumeAn3: num(opp.volume_an3),
      volumeGarantiSeuil: num(opp.volume_garanti_seuil),
      leviers: strArray(opp.leviers),
    },
    calendrier,
    documents: DOCUMENTS_JOINTS_LABELS.map((label) => ({
      label,
      present: false,
    })),
  };

  return {
    snapshot,
    clientId: opp.client_id,
    commercialId: opp.owner_id,
    signature: null,
  };
}

/* Formes minimales du snapshot V1 historique (Rows bruts sérialisés). */
interface SnapshotV1 {
  prospect?: Record<string, unknown>;
  commercial?: { nom?: unknown; prenom?: unknown } | null;
  client?: { raison_sociale?: unknown } | null;
  contacts?: Array<Record<string, unknown>>;
  rdvs?: Array<Record<string, unknown>>;
  signature?: Record<string, unknown> | null;
  referenceDossier?: unknown;
  dateProduction?: unknown;
}

/**
 * Normalise un `contenu` JSONB en SyntheseSnapshotV2 : passe-plat si déjà V2,
 * adaptateur pour les snapshots V1 historiques (Rows bruts). Les champs
 * absents en V1 sortent null / vides.
 */
export function normalizeSnapshot(contenu: Json | null): SyntheseSnapshotV2 {
  const empty: SyntheseSnapshotV2 = {
    version: 2,
    meta: {
      referenceDossier: '-',
      numeroContrat: null,
      dateSignature: null,
      dateProduction: '',
      developpeur: null,
      tunnel: null,
    },
    identite: {
      raisonSociale: '-',
      formeJuridique: null,
      siren: null,
      siret: null,
      siege: null,
      codeNaf: null,
      nafLibelle: null,
      region: null,
      siteWeb: null,
      effectif: null,
      nbImplantations: null,
      caDernierExercice: null,
    },
    contacts: [],
    historique: {
      canal: null,
      datePremierContact: null,
      initiateur: null,
      evolution: null,
      rdvs: [],
    },
    engagements: {
      perimetre: null,
      formationsRncp: [],
      typeFormation: null,
      tauxNpec: null,
      dureeAns: null,
      moisDemarrage: null,
      volumeAn1: null,
      volumeAn2: null,
      volumeAn3: null,
      volumeGarantiSeuil: null,
      leviers: [],
    },
    calendrier: {},
    documents: DOCUMENTS_JOINTS_LABELS.map((label) => ({
      label,
      present: false,
    })),
  };

  if (!contenu || typeof contenu !== 'object' || Array.isArray(contenu)) {
    return empty;
  }

  const raw = contenu as Record<string, unknown>;
  if (raw.version === 2) {
    // Déjà au format courant : on fait confiance au producteur (nous-mêmes).
    return raw as unknown as SyntheseSnapshotV2;
  }

  // Adaptation V1 (Rows bruts : prospect, contacts, rdvs, signature...).
  const v1 = raw as SnapshotV1;
  const p = v1.prospect ?? {};
  const signature = v1.signature ?? null;

  const developpeur =
    v1.commercial && (v1.commercial.prenom || v1.commercial.nom)
      ? `${str(v1.commercial.prenom) ?? ''} ${str(v1.commercial.nom) ?? ''}`.trim()
      : null;

  return {
    ...empty,
    meta: {
      referenceDossier: str(v1.referenceDossier) ?? '-',
      numeroContrat: null,
      dateSignature: signature ? str(signature.signed_at) : null,
      dateProduction: str(v1.dateProduction) ?? '',
      developpeur,
      tunnel: (str(p.type_prospect) as TypeProspect | null) ?? null,
    },
    identite: {
      raisonSociale: str(v1.client?.raison_sociale) ?? str(p.nom) ?? '-',
      formeJuridique: str(p.forme_juridique),
      siren: str(p.siren),
      siret: str(p.siret),
      siege: str(p.adresse),
      codeNaf: str(p.code_naf),
      nafLibelle: str(p.naf_libelle),
      region: str(p.region),
      siteWeb: str(p.site_web),
      effectif: str(p.effectif_tranche),
      nbImplantations: null,
      caDernierExercice: null,
    },
    contacts: (v1.contacts ?? []).map((c) => ({
      nom: str(c.nom) ?? '-',
      poste: str(c.poste),
      email: str(c.email),
      telephone: str(c.telephone),
      role: (str(c.role_decision) as RoleDecisionContact | null) ?? null,
      sensibilites: str(c.sensibilites),
    })),
    historique: {
      canal: (str(p.canal_origine) as CanalOrigine | null) ?? null,
      datePremierContact: null,
      initiateur: null,
      evolution: null,
      rdvs: (v1.rdvs ?? []).map((r) => ({
        date: str(r.date_realisee) ?? str(r.date_prevue),
        type: str(r.type_rdv),
        statut: str(r.statut),
        objet: str(r.objet),
      })),
    },
    engagements: {
      perimetre: str(p.perimetre_missions),
      formationsRncp: [],
      typeFormation: null,
      tauxNpec: num(p.taux_npec),
      dureeAns: num(p.duree_contrat_ans),
      moisDemarrage: num(p.mois_demarrage),
      volumeAn1: num(p.volume_an1),
      volumeAn2: num(p.volume_an2),
      volumeAn3: num(p.volume_an3),
      volumeGarantiSeuil: num(p.volume_garanti_seuil),
      leviers: strArray(p.leviers),
    },
    documents: DOCUMENTS_JOINTS_LABELS.map((label, i) => ({
      label,
      present: i === 0 ? Boolean(signature?.signed_document_path) : false,
    })),
  };
}

/**
 * Agrège les saisies sections 6 + 8. `reco` est null quand le lecteur n'a pas
 * accès à la section 8 (CDP affecté) ou qu'elle n'a pas encore été remplie.
 */
export function saisiesOf(
  synthese: PassationSynthese,
  reco: PassationReco | null,
): SyntheseSaisies {
  return {
    points_vigilance: synthese.points_vigilance,
    promesses_orales: synthese.promesses_orales,
    typologie_client: reco?.typologie_client ?? null,
    charge_previsionnelle: reco?.charge_previsionnelle ?? null,
    risque_churn: reco?.risque_churn ?? null,
    cdp_ideal: reco?.cdp_ideal ?? null,
    cdp_a_eviter: reco?.cdp_a_eviter ?? null,
    notes_inter_equipe: reco?.notes_inter_equipe ?? null,
  };
}

/** Recommandation (section 8) d'une synthèse — lecture pipeline/admin. */
export async function getRecoBySynthese(
  syntheseId: string,
): Promise<PassationReco | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('document_synthese_reco')
    .select('*')
    .eq('synthese_id', syntheseId)
    .maybeSingle();
  if (error) {
    logger.error('queries.passation', 'getRecoBySynthese failed', {
      syntheseId,
      error,
    });
    return null;
  }
  return data;
}
