'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';

// useRef import kept for scrollRef (DOM ref, not state mirror).
import { Send, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/shared/user-avatar';
import { GiphyPicker } from '@/components/equipe/giphy-picker';
import { deleteTeamMessage, sendTeamMessage } from '@/lib/actions/team-chat';
import type { TeamMessage } from '@/lib/queries/team-chat';
import { formatDistanceToNowStrict } from 'date-fns';
import { fr } from 'date-fns/locale';

interface TeamChatProps {
  initialMessages: TeamMessage[];
  currentUserId: string;
}

/**
 * Team chat panel:
 * - Messages expire at 48h (cleaned by cron)
 * - Supabase Realtime postgres_changes keeps the list fresh across clients
 * - Authors can delete their own messages (RLS enforces this server-side)
 * - Giphy GIFs only (rating=g), no image/video uploads
 */
export function TeamChat({ initialMessages, currentUserId }: TeamChatProps) {
  const [messages, setMessages] = useState<TeamMessage[]>(initialMessages);
  const [contenu, setContenu] = useState('');
  const [pendingGif, setPendingGif] = useState<string | null>(null);
  const [sending, startSending] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Realtime subscription on team_messages. When a message is inserted we
  // fetch it with author info (realtime payload doesn't include the join);
  // on delete we just drop by id. Dedupe uses the functional updater so we
  // always see fresh state.
  useEffect(() => {
    const supabase = createClient();

    // Scoped channel name to avoid collisions if this component mounts twice.
    const channel = supabase
      .channel(`team-messages-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'team_messages' },
        async (payload) => {
          const row = payload.new as {
            id: string;
            user_id: string;
            contenu: string | null;
            gif_url: string | null;
            created_at: string;
          };
          const { data: author } = await supabase
            .from('users')
            .select(
              'prenom, nom, email, avatar_mode, avatar_seed, avatar_regen_date',
            )
            .eq('id', row.user_id)
            .maybeSingle();
          setMessages((prev) => {
            // Dedupe: our own optimistic insert may already be here.
            if (prev.some((m) => m.id === row.id)) return prev;
            return [
              ...prev,
              {
                id: row.id,
                user_id: row.user_id,
                contenu: row.contenu,
                gif_url: row.gif_url,
                created_at: row.created_at,
                author: author
                  ? {
                      prenom: author.prenom,
                      nom: author.nom,
                      email: author.email,
                      avatar_mode: (author.avatar_mode ?? null) as
                        | 'daily'
                        | 'random'
                        | 'frozen'
                        | null,
                      avatar_seed: author.avatar_seed ?? null,
                      avatar_regen_date: author.avatar_regen_date ?? null,
                    }
                  : null,
              },
            ];
          });
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'team_messages' },
        (payload) => {
          const oldRow = payload.old as { id?: string };
          if (oldRow.id) {
            setMessages((prev) => prev.filter((m) => m.id !== oldRow.id));
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Auto-scroll on new message.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = useCallback(() => {
    const trimmed = contenu.trim();
    if (!trimmed && !pendingGif) return;
    startSending(async () => {
      const res = await sendTeamMessage(trimmed || null, pendingGif);
      if (res.success) {
        setContenu('');
        setPendingGif(null);
      } else {
        toast.error(res.error ?? "Impossible d'envoyer");
      }
    });
  }, [contenu, pendingGif]);

  const handleDelete = useCallback(async (id: string) => {
    const res = await deleteTeamMessage(id);
    if (!res.success) {
      toast.error(res.error ?? 'Erreur de suppression');
      return;
    }
    // Optimistic remove - realtime will confirm across other tabs.
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const grouped = useMemo(() => messages, [messages]);

  return (
    <div className="border-border bg-card flex flex-col rounded-xl border">
      <div className="border-border flex items-center justify-between border-b px-4 py-2">
        <h2 className="text-foreground text-sm font-medium">
          Chat équipe
          <span className="text-muted-foreground ml-2 text-xs font-normal">
            messages effacés après 48 h
          </span>
        </h2>
      </div>

      <div
        ref={scrollRef}
        className="flex max-h-96 min-h-48 flex-col gap-3 overflow-y-auto px-4 py-3"
      >
        {grouped.length === 0 ? (
          <p className="text-muted-foreground my-8 text-center text-sm italic">
            Silence radio pour le moment. Le premier qui parle gagne un GIF.
          </p>
        ) : (
          grouped.map((m) => (
            <ChatMessage
              key={m.id}
              message={m}
              isAuthor={m.user_id === currentUserId}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>

      <div className="border-border border-t p-3">
        {pendingGif && (
          <div className="relative mb-2 inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={pendingGif}
              alt="GIF à envoyer"
              className="max-h-32 rounded"
            />
            <button
              type="button"
              className="bg-background/80 border-border absolute top-1 right-1 rounded-full border p-0.5"
              onClick={() => setPendingGif(null)}
              aria-label="Retirer le GIF"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
        <div className="flex items-end gap-1">
          <textarea
            value={contenu}
            onChange={(e) => setContenu(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Écrire un message (Entrée pour envoyer, Maj+Entrée pour saut de ligne)"
            maxLength={2000}
            rows={2}
            className="border-input bg-background flex-1 resize-none rounded-md border px-3 py-2 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
          />
          <GiphyPicker onPick={(url) => setPendingGif(url)} />
          <Button
            type="button"
            size="sm"
            onClick={handleSend}
            disabled={sending || (!contenu.trim() && !pendingGif)}
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function ChatMessage({
  message,
  isAuthor,
  onDelete,
}: {
  message: TeamMessage;
  isAuthor: boolean;
  onDelete: (id: string) => void;
}) {
  const authorName = message.author
    ? `${message.author.prenom} ${message.author.nom}`
    : 'Inconnu';
  const timeAgo = formatDistanceToNowStrict(new Date(message.created_at), {
    addSuffix: true,
    locale: fr,
  });

  return (
    <div className="group flex items-start gap-2">
      {message.author ? (
        <UserAvatar
          email={message.author.email}
          avatarSeed={message.author.avatar_seed}
          avatarMode={message.author.avatar_mode}
          avatarRegenDate={message.author.avatar_regen_date}
          name={authorName}
          size={28}
        />
      ) : (
        <div className="bg-muted h-7 w-7 rounded-full" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-foreground text-sm font-medium">
            {authorName}
          </span>
          <span className="text-muted-foreground text-xs">{timeAgo}</span>
          {isAuthor && (
            <button
              type="button"
              onClick={() => onDelete(message.id)}
              className="text-muted-foreground hover:text-destructive ml-auto opacity-0 transition group-hover:opacity-100"
              aria-label="Supprimer le message"
              title="Annuler l'envoi"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
        {message.contenu && (
          <p className="text-foreground text-sm break-words whitespace-pre-wrap">
            {message.contenu}
          </p>
        )}
        {message.gif_url && (
          <div className="mt-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={message.gif_url}
              alt="GIF"
              className="max-h-48 rounded"
              loading="lazy"
            />
          </div>
        )}
      </div>
    </div>
  );
}
