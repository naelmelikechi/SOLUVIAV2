/**
 * Application error types with stable error codes.
 *
 * Why:
 * - Callers can branch on `error.code` instead of parsing messages.
 * - Logs/monitoring can aggregate by code (e.g. spike in FACTURE_CREATE_FAILED).
 * - UI error boundaries can map codes to user-friendly French messages.
 *
 * Convention: codes are UPPER_SNAKE_CASE verbs on nouns, scoped by domain:
 *   PROJETS_FETCH_FAILED, FACTURE_CREATE_FAILED, QUALITE_UPDATE_FAILED, ...
 */

export type AppErrorCode =
  // Generic
  | 'UNKNOWN'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_FAILED'
  // Projets
  | 'PROJETS_FETCH_FAILED'
  | 'PROJET_NOT_FOUND'
  | 'PROJETS_CONTRATS_FETCH_FAILED'
  | 'PROJETS_DOCUMENTS_FETCH_FAILED'
  // Prospects (pipeline commercial)
  | 'PROSPECTS_FETCH_FAILED'
  | 'PROSPECT_NOT_FOUND'
  | 'PROSPECTS_IMPORT_FAILED'
  | 'PROSPECT_UPDATE_FAILED'
  | 'PROSPECT_CONVERT_FAILED'
  | 'PROSPECT_NOTE_FAILED'
  // Idées (boîte à idées)
  | 'IDEES_FETCH_FAILED'
  | 'IDEE_NOT_FOUND'
  | 'IDEE_PROPOSE_FAILED'
  | 'IDEE_UPDATE_FAILED'
  | 'IDEE_VALIDATE_FAILED'
  | 'IDEE_SHIP_FAILED'
  // Clients
  | 'CLIENTS_FETCH_FAILED'
  | 'CLIENT_NOT_FOUND'
  | 'CLIENTS_CONTACTS_FETCH_FAILED'
  | 'CLIENTS_NOTES_FETCH_FAILED'
  | 'CLIENTS_DOCUMENTS_FETCH_FAILED'
  | 'CLIENTS_PROJETS_FETCH_FAILED'
  // Users
  | 'USERS_FETCH_FAILED'
  | 'USER_NOT_FOUND'
  // Factures
  | 'FACTURES_FETCH_FAILED'
  | 'FACTURE_NOT_FOUND'
  | 'FACTURE_CREATE_FAILED'
  | 'FACTURE_UPDATE_FAILED'
  | 'FACTURES_PAIEMENTS_FETCH_FAILED'
  | 'FACTURES_ECHEANCES_FETCH_FAILED'
  // Qualite
  | 'QUALITE_FETCH_FAILED'
  | 'QUALITE_UPDATE_FAILED'
  // Temps
  | 'TEMPS_FETCH_FAILED'
  // Parametres
  | 'PARAMETRES_FETCH_FAILED'
  | 'PARAMETRES_UPDATE_FAILED'
  // Dashboard
  | 'DASHBOARD_FETCH_FAILED'
  // Notifications
  | 'NOTIFICATIONS_FETCH_FAILED'
  // Équipe
  | 'EQUIPE_FETCH_FAILED'
  // Team chat
  | 'TEAM_CHAT_FETCH_FAILED'
  | 'TEAM_CHAT_SEND_FAILED'
  | 'TEAM_CHAT_DELETE_FAILED'
  // Eduvia Sync
  | 'EDUVIA_SYNC_FAILED';

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly context: Record<string, unknown> | undefined;

  constructor(
    code: AppErrorCode,
    message: string,
    options?: { cause?: unknown; context?: Record<string, unknown> },
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = 'AppError';
    this.code = code;
    this.context = options?.context;
  }

  /**
   * Type guard - use in catch blocks when you need to branch on code.
   */
  static is(err: unknown): err is AppError {
    return err instanceof AppError;
  }
}
