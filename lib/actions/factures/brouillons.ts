// Barrel de compatibilite : les actions brouillon vivaient toutes ici
// (1223 lignes) avant le split par responsabilite. Garde les imports
// existants (`@/lib/actions/factures/brouillons` et l'index) stables.
//
//   brouillon-echeancier.ts  : createFactures (echeancier auto par projet)
//   brouillon-from-events.ts : createFactureFromEvents (facturation manuelle)
//   brouillon-libre.ts       : createBlankBrouillon + createFreeBrouillon
//   brouillon-mutations.ts   : deleteBrouillon + updateBrouillonInfo
//   brouillons-shared.ts     : primitives zod + type SupabaseServerClient
//
// PAS de 'use server' ici : pur re-export, chaque action est deja taggee
// dans son module (meme pattern que ./index.ts).

export { createFactures } from './brouillon-echeancier';
export { deleteBrouillon, updateBrouillonInfo } from './brouillon-mutations';
export { createFactureFromEvents } from './brouillon-from-events';
export type { SelectedEvent } from './brouillon-from-events';
export { createBlankBrouillon, createFreeBrouillon } from './brouillon-libre';
export type { BlankBrouillonLigne, FreeLigne } from './brouillon-libre';
