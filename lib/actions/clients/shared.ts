import { z } from 'zod';

export const uuidSchema = z.string().uuid('ID doit être un UUID');
export const clientIdSchema = z.string().uuid('clientId doit être un UUID');
export const optionalTrimmedString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null));
