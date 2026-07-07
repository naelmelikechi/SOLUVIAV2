/**
 * Erreur d'action : `message` reste **neutre** (affichable à n'importe qui),
 * `detail` porte la cause technique réelle (Postgres/Supabase). L'appelant décide
 * qui a le droit de voir `detail` (cf. `createOpportuniteComplete` : propriétaire
 * seulement). Sépare « ce qu'on montre » de « ce qu'on logue ».
 */
export class ActionError extends Error {
  readonly detail: string;
  constructor(message: string, detail: string) {
    super(message);
    this.name = 'ActionError';
    this.detail = detail;
  }
}

/**
 * Échec d'action : journalise l'erreur réelle (Postgres/Supabase) côté serveur
 * et lève une `ActionError` dont le `message` est **neutre** (pas de fuite de
 * colonnes/contraintes au tout-venant) mais dont `detail` contient la cause réelle.
 */
export function dbFail(
  error: { message?: string } | null,
  message: string,
): never {
  const detail = `${message}${error?.message ? ` - ${error.message}` : ''}`;
  console.error(`[action] ${detail}`);
  throw new ActionError(message, detail);
}
