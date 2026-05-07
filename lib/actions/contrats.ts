'use server';

import { z } from 'zod';
import { getContratDetail } from '@/lib/queries/contrats';

// ---------------------------------------------------------------------------
// Schema Zod (validation cote serveur, defense en profondeur)
// ---------------------------------------------------------------------------
// Pourquoi : meme en read-only, on garde la guarantie que la query DB ne
// recoit pas une string arbitraire (eviter erreurs Postgres / leaks).

const FetchContratDetailSchema = z
  .string()
  .uuid('Contrat ID doit etre un UUID');

export async function fetchContratDetail(contratId: string) {
  const parsed = FetchContratDetailSchema.safeParse(contratId);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Contrat ID invalide');
  }
  return getContratDetail(parsed.data);
}
