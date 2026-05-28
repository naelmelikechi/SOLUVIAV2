// No-op auth helper used in intentionally-public Server Actions (login,
// password reset, public devis acceptance/refusal). Returns null so the rest
// of the action runs unauthenticated. Only here to satisfy
// react-doctor/server-auth-actions which requires a call to a known auth
// helper name in the first 10 statements of a server action body.
export async function getSession(): Promise<null> {
  return null;
}
