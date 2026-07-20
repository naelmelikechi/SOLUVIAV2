import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';
import { resolveTauxCommission } from '@/lib/utils/commission';
import { isContratActif } from '@/lib/utils/contrat-states';
import { round2 } from '@/lib/utils/number';
import {
  computeJalonContribution,
  moisAbsoluFromRelatif,
  resolveProjetEcheancier,
  type ContratEcheancierContext,
  type JalonContribution,
} from '@/lib/echeancier/calc';

// ---------------------------------------------------------------------------
// Échéances 1/12 dues : calcul LIVE (sans la table `echeances`, morte depuis
// la suppression du cron) de ce qui reste à facturer pour les projets au
// modèle échéancier.
//
// Principe : jalons attendus à date (mois_absolu <= mois courant) dont la
// quote-part n'est pas encore couverte par ce qui a déjà été facturé sur le
// contrat. La couverture se mesure en QUOTE-PARTS (euros facturés ÷ base
// snapshot de la ligne, base = npec_snapshot × taux_snapshot / 100), allouées
// aux jalons les plus anciens d'abord :
//   - les lignes manuelles legacy cumulées (M+1..M+x en une seule ligne)
//     couvrent bien x jalons ;
//   - un changement de NPEC ou de taux ne "dé-couvre" PAS les jalons déjà
//     facturés : le delta sur ces jalons est le territoire EXCLUSIF du
//     pipeline ajustements (detectNpecChangeAjustement, qui travaille aux
//     snapshots). Valoriser les jalons passés aux paramètres courants en
//     déduisant des euros facturerait ce delta une seconde fois.
//
// "Déjà facturé" = lignes standard jalon (est_avoir=false, event_type IS NULL
// - les lignes engagement portent aussi mois_relatif=step_number -, tous
// statuts y compris brouillon pour ne pas préparer deux fois). Les AVOIRS
// sont volontairement ignorés : un avoir d'ajustement NPEC corrige un jalon
// couvert (il ne le rend pas re-facturable), une rupture sort le contrat du
// calcul via son état, et un avoir d'annulation pure laisse le jalon
// "couvert" (sous-proposition conservatrice, refacturable via le dialog
// manuel). Jamais de sur-proposition.
// ---------------------------------------------------------------------------

export interface EcheancierProjetInput {
  id: string;
  ref: string | null;
  taux_commission: number | null;
  echeancier_template_id: string | null;
  echeancier_override: unknown;
  client_id: string;
  client_raison_sociale: string;
}

export interface EcheancierContratInput {
  id: string;
  projet_id: string | null;
  ref: string | null;
  contract_number: string | null;
  apprenant_prenom: string | null;
  apprenant_nom: string | null;
  formation_titre: string | null;
  contract_state: string;
  npec_amount: number | null;
  date_debut: string | null;
  duree_mois: number | null;
  archive: boolean;
}

export interface EcheancierTemplateInput {
  id: string;
  nom: string;
  jalons: unknown;
  is_default: boolean;
}

/** Ligne jalon standard déjà facturée/préparée (avec ses snapshots). */
export interface BilledJalonLine {
  montant_ht: number;
  npec_snapshot: number | null;
  taux_commission_snapshot: number | null;
}

export interface EcheancierDueContribution {
  contratId: string;
  contratRef: string | null;
  contractNumber: string | null;
  apprenant: string;
  formationTitre: string | null;
  moisRelatif: number;
  quotePart: number;
  npecSnapshot: number;
  /** Montant HT dû sur ce jalon (peut être partiel si déjà facturé en partie). */
  montantHt: number;
}

export interface EcheancierDueMois {
  projetId: string;
  projetRef: string;
  clientId: string;
  clientRaisonSociale: string;
  tauxCommission: number;
  /** Nom du template résolu (null si override local ou fallback vide). */
  templateNom: string | null;
  templateSource: 'override' | 'template' | 'default';
  /** 1er du mois, ISO yyyy-mm-dd. */
  moisConcerne: string;
  montantHt: number;
  contributions: EcheancierDueContribution[];
}

