import { unstable_cache } from 'next/cache';
import { createCrmClient } from '@/lib/crm/supabase/server';
import { createCrmAdminClient } from '@/lib/crm/supabase/admin';
import { fetchCrmUsers } from '@/lib/crm/queries/_users';
import type {
  ActiviteType,
  CrmRoleDecision,
  CrmTypeFormation,
  CrmCanalOrigine,
  CrmInitiateur,
  CrmTypeProspect,
} from '@/lib/crm/database.types';
import type { OppStatut, RdvStatut, Priorite } from '@/lib/crm/domain/enums';

/**
 * Étapes actives, cachées inter-requêtes (config quasi immuable, sinon refetchée
 * à chaque rendu de pipeline/dashboard/récap). Lecture via le client service-role :
 * `cookies()` est interdit dans unstable_cache, et `etapes` ne contient rien de
 * sensible (libellés/couleurs/ordre). Aucune action n'écrit etapes aujourd'hui
 * (écriture réservée admin en DB) ; si ça arrive un jour, invalider
 * avec `revalidateTag("etapes")`. TTL 1 h en filet.
 */
export const listEtapes = unstable_cache(
  async () => {
    const supabase = createCrmAdminClient();
    const { data, error } = await supabase
      .from('etapes')
      .select('*')
      .eq('actif', true)
      .order('ordre');
    if (error) throw error;
    return data ?? [];
  },
  ['etapes-actives'],
  { tags: ['etapes'], revalidate: 3600 },
);

// L'identité commerciale (owner) vit dans `public.users` (SOLUVIA) : PostgREST
// ne résout pas les embeds cross-schéma, on sélectionne la FK brute (owner_id)
// et on recolle prenom/nom en JS (nom affichable recomposé côté consommateur).
const OPP_LIST_BASE = `id, intitule, probabilite, statut, etape_id, date_cloture_prevue, nb_alternants,
  owner_id`;

export type OppListItem = {
  id: string;
  intitule: string;
  probabilite: number | null;
  statut: OppStatut;
  etape_id: string;
  date_cloture_prevue: string | null;
  nb_alternants: number | null;
  owner: { prenom: string | null; nom: string | null } | null;
  compte: {
    id: string;
    nom: string;
    adresses: { departement: string | null; region: string | null }[];
  } | null;
};

