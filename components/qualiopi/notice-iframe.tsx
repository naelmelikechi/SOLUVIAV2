'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronUp, ExternalLink, HelpCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';

const NOTICES_BASE = 'https://quavia.eduvia.app';

interface NoticeIframeProps {
  /** Type de notice : indicateur, livrable ou critere */
  kind: 'indicateur' | 'livrable' | 'critere';
  /** Code de l'entite (ex: IND-01, LIV-C1-100, C1) */
  code: string;
  /** Theme : 'light' ou 'dark', synchronise avec l'app SOLUVIA */
  theme?: 'light' | 'dark';
  /**
   * Callback de navigation declenche quand l'utilisateur clique un lien
   * interne dans la notice (postMessage de Quavia).
   */
  onNavigate?: (target: {
    kind: 'indicateur' | 'livrable' | 'critere';
    code: string;
  }) => void;
}

interface QuaviaMessage {
  source: 'quavia';
  action: 'navigate';
  type: 'indicateur' | 'livrable' | 'critere';
  code: string;
}

function isQuaviaMessage(d: unknown): d is QuaviaMessage {
  if (typeof d !== 'object' || d === null) return false;
  const m = d as Record<string, unknown>;
  return (
    m.source === 'quavia' &&
    m.action === 'navigate' &&
    typeof m.code === 'string' &&
    (m.type === 'indicateur' || m.type === 'livrable' || m.type === 'critere')
  );
}

export function NoticeIframe({
  kind,
  code,
  theme = 'light',
  onNavigate,
}: NoticeIframeProps) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const router = useRouter();

  const url = `${NOTICES_BASE}/${kind}s/${encodeURIComponent(code)}?theme=${theme}&interactive=true`;

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      // Filtre par origine pour eviter les messages d'autres iframes
      try {
        const expectedOrigin = new URL(NOTICES_BASE).origin;
        if (event.origin !== expectedOrigin) return;
      } catch {
        return;
      }
      if (!isQuaviaMessage(event.data)) return;
      onNavigate?.({ kind: event.data.type, code: event.data.code });
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onNavigate, router]);

  return (
    <Card className="mb-4 p-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="hover:bg-muted/30 flex w-full cursor-pointer items-center justify-between gap-2 px-4 py-3 text-left transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <HelpCircle className="text-primary h-4 w-4" />
          Notice d&apos;aide Eduvia
          <span className="text-muted-foreground font-mono text-xs">
            {code}
          </span>
        </span>
        <span className="flex items-center gap-2">
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          {open ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </span>
      </button>
      {open ? (
        <div className="border-t border-[var(--border-light)]">
          {!loaded ? (
            <div className="text-muted-foreground p-6 text-center text-sm">
              Chargement de la notice...
            </div>
          ) : null}
          <iframe
            ref={iframeRef}
            src={url}
            onLoad={() => setLoaded(true)}
            sandbox="allow-scripts allow-same-origin allow-popups"
            className="h-[400px] w-full border-0"
            title={`Notice ${kind} ${code}`}
          />
        </div>
      ) : null}
    </Card>
  );
}

/**
 * Helper standalone pour ouvrir la notice dans un nouvel onglet,
 * sans charger l'iframe (cas ou l'iframe est cassee, ou pour mobile).
 */
export function NoticeLink({
  kind,
  code,
  className,
}: {
  kind: 'indicateur' | 'livrable' | 'critere';
  code: string;
  className?: string;
}) {
  const url = `${NOTICES_BASE}/${kind}s/${encodeURIComponent(code)}`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={`border-border text-foreground hover:bg-muted inline-flex h-8 items-center gap-1.5 rounded-md border bg-white px-3 text-sm font-medium transition-colors ${className ?? ''}`}
    >
      <HelpCircle className="h-3.5 w-3.5" />
      Notice d&apos;aide
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}
