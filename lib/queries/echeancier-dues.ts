import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';
import { resolveTauxCommission } from '@/lib/utils/commission';
import { isContratActif } from '@/lib/utils/contrat-states';
import { round2 } from '@/lib/utils/number';
import {
  computeJalonContribution,
  resolveProjetEcheancier,
  type ContratEcheancierContext,
  type JalonContribution,
} from '@/lib/echeancier/calc';

// ---------------------------------------------------------------------------
// Échéances 1/12 dues : calcul LIVE (sans la table `echeances`, morte depuis
// la suppression du cron) de ce qui reste à facturer pour les projets au
// modèle échéancier.
//
// Principe : jalons attendus à date (mois_absolu <= mois courant) MOINS ce qui
// a déjà été facturé sur le contrat. La déduction est EN MONTANT par contrat
// (pas par présence de jalon) car le dialog manuel historique émettait des
// lignes cumulées (M+1..M+x en une ligne) : on alloue le total déjà facturé
// aux jalons les plus anciens d'abord, le reliquat de chaque jalon est dû.
//
// "Déjà facturé" = lignes standard (est_avoir=false, tous statuts y compris
// brouillon pour ne pas préparer deux fois) rattachées à un jalon
// (mois_relatif > 0), NET des avoirs. Les lignes d'avoir sont stockées en
// montant NÉGATIF mais sans mois_relatif : on les nette au niveau contrat
// (sinon un avoir NPEC laisserait le "déjà facturé" au montant plein et les
// jalons suivants seraient sous-proposés à hauteur de l'avoir, durablement).
// Les avoirs du monde engagement (event_type renseigné) sont exclus : ils
// compensent des events engagement/opco_step, pas des jalons.
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
 * `billedByContrat` = somme HT des lignes jalon standard déjà émises/préparées
 * par contrat.
 */
export function computeEcheancierDues(input: {
  projets: EcheancierProjetInput[];
  contrats: EcheancierContratInput[];
  templates: EcheancierTemplateInput[];
  billedByContrat: Map<string, number>;
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

      // Allocation du déjà-facturé aux jalons les plus anciens d'abord.
      // Clamp à 0 : un net négatif (avoirs > facturé) ne doit jamais gonfler
      // un jalon au-delà de son propre montant.
      let restantBilled = Math.max(0, billedByContrat.get(c.id) ?? 0);
      const apprenant =
        `${c.apprenant_prenom ?? ''} ${c.apprenant_nom ?? ''}`.trim();

      for (const contrib of contributions) {
        const consomme = Math.min(contrib.montant_ht, restantBilled);
        restantBilled = round2(restantBilled - consomme);
        const due = round2(contrib.montant_ht - consomme);
        // Tolérance : ignore les reliquats d'arrondi < 1 centime.
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
// Loader DB
// ---------------------------------------------------------------------------

/**
 * Projets actifs au modèle échéancier (est_libre=false, non archivés) ayant
 * au moins un contrat. Retourne aussi la liste vide d'échéances dues si tout
 * est à jour : l'UI distingue "aucun projet échéancier" de "à jour".
 */
export async function getEcheancierDues(projetId?: string): Promise<{
  hasEcheancierProjets: boolean;
  dues: EcheancierDueMois[];
}> {
  const supabase = await createClient();

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
    return { hasEcheancierProjets: false, dues: [] };
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
  if (projets.length === 0) return { hasEcheancierProjets: false, dues: [] };

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
    return { hasEcheancierProjets: true, dues: [] };
  }
  const contrats = contratsRaw ?? [];
  if (contrats.length === 0) return { hasEcheancierProjets: false, dues: [] };

  const billedByContrat = await loadBilledByContrat(
    supabase,
    contrats.map((c) => c.id),
  );

  const dues = computeEcheancierDues({
    projets,
    contrats,
    templates: templates ?? [],
    billedByContrat,
    cutoffMois: currentMoisCutoff(),
  });

  return { hasEcheancierProjets: true, dues };
}

/**
 * Somme HT par contrat des lignes jalon standard (mois_relatif > 0), nette
 * des avoirs échéancier (négatifs, sans mois_relatif ni event_type).
 * Batch par tranches de 200 contrats pour rester sous les limites PostgREST.
 */
async function loadBilledByContrat(
  supabase: Awaited<ReturnType<typeof createClient>>,
  contratIds: string[],
): Promise<Map<string, number>> {
  const billed = new Map<string, number>();
  const CHUNK = 200;
  for (let i = 0; i < contratIds.length; i += CHUNK) {
    const chunk = contratIds.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('facture_lignes')
      .select(
        'contrat_id, montant_ht, mois_relatif, event_type, facture:factures!inner(est_avoir)',
      )
      .in('contrat_id', chunk);
    if (error) {
      logger.error('queries.echeancier-dues', 'lignes fetch failed', {
        error,
      });
      continue;
    }
    for (const l of data ?? []) {
      if (!l.contrat_id) continue;
      const compte = l.facture?.est_avoir
        ? // Avoir : net (montant négatif), sauf avoirs du monde engagement.
          l.event_type == null
        : // Ligne standard : uniquement les lignes jalon.
          (l.mois_relatif ?? 0) > 0;
      if (!compte) continue;
      billed.set(
        l.contrat_id,
        round2((billed.get(l.contrat_id) ?? 0) + Number(l.montant_ht)),
      );
    }
  }
  return billed;
}
