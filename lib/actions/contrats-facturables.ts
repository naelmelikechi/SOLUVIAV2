'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/utils/roles';
import { logAudit } from '@/lib/utils/audit';
import { logger } from '@/lib/utils/logger';

const InputSchema = z.object({
  contratIds: z.array(z.string().uuid()).min(1).max(200),
  facturable: z.boolean(),
});

/**
 * Marque des contrats comme non facturables (facturation_verrouillee = true)
 * ou les rend à nouveau facturables. Réversible à tout moment depuis la zone
 * « Non facturables » de /a-facturer.
 *
 * Le flag est une colonne SOLUVIA pure (la sync Eduvia ne la touche pas) qui
 * sort le contrat de la liste À facturer, du badge sidebar et de la worklist
 * accueil - sans l'archiver ni le masquer ailleurs.
 *
 * Droits : admin, ou CDP (principal/backup) des projets concernés.
 */
export async function setContratsFacturables(input: {
  contratIds: string[];
  facturable: boolean;
}): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAuth();
  if (!auth.ok) return { success: false, error: auth.error };

  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Paramètres invalides' };
  const { contratIds, facturable } = parsed.data;

  const supabase = await createClient();
  const { data: me } = await supabase
    .from('users')
    .select('id, role')
    .eq('id', auth.user.id)
    .single();
  const admin = isAdmin(me?.role);
  if (!admin && me?.role !== 'cdp') {
    return { success: false, error: 'Accès refusé' };
  }

  // Vérification d'appartenance : les contrats lus via le client RLS de
  // l'utilisateur (CDP = ses projets uniquement). Tout id non retrouvé est
  // soit inexistant soit hors périmètre -> refus global (pas d'écriture
  // partielle silencieuse).
  const { data: visibles, error: visErr } = await supabase
    .from('contrats')
    .select('id')
    .in('id', contratIds);
  if (visErr) {
    logger.error('actions.contrats-facturables', 'visibility check failed', {
      error: visErr,
    });
    return { success: false, error: 'Vérification impossible' };
  }
  if ((visibles ?? []).length !== contratIds.length) {
    return {
      success: false,
      error: 'Un ou plusieurs contrats sont hors de votre périmètre',
    };
  }

  // Écriture via le client admin : la colonne est un drapeau de pilotage
  // SOLUVIA, l'appartenance vient d'être prouvée par la lecture RLS.
  const adminClient = createAdminClient();
  const { error } = await adminClient
    .from('contrats')
    .update({ facturation_verrouillee: !facturable })
    .in('id', contratIds);
  if (error) {
    logger.error('actions.contrats-facturables', 'update failed', { error });
    return { success: false, error: 'Échec de la mise à jour' };
  }

  logAudit(
    facturable ? 'contrat_rendu_facturable' : 'contrat_rendu_non_facturable',
    'contrats',
    contratIds.length === 1 ? contratIds[0] : undefined,
    { contratIds, facturable },
    auth.user.id,
  );
  revalidatePath('/a-facturer');
  revalidatePath('/accueil');
  return { success: true };
}
