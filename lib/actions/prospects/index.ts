// Barrel — preserve les imports depuis '@/lib/actions/prospects'.
// Les Server Actions vivent dans les fichiers splittes (chacun 'use server').
// Ce fichier n'est PAS 'use server' : re-export pur.

export {
  loadProspectDetails,
  updateProspectStage,
  updateProspectAssignment,
  bulkUpdateProspects,
  addProspectNote,
  convertProspectToClient,
  deleteProspect,
} from './pipeline';
export { importProspectsFromExcel } from './import-excel';
export { lookupSiren, createProspect } from './create';
export {
  updateProspectNegotiation,
  updateProspectIdentite,
  verifyProspectSiren,
  addProspectContact,
  updateProspectContact,
  deleteProspectContact,
  setProspectContactPrincipal,
} from './fiche';
