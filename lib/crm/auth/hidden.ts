/**
 * Comptes « fantômes » : connexion + accès normaux, mais invisibles dans les
 * listes et sélecteurs d'utilisateurs (page Utilisateurs, choix des commerciaux…).
 *
 * Configuré via la variable d'env `HIDDEN_USER_EMAILS` (emails séparés par des
 * virgules, insensible à la casse). Non `NEXT_PUBLIC` : jamais exposé au client.
 */
export function hiddenEmails(): Set<string> {
  return new Set(
    (process.env.HIDDEN_USER_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isHiddenEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return hiddenEmails().has(email.toLowerCase());
}
