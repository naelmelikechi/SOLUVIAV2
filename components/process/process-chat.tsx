'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Loader2,
  RotateCcw,
  Send,
  Sparkles,
  Square,
  ThumbsDown,
  ThumbsUp,
  X,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  CitationText,
  type CitationSource,
} from '@/components/process/citation-text';
import { cn } from '@/lib/utils';
import type { ProcessListItem } from '@/lib/process/browse';

export interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
}

type FeedbackStatus = 'pending' | 'done' | 'error';
interface FeedbackState {
  rating: 1 | -1;
  status: FeedbackStatus;
}

const UNAVAILABLE_MESSAGE = 'L’assistant est momentanément indisponible.';
const GENERIC_STARTER = 'Que faire en cas de doute sur un process ?';

/** Suggestions de démarrage dérivées des process disponibles (pur, pas d'appel IA). */
export function buildStarterSuggestions(all: ProcessListItem[]): string[] {
  const fromProcess = all
    .slice(0, 3)
    .map((p) => `« ${p.titre} » : par où commencer ?`);
  return [...fromProcess, GENERIC_STARTER];
}

function lastUserQuestion(history: ChatMsg[]): string {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m && m.role === 'user') return m.content;
  }
  return '';
}

function replaceLastAssistant(prev: ChatMsg[], content: string): ChatMsg[] {
  if (prev.length === 0) return prev;
  const idx = prev.length - 1;
  const last = prev[idx];
  if (!last || last.role !== 'assistant') return prev;
  const next = prev.slice();
  next[idx] = { role: 'assistant', content };
  return next;
}

interface ProcessChatProps {
  /** Première question posée (depuis la searchbar du hero) : déclenche le 1er tour au montage. */
  initialQuestion: string;
  /** Retour au mode « parcourir » (reset complet côté parent). */
  onExit: () => void;
}

