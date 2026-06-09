'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { checkAuth } from '@/lib/auth/guards';
import { logger } from '@/lib/utils/logger';
import { logAudit } from '@/lib/utils/audit';
import { addDaysIso } from '@/lib/utils/dates';
import { getDelaiEcheanceJours } from '@/lib/queries/parametres';
import {
  aggregateProjetEcheances,
  parseJalons,
  resolveProjetEcheancier,
  type ContratEcheancierContext,
} from '@/lib/echeancier/calc';
import { getDefaultSocieteEmettriceId } from '@/lib/queries/societes-emettrices';
import { resolveTvaRegime } from '@/lib/utils/tva-intracom';
import {
  uuidSchema,
  type SupabaseServerClient,
} from '@/lib/actions/factures/brouillons-shared';

const CreateFacturesSchema = z
  .array(uuidSchema('echeanceId'))
  .min(1, 'Aucune échéance sélectionnée')
  .max(500, 'Trop d’échéances sélectionnées');

// ---------------------------------------------------------------------------
// Helper interne : process un groupe d'echeances (= 1 projet) en brouillon.
// ---------------------------------------------------------------------------
// Retourne factureId | null. Chaque appel est independant et peut etre
// lance en parallele via Promise.all dans createFactures (pas de dependance
// croisee entre projets).
interface BrouillonGroup {
  projetId: string;
  clientId: string;
  tauxCommission: number;
  echeancierTemplateId: string | null;
  echeancierOverride: unknown;
  moisConcernes: string[];
  echeanceIds: string[];
}

async function processBrouillonGroup(
  group: BrouillonGroup,
  templates: Array<{
    id: string;
    nom: string;
    jalons: unknown;
    is_default: boolean;
  }>,
  supabase: SupabaseServerClient,
  userId: string,
  delaiJours: number,
): Promise<string | null> {
  const { data: contratsRaw } = await supabase
    .from('contrats')
    .select(
      'id, npec_amount, date_debut, duree_mois, archive, formation_titre, apprenant_prenom, apprenant_nom',
    )
    .eq('projet_id', group.projetId)
    .eq('archive', false);

  if (!contratsRaw || contratsRaw.length === 0) return null;

  const contratsCtx: ContratEcheancierContext[] = contratsRaw.flatMap((c) =>
    c.date_debut && c.duree_mois
      ? [
          {
            contrat_id: c.id,
            npec_amount: c.npec_amount ?? 0,
            date_debut: c.date_debut,
            duree_mois: c.duree_mois,
            archive: c.archive ?? false,
          },
        ]
      : [],
  );

  const resolved = resolveProjetEcheancier(
    {
      echeancier_template_id: group.echeancierTemplateId,
      echeancier_override: group.echeancierOverride,
    },
    templates.map((t) => ({
      id: t.id,
      nom: t.nom,
      jalons: t.jalons,
      is_default: t.is_default,
    })),
  );
  const jalons = parseJalons(resolved.jalons);
  const aggregated = aggregateProjetEcheances(
    group.projetId,
    contratsCtx,
    jalons,
    group.tauxCommission,
  );

  const moisSet = new Set(group.moisConcernes);
  const selectedAggregated = aggregated.filter((a) =>
    moisSet.has(a.mois_concerne),
  );
  if (selectedAggregated.length === 0) return null;

  const contratInfo = new Map(
    contratsRaw.map((c) => [
      c.id,
      {
        formation: c.formation_titre ?? '',
        prenom: c.apprenant_prenom ?? '',
        nom: c.apprenant_nom ?? '',
      },
    ]),
  );

  const lignes: Array<{
    contrat_id: string;
    description: string;
    montant_ht: number;
    mois_relatif: number;
    quote_part: number;
    npec_snapshot: number;
    taux_commission_snapshot: number;
  }> = [];
  for (const agg of selectedAggregated) {
    for (const c of agg.contributions) {
      const info = contratInfo.get(c.contrat_id);
      const moisLabel = c.mois_absolu;
      lignes.push({
        contrat_id: c.contrat_id,
        description: `Commission ${group.tauxCommission}% - ${info?.formation ?? ''} - ${info?.prenom ?? ''} ${info?.nom ?? ''} - ${moisLabel}`,
        montant_ht: c.montant_ht,
        mois_relatif: c.mois_relatif,
        quote_part: c.quote_part,
        npec_snapshot: c.npec_snapshot,
        taux_commission_snapshot: group.tauxCommission,
      });
    }
  }

  if (lignes.length === 0) return null;

  const sortedMois = group.moisConcernes.toSorted();
  const moisLabel =
    sortedMois.length === 1
      ? sortedMois[0]!
      : `${sortedMois[0]} - ${sortedMois[sortedMois.length - 1]}`;

  // Cents entiers : SUM(facture_lignes.montant_ht) == factures.montant_ht.
  // N.B. : ne passe pas par insertBrouillonWithLignes car mois_concerne =
  // moisLabel (range de mois) et non YYYY-MM courant, et la facture doit
  // ensuite linker des echeances - le helper generique ne gere pas ce 2e step.
  const totalHtCents = lignes.reduce(
    (s, l) => s + Math.round(l.montant_ht * 100),
    0,
  );
  const { data: clientTva } = await supabase
    .from('clients')
    .select('tva_intracommunautaire')
    .eq('id', group.clientId)
    .single();
  const tauxTva = resolveTvaRegime(clientTva?.tva_intracommunautaire).taux;
  const montantTvaCents = Math.round((totalHtCents * tauxTva) / 100);
  const totalHt = totalHtCents / 100;
  const montantTva = montantTvaCents / 100;
  const montantTtc = (totalHtCents + montantTvaCents) / 100;

  const dateEmissionStr = new Date().toISOString().split('T')[0]!;
  const dateEcheanceStr = addDaysIso(dateEmissionStr, delaiJours);

  const societeEmettriceId = await getDefaultSocieteEmettriceId();
  const { data: facture, error: insertError } = await supabase
    .from('factures')
    .insert({
      societe_emettrice_id: societeEmettriceId,
      projet_id: group.projetId,
      client_id: group.clientId,
      date_emission: dateEmissionStr,
      date_echeance: dateEcheanceStr,
      mois_concerne: moisLabel,
      montant_ht: totalHt,
      taux_tva: tauxTva,
      montant_tva: montantTva,
      montant_ttc: montantTtc,
      statut: 'a_emettre',
      est_avoir: false,
      created_by: userId,
    })
    .select('id')
    .single();

  if (insertError || !facture) return null;

  const { error: lignesError } = await supabase.from('facture_lignes').insert(
    lignes.map((l) => ({
      facture_id: facture.id,
      contrat_id: l.contrat_id,
      description: l.description,
      montant_ht: l.montant_ht,
      mois_relatif: l.mois_relatif,
      quote_part: l.quote_part,
      npec_snapshot: l.npec_snapshot,
      taux_commission_snapshot: l.taux_commission_snapshot,
    })),
  );

  if (lignesError) {
    await supabase.from('factures').delete().eq('id', facture.id);
    logger.error('actions.factures', 'createFactures lignes insert failed', {
      factureId: facture.id,
      error: lignesError,
    });
    return null;
  }

  await supabase
    .from('echeances')
    .update({ facture_id: facture.id, validee: true })
    .in('id', group.echeanceIds);

  logAudit(
    'brouillon_created',
    'facture',
    facture.id,
    { mois: moisLabel },
    userId,
  );

  return facture.id;
}

