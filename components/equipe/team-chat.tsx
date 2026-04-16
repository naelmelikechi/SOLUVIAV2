'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';
import { ArrowDown, Bell, BellOff, Send, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/shared/user-avatar';
import { GiphyPicker } from '@/components/equipe/giphy-picker';
import { deleteTeamMessage, sendTeamMessage } from '@/lib/actions/team-chat';
import type { TeamMessage } from '@/lib/queries/team-chat';
import { formatDistanceToNowStrict } from 'date-fns';
import { fr } from 'date-fns/locale';

const MAX_CONTENU = 2000;
// Auto-scroll tolerance: if the user is within this many px of the bottom we
// consider them "at the bottom" and we scroll on new messages.
const STICK_TO_BOTTOM_PX = 80;
// Minimum interval between two sends (client-side anti-double-click).
const SEND_DEBOUNCE_MS = 600;
// Threshold (ms) past which we show the "disparaît bientôt" retention label.
// Matches the 48h TTL enforced by the cron cleanup job, minus an 8h window.
const TTL_TOTAL_MS = 48 * 60 * 60 * 1000;
const TTL_WARN_MS = 40 * 60 * 60 * 1000;
// Key used for the per-browser opt-in to system notifications.
const NOTIFY_LS_KEY = 'soluvia.team_chat.notify';

interface TeamChatProps {
  initialMessages: TeamMessage[];
  currentUser: {
    id: string;
    prenom: string;
    nom: string;
    email: string;
    avatar_mode: 'daily' | 'random' | 'frozen' | null;
    avatar_seed: string | null;
    avatar_regen_date: string | null;
  };
}

/**
 * Team chat panel (see plan at /Users/nael/.claude/plans/snug-twirling-plum.md).
 *
 * Resilience layers (ordered by how fast they recover from a missed message):
 *   1. Optimistic append after a successful send (own messages appear instantly).
 *   2. Realtime postgres_changes subscription on team_messages (live across users).
 *   3. Delta fetch on mount + on tab focus + on Realtime (re)subscribe — fills
 *      any gap left by the mount/unmount cycle when navigating between pages.
 *   4. Parent page is `dynamic = 'force-dynamic'` so server-side initialMessages
 *      are always fresh at the RSC boundary.
 */
export function TeamChat({ initialMessages, currentUser }: TeamChatProps) {
  const currentUserId = currentUser.id;
  const [messages, setMessages] = useState<TeamMessage[]>(initialMessages);
  const [contenu, setContenu] = useState('');
  const [pendingGif, setPendingGif] = useState<string | null>(null);
  const [sending, startSending] = useTransition();
  const [pendingCount, setPendingCount] = useState(0);
  const [notifyEnabled, setNotifyEnabled] = useState(false);
  const [canAskNotify, setCanAskNotify] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  // Tracks whether the user is currently scrolled near the bottom. When they
  // aren't, new messages trigger the "X nouveaux" pill instead of auto-scroll.
  const isAtBottomRef = useRef(true);
  // Guards against setState after unmount (e.g. delta-fetch resolving late).
  const mountedRef = useRef(true);
  // Last successful message created_at; used as the lower bound for delta fetches.
  const lastSeenAtRef = useRef<string | null>(
    initialMessages.length > 0
      ? (initialMessages[initialMessages.length - 1]?.created_at ?? null)
      : null,
  );
  // Client-side rate-limit: refuse sending faster than SEND_DEBOUNCE_MS.
  const lastSentAtRef = useRef<number>(0);
  // Tracks previous Realtime status so we only resync on true reconnections.
  const lastRealtimeStatusRef = useRef<string | null>(null);

  // ----- Initial opt-in state for browser notifications -------------------
  useEffect(() => {
    mountedRef.current = true;
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setCanAskNotify(false);
      setNotifyEnabled(false);
      return () => {
        mountedRef.current = false;
      };
    }
    const stored = window.localStorage.getItem(NOTIFY_LS_KEY) === '1';
    setNotifyEnabled(stored && Notification.permission === 'granted');
    setCanAskNotify(Notification.permission === 'default');
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ----- Delta fetch helper -------------------------------------------------
  // Pulls any messages strictly after lastSeenAtRef. Merges with dedupe so
  // concurrent Realtime INSERTs don't duplicate rows.
  const deltaFetch = useCallback(async (reason: string) => {
    const supabase = createClient();
    const cutoff =
      lastSeenAtRef.current ??
      new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('team_messages')
      .select(
        `
        id, user_id, contenu, gif_url, created_at,
        author:users!team_messages_user_id_fkey(
          prenom, nom, email, avatar_mode, avatar_seed, avatar_regen_date
        )
      `,
      )
      .gt('created_at', cutoff)
      .order('created_at', { ascending: true });

    if (error || !mountedRef.current) return;

    const rows = (data ?? []).map((row) => {
      const author = Array.isArray(row.author)
        ? (row.author[0] ?? null)
        : (row.author ?? null);
      return {
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
      } satisfies TeamMessage;
    });

    if (rows.length === 0) return;

    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      const added = rows.filter((r) => !seen.has(r.id));
      if (added.length === 0) return prev;
      const merged = [...prev, ...added].sort((a, b) =>
        a.created_at < b.created_at ? -1 : 1,
      );
      return merged;
    });

    const last = rows[rows.length - 1];
    if (last) lastSeenAtRef.current = last.created_at;
    // Only keep the info log to see in Vercel runtime logs how often we rescue messages.
    console.info('[team_chat] delta_fetch_recovered', {
      reason,
      count: rows.length,
    });
  }, []);

  // ----- Realtime subscription + initial + focus/reconnect resyncs -----
  // This effect owns: initial delta-fetch, visibility/focus listeners for
  // re-sync, Realtime INSERT/DELETE subscription, and reconnect-triggered
  // re-sync. All setState calls happen inside subscription/event callbacks
  // or via queueMicrotask — never synchronously in the effect body.
  useEffect(() => {
    const supabase = createClient();

    // Kick off an initial delta-fetch right at mount via a microtask, so the
    // setState in `deltaFetch` happens *after* the effect body returns.
    queueMicrotask(() => {
      void deltaFetch('mount');
    });

    const handleVisibility = () => {
      if (!document.hidden) void deltaFetch('visibilitychange');
    };
    const handleFocus = () => {
      void deltaFetch('window_focus');
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);

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
          if (!mountedRef.current) return;

          setMessages((prev) => {
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
          if (row.created_at > (lastSeenAtRef.current ?? '')) {
            lastSeenAtRef.current = row.created_at;
          }

          // Notification: only if enabled, tab is hidden, and message isn't ours.
          if (
            row.user_id !== currentUserId &&
            typeof window !== 'undefined' &&
            'Notification' in window &&
            Notification.permission === 'granted' &&
            window.localStorage.getItem(NOTIFY_LS_KEY) === '1' &&
            document.hidden
          ) {
            const who = author
              ? `${author.prenom} ${author.nom}`.trim()
              : 'Équipe';
            const preview =
              row.contenu?.slice(0, 140) ??
              (row.gif_url ? '(a envoyé un GIF)' : '');
            try {
              new Notification(`${who} — SOLUVIA`, {
                body: preview,
                tag: 'soluvia-team-chat',
                silent: false,
              });
            } catch {
              /* silently ignore: some browsers throw if not focused */
            }
          }
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
      .subscribe((status) => {
        // Detect reconnection: non-SUBSCRIBED → SUBSCRIBED. On a fresh mount
        // lastRealtimeStatusRef is null, so we skip the redundant fetch
        // (deltaFetch('mount') already ran above).
        const prev = lastRealtimeStatusRef.current;
        lastRealtimeStatusRef.current = status;
        if (status === 'SUBSCRIBED' && prev && prev !== 'SUBSCRIBED') {
          void deltaFetch('realtime_reconnect');
        }
      });

    return () => {
      mountedRef.current = false;
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
      supabase.removeChannel(channel);
    };
    // currentUserId + deltaFetch are stable for the lifetime of the mount;
    // listing them would just re-subscribe needlessly on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ----- Auto-scroll (only if user is at bottom) ---------------------------
  // We intentionally call setPendingCount inside this effect: it's the only
  // way to react to a messages-length change driven by external sources
  // (Realtime, delta-fetch). The cascade stays bounded because the setter
  // either resets to 0 or bumps once per arrived message.
  useEffect(() => {
    if (!scrollRef.current) return;
    if (isAtBottomRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      setPendingCount(0);
    } else {
      // User is scrolled up - bump the "X nouveaux" pill instead.
      setPendingCount((n) => n + 1);
    }
    // We only care about the *count* changing, not message identity.
  }, [messages.length]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distanceFromBottom < STICK_TO_BOTTOM_PX;
    isAtBottomRef.current = atBottom;
    if (atBottom && pendingCount > 0) setPendingCount(0);
  }, [pendingCount]);

  const scrollToBottom = useCallback(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    isAtBottomRef.current = true;
    setPendingCount(0);
  }, []);

  // ----- Send + delete -----------------------------------------------------
  const handleSend = useCallback(() => {
    const trimmed = contenu.trim();
    if (!trimmed && !pendingGif) return;
    const now = Date.now();
    if (now - lastSentAtRef.current < SEND_DEBOUNCE_MS) return;
    lastSentAtRef.current = now;

    startSending(async () => {
      const res = await sendTeamMessage(trimmed || null, pendingGif);
      if (res.success) {
        setContenu('');
        setPendingGif(null);
        // Pin scroll to bottom on own send even if the user was scrolled up.
        isAtBottomRef.current = true;
        if (res.message) {
          const own = res.message;
          setMessages((prev) =>
            prev.some((m) => m.id === own.id)
              ? prev
              : [
                  ...prev,
                  {
                    id: own.id,
                    user_id: own.user_id,
                    contenu: own.contenu,
                    gif_url: own.gif_url,
                    created_at: own.created_at,
                    author: {
                      prenom: currentUser.prenom,
                      nom: currentUser.nom,
                      email: currentUser.email,
                      avatar_mode: currentUser.avatar_mode,
                      avatar_seed: currentUser.avatar_seed,
                      avatar_regen_date: currentUser.avatar_regen_date,
                    },
                  },
                ],
          );
          if (own.created_at > (lastSeenAtRef.current ?? '')) {
            lastSeenAtRef.current = own.created_at;
          }
        }
      } else {
        toast.error(res.error ?? "Impossible d'envoyer");
      }
    });
  }, [contenu, pendingGif, currentUser]);

  const handleDelete = useCallback(async (id: string) => {
    const res = await deleteTeamMessage(id);
    if (!res.success) {
      toast.error(res.error ?? 'Erreur de suppression');
      return;
    }
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  // ----- Notification opt-in -----------------------------------------------
  const enableNotifications = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    const perm =
      Notification.permission === 'default'
        ? await Notification.requestPermission()
        : Notification.permission;
    if (perm === 'granted') {
      window.localStorage.setItem(NOTIFY_LS_KEY, '1');
      setNotifyEnabled(true);
      setCanAskNotify(false);
      toast.success('Notifications activées.');
    } else if (perm === 'denied') {
      setCanAskNotify(false);
      toast.error(
        'Permission refusée. Autorisez les notifications dans le navigateur.',
      );
    }
  }, []);

  const disableNotifications = useCallback(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(NOTIFY_LS_KEY);
    setNotifyEnabled(false);
    toast.success('Notifications désactivées.');
  }, []);

  const grouped = useMemo(() => messages, [messages]);
  const trimmedLen = contenu.trim().length;
  const canSend = !sending && (trimmedLen > 0 || !!pendingGif);

  return (
    <div className="border-border bg-card flex flex-col rounded-xl border">
      <div className="border-border flex items-center justify-between border-b px-4 py-2">
        <h2 className="text-foreground text-sm font-medium">
          Chat équipe
          <span className="text-muted-foreground ml-2 text-xs font-normal">
            messages effacés après 48 h
          </span>
        </h2>
        <div className="flex items-center gap-1">
          {notifyEnabled ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={disableNotifications}
              title="Désactiver les notifications"
              aria-label="Désactiver les notifications"
              className="h-7 w-7 p-0"
            >
              <Bell className="h-3.5 w-3.5" />
            </Button>
          ) : canAskNotify ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={enableNotifications}
              title="Activer les notifications navigateur"
              className="text-muted-foreground h-7 gap-1 px-2 text-xs"
            >
              <BellOff className="h-3.5 w-3.5" />
              Activer les notifs
            </Button>
          ) : null}
        </div>
      </div>

      <div className="relative">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
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

        {pendingCount > 0 && (
          <button
            type="button"
            onClick={scrollToBottom}
            className="bg-primary text-primary-foreground hover:bg-primary/90 absolute right-4 bottom-3 flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium shadow-md transition-colors"
            aria-label={`Voir les ${pendingCount} nouveaux messages`}
          >
            <ArrowDown className="h-3 w-3" />
            {pendingCount} nouveau{pendingCount > 1 ? 'x' : ''}
          </button>
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
            maxLength={MAX_CONTENU}
            rows={2}
            className="border-input bg-background flex-1 resize-none rounded-md border px-3 py-2 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
          />
          <GiphyPicker onPick={(url) => setPendingGif(url)} />
          <Button
            type="button"
            size="sm"
            onClick={handleSend}
            disabled={!canSend}
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="mt-1 flex items-center justify-end">
          <span
            className={`text-[11px] ${
              trimmedLen > MAX_CONTENU * 0.9
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-muted-foreground'
            }`}
          >
            {trimmedLen} / {MAX_CONTENU}
          </span>
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
  // Age thresholds drive the retention label. Computed once at mount — the
  // warning window (40-48h after creation) is wide enough that a single
  // snapshot per render is fine; we don't need live updates per second.
  const [expiringSoon, setExpiringSoon] = useState(false);
  useEffect(() => {
    const update = () => {
      const ageMs = Date.now() - new Date(message.created_at).getTime();
      setExpiringSoon(ageMs > TTL_WARN_MS && ageMs < TTL_TOTAL_MS);
    };
    update();
    const id = setInterval(update, 5 * 60 * 1000); // refresh every 5 min
    return () => clearInterval(id);
  }, [message.created_at]);

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
          {expiringSoon && (
            <span
              className="text-muted-foreground text-[11px] italic"
              title="Les messages sont automatiquement supprimés après 48 h"
            >
              · disparaît bientôt
            </span>
          )}
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
