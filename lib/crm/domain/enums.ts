// Source unique des enums métier stockés en base (CHECK constraints 0001/0015).
// Avant : "ouverte"/"gagnee"/"perdue" répété dans 11 fichiers, priorite définie
// 3 fois, rôles 18 fois — et database.types.ts typait tout en `string`.
export const OPP_STATUTS = ['ouverte', 'gagnee', 'perdue'] as const;
export type OppStatut = (typeof OPP_STATUTS)[number];

export const RDV_STATUTS = ['planifie', 'realise', 'annule'] as const;
export type RdvStatut = (typeof RDV_STATUTS)[number];

export const PRIORITES = ['basse', 'normale', 'haute'] as const;
export type Priorite = (typeof PRIORITES)[number];

export const ROLES = ['admin', 'membre'] as const;
export type Role = (typeof ROLES)[number];
