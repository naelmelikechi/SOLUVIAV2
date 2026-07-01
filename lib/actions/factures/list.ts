'use server';

import { z } from 'zod';
import { checkAuth } from '@/lib/auth/guards';
import { logger } from '@/lib/utils/logger';
import {
  getFacturesPage,
  type FacturesPage,
  type FacturesPageParams,
} from '@/lib/queries/factures';

// Validation defense-en-profondeur des parametres venant du client (« Voir
// plus », changement de filtre/recherche). Le clamp du limit reste fait par
// getFacturesPage ; ici on borne juste la surface d'entree.
const FetchFacturesPageSchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  cursor: z.string().max(512).nullish(),
  statuts: z
    .array(z.enum(['emise', 'payee', 'en_retard', 'avoir']))
    .max(4)
    .optional(),
  searchRef: z.string().max(200).optional(),
  filterProjet: z.string().max(200).optional(),
  filterClient: z.string().max(200).optional(),
});

export type FetchFacturesPageResult =
  | { ok: true; page: FacturesPage }
  | { ok: false; error: string };

/**
 * Server Action « page suivante / re-filtrage » de la liste des factures.
 * Admin only (garde alignee sur la page /facturation). Wrappe getFacturesPage
 * pour les appels client (pagination keyset + filtres pousses cote serveur).
 */
export async function fetchFacturesPage(
  params: FacturesPageParams,
): Promise<FetchFacturesPageResult> {
  const auth = await checkAuth();
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = FetchFacturesPageSchema.safeParse(params);
  if (!parsed.success) {
    return { ok: false, error: 'Parametres de pagination invalides' };
  }

  try {
    const page = await getFacturesPage(parsed.data);
    return { ok: true, page };
  } catch (error) {
    logger.error('actions.factures', 'fetchFacturesPage failed', { error });
    return { ok: false, error: 'Impossible de charger les factures' };
  }
}
