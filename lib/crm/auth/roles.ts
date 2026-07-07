import { redirect } from 'next/navigation';
import { cache } from 'react';
import { getUser } from '@/lib/queries/users';
import { isAdmin, canAccessPipeline } from '@/lib/utils/roles';

// Remap de l'auth perf (`profiles` + rôles `admin`/`membre`) sur l'utilisateur
// SOLUVIA (`public.users` + rôles `role_utilisateur`). Mêmes noms exportés que
// le `lib/auth/roles.ts` de perf pour que le code CRM copié compile sans retouche.

export type CrmRole = 'admin' | 'membre';

export type CurrentProfile = {
  id: string;
  email: string | null;
  nom_complet: string | null;
  avatar_url: string | null;
  role: CrmRole;
};

/** Utilisateur SOLUVIA courant (ou null), mémoïsé sur la passe de rendu. */
export const cachedGetUser = cache(async () => (await getUser()) ?? null);

/** Profil CRM dérivé de l'utilisateur SOLUVIA (ou null si non authentifié). */
export const getCurrentProfile = cache(
  async (): Promise<CurrentProfile | null> => {
    const u = await getUser();
    if (!u) return null;
    return {
      id: u.id,
      email: u.email ?? null,
      nom_complet:
        [u.prenom, u.nom].filter(Boolean).join(' ') || (u.email ?? null),
      avatar_url: null,
      role: isAdmin(u.role) ? 'admin' : 'membre',
    };
  },
);

/** Exige un utilisateur avec accès pipeline ; redirige vers /accueil sinon. */
export async function requireCrmUser() {
  const u = await getUser();
  if (!u || !canAccessPipeline(u.role, u.pipeline_access)) redirect('/accueil');
  return u;
}

/** Exige le rôle admin ; redirige sinon. */
export async function requireCrmAdmin() {
  const u = await getUser();
  if (!u) redirect('/login');
  if (!isAdmin(u.role)) redirect('/crm/dashboard');
  return u;
}
