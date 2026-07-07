import { z } from 'zod';
import { optionalUuid } from './helpers';
import { PRIORITES } from '@/lib/crm/domain/enums';

export const relanceSchema = z.object({
  titre: z.string().min(1, 'Titre requis'),
  opportunite_id: optionalUuid,
  compte_id: optionalUuid,
  date_echeance: z.string().min(1, 'Échéance requise'),
  assignee_id: optionalUuid,
  priorite: z.enum(PRIORITES).default('normale'),
  note: z.string().optional().or(z.literal('')),
});
export type RelanceInput = z.infer<typeof relanceSchema>;
