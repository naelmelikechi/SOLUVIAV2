'use server';

import {
  checkDuplicateBilling,
  getProjetActiveContratsForFacturation,
  type ProjetForFacturation,
} from '@/lib/queries/factures';

// ---------------------------------------------------------------------------
// Wrappers server-action pour exposer les queries cote client (utilises par
// le LigneEditDialog : suggestion auto + warning duplicate non bloquant).
// ---------------------------------------------------------------------------

export async function fetchProjetContrats(
  projetId: string,
): Promise<ProjetForFacturation | null> {
  return getProjetActiveContratsForFacturation(projetId);
}

export type DuplicateCheckResult =
  | { duplicate: false }
  | {
      duplicate: true;
      onFactureRef: string | null;
      onFactureStatut: string;
      moisRelatif: number;
    };

export async function checkDuplicate(
  contratId: string,
  moisRelatif: number,
  excludeFactureId?: string,
): Promise<DuplicateCheckResult> {
  return checkDuplicateBilling({ contratId, moisRelatif, excludeFactureId });
}
