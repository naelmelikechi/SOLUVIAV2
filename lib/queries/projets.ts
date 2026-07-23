import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/utils/logger';
import { encaisseHt } from '@/lib/utils/montant-ht';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

async function getProjetsList() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('projets')
    .select(
      `
      id,
      ref,
      statut,
      date_debut,
      taux_commission,
      modele_facturation,
      est_interne,
      client:clients!projets_client_id_fkey (
        id,
        trigramme,
        raison_sociale
      ),
      typologie:typologies_projet!projets_typologie_id_fkey (
        code,
        libelle
      ),
      cdp:users!projets_cdp_id_fkey (
        id,
        nom,
        prenom
      ),
      backup_cdp:users!projets_backup_cdp_id_fkey (
        id,
        nom,
        prenom
      )
    `,
    )
    .eq('archive', false)
    .eq('est_libre', false)
    .order('ref', { ascending: true });

  if (error) {
    logger.error('queries.projets', 'getProjetsList failed', { error });
    throw new AppError(
      'PROJETS_FETCH_FAILED',
      'Impossible de charger les projets',
      { cause: error },
    );
  }
  return data;
}

export type ProjetListItem = Awaited<ReturnType<typeof getProjetsList>>[number];

export interface ProjetListEnriched extends ProjetListItem {
  apprentisActifs: number;
  facturesEnRetard: number;
  encaissementsEnRetard: number;
  tempsMois: number;
}

export async function getProjetsListEnriched(): Promise<ProjetListEnriched[]> {
  const [supabase, projets] = await Promise.all([
    createClient(),
    getProjetsList(),
  ]);

  if (projets.length === 0) return [];

  const projetIds = projets.map((p) => p.id);

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .split('T')[0];
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString()
    .split('T')[0];

  // Run all aggregate queries in parallel
  const [contratsRes, facturesRes, tempsRes] = await Promise.all([
    // 1. Contrats actifs par projet
    supabase
      .from('contrats')
      .select('projet_id')
      .in('projet_id', projetIds)
      .eq('archive', false),

    // 2. Factures en retard par projet (with paiements for net calculation)
    supabase
      .from('factures')
      .select('id, projet_id, montant_ht, montant_ttc, paiements(montant)')
      .in('projet_id', projetIds)
      .eq('statut', 'en_retard'),

    // 3. Temps du mois courant par projet
    supabase
      .from('saisies_temps')
      .select('projet_id, heures')
      .in('projet_id', projetIds)
      .gte('date', startOfMonth!)
      .lte('date', endOfMonth!),
  ]);

  // Build lookup maps
  const apprentisMap = new Map<string, number>();
  for (const c of contratsRes.data ?? []) {
    if (!c.projet_id) continue;
    apprentisMap.set(c.projet_id, (apprentisMap.get(c.projet_id) ?? 0) + 1);
  }

  const facturesRetardMap = new Map<string, number>();
  const encaissementsRetardMap = new Map<string, number>();
  for (const f of facturesRes.data ?? []) {
    if (!f.projet_id) continue;
    facturesRetardMap.set(
      f.projet_id,
      (facturesRetardMap.get(f.projet_id) ?? 0) + 1,
    );
    // Net overdue HT = montant_ht - encaissé HT (paiements TTC ramenés au prorata HT/TTC)
    const paiementsSum = (
      (f as unknown as { paiements: Array<{ montant: number }> }).paiements ??
      []
    ).reduce((s: number, p: { montant: number }) => s + (p.montant ?? 0), 0);
    const net =
      (f.montant_ht ?? 0) -
      encaisseHt(paiementsSum, f.montant_ht ?? 0, f.montant_ttc ?? 0);
    if (net > 0) {
      encaissementsRetardMap.set(
        f.projet_id,
        (encaissementsRetardMap.get(f.projet_id) ?? 0) + net,
      );
    }
  }

  const tempsMap = new Map<string, number>();
  for (const s of tempsRes.data ?? []) {
    tempsMap.set(
      s.projet_id,
      (tempsMap.get(s.projet_id) ?? 0) + (s.heures ?? 0),
    );
  }

  // Merge into enriched array
  return projets.map((p) => ({
    ...p,
    apprentisActifs: apprentisMap.get(p.id) ?? 0,
    facturesEnRetard: facturesRetardMap.get(p.id) ?? 0,
    encaissementsEnRetard: encaissementsRetardMap.get(p.id) ?? 0,
    tempsMois: tempsMap.get(p.id) ?? 0,
  }));
}

