// Primitives partagees entre les actions brouillon (PAS un module 'use
// server' : rien ici n'est une action, uniquement des schemas/types).
//
// Pourquoi ces schemas : RLS bloque les acces non autorises mais ne contraint
// pas le type. Sans ces guards, un client peut poster montants=NaN,
// ids=garbage ou arrays de 100k items et corrompre les donnees / ouvrir un
// DoS.

import { z } from 'zod';
import type { checkAuth } from '@/lib/auth/guards';

export const uuidSchema = (label: string) =>
  z.string().uuid(`${label} doit être un UUID`);

export const montantHtSchema = z
  .number()
  .finite('Montant doit être un nombre fini')
  .gte(-10_000_000, 'Montant aberrant')
  .lte(10_000_000, 'Montant aberrant');

export const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format de date invalide (attendu YYYY-MM-DD)');

export type SupabaseServerClient = Extract<
  Awaited<ReturnType<typeof checkAuth>>,
  { ok: true }
>['supabase'];
