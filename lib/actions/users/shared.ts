import { z } from 'zod';

export type ActionResult = {
  success: boolean;
  error?: string;
  /**
   * Avertissements non-bloquants remontes au caller (ex. email non envoye,
   * notif fan-out KO). L UI peut afficher un toast.warning en plus du
   * toast.success. Avant : ces erreurs etaient silencieusement loguees et
   * l'admin n avait aucun signal.
   */
  warnings?: string[];
};

export const UserIdSchema = z.string().uuid('userId doit être un UUID');

// ---------------------------------------------------------------------------
// Helpers locaux
// ---------------------------------------------------------------------------
