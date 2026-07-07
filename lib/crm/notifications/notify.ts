import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/crm/database.types';
import { isHiddenEmail } from '@/lib/crm/auth/hidden';

export type NotifType = 'mention' | 'rdv_assigned' | 'relance_assigned';

export type NotifInput = {
  user_id: string;
  actor_id: string | null;
  type: NotifType;
  contenu: string;
  link: string | null;
};

/**
 * Insère des notifications en **best-effort** : ne lève jamais. Une notif ratée
 * (table 0011 absente, RLS, etc.) ne doit jamais casser l'action métier qui l'a
 * déclenchée (note, relance, RDV). Les doublons destinataires sont dédupliqués.
 */
export async function createNotifications(
  supabase: SupabaseClient<Database, 'crm'>,
  notifs: NotifInput[],
): Promise<void> {
  const clean = notifs.filter((n) => n.user_id);
  if (clean.length === 0) return;
  try {
    const { error } = await supabase.from('notifications').insert(clean);
    if (error && error.code !== '42P01') {
      console.error('[notif] insertion échouée:', error.message);
    }
  } catch (e) {
    console.error(
      '[notif] insertion échouée:',
      e instanceof Error ? e.message : String(e),
    );
  }
}

/**
 * Nom affichable de l'acteur d'une notification (nom complet, à défaut email).
 * Compte fantôme : nom générique — son identité ne doit JAMAIS être écrite dans
 * le contenu d'une notification (le texte, contrairement aux jointures, n'est
 * pas filtrable par la RLS après coup).
 */
export async function actorName(
  supabase: SupabaseClient<Database, 'crm'>,
  user: { id: string; email?: string | null } | null,
): Promise<string> {
  if (!user?.id) return "Quelqu'un";
  if (isHiddenEmail(user.email)) return 'Un collègue';
  // SOLUVIA : l'identité utilisateur vit dans `public.users` (prenom + nom), pas
  // dans un `profiles.nom_complet`. Le client est scopé `crm` : l'accès cross-schema
  // à `public.users` échappe au typage → cast local non scopé pour ce seul SELECT.
  const { data } = await (supabase as unknown as SupabaseClient)
    .schema('public')
    .from('users')
    .select('prenom, nom')
    .eq('id', user.id)
    .maybeSingle();
  const nomComplet = data
    ? [data.prenom, data.nom].filter(Boolean).join(' ').trim()
    : '';
  return nomComplet || user.email || "Quelqu'un";
}

/** Tronque un texte pour l'extrait d'une notification. */
export function excerpt(text: string, max = 80): string {
  const t = text.trim().replace(/\s+/g, ' ');
  return t.length > max ? `${t.slice(0, max).trimEnd()}…` : t;
}
