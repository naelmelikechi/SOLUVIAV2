'use server';

import { z } from 'zod';
import { requireAuth } from '@/lib/auth/guards';
import { planeConfigured, planeFetch } from '@/lib/plane/client';
import { getPlaneProjectStates } from '@/lib/plane/queries';
import { logger } from '@/lib/utils/logger';

const ToggleSchema = z.object({
  projectId: z.string().uuid(),
  issueId: z.string().uuid(),
  done: z.boolean(),
});

/**
 * Coche/décoche une tâche Plane depuis SOLUVIA : bascule l'issue vers l'état
 * du groupe completed (Done) ou unstarted (Todo). Réservé aux utilisateurs
 * authentifiés ; l'écriture passe par la clé API serveur.
 */
export async function togglePlaneTask(input: {
  projectId: string;
  issueId: string;
  done: boolean;
}): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAuth();
  if (!auth.ok) return { success: false, error: auth.error };
  if (!planeConfigured())
    return { success: false, error: 'Plane non configuré' };

  const parsed = ToggleSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'Paramètres invalides' };
  }
  const { projectId, issueId, done } = parsed.data;

  try {
    const states = await getPlaneProjectStates(projectId);
    if (!states) {
      return { success: false, error: 'États du projet Plane introuvables' };
    }
    await planeFetch(`/projects/${projectId}/issues/${issueId}/`, {
      method: 'PATCH',
      body: JSON.stringify({
        state: done ? states.doneStateId : states.todoStateId,
      }),
    });
    // Pas de revalidatePath : la ligne reste affichée barrée (état optimiste
    // du client) et DÉCOCHABLE. Elle disparaît au prochain chargement.
    return { success: true };
  } catch (error) {
    logger.error('actions.plane', 'togglePlaneTask failed', {
      error,
      issueId,
    });
    return { success: false, error: 'Échec de la mise à jour dans Plane' };
  }
}