export async function listOpportunites(): Promise<OppListItem[]> {
  const supabase = await createCrmClient();
  // Enrichi avec les zones (adresses) de la société pour le filtre du pipeline.
  const { data, error } = await supabase
    .from('opportunites')
    .select(
      `${OPP_LIST_BASE}, compte:comptes(id, nom, adresses(departement, region))`,
    )
    .order('created_at', { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as unknown as (Omit<OppListItem, 'owner'> & {
    owner_id: string | null;
  })[];
  const users = await fetchCrmUsers(rows.map((r) => r.owner_id));
  return rows.map(({ owner_id, ...r }) => {
    const u = owner_id ? users.get(owner_id) : undefined;
    return { ...r, owner: u ? { prenom: u.prenom, nom: u.nom } : null };
  });
}

export type OppDetailContact = {
  id: string;
  prenom: string | null;
  nom: string | null;
  email: string | null;
  telephone: string | null;
  principal: boolean;
  role_decision: CrmRoleDecision | null;
  sensibilites: string | null;
};
export type OppDetailAdresse = {
  id: string;
  libelle: string | null;
  ville: string | null;
  departement: string | null;
  region: string | null;
  principal: boolean;
};
export type OppDetailActivite = {
  id: string;
  type: ActiviteType;
  contenu: string;
  created_at: string;
  auteur: { prenom: string | null; nom: string | null } | null;
};
export type OppDetailRelance = {
  id: string;
  titre: string;
  date_echeance: string;
  fait: boolean;
  priorite: Priorite;
};
export type OppDetailRdv = {
  id: string;
  titre: string;
  debut: string;
  statut: RdvStatut;
};
export type OppDetail = {
  id: string;
  intitule: string;
  statut: OppStatut;
  etape_id: string;
  probabilite: number | null;
  formation_visee: string | null;
  nb_alternants: number | null;
  source: string | null;
  date_cloture_prevue: string | null;
  cfa: string | null;
  date_cible_prochain_rdv: string | null;
  // Négociation / passation (A2/A4)
  perimetre_missions: string | null;
  formations_rncp: string[];
  type_formation: CrmTypeFormation | null;
  taux_npec: number | null;
  duree_contrat_ans: number | null;
  mois_demarrage: number | null;
  volume_an1: number | null;
  volume_an2: number | null;
  volume_an3: number | null;
  volume_garanti_seuil: number | null;
  leviers: string[];
  canal_origine: CrmCanalOrigine | null;
  date_premier_contact: string | null;
  initiateur: CrmInitiateur | null;
  historique_synthese: string | null;
  numero_contrat: string | null;
  type_prospect: CrmTypeProspect | null;
  compte: {
    id: string;
    nom: string;
    nombre_collaborateurs: number | null;
    // Identité / INSEE (A2/A4)
    siren: string | null;
    siret: string | null;
    forme_juridique: string | null;
    code_naf: string | null;
    naf_libelle: string | null;
    effectif_tranche: string | null;
    nb_implantations: number | null;
    ca_dernier_exercice: number | null;
    insee_verifie: boolean;
    contacts: OppDetailContact[];
    adresses: OppDetailAdresse[];
  } | null;
  activites: OppDetailActivite[];
  relances: OppDetailRelance[];
  rdv: OppDetailRdv[];
};

export async function getOpportunite(id: string): Promise<OppDetail | null> {
  const supabase = await createCrmClient();
  // Colonnes ciblées (celles du type OppDetail du drawer) au lieu de `*`, et
  // timeline bornée aux 30 dernières activités (elles s'accumulent sans limite ;
  // même esprit que le plafonnement de fetchRisks).
  const withAdresses = `id, intitule, statut, etape_id, probabilite, formation_visee, nb_alternants,
      source, date_cloture_prevue, cfa, date_cible_prochain_rdv,
      perimetre_missions, formations_rncp, type_formation, taux_npec, duree_contrat_ans,
      mois_demarrage, volume_an1, volume_an2, volume_an3, volume_garanti_seuil, leviers,
      canal_origine, date_premier_contact, initiateur, historique_synthese, numero_contrat, type_prospect,
      compte:comptes(id, nom, nombre_collaborateurs, siren, siret, forme_juridique, code_naf, naf_libelle, effectif_tranche, nb_implantations, ca_dernier_exercice, insee_verifie, contacts(id, prenom, nom, email, telephone, principal, role_decision, sensibilites), adresses(id, libelle, ville, departement, region, principal)),
      activites(id, type, contenu, created_at, auteur_id),
      relances(id, titre, date_echeance, fait, priorite),
      rdv(id, titre, debut, statut)`;
  const { data, error } = await supabase
    .from('opportunites')
    .select(withAdresses)
    .eq('id', id)
    .is('relances.archived_at', null) // les relances archivées n'apparaissent pas dans le drawer
    .order('created_at', { referencedTable: 'activites', ascending: false })
    .limit(30, { referencedTable: 'activites' })
    .maybeSingle();
  if (error) throw error;
  const raw = data as unknown as
    | (Omit<OppDetail, 'activites'> & {
        activites: (Omit<OppDetailActivite, 'auteur'> & {
          auteur_id: string | null;
        })[];
      })
    | null;
  if (!raw) return null;
  // Auteurs des activités = public.users (embed cross-schéma impossible) : un
  // seul fetch groupé puis recollage en JS.
  const users = await fetchCrmUsers(raw.activites.map((a) => a.auteur_id));
  return {
    ...raw,
    activites: raw.activites.map(({ auteur_id, ...a }) => {
      const u = auteur_id ? users.get(auteur_id) : undefined;
      return { ...a, auteur: u ? { prenom: u.prenom, nom: u.nom } : null };
    }),
  };
}