export async function getProjetByRef(ref: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('projets')
    .select(
      `
      id,
      ref,
      statut,
      date_debut,
      taux_commission,
      modele_facturation,
      echeancier_template_id,
      client:clients!projets_client_id_fkey (
        id,
        trigramme,
        raison_sociale,
        siret,
        adresse,
        localisation,
        plane_project_id
      ),
      typologie:typologies_projet!projets_typologie_id_fkey (
        code,
        libelle
      ),
      cdp:users!projets_cdp_id_fkey (
        id,
        nom,
        prenom,
        email
      ),
      backup_cdp:users!projets_backup_cdp_id_fkey (
        id,
        nom,
        prenom,
        email
      )
    `,
    )
    .eq('ref', ref)
    .single();

  if (error) {
    logger.error('queries.projets', 'getProjetByRef failed', { ref, error });
    return null;
  }
  return data;
}

export type ProjetDetail = NonNullable<
  Awaited<ReturnType<typeof getProjetByRef>>
>;

export async function getContratsByProjetId(projetId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('contrats')
    .select(
      `
      id,
      ref,
      contract_number,
      internal_number,
      apprenant_nom,
      apprenant_prenom,
      formation_titre,
      duree_mois,
      date_debut,
      date_fin,
      npec_amount,
      contract_state,
      progression:contrats_progressions!contrats_progressions_contrat_id_fkey(
        progression_percentage,
        total_spent_time_hours,
        last_activity_at
      ),
      invoice_steps:eduvia_invoice_steps(paid_amount, total_amount, invoice_state, paid_at)
    `,
    )
    .eq('projet_id', projetId)
    .eq('archive', false)
    .order('ref', { ascending: true });

  if (error) {
    logger.error('queries.projets', 'getContratsByProjetId failed', {
      projetId,
      error,
    });
    throw new AppError(
      'PROJETS_CONTRATS_FETCH_FAILED',
      'Impossible de charger les contrats du projet',
      { cause: error },
    );
  }
  // Flatten the join: progression has UNIQUE(contrat_id), keep just the
  // row. invoice_steps stays an array, used to compute paid totals.
  return (data ?? []).map((c) => ({
    ...c,
    progression: Array.isArray(c.progression)
      ? (c.progression[0] ?? null)
      : (c.progression ?? null),
    invoice_steps: (c.invoice_steps ?? []) as Array<{
      paid_amount: number | null;
      total_amount: number | null;
      invoice_state: string | null;
      paid_at: string | null;
    }>,
  }));
}

export type ContratRow = Awaited<
  ReturnType<typeof getContratsByProjetId>
>[number];

// Montant encaisse cote OPCO pour un bordereau Eduvia. Meme semantique
// "pedago regle" que lib/queries/billable-events/derive.ts : un step est
// entierement regle si invoice_state = REGLE ou si opco_settled_amount couvre
// le total (le state peut rester TRANSMIS a cause du premier equipement) ;
// sinon on compte le reglement partiel.
export function stepEncaisseOpco(step: {
  total_amount: number | null;
  invoice_state: string | null;
  opco_settled_amount: number | null;
}): number {
  const total = step.total_amount ?? 0;
  if (step.invoice_state === 'REGLE') return total;
  if (step.opco_settled_amount == null) return 0;
  return Math.min(step.opco_settled_amount, total);
}

