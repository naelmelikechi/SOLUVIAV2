// Re-exports from the split factures module.
// Server Actions live in their respective files (each tagged 'use server').
// This index file is a pure barrel, NOT 'use server', so it can also
// re-export types/interfaces alongside the async functions.

export {
  createFactures,
  createFactureFromEvents,
  createBlankBrouillon,
  createFreeBrouillon,
  deleteBrouillon,
  updateBrouillonInfo,
} from './brouillons';
export type {
  SelectedEvent,
  BlankBrouillonLigne,
  FreeLigne,
} from './brouillons';

export { computeProrataAvoir, createAvoir } from './avoirs';
export type { ProrataBreakdownItem } from './avoirs';

export { sendFacture, sendFacturesBulk } from './emission';

export { addManualPayment } from './payments';