/**
 * Cree des factures BROUILLON (statut 'a_emettre') a partir d'echeances
 * selectionnees. Aucune ref ni email n'est genere a ce stade : il faut
 * appeler sendFacture(s) ensuite pour finaliser.
 *
 * Le statut brouillon permet a l'utilisateur de relire la facture, modifier
 * les lignes ou supprimer le brouillon sans consommer de numero gapless.
 */
export async function createFactures(
  echeanceIds: string[],
): Promise<{ success: boolean; ids: string[]; error?: string }> {
  const parsed = CreateFacturesSchema.safeParse(echeanceIds);
  if (!parsed.success) {
    return {
      success: false,
      ids: [],
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }
  echeanceIds = parsed.data;

  const auth = await checkAuth();
  if (!auth.ok) return { success: false, ids: [], error: auth.error };
  const { supabase, user } = auth;
  const delaiJours = await getDelaiEcheanceJours(supabase);

  // 1. Fetch selected echeances + templates en parallele : independants.
  //    Le templates est un referentiel partage, on l aurait fetched de toute
  //    facon meme si echeances etait vide.
  const [echeancesRes, templatesRes] = await Promise.all([
    supabase
      .from('echeances')
      .select(
        `
        id, mois_concerne, montant_prevu_ht,
        projet:projets!echeances_projet_id_fkey(
          id, ref, taux_commission, echeancier_template_id, echeancier_override,
          client:clients!projets_client_id_fkey(id, trigramme)
        )
      `,
      )
      .in('id', echeanceIds)
      .is('facture_id', null),
    supabase
      .from('echeanciers_templates')
      .select('id, nom, jalons, is_default')
      .eq('archive', false),
  ]);

  const { data: echeances, error: fetchError } = echeancesRes;
  if (fetchError) return { success: false, ids: [], error: fetchError.message };
  if (!echeances || echeances.length === 0) {
    return {
      success: false,
      ids: [],
      error: 'Échéances introuvables ou déjà facturées',
    };
  }

  const { data: templates } = templatesRes;

  // 2. Group echeances by projet_id
  const groups = new Map<
    string,
    {
      projetId: string;
      clientId: string;
      tauxCommission: number;
      echeancierTemplateId: string | null;
      echeancierOverride: unknown;
      moisConcernes: string[];
      echeanceIds: string[];
    }
  >();

  for (const ech of echeances) {
    const projet = ech.projet;
    if (!projet) continue;
    const projetId = projet.id;
    const existing = groups.get(projetId);
    if (existing) {
      existing.moisConcernes.push(ech.mois_concerne);
      existing.echeanceIds.push(ech.id);
    } else {
      groups.set(projetId, {
        projetId,
        clientId: projet.client?.id ?? '',
        tauxCommission: projet.taux_commission ?? 10,
        echeancierTemplateId: projet.echeancier_template_id ?? null,
        echeancierOverride: projet.echeancier_override,
        moisConcernes: [ech.mois_concerne],
        echeanceIds: [ech.id],
      });
    }
  }

  // 3. For each group, create facture + lignes (parallele : chaque groupe est
  //    un projet independant - inserts et updates n'ont aucune dependance
  //    croisee. Rollback reste isole par groupe via le helper).
  const results = await Promise.all(
    Array.from(groups.values()).map((group) =>
      processBrouillonGroup(
        group,
        templates ?? [],
        supabase,
        user.id,
        delaiJours,
      ),
    ),
  );
  const createdIds = results.filter((id): id is string => id !== null);

  revalidatePath('/facturation');

  if (createdIds.length === 0) {
    return {
      success: false,
      ids: [],
      error: 'Aucun brouillon créé - vérifiez les contrats actifs',
    };
  }

  return { success: true, ids: createdIds };
}