/** Fil de discussion complet de l'assistant process : tours, streaming, citations, relances, feedback. */
export function ProcessChat({ initialQuestion, onExit }: ProcessChatProps) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [sources, setSources] = useState<CitationSource[]>([]);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [followups, setFollowups] = useState<string[]>([]);
  const [composer, setComposer] = useState('');
  const [feedback, setFeedback] = useState<Record<number, FeedbackState>>({});

  const messagesRef = useRef<ChatMsg[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const turnIdRef = useRef(0);
  const startedRef = useRef(false);

  function updateMessages(updater: (prev: ChatMsg[]) => ChatMsg[]) {
    const next = updater(messagesRef.current);
    messagesRef.current = next;
    setMessages(next);
  }

  const fireFollowups = useCallback(
    async (id: number, question: string, answer: string) => {
      if (!question.trim() || !answer.trim()) return;
      try {
        const res = await fetch('/api/process/followups', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ question, answer }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { suggestions?: string[] };
        if (id !== turnIdRef.current) return; // relances obsolètes (un nouveau tour a démarré)
        setFollowups(
          Array.isArray(data.suggestions) ? data.suggestions.slice(0, 3) : [],
        );
      } catch {
        // best-effort : jamais bloquant pour le fil
      }
    },
    [],
  );

  const runTurn = useCallback(
    async (history: ChatMsg[]) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const id = ++turnIdRef.current;

      updateMessages(() => [...history, { role: 'assistant', content: '' }]);
      setFollowups([]);
      setError(null);
      setAsking(true);

      try {
        const res = await fetch('/api/process/ask', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ messages: history }),
          signal: controller.signal,
        });
        if (id !== turnIdRef.current) return;

        let parsedSources: CitationSource[] = [];
        try {
          const h = res.headers.get('x-process-sources');
          parsedSources = h
            ? (JSON.parse(decodeURIComponent(h)) as CitationSource[])
            : [];
        } catch {
          parsedSources = [];
        }
        setSources(parsedSources);

        if (!res.ok || !res.body) {
          setError(UNAVAILABLE_MESSAGE);
          setAsking(false);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let acc = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (id !== turnIdRef.current) return;
          acc += decoder.decode(value, { stream: true });
          updateMessages((prev) => replaceLastAssistant(prev, acc));
        }
        if (id !== turnIdRef.current) return;
        setAsking(false);
        void fireFollowups(id, lastUserQuestion(history), acc);
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') return;
        if (id !== turnIdRef.current) return;
        setError(UNAVAILABLE_MESSAGE);
        setAsking(false);
      }
    },
    [fireFollowups],
  );

  const ask = useCallback(
    (question: string) => {
      const trimmed = question.trim();
      if (!trimmed) return;
      const history: ChatMsg[] = [
        ...messagesRef.current,
        { role: 'user', content: trimmed },
      ];
      void runTurn(history);
    },
    [runTurn],
  );

  const regenerate = useCallback(() => {
    if (asking) return;
    const current = messagesRef.current;
    const lastIdx = current.length - 1;
    const last = current[lastIdx];
    if (!last || last.role !== 'assistant') return;
    // Retire la dernière réponse assistant et relance sur le même historique
    // (qui se termine donc sur la dernière question utilisateur).
    void runTurn(current.slice(0, lastIdx));
  }, [asking, runTurn]);

  function onStop() {
    abortRef.current?.abort();
    setAsking(false);
  }

  function handleExit() {
    abortRef.current?.abort();
    onExit();
  }

  function onComposerSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (asking || !composer.trim()) return;
    const q = composer;
    setComposer('');
    ask(q);
  }

  async function sendFeedback(index: number, rating: 1 | -1) {
    const msg = messagesRef.current[index];
    if (!msg || msg.role !== 'assistant' || !msg.content) return;
    if (feedback[index]) return; // déjà voté

    let question = '';
    for (let i = index - 1; i >= 0; i--) {
      const m = messagesRef.current[i];
      if (m && m.role === 'user') {
        question = m.content;
        break;
      }
    }

    setFeedback((prev) => ({
      ...prev,
      [index]: { rating, status: 'pending' },
    }));
    try {
      const res = await fetch('/api/process/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          question,
          answer: msg.content,
          rating,
          sources,
        }),
      });
      if (!res.ok) throw new Error('feedback_failed');
      setFeedback((prev) => ({ ...prev, [index]: { rating, status: 'done' } }));
    } catch {
      setFeedback((prev) => ({
        ...prev,
        [index]: { rating, status: 'error' },
      }));
    }
  }

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (initialQuestion.trim()) ask(initialQuestion);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 1 seul tour au montage (ProcessChat est remonté à chaque nouvelle conversation via `key`)
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const firstQuestion = messages.find((m) => m.role === 'user')?.content ?? '';
  const lastIndex = messages.length - 1;

  return (
    <section className="mt-10">
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <span className="font-semibold">
          {firstQuestion ? `« ${firstQuestion} »` : 'Conversation'}
        </span>
        <button
          type="button"
          onClick={handleExit}
          className="text-primary focus-visible:outline-primary ml-auto inline-flex items-center gap-1.5 text-[13px] focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <X className="size-3.5" />
          Nouvelle recherche
        </button>
      </div>

      <div className="flex flex-col gap-4">
        {messages.map((m, i) => {
          if (m.role === 'user') {
            return (
              <div
                key={i}
                className="bg-muted text-foreground ml-auto max-w-[85%] rounded-2xl rounded-br-sm px-4 py-2.5 text-sm"
              >
                {m.content}
              </div>
            );
          }

          const isLast = i === lastIndex;
          const empty = m.content.length === 0;
          const showError = isLast && !!error && empty;
          const showLoader = isLast && asking && empty && !showError;
          const showFooter = !empty && (!isLast || !asking);
          const fb = feedback[i];

          return (
            <div
              key={i}
              aria-live={isLast ? 'polite' : undefined}
              className="border-border bg-card rounded-xl border p-5 shadow-sm"
            >
              <div className="text-primary mb-3 flex items-center gap-2">
                <Sparkles className="size-4" />
                <span className="text-[12.5px] font-semibold tracking-[0.06em] uppercase">
                  Réponse
                </span>
              </div>

              {showError ? (
                <p className="text-destructive text-sm">{error}</p>
              ) : showLoader ? (
                <div className="text-muted-foreground flex items-center gap-2 text-sm">
                  <Loader2 className="size-4 animate-spin" />
                  L&rsquo;assistant lit les process…
                </div>
              ) : (
                <>
                  <CitationText sources={sources}>{m.content}</CitationText>
                  {isLast && asking && (
                    <span
                      aria-hidden
                      className="bg-primary/70 ml-0.5 inline-block h-[1em] w-[2px] animate-pulse align-middle"
                    />
                  )}
                </>
              )}

              {showFooter && (
                <div className="border-border mt-4 flex items-center gap-3 border-t pt-3">
                  {isLast && (
                    <button
                      type="button"
                      onClick={regenerate}
                      className="text-muted-foreground hover:text-primary focus-visible:outline-primary inline-flex items-center gap-1.5 text-[12.5px] focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      <RotateCcw className="size-3.5" />
                      Régénérer
                    </button>
                  )}
                  <div className="ml-auto flex items-center gap-2">
                    {fb?.status === 'done' ? (
                      <span className="text-muted-foreground text-[12.5px]">
                        Merci !
                      </span>
                    ) : (
                      <>
                        <button
                          type="button"
                          aria-label="Réponse utile"
                          aria-pressed={fb?.rating === 1}
                          disabled={!!fb}
                          onClick={() => void sendFeedback(i, 1)}
                          className={cn(
                            'text-muted-foreground hover:text-primary focus-visible:outline-primary rounded p-1 transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50',
                            fb?.rating === 1 && 'text-primary',
                          )}
                        >
                          <ThumbsUp className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label="Réponse pas utile"
                          aria-pressed={fb?.rating === -1}
                          disabled={!!fb}
                          onClick={() => void sendFeedback(i, -1)}
                          className={cn(
                            'text-muted-foreground hover:text-primary focus-visible:outline-primary rounded p-1 transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50',
                            fb?.rating === -1 && 'text-primary',
                          )}
                        >
                          <ThumbsDown className="size-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {followups.length > 0 && !asking && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground mr-0.5 text-[12.5px]">
            Continuer&nbsp;:
          </span>
          {followups.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => ask(f)}
              className="border-border bg-card text-muted-foreground hover:border-primary hover:bg-primary/10 hover:text-primary focus-visible:outline-primary rounded-full border px-3.5 py-[7px] text-[13px] transition focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {f}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={onComposerSubmit}
        className="border-input bg-card focus-within:border-primary focus-within:ring-primary/15 mt-6 flex items-center gap-2 rounded-full border-[1.5px] py-1.5 pr-1.5 pl-4 shadow-sm transition focus-within:ring-4"
      >
        <Input
          value={composer}
          onChange={(e) => setComposer(e.target.value)}
          placeholder="Poser une question de suite…"
          aria-label="Poser une question de suite"
          disabled={asking}
          className="h-9 flex-1 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
        />
        {asking ? (
          <Button
            type="button"
            variant="outline"
            onClick={onStop}
            className="shrink-0 gap-1.5 rounded-full px-4"
          >
            <Square className="size-3.5" />
            Stop
          </Button>
        ) : (
          <Button
            type="submit"
            disabled={!composer.trim()}
            className="shrink-0 gap-1.5 rounded-full px-4"
          >
            <Send className="size-3.5" />
            Envoyer
          </Button>
        )}
      </form>

      <div className="mt-6">
        <h2 className="mb-3 text-[15px] font-semibold tracking-tight">
          Sources
        </h2>
        {sources.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Aucun process finalisé à citer.
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {sources.map((s) => (
              <Link
                key={s.source_fiche_id}
                href={s.url}
                className="group border-border bg-card focus-visible:outline-primary hover:border-foreground/20 flex items-center gap-3 rounded-xl border px-4 py-3.5 text-sm transition hover:-translate-y-px hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="text-muted-foreground block text-[12.5px]">
                    {s.mission}
                  </span>
                  <span className="text-foreground block truncate font-semibold tracking-tight">
                    {s.titre}
                  </span>
                </span>
                <ArrowRight className="text-muted-foreground group-hover:text-primary size-[15px] shrink-0 transition group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
