'use server';

// createBrouillonEcheancier : prépare un brouillon de facture depuis les
// échéances 1/12 dues d'un projet au modèle échéancier (calcul live, cf.
// lib/queries/echeancier-dues.ts). Le serveur RECALCULE toujours les dues :
// le client n'envoie que (projetId, mois), jamais de montants.

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { checkAuth } from '@/lib/auth/guards';
import { logAudit } from '@/lib/utils/audit';
import { logger } from '@/lib/utils/logger';
import { getEcheancierDues } from '@/lib/queries/echeancier-dues';
import {
  uuidSchema,
  dateStringSchema,
  insertBrouillonWithLignes,
  type BrouillonLigneInsert,
} from '@/lib/actions/factures/brouillons-shared';

const CreateBrouillonEcheancierSchema = z.object({
  projetId: uuidSchema('projetId'),
  mois: z
    .array(dateStringSchema)
    .min(1, 'Aucun mois sélectionné')
    .max(24, 'Trop de mois sélectionnés'),
});

export async function createBrouillonEcheancier(input: {
  projetId: string;
  mois: string[];
}): Promise<{ success: boolean; factureId?: string; error?: string }> {
  const parsed = CreateBrouillonEcheancierSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }

  const auth = await checkAuth();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  // Recalcul serveur : seules les échéances réellement dues au moment T
  // partent en brouillon (idempotent : ce qui vient d'être préparé par un
  // autre admin n'est plus dû).
  const { dues } = await getEcheancierDues(parsed.data.projetId);
  const moisSet = new Set(parsed.data.mois);
  const selected = dues.filter((d) => moisSet.has(d.moisConcerne));

  if (selected.length === 0) {
    return {
      success: false,
      error:
        'Aucune échéance due pour ce mois - la page est peut-être périmée, rechargez-la',
    };
  }

  const clientId = selected[0]!.clientId;
  const lignes: BrouillonLigneInsert[] = [];
  for (const due of selected) {
    for (const c of due.contributions) {
      lignes.push({
        contrat_id: c.contratId,
        description: `Commission ${due.tauxCommission}% - ${c.formationTitre ?? ''} - ${c.apprenant} - mois M+${c.moisRelatif}`,
        montant_ht: c.montantHt,
        mois_relatif: c.moisRelatif,
        quote_part: c.quotePart,
        npec_snapshot: c.npecSnapshot,
        taux_commission_snapshot: due.tauxCommission,
      });
    }
  }

  const sortedMois = Array.from(moisSet)
    .toSorted()
    .map((m) => m.slice(0, 7));
  const moisConcerne =
    sortedMois.length === 1
      ? sortedMois[0]!
      : `${sortedMois[0]} - ${sortedMois[sortedMois.length - 1]}`;

  const result = await insertBrouillonWithLignes({
    supabase,
    userId: user.id,
    projetId: parsed.data.projetId,
    clientId,
    lignes,
    logScope: 'createBrouillonEcheancier',
    moisConcerne,
  });

  if (!result.ok) return { success: false, error: result.error };

  logAudit(
    'brouillon_created',
    'facture',
    result.factureId,
    { mois: moisConcerne, modele: 'echeancier', lignes: lignes.length },
    user.id,
  );
  logger.info('actions.factures', 'brouillon echeancier created', {
    factureId: result.factureId,
    projetId: parsed.data.projetId,
    mois: moisConcerne,
  });

  revalidatePath('/facturation');
  return { success: true, factureId: result.factureId };
}
