'use client';

import { useEffect, useRef, useState } from 'react';
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

  // Reset loaded quand on ferme : sinon a la reouverture, l iframe est
  // re-mount mais loaded reste true, donc on saute le 'Chargement...'
  // et l user voit un cadre blanc le temps que la notice recharge.
  function toggleOpen() {
    setOpen((prev) => {
      if (prev) setLoaded(false);
      return !prev;
    });
  }

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
  }, [onNavigate]);

  return (
    <Card className="mb-4 p-0">
      <button
        type="button"
        onClick={toggleOpen}
        className="hover:bg-muted/30 flex w-full cursor-pointer items-center justify-between gap-2 px-4 py-3 text-left transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <HelpCircle className="text-primary size-4" />
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
            <ExternalLink className="size-3.5" />
          </a>
          {open ? (
            <ChevronUp className="size-4" />
          ) : (
            <ChevronDown className="size-4" />
          )}
        </span>
      </button>
      {open ? (
        <div className="border-t border-[var(--border-light)]">
          {!loaded ? (
            <div className="text-muted-foreground p-6 text-center text-sm">
              Chargement de la notice…
            </div>
          ) : null}
          {/*
            sandbox="allow-scripts allow-same-origin" est generalement deconseille
            par MDN car le contenu peut s'auto-desandboxer s'il partage l'origine
            du parent. Ici l'iframe charge quavia.eduvia.app (cross-origin par
            rapport a app.mysoluvia.com), donc allow-same-origin permet seulement
            au contenu d'acceder a ses propres cookies / storage de quavia.eduvia.app.
            Le scenario de de-sandboxing ne s'applique pas aux iframes cross-origin.
          */}
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
          <iframe
            ref={iframeRef}
            src={url}
            onLoad={() => setLoaded(true)}
            // oxlint-disable-next-line react-doctor/iframe-missing-sandbox
            sandbox="allow-scripts allow-same-origin allow-popups"
            className="h-[400px] w-full border-0"
            title={`Notice ${kind} ${code}`}
          />
        </div>
      ) : null}
    </Card>
  );
}
