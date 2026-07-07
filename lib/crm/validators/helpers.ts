import { z } from 'zod';

/**
 * Champ UUID optionnel : "" (combobox vidé) ou null/undefined -> null.
 * Le type d'entrée reste `string | null | undefined` (compatible react-hook-form),
 * et `.uuid()` ne rejette plus une chaîne vide envoyée par un formulaire.
 */
export const optionalUuid = z
  .string()
  .nullable()
  .optional()
  .refine(
    (v) => v == null || v === '' || z.string().uuid().safeParse(v).success,
    {
      message: 'Identifiant invalide',
    },
  )
  .transform((v) => (v === '' || v == null ? null : v));

/**
 * Champ date optionnel (chaîne ISO) : "" (input date vide) -> null.
 * Évite l'erreur Postgres « invalid input syntax for type date: "" ».
 */
export const optionalDate = z
  .string()
  .nullable()
  .optional()
  .transform((v) => (v === '' || v == null ? null : v));
