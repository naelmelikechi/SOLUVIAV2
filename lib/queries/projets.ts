import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/utils/logger';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export async function getProjetsList() {
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
  const supabase = await createClient();
  const projets = await getProjetsList();

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
      .select('id, projet_id, montant_ttc, paiements(montant)')
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
    apprentisMap.set(c.projet_id, (apprentisMap.get(c.projet_id) ?? 0) + 1);
  }

  const facturesRetardMap = new Map<string, number>();
  const encaissementsRetardMap = new Map<string, number>();
  for (const f of facturesRes.data ?? []) {
    facturesRetardMap.set(
      f.projet_id,
      (facturesRetardMap.get(f.projet_id) ?? 0) + 1,
    );
    // Net overdue = montant_ttc - sum of paiements (joined in query)
    const paiementsSum = (
      (f as unknown as { paiements: Array<{ montant: number }> }).paiements ??
      []
    ).reduce((s: number, p: { montant: number }) => s + (p.montant ?? 0), 0);
    const net = (f.montant_ttc ?? 0) - paiementsSum;
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
      billing_mode,
      client:clients!projets_client_id_fkey (
        id,
        trigramme,
        raison_sociale,
        siret,
        adresse,
        localisation
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
      *,
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

export async function getProjetFinance(projetId: string) {
  const supabase = await createClient();

  // Trois queries independantes lancees en parallele : contrats (production
  // OPCO), factures (facture/en_retard OPCO), projet (taux_commission). La
  // 4e (paiements) depend du resultat factures, on la fait apres.
  const [contratsRes, facturesRes, projetRes] = await Promise.all([
    supabase
      .from('contrats')
      .select('id, npec_amount')
      .eq('projet_id', projetId)
      .eq('archive', false),
    supabase
      .from('factures')
      .select('id, montant_ht, statut')
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

  const production_opco = (contrats ?? []).reduce(
    (sum, c) => sum + (c.npec_amount ?? 0),
    0,
  );

  const facture_opco = (factures ?? []).reduce(
    (sum, f) => sum + (f.montant_ht ?? 0),
    0,
  );

  const factureIds = (factures ?? []).map((f) => f.id);
  let encaisse_opco = 0;
  if (factureIds.length > 0) {
    const { data: paiements } = await supabase
      .from('paiements')
      .select('montant')
      .in('facture_id', factureIds);
    encaisse_opco = (paiements ?? []).reduce(
      (sum, p) => sum + (p.montant ?? 0),
      0,
    );
  }

  const en_retard = (factures ?? [])
    .filter((f) => f.statut === 'en_retard')
    .reduce((sum, f) => sum + (f.montant_ht ?? 0), 0);

  return {
    production_opco,
    facture_opco,
    encaisse_opco,
    en_retard,
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
  const saisieIdsMois = saisiesMois.map((s) => s.id);
  const { data: axeRows } =
    saisieIdsMois.length > 0
      ? await supabase
          .from('saisies_temps_axes')
          .select('axe, heures')
          .in('saisie_id', saisieIdsMois)
      : { data: [] as Array<{ axe: string; heures: number }> };

  const { data: axesDefs } = await supabase
    .from('axes_temps')
    .select('code, libelle, couleur')
    .order('ordre');

  const axeMap = new Map<string, number>();
  for (const row of axeRows ?? []) {
    axeMap.set(row.axe, (axeMap.get(row.axe) ?? 0) + row.heures);
  }

  const axes = (axesDefs ?? [])
    .filter((a) => axeMap.has(a.code))
    .map((a) => ({
      code: a.code,
      label: a.libelle,
      heures: axeMap.get(a.code) ?? 0,
      color: a.couleur ?? '#6b7280',
    }));

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
