/**
 * Matrice centralisee des permissions de gestion d'utilisateurs.
 *
 * Avant : les regles de hierarchie etaient eparpillees dans lib/actions/users.ts
 * (inviteUser:394, updateUserRole:71-84, toggleUserActive:239-247) + duplication
 * silencieuse. Maintenant tout passe par ces helpers.
 *
 * Matrice :
 *   | Action                       | admin | superadmin |
 *   | inviter cdp / commercial     |  oui  |    oui     |
 *   | inviter admin                |  non  |    oui     |
 *   | inviter superadmin           |  non  |    non     |  (jamais via UI)
 *   | modifier un cdp / commercial |  oui  |    oui     |
 *   | modifier un admin            |  non  |    oui     |
 *   | modifier un superadmin       |  non  |    oui*    |  (*sauf soi-meme)
 *   | promouvoir vers admin / sa.  |  non  |    oui     |
 *   | supprimer                    |  non  |    oui     |
 */

import { isAdmin, isSuperAdmin } from '@/lib/utils/roles';

export type Role = 'admin' | 'cdp' | 'superadmin' | 'commercial';
export type InvitableRole = Exclude<Role, 'superadmin'>;
export type AssignableRole = Role;

/**
 * Le caller peut-il modifier (role/profil/actif) un user cible ?
 *
 * Note : ne couvre PAS le cas "self" - le caller test "authUser.id === userId"
 * doit etre fait separement dans chaque action (refus de se modifier soi-meme).
 */
export function canManageUser(
  callerRole: string | null | undefined,
  targetRole: string | null | undefined,
): boolean {
  if (isSuperAdmin(callerRole)) return true;
  // Le caller doit AU MOINS etre admin (un CDP/commercial ne gere personne).
  if (!isAdmin(callerRole)) return false;
  // Un admin classique ne peut PAS toucher a un admin/superadmin.
  return targetRole !== 'admin' && targetRole !== 'superadmin';
}

/**
 * Le caller peut-il assigner ce role (via inviteUser ou updateUserRole) ?
 *
 * - superadmin : tout sauf 'superadmin' (jamais auto-attribue via UI)
 * - admin      : seulement 'cdp' et 'commercial'
 */
export function canAssignRole(
  callerRole: string | null | undefined,
  newRole: AssignableRole,
): boolean {
  if (newRole === 'superadmin') {
    // Pas de promotion vers superadmin via l UI - reserve a une migration manuelle.
    return false;
  }
  if (isSuperAdmin(callerRole)) return true;
  if (!isAdmin(callerRole)) return false;
  return newRole === 'cdp' || newRole === 'commercial';
}

/**
 * Le caller peut-il inviter un user avec ce role ?
 *
 * Identique a canAssignRole mais expose comme alias semantique (le call site
 * est plus lisible).
 */
export function canInviteRole(
  callerRole: string | null | undefined,
  newRole: InvitableRole,
): boolean {
  return canAssignRole(callerRole, newRole);
}

/**
 * Le caller peut-il supprimer un user ?
 *
 * Reserve aux superadmins. Le caller ne doit pas se supprimer lui-meme (check
 * separe dans deleteUser).
 */
export function canDeleteUser(callerRole: string | null | undefined): boolean {
  return isSuperAdmin(callerRole);
}

/**
 * Le caller peut-il renvoyer une invitation ou reset le password d'un user ?
 *
 * Memes regles que canManageUser : admin gere cdp/commercial, superadmin gere
 * tout le monde.
 */
export function canResetUserCredentials(
  callerRole: string | null | undefined,
  targetRole: string | null | undefined,
): boolean {
  return canManageUser(callerRole, targetRole);
}