export async function getProjetFinance(projetId: string) {
  const supabase = await createClient();

  // Trois queries independantes lancees en parallele : contrats (production
  // OPCO), factures (facture/en_retard SOLUVIA), projet (taux_commission).
  // Les deux suivantes (paiements, invoice_steps) dependent des resultats.
  const [contratsRes, facturesRes, projetRes] = await Promise.all([
    // Contrats SANS filtre archive : la production ne compte que les
    // non-archives, mais les bordereaux OPCO des contrats archives restent
    // comptes (les factures SOLUVIA correspondantes existent toujours -
    // gapless - donc l'OPCO doit rester symetrique).
    supabase
      .from('contrats')
      .select('id, npec_amount, archive')
      .eq('projet_id', projetId),
    supabase
      .from('factures')
      .select('id, montant_ht, montant_ttc, statut')
      .eq('projet_id', projetId)
      .in('statut', ['emise', 'payee', 'en_retard']),
    supabase
      .from('projets')
      .select('taux_commission')
      .eq('id', projetId)
      .single(),
  ]);

  const contrats = contratsRes.data;
  const factures = facturesRes.data;
  const projet = projetRes.data;

  const production_opco = (contrats ?? [])
    .filter((c) => !c.archive)
    .reduce((sum, c) => sum + (c.npec_amount ?? 0), 0);

  // Les factures SOLUVIA sont des factures de commission (base = NPEC x taux) :
  // ce sont des montants cote SOLUVIA, pas cote OPCO.
  const facture_soluvia = (factures ?? []).reduce(
    (sum, f) => sum + (f.montant_ht ?? 0),
    0,
  );

  const factureIds = (factures ?? []).map((f) => f.id);
  // Ratio HT/TTC par facture pour ramener les paiements (TTC) en HT.
  const ratioByFacture = new Map<string, { ht: number; ttc: number }>();
  for (const f of factures ?? []) {
    ratioByFacture.set(f.id, {
      ht: f.montant_ht ?? 0,
      ttc: f.montant_ttc ?? 0,
    });
  }

  const contratIds = (contrats ?? []).map((c) => c.id);
  const [paiementsRes, stepsRes, lignesRes] = await Promise.all([
    factureIds.length > 0
      ? supabase
          .from('paiements')
          .select('montant, facture_id')
          .in('facture_id', factureIds)
      : Promise.resolve({
          data: [] as { montant: number | null; facture_id: string }[],
        }),
    contratIds.length > 0
      ? supabase
          .from('eduvia_invoice_steps')
          .select('total_amount, invoice_state, opco_settled_amount')
          .in('contrat_id', contratIds)
      : Promise.resolve({
          data: [] as {
            total_amount: number | null;
            invoice_state: string | null;
            opco_settled_amount: number | null;
          }[],
        }),
    // Split engagement / echeances du "Facturé" SOLUVIA (memes factures que
    // facture_soluvia : emise/payee/en_retard, avoirs exclus par le statut).
    factureIds.length > 0
      ? supabase
          .from('facture_lignes')
          .select('event_type, montant_ht')
          .in('facture_id', factureIds)
      : Promise.resolve({
          data: [] as { event_type: string | null; montant_ht: number }[],
        }),
  ]);

  const encaisse_soluvia = (paiementsRes.data ?? []).reduce((sum, p) => {
    const r = ratioByFacture.get(p.facture_id as string);
    return sum + encaisseHt(p.montant ?? 0, r?.ht ?? 0, r?.ttc ?? 0);
  }, 0);

  // Cote OPCO reel : bordereaux Eduvia emis (TRANSMIS/REGLE) et regles.
  const steps = stepsRes.data ?? [];
  const facture_opco = steps
    .filter(
      (s) => s.invoice_state === 'TRANSMIS' || s.invoice_state === 'REGLE',
    )
    .reduce((sum, s) => sum + (s.total_amount ?? 0), 0);
  const encaisse_opco = steps.reduce((sum, s) => sum + stepEncaisseOpco(s), 0);

  const en_retard_soluvia = (factures ?? [])
    .filter((f) => f.statut === 'en_retard')
    .reduce((sum, f) => sum + (f.montant_ht ?? 0), 0);

  // Repartition du facture SOLUVIA par type d'event (facturation a
  // l'engagement) : etape 1 vs echeances OPCO. Les lignes sans event_type
  // (manuelles/libres) ne rentrent dans aucun des deux buckets.
  const lignesEvents = lignesRes.data ?? [];
  const facture_soluvia_engagement = lignesEvents
    .filter((l) => l.event_type === 'engagement')
    .reduce((sum, l) => sum + (l.montant_ht ?? 0), 0);
  const facture_soluvia_echeances = lignesEvents
    .filter((l) => l.event_type === 'opco_step')
    .reduce((sum, l) => sum + (l.montant_ht ?? 0), 0);

  return {
    production_opco,
    facture_opco,
    encaisse_opco,
    facture_soluvia,
    facture_soluvia_engagement,
    facture_soluvia_echeances,
    encaisse_soluvia,
    en_retard_soluvia,
    taux_commission: projet?.taux_commission ?? 0,
  };
}

