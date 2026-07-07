import { z } from 'zod';
import { optionalUuid } from './helpers';

export const rdvSchema = z
  .object({
    titre: z.string().min(1, 'Titre requis'),
    debut: z.string().min(1, 'Début requis'),
    fin: z.string().min(1, 'Fin requise'),
    lieu: z.string().optional().or(z.literal('')),
    opportunite_id: optionalUuid,
    compte_id: optionalUuid,
    notes_prep: z.string().optional().or(z.literal('')),
    commerciaux: z.array(z.string().uuid()).optional().default([]),
  })
  .refine((d) => new Date(d.fin) >= new Date(d.debut), {
    message: 'La fin doit suivre le début',
    path: ['fin'],
  });
export type RdvInput = z.infer<typeof rdvSchema>;
