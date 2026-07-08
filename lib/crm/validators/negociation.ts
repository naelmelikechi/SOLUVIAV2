import { z } from 'zod';

// Champs négociation / passation (A2) : capturés dans le pipeline CRM pour
// alimenter buildSyntheseSnapshotFromOpportunite. Tout est optionnel (saisi au
// fil de la négociation) ; "" -> null pour rester propre en base.

const optionalText = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v == null || v === '' ? null : v));

const optionalNum = z.preprocess(
  (v) => (v === '' || v == null ? null : v),
  z.coerce.number().min(0).nullable(),
);

const optionalInt = z.preprocess(
  (v) => (v === '' || v == null ? null : v),
  z.coerce.number().int().min(0).nullable(),
);

const optionalMois = z.preprocess(
  (v) => (v === '' || v == null ? null : v),
  z.coerce.number().int().min(1).max(12).nullable(),
);

const strArray = z.array(z.string()).optional().default([]);

const enumOrNull = <const T extends readonly [string, ...string[]]>(vals: T) =>
  z.preprocess(
    (v) => (v === '' || v == null ? null : v),
    z.enum(vals).nullable(),
  );

// Littéraux alignés sur lib/utils/constants.ts + CHECK de la migration
// 20260708120000_crm_phase2_enrichissement.sql.
export const negociationSchema = z.object({
  perimetre_missions: optionalText,
  formations_rncp: strArray,
  type_formation: enumOrNull(['presentiel', 'distanciel', 'hybride']),
  taux_npec: optionalNum,
  duree_contrat_ans: optionalNum,
  mois_demarrage: optionalMois,
  volume_an1: optionalInt,
  volume_an2: optionalInt,
  volume_an3: optionalInt,
  volume_garanti_seuil: optionalInt,
  leviers: strArray,
  canal_origine: enumOrNull([
    'reseau_developpeur',
    'reseau_direction',
    'linkedin_auto',
    'salon',
    'apporteur',
    'autre',
  ]),
  date_premier_contact: optionalText,
  initiateur: enumOrNull(['soluvia', 'prospect']),
  historique_synthese: optionalText,
  numero_contrat: optionalText,
  type_prospect: enumOrNull(['cfa', 'entreprise']),
});

export type NegociationInput = z.input<typeof negociationSchema>;
export type NegociationParsed = z.infer<typeof negociationSchema>;