export type ProjetFinance = Awaited<ReturnType<typeof getProjetFinance>>;

export async function getProjetTempsStats(projetId: string) {
  const mois_label = format(new Date(), 'MMMM yyyy', { locale: fr });

  const supabase = await createClient();

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .split('T')[0];
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString()
    .split('T')[0];
  const startOfYear = new Date(now.getFullYear(), 0, 1)
    .toISOString()
    .split('T')[0]!;
  const endOfYear = new Date(now.getFullYear(), 11, 31)
    .toISOString()
    .split('T')[0]!;
  const annee = now.getFullYear();

  // Recupere TOUTES les saisies de l'annee en une seule query : on derive
  // ensuite le mois courant + le breakdown 12 mois cote app, evite un 2e
  // round-trip.
  const { data: saisiesAnnee } = await supabase
    .from('saisies_temps')
    .select('id, heures, date')
    .eq('projet_id', projetId)
    .gte('date', startOfYear)
    .lte('date', endOfYear);

  const allSaisies = saisiesAnnee ?? [];
  const totalAnnee = allSaisies.reduce((sum, s) => sum + (s.heures ?? 0), 0);

  // Total mois courant (subset de l'annee)
  const saisiesMois = allSaisies.filter(
    (s) => s.date >= startOfMonth! && s.date <= endOfMonth!,
  );
  const total = saisiesMois.reduce((sum, s) => sum + (s.heures ?? 0), 0);

  // Breakdown 12 mois pour le sparkline
  const parMois = new Map<number, number>();
  for (let m = 0; m < 12; m++) parMois.set(m, 0);
  for (const s of allSaisies) {
    const monthIdx = new Date(s.date).getMonth();
    parMois.set(monthIdx, (parMois.get(monthIdx) ?? 0) + (s.heures ?? 0));
  }
  const sparkline = Array.from({ length: 12 }, (_, m) => ({
    mois: m,
    heures: parMois.get(m) ?? 0,
  }));

  if (allSaisies.length === 0) {
    return {
      total: 0,
      mois_label,
      axes: [],
      totalAnnee: 0,
      annee,
      sparkline,
    };
  }

  // Breakdown par axe (mois courant uniquement, comme avant)
  // axeRows + axesDefs en parallele : axesDefs est un referentiel
  // independant des saisies.
  const saisieIdsMois = saisiesMois.map((s) => s.id);
  const [axeRowsRes, axesDefsRes] = await Promise.all([
    saisieIdsMois.length > 0
      ? supabase
          .from('saisies_temps_axes')
          .select('axe, heures')
          .in('saisie_id', saisieIdsMois)
      : Promise.resolve({
          data: [] as Array<{ axe: string; heures: number }>,
        }),
    supabase.from('axes_temps').select('code, libelle, couleur').order('ordre'),
  ]);
  const { data: axeRows } = axeRowsRes;
  const { data: axesDefs } = axesDefsRes;

  const axeMap = new Map<string, number>();
  for (const row of axeRows ?? []) {
    axeMap.set(row.axe, (axeMap.get(row.axe) ?? 0) + row.heures);
  }

  const axes = (axesDefs ?? []).flatMap((a) =>
    axeMap.has(a.code)
      ? [
          {
            code: a.code,
            label: a.libelle,
            heures: axeMap.get(a.code) ?? 0,
            color: a.couleur ?? '#6b7280',
          },
        ]
      : [],
  );

  return { total, mois_label, axes, totalAnnee, annee, sparkline };
}

export type ProjetTempsStats = Awaited<ReturnType<typeof getProjetTempsStats>>;

export async function getDocumentsByProjetId(projetId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('projet_documents')
    .select('*, user:users!projet_documents_user_id_fkey(id, nom, prenom)')
    .eq('projet_id', projetId)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('queries.projets', 'getDocumentsByProjetId failed', {
      projetId,
      error,
    });
    throw new AppError(
      'PROJETS_DOCUMENTS_FETCH_FAILED',
      'Impossible de charger les documents',
      { cause: error },
    );
  }
  return data;
}

export type ProjetDocument = Awaited<
  ReturnType<typeof getDocumentsByProjetId>
>[number];
