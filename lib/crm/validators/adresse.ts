import { z } from 'zod';
import {
  isKnownDepartement,
  isKnownRegion,
  normalizeDepartement,
  regionForDepartement,
} from '@/lib/crm/domain/geo';

/**
 * Une « zone » d'établissement, saisie à granularité libre : ville, département
 * ou région. Tout est facultatif. La région est recalculée depuis le département
 * côté serveur quand celui-ci est présent (source de vérité unique, anti-drift).
 */
export const adresseSchema = z.object({
  libelle: z.string().trim().max(120).optional().or(z.literal('')),
  ville: z.string().trim().max(120).optional().or(z.literal('')),
  departement: z
    .string()
    .trim()
    .optional()
    .or(z.literal(''))
    .refine((v) => !v || isKnownDepartement(v), {
      message: 'Département inconnu',
    }),
  region: z
    .string()
    .trim()
    .optional()
    .or(z.literal(''))
    .refine((v) => !v || isKnownRegion(v), { message: 'Région inconnue' }),
  principal: z.boolean().optional().default(false),
});

export type AdresseInput = z.input<typeof adresseSchema>;
export type AdresseParsed = z.infer<typeof adresseSchema>;

/** true si la ligne est entièrement vide (à ignorer avant insertion). */
export function isAdresseVide(a: AdresseParsed): boolean {
  return !(
    (a.libelle ?? '').trim() ||
    (a.ville ?? '').trim() ||
    (a.departement ?? '').trim() ||
    (a.region ?? '').trim()
  );
}

/**
 * Normalise une adresse pour la persistance : code département canonique +
 * région recalculée depuis le département (sinon région telle quelle).
 */
export function toAdresseRow(a: AdresseParsed): {
  libelle: string | null;
  ville: string | null;
  departement: string | null;
  region: string | null;
  principal: boolean;
} {
  const departement = normalizeDepartement(a.departement || null);
  const region = departement
    ? regionForDepartement(departement)
    : a.region || null || null;
  return {
    libelle: (a.libelle ?? '').trim() || null,
    ville: (a.ville ?? '').trim() || null,
    departement,
    region,
    principal: a.principal ?? false,
  };
}