/** 1er du mois courant en ISO yyyy-mm-01 (UTC, cohérent avec calc.ts). */
export function currentMoisCutoff(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

/**
 * Cœur PUR (aucune DB) : calcule les échéances dues par projet × mois.
 * `billedByContrat` = lignes jalon standard déjà émises/préparées par contrat
 * (leurs snapshots servent à convertir les euros en quote-parts couvertes).
 */
export function computeEcheancierDues(input: {
  projets: EcheancierProjetInput[];
  contrats: EcheancierContratInput[];
  templates: EcheancierTemplateInput[];
  billedByContrat: Map<string, BilledJalonLine[]>;
  cutoffMois: string;
}): EcheancierDueMois[] {
  const { projets, contrats, templates, billedByContrat, cutoffMois } = input;

  const contratsByProjet = new Map<string, EcheancierContratInput[]>();
  for (const c of contrats) {
    if (!c.projet_id) continue;
    const arr = contratsByProjet.get(c.projet_id);
    if (arr) arr.push(c);
    else contratsByProjet.set(c.projet_id, [c]);
  }

  const rows: EcheancierDueMois[] = [];

  for (const projet of projets) {
    const projetContrats = contratsByProjet.get(projet.id) ?? [];
    if (projetContrats.length === 0) continue;

    const resolved = resolveProjetEcheancier(
      {
        echeancier_override: projet.echeancier_override,
        echeancier_template_id: projet.echeancier_template_id,
      },
      templates,
    );
    if (resolved.jalons.length === 0) continue;

    const taux = resolveTauxCommission(projet.taux_commission);
    const byMois = new Map<string, EcheancierDueContribution[]>();

    for (const c of projetContrats) {
      if (c.archive || !isContratActif(c.contract_state)) continue;
      if (!c.date_debut || !c.duree_mois) continue;

      const ctx: ContratEcheancierContext = {
        contrat_id: c.id,
        npec_amount: Number(c.npec_amount ?? 0),
        date_debut: c.date_debut,
        duree_mois: c.duree_mois,
        archive: c.archive,
      };

      // Jalons attendus à date, triés du plus ancien au plus récent.
      const contributions: JalonContribution[] = [];
      for (const jalon of resolved.jalons) {
        const contrib = computeJalonContribution(ctx, jalon, taux);
        if (contrib && contrib.mois_absolu <= cutoffMois) {
          contributions.push(contrib);
        }
      }
      contributions.sort((a, b) => a.mois_relatif - b.mois_relatif);

      // Couverture en QUOTE-PARTS : chaque ligne facturée couvre
      // montant / (base snapshot) de contrat. Fallback sur la base courante
      // si les snapshots manquent (lignes manuelles legacy incomplètes).
      const currentBase = (ctx.npec_amount * taux) / 100;
      let coveredQp = 0;
      for (const line of billedByContrat.get(c.id) ?? []) {
        const montant = Number(line.montant_ht);
        if (!(montant > 0)) continue;
        const snapBase =
          (Number(line.npec_snapshot ?? 0) *
            Number(line.taux_commission_snapshot ?? 0)) /
          100;
        const baseRef = snapBase > 0 ? snapBase : currentBase;
        if (baseRef <= 0) continue;
        coveredQp += montant / baseRef;
      }

      const apprenant =
        `${c.apprenant_prenom ?? ''} ${c.apprenant_nom ?? ''}`.trim();

      // Allocation de la couverture aux jalons les plus anciens d'abord.
      for (const contrib of contributions) {
        if (coveredQp >= contrib.quote_part - 1e-9) {
          coveredQp -= contrib.quote_part;
          continue;
        }
        const dueQp = contrib.quote_part - Math.max(0, coveredQp);
        coveredQp = 0;
        // Borne au montant du jalon (sécurité arrondi), tolérance < 1 centime.
        const due = Math.min(round2(dueQp * currentBase), contrib.montant_ht);
        if (due < 0.01) continue;

        const arr = byMois.get(contrib.mois_absolu) ?? [];
        arr.push({
          contratId: c.id,
          contratRef: c.ref,
          contractNumber: c.contract_number,
          apprenant,
          formationTitre: c.formation_titre,
          moisRelatif: contrib.mois_relatif,
          quotePart: contrib.quote_part,
          npecSnapshot: contrib.npec_snapshot,
          montantHt: due,
        });
        byMois.set(contrib.mois_absolu, arr);
      }
    }

    for (const [mois, contributions] of byMois) {
      rows.push({
        projetId: projet.id,
        projetRef: projet.ref ?? '',
        clientId: projet.client_id,
        clientRaisonSociale: projet.client_raison_sociale,
        tauxCommission: taux,
        templateNom: resolved.template_nom ?? null,
        templateSource: resolved.source,
        moisConcerne: mois,
        montantHt: round2(contributions.reduce((s, c) => s + c.montantHt, 0)),
        contributions,
      });
    }
  }

  return rows.sort(
    (a, b) =>
      a.moisConcerne.localeCompare(b.moisConcerne) ||
      a.projetRef.localeCompare(b.projetRef),
  );
}

// ---------------------------------------------------------------------------
// Projection des échéances À VENIR (jalons futurs) sur un horizon glissant.
//
// Contrairement à computeEcheancierDues, on ne déduit PAS le déjà-facturé :
// c'est une prévision brute de ce qui sera facturé. Les jalons futurs ne sont
// pas encore couverts (rien n'a été émis pour un mois qui n'est pas arrivé),
// donc le montant plein du jalon est la bonne projection. On ne renvoie que
// les mois STRICTEMENT postérieurs au mois courant et <= cutoff + monthsAhead.
// ---------------------------------------------------------------------------
export function computeEcheancierUpcoming(input: {
  projets: EcheancierProjetInput[];
  contrats: EcheancierContratInput[];
  templates: EcheancierTemplateInput[];
  cutoffMois: string;
  monthsAhead: number;
}): EcheancierDueMois[] {
  const { projets, contrats, templates, cutoffMois, monthsAhead } = input;
  // 1er du mois "cutoff + monthsAhead" : borne haute inclusive de l'horizon.
  const horizonMois = moisAbsoluFromRelatif(cutoffMois, monthsAhead);

  const contratsByProjet = new Map<string, EcheancierContratInput[]>();
  for (const c of contrats) {
    if (!c.projet_id) continue;
    const arr = contratsByProjet.get(c.projet_id);
    if (arr) arr.push(c);
    else contratsByProjet.set(c.projet_id, [c]);
  }

  const rows: EcheancierDueMois[] = [];

  for (const projet of projets) {
    const projetContrats = contratsByProjet.get(projet.id) ?? [];
    if (projetContrats.length === 0) continue;

    const resolved = resolveProjetEcheancier(
      {
        echeancier_override: projet.echeancier_override,
        echeancier_template_id: projet.echeancier_template_id,
      },
      templates,
    );
    if (resolved.jalons.length === 0) continue;

    const taux = resolveTauxCommission(projet.taux_commission);
    const byMois = new Map<string, EcheancierDueContribution[]>();

    for (const c of projetContrats) {
      if (c.archive || !isContratActif(c.contract_state)) continue;
      if (!c.date_debut || !c.duree_mois) continue;

      const ctx: ContratEcheancierContext = {
        contrat_id: c.id,
        npec_amount: Number(c.npec_amount ?? 0),
        date_debut: c.date_debut,
        duree_mois: c.duree_mois,
        archive: c.archive,
      };
      const apprenant =
        `${c.apprenant_prenom ?? ''} ${c.apprenant_nom ?? ''}`.trim();

      for (const jalon of resolved.jalons) {
        const contrib = computeJalonContribution(ctx, jalon, taux);
        if (!contrib) continue;
        // Strictement futur et dans l'horizon.
        if (contrib.mois_absolu <= cutoffMois) continue;
        if (contrib.mois_absolu > horizonMois) continue;

        const arr = byMois.get(contrib.mois_absolu) ?? [];
        arr.push({
          contratId: c.id,
          contratRef: c.ref,
          contractNumber: c.contract_number,
          apprenant,
          formationTitre: c.formation_titre,
          moisRelatif: contrib.mois_relatif,
          quotePart: contrib.quote_part,
          npecSnapshot: contrib.npec_snapshot,
          montantHt: contrib.montant_ht,
        });
        byMois.set(contrib.mois_absolu, arr);
      }
    }

    for (const [mois, contributions] of byMois) {
      rows.push({
        projetId: projet.id,
        projetRef: projet.ref ?? '',
        clientId: projet.client_id,
        clientRaisonSociale: projet.client_raison_sociale,
        tauxCommission: taux,
        templateNom: resolved.template_nom ?? null,
        templateSource: resolved.source,
        moisConcerne: mois,
        montantHt: round2(contributions.reduce((s, c) => s + c.montantHt, 0)),
        contributions,
      });
    }
  }

  return rows.sort(
    (a, b) =>
      a.moisConcerne.localeCompare(b.moisConcerne) ||
      a.projetRef.localeCompare(b.projetRef),
  );
}

// ---------------------------------------------------------------------------
// Loader DB
// ---------------------------------------------------------------------------

/** Horizon (mois) de la projection "À venir" affichée dans l'onglet Échéancier. */
export const UPCOMING_MONTHS_AHEAD = 3;

/** Client acceptés par le loader : session utilisateur (RLS) ou service role
 *  (cron). Les deux exposent la même API typée Database. */
type AnySupabase =
  | Awaited<ReturnType<typeof createClient>>
  | SupabaseClient<Database>;

/**
 * Projets actifs au modèle échéancier (est_libre=false, non archivés) ayant
 * au moins un contrat. Retourne aussi la liste vide d'échéances dues si tout
 * est à jour : l'UI distingue "aucun projet échéancier" de "à jour".
 */
export async function getEcheancierDues(projetId?: string): Promise<{
  hasEcheancierProjets: boolean;
  dues: EcheancierDueMois[];
  upcoming: EcheancierDueMois[];
}> {
  return getEcheancierDuesWith(await createClient(), projetId);
}

/** Variante à client injecté : utilisée par le cron (service role, pas de
 *  cookies) et par getEcheancierDues (client serveur RLS). */
export async function getEcheancierDuesWith(
  supabase: AnySupabase,
  projetId?: string,
): Promise<{
  hasEcheancierProjets: boolean;
  dues: EcheancierDueMois[];
  upcoming: EcheancierDueMois[];
}> {
  let query = supabase
    .from('projets')
    .select(
      `
      id, ref, taux_commission, echeancier_template_id, echeancier_override,
      client:clients!projets_client_id_fkey(id, raison_sociale)
    `,
    )
    .eq('archive', false)
    .eq('est_libre', false)
    .eq('modele_facturation', 'echeancier');
  if (projetId) query = query.eq('id', projetId);
  const { data: projetsRaw, error: pErr } = await query;

  if (pErr) {
    logger.error('queries.echeancier-dues', 'projets fetch failed', {
      error: pErr,
    });
    return { hasEcheancierProjets: false, dues: [], upcoming: [] };
  }

  const projets: EcheancierProjetInput[] = (projetsRaw ?? []).flatMap((p) =>
    p.client
      ? [
          {
            id: p.id,
            ref: p.ref,
            taux_commission: p.taux_commission,
            echeancier_template_id: p.echeancier_template_id,
            echeancier_override: p.echeancier_override,
            client_id: p.client.id,
            client_raison_sociale: p.client.raison_sociale ?? '',
          },
        ]
      : [],
  );
  if (projets.length === 0)
    return { hasEcheancierProjets: false, dues: [], upcoming: [] };

  const projetIds = projets.map((p) => p.id);

  const [{ data: contratsRaw, error: cErr }, { data: templates }] =
    await Promise.all([
      supabase
        .from('contrats')
        .select(
          'id, projet_id, ref, contract_number, apprenant_prenom, apprenant_nom, formation_titre, contract_state, npec_amount, date_debut, duree_mois, archive',
        )
        .in('projet_id', projetIds)
        .eq('archive', false),
      supabase
        .from('echeanciers_templates')
        .select('id, nom, jalons, is_default')
        .eq('archive', false),
    ]);

  if (cErr) {
    logger.error('queries.echeancier-dues', 'contrats fetch failed', {
      error: cErr,
    });
    return { hasEcheancierProjets: true, dues: [], upcoming: [] };
  }
  const contrats = contratsRaw ?? [];
  if (contrats.length === 0)
    return { hasEcheancierProjets: false, dues: [], upcoming: [] };

  const billedByContrat = await loadBilledByContrat(
    supabase,
    contrats.map((c) => c.id),
  );

  const cutoffMois = currentMoisCutoff();
  const dues = computeEcheancierDues({
    projets,
    contrats,
    templates: templates ?? [],
    billedByContrat,
    cutoffMois,
  });
  const upcoming = computeEcheancierUpcoming({
    projets,
    contrats,
    templates: templates ?? [],
    cutoffMois,
    monthsAhead: UPCOMING_MONTHS_AHEAD,
  });

  return { hasEcheancierProjets: true, dues, upcoming };
}

/**
 * Lignes jalon standard par contrat : est_avoir=false, event_type IS NULL
 * (les lignes engagement portent aussi mois_relatif=step_number, on les
 * exclut explicitement comme le fait lib/echeancier/ajustements.ts),
 * mois_relatif > 0, tous statuts. Les avoirs sont volontairement ignorés
 * (cf. en-tête du module).
 * Batch par tranches de 200 contrats pour rester sous les limites PostgREST.
 */
async function loadBilledByContrat(
  supabase: AnySupabase,
  contratIds: string[],
): Promise<Map<string, BilledJalonLine[]>> {
  const billed = new Map<string, BilledJalonLine[]>();
  const CHUNK = 200;
  for (let i = 0; i < contratIds.length; i += CHUNK) {
    const chunk = contratIds.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('facture_lignes')
      .select(
        'contrat_id, montant_ht, npec_snapshot, taux_commission_snapshot, facture:factures!inner(est_avoir)',
      )
      .in('contrat_id', chunk)
      .is('event_type', null)
      .gt('mois_relatif', 0);
    if (error) {
      logger.error('queries.echeancier-dues', 'lignes fetch failed', {
        error,
      });
      continue;
    }
    for (const l of data ?? []) {
      if (!l.contrat_id || l.facture?.est_avoir) continue;
      const arr = billed.get(l.contrat_id) ?? [];
      arr.push({
        montant_ht: Number(l.montant_ht),
        npec_snapshot: l.npec_snapshot,
        taux_commission_snapshot: l.taux_commission_snapshot,
      });
      billed.set(l.contrat_id, arr);
    }
  }
  return billed;
}
