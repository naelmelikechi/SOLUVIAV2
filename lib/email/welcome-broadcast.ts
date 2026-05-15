// Logique pure de filtrage des destinataires du broadcast welcome.
// Separe de la route pour testabilite (pas de Supabase ni de I/O).

export type Role = 'admin' | 'superadmin' | 'cdp' | 'commercial';

export interface BroadcastUser {
  email: string;
  prenom: string;
  role: Role;
  actif: boolean;
  welcome_email_sent_at: string | null;
}

export function filterEligibleRecipients(
  users: BroadcastUser[],
): BroadcastUser[] {
  return users.filter((u) => u.actif && u.welcome_email_sent_at === null);
}
