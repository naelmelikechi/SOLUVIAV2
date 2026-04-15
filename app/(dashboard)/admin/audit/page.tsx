import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/queries/users';
import { isAdmin } from '@/lib/utils/roles';
import { PageHeader } from '@/components/shared/page-header';
import { UserAvatar } from '@/components/shared/user-avatar';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { Json } from '@/types/database';

export const metadata: Metadata = { title: 'Historique — SOLUVIA' };

/** Map audit action codes to French descriptions */
function describeAction(
  action: string,
  details: Record<string, Json> | null,
): string {
  const d = details ?? {};
  switch (action) {
    case 'facture_created':
      return `a créé la facture ${d.ref ?? ''}`;
    case 'avoir_created':
      return `a créé l'avoir ${d.ref ?? ''}`;
    case 'paiement_created':
      return 'a enregistré un paiement';
    case 'client_created':
      return 'a créé un client';
    case 'client_updated':
      return 'a modifié un client';
    case 'client_archived':
      return 'a archivé un client';
    case 'client_unarchived':
      return 'a restauré un client';
    case 'contact_added':
      return 'a ajouté un contact';
    case 'contact_deleted':
      return 'a supprimé un contact';
    case 'note_added':
      return 'a ajouté une note';
    case 'apikey_added':
      return 'a ajouté une clé API';
    case 'apikey_deleted':
      return 'a supprimé une clé API';
    case 'apikey_toggled':
      return 'a modifié une clé API';
    case 'projet_created':
      return 'a créé un projet';
    case 'user_invited':
      return `a invité ${d.email ?? ''}`;
    case 'user_role_changed':
      return 'a modifié le rôle';
    case 'user_toggled':
      return "a modifié le statut d'un utilisateur";
    case 'profile_updated':
      return 'a modifié son profil';
    case 'password_changed':
      return 'a changé son mot de passe';
    case 'avatar_regenerated':
      return 'a régénéré son avatar';
    case 'avatar_locked':
      return 'a figé son avatar';
    case 'avatar_unlocked':
      return 'a déverrouillé son avatar';
    case 'email_sent':
      return 'a envoyé un email';
    case 'sync_eduvia':
      return 'a lancé la synchronisation Eduvia';
    case 'sync_odoo':
      return 'a lancé la synchronisation Odoo';
    case 'parametres_updated':
      return 'a modifié les paramètres';
    case 'user_updated':
      return 'a modifié un utilisateur';
    default:
      return action.replace(/_/g, ' ');
  }
}

export default async function AuditPage() {
  const user = await getCurrentUser();
  if (!isAdmin(user?.role)) {
    redirect('/projets');
  }

  const supabase = await createClient();

  const { data: logs } = await supabase
    .from('audit_logs')
    .select(
      `
      id, action, entity_type, entity_id, details, created_at,
      user:users!audit_logs_user_id_fkey(id, nom, prenom, email, avatar_seed)
    `,
    )
    .order('created_at', { ascending: false })
    .limit(100);

  return (
    <div>
      <Link
        href="/admin/parametres"
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1.5 text-sm transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Retour aux paramètres
      </Link>

      <PageHeader
        title="Historique"
        description="Dernières actions effectuées sur la plateforme"
      />

      {!logs || logs.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Aucune action enregistrée.
        </p>
      ) : (
        <div className="space-y-0">
          {logs.map((log) => {
            const u = log.user;
            const name = u ? `${u.prenom} ${u.nom}` : 'Utilisateur inconnu';
            const email = u?.email ?? '';
            const avatarSeed = u?.avatar_seed ?? null;
            const timeAgo = formatDistanceToNow(parseISO(log.created_at), {
              addSuffix: true,
              locale: fr,
            });
            const description = describeAction(
              log.action,
              log.details as Record<string, Json> | null,
            );

            return (
              <div
                key={log.id}
                className="border-border flex items-start gap-3 border-b py-3 last:border-b-0"
              >
                <div className="mt-0.5 shrink-0">
                  <UserAvatar
                    email={email}
                    avatarSeed={avatarSeed}
                    name={name}
                    size={28}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="font-semibold">{name}</span>{' '}
                    <span className="text-muted-foreground">{description}</span>
                  </p>
                  <p className="text-muted-foreground text-xs">{timeAgo}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
