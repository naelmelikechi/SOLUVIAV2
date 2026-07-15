'use server';

import { revalidatePath } from 'next/cache';
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

const CreateSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(5000).optional(),
  priority: z.enum(['urgent', 'high', 'medium', 'low', 'none']),
  targetDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  assigneeId: z.string().uuid().nullable(),
});

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Crée une issue dans Plane depuis SOLUVIA (pousse via l'API serveur).
 * Réservé aux utilisateurs authentifiés ; l'issue est créée dans le projet
 * Plane choisi, assignée au membre choisi (ou personne).
 */
export async function createPlaneTask(input: {
  projectId: string;
  name: string;
  description?: string;
  priority: 'urgent' | 'high' | 'medium' | 'low' | 'none';
  targetDate: string | null;
  assigneeId: string | null;
}): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAuth();
  if (!auth.ok) return { success: false, error: auth.error };
  if (!planeConfigured())
    return { success: false, error: 'Plane non configuré' };

  const parsed = CreateSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'Paramètres invalides' };
  }
  const { projectId, name, description, priority, targetDate, assigneeId } =
    parsed.data;

  try {
    await planeFetch(`/projects/${projectId}/issues/`, {
      method: 'POST',
      body: JSON.stringify({
        name,
        priority,
        target_date: targetDate,
        assignees: assigneeId ? [assigneeId] : [],
        ...(description
          ? {
              description_html: `<p>${escapeHtml(description).replace(/\n/g, '<br/>')}</p>`,
            }
          : {}),
      }),
    });
    revalidatePath('/taches');
    return { success: true };
  } catch (error) {
    logger.error('actions.plane', 'createPlaneTask failed', {
      error,
      projectId,
    });
    return { success: false, error: 'Échec de la création dans Plane' };
  }
}
