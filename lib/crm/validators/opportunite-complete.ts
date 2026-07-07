import { z } from 'zod';
import { adresseSchema } from './adresse';

/** Champ nombre optionnel : "" / null -> null, sinon entier >= 0. */
const optionalInt = z.preprocess(
  (v) => (v === '' || v == null ? null : v),
  z.coerce.number().int().min(0).nullable(),
);

const contactSchema = z.object({
  prenom: z.string().optional().or(z.literal('')),
  nom: z.string().optional().or(z.literal('')),
  email: z.email('Email invalide').optional().or(z.literal('')),
  telephone: z.string().optional().or(z.literal('')),
});

/**
 * Création unifiée : société + contact(s) + opportunité + 1er RDV + commentaire,
 * en un seul formulaire. Le compte/contact n'est jamais saisi séparément.
 */
export const opportuniteCompleteSchema = z.object({
  societe_nom: z.string().min(1, 'Nom de la société requis'),
  nombre_collaborateurs: optionalInt,
  contacts: z
    .array(contactSchema)
    .min(1, 'Au moins un contact')
    .refine((cs) => cs.some((c) => (c.nom ?? '').trim() !== ''), {
      message: 'Au moins un contact avec un nom',
    }),
  adresses: z.array(adresseSchema).optional().default([]),
  nb_alternants: optionalInt,
  cfa: z.string().optional().or(z.literal('')),
  date_premier_rdv: z.string().optional().or(z.literal('')),
  commentaire: z.string().optional().or(z.literal('')),
  date_cible_prochain_rdv: z
    .string()
    .nullable()
    .optional()
    .transform((v) => (v === '' || v == null ? null : v)),
});

export type OpportuniteCompleteInput = z.input<
  typeof opportuniteCompleteSchema
>;
export type OpportuniteCompleteParsed = z.infer<
  typeof opportuniteCompleteSchema
>;
