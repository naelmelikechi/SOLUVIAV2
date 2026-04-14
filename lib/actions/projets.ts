'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/utils/roles';
import { logger } from '@/lib/utils/logger';

export async function createProjet(data: {
  clientId: string;
  typologieId: string;
  cdpId: string;
  backupCdpId?: string;
  tauxCommission?: number;
  dateDebut?: string;
}): Promise<{ success: boolean; ref?: string; error?: string }> {
  if (!data.clientId) {
    return { success: false, error: 'Le client est requis' };
  }
  if (!data.typologieId) {
    return { success: false, error: 'La typologie est requise' };
  }
  if (!data.cdpId) {
    return { success: false, error: 'Le chef de projet est requis' };
  }

  const supabase = await createClient();

  // Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Non authentifie' };

  // Admin check
  const { data: caller } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (!isAdmin(caller?.role)) {
    return { success: false, error: 'Acces reserve aux administrateurs' };
  }

  // Validate CDP != backup CDP
  if (data.backupCdpId && data.backupCdpId === data.cdpId) {
    return {
      success: false,
      error: 'Le CDP titulaire et le CDP backup doivent etre differents',
    };
  }

  const { data: projet, error } = await supabase
    .from('projets')
    .insert({
      client_id: data.clientId,
      typologie_id: data.typologieId,
      cdp_id: data.cdpId,
      backup_cdp_id: data.backupCdpId || null,
      taux_commission: data.tauxCommission ?? 10,
      date_debut: data.dateDebut || null,
    })
    .select('id, ref')
    .single();

  if (error) {
    logger.error('actions.projets', 'createProjet failed', { error });
    return {
      success: false,
      error: error.message || 'Erreur lors de la creation du projet',
    };
  }

  revalidatePath('/projets');

  return { success: true, ref: projet.ref ?? undefined };
}
