'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { updateBugReportAction } from '@/lib/actions/bug-reports';
import type { BugReportRow } from '@/lib/queries/bug-reports';

const SEVERITY_VARIANT: Record<string, string> = {
  low: 'bg-blue-100 text-blue-800',
  medium: 'bg-amber-100 text-amber-800',
  high: 'bg-orange-100 text-orange-800',
  critical: 'bg-red-100 text-red-800',
};

const SEVERITY_LABEL: Record<string, string> = {
  low: 'Faible',
  medium: 'Moyenne',
  high: 'Elevee',
  critical: 'Critique',
};

const STATUS_OPTIONS = [
  { value: 'nouveau', label: 'Nouveau' },
  { value: 'en_cours', label: 'En cours' },
  { value: 'resolu', label: 'Resolu' },
  { value: 'wontfix', label: 'Wontfix' },
] as const;

type Status = (typeof STATUS_OPTIONS)[number]['value'];

interface BugDetailProps {
  bug: BugReportRow;
  screenshotUrl: string | null;
}

export function BugDetail({ bug, screenshotUrl }: BugDetailProps) {
  const [status, setStatus] = useState<Status>(bug.status as Status);
  const [resolutionNotes, setResolutionNotes] = useState(
    bug.resolution_notes ?? '',
  );
  const [pending, startTransition] = useTransition();

  const hypotheses = Array.isArray(bug.ai_hypotheses)
    ? (bug.ai_hypotheses as string[])
    : [];

  const consoleErrors = Array.isArray(bug.console_errors)
    ? (bug.console_errors as Array<Record<string, unknown>>)
    : [];

  const viewport = (bug.viewport ?? null) as {
    width?: number;
    height?: number;
    dpr?: number;
  } | null;

  const handleSave = () => {
    startTransition(async () => {
      const res = await updateBugReportAction({
        id: bug.id,
        status,
        resolutionNotes: resolutionNotes.trim() || null,
      });
      if (res.success) {
        toast.success('Bug mis a jour');
      } else {
        toast.error(res.error ?? 'Erreur lors de la mise a jour');
      }
    });
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        {bug.ai_status === 'done' && bug.ai_summary && (
          <Card className="p-4">
            <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
              Analyse IA
            </p>
            <div className="mb-3 flex gap-2">
              {bug.ai_severity && (
                <Badge className={SEVERITY_VARIANT[bug.ai_severity]}>
                  {SEVERITY_LABEL[bug.ai_severity] ?? bug.ai_severity}
                </Badge>
              )}
              {bug.ai_category && (
                <Badge variant="outline" className="capitalize">
                  {bug.ai_category}
                </Badge>
              )}
            </div>
            <p className="text-sm leading-relaxed">{bug.ai_summary}</p>
            {hypotheses.length > 0 && (
              <>
                <p className="text-muted-foreground mt-4 mb-1 text-xs font-semibold tracking-wide uppercase">
                  Hypotheses
                </p>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {hypotheses.map((h, i) => (
                    <li key={i}>{h}</li>
                  ))}
                </ul>
              </>
            )}
          </Card>
        )}

        {bug.ai_status === 'failed' && bug.ai_error && (
          <Card className="border-destructive/50 bg-destructive/5 p-4">
            <p className="text-destructive text-xs font-semibold tracking-wide uppercase">
              Analyse IA echouee
            </p>
            <p className="mt-1 text-sm">{bug.ai_error}</p>
          </Card>
        )}

        {bug.ai_status === 'pending' && (
          <Card className="border-amber-300/50 bg-amber-50 p-4">
            <p className="text-sm text-amber-900">Analyse IA en cours...</p>
          </Card>
        )}

        <Card className="p-4">
          <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
            Commentaire utilisateur
          </p>
          <p className="text-sm whitespace-pre-wrap">{bug.comment}</p>
          {bug.perceived_severity && (
            <p className="text-muted-foreground mt-3 text-xs">
              Severite ressentie:{' '}
              <span className="font-medium capitalize">
                {bug.perceived_severity}
              </span>
            </p>
          )}
        </Card>

        {screenshotUrl && (
          <Card className="p-4">
            <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
              Screenshot
            </p>
            <a href={screenshotUrl} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={screenshotUrl}
                alt="Screenshot du bug"
                className="border-border max-w-full rounded-md border"
              />
            </a>
          </Card>
        )}

        <Card className="p-4">
          <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
            Contexte technique
          </p>
          <dl className="grid grid-cols-[140px_1fr] gap-y-1 text-xs">
            <dt className="text-muted-foreground">Page</dt>
            <dd className="break-all">
              <a
                href={bug.page_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                {bug.page_url}
              </a>
            </dd>
            <dt className="text-muted-foreground">User-Agent</dt>
            <dd className="font-mono break-all">{bug.user_agent ?? '-'}</dd>
            <dt className="text-muted-foreground">Viewport</dt>
            <dd className="font-mono">
              {viewport
                ? `${viewport.width ?? '?'} x ${viewport.height ?? '?'} (dpr ${viewport.dpr ?? '?'})`
                : '-'}
            </dd>
            <dt className="text-muted-foreground">Sentry event</dt>
            <dd className="font-mono">{bug.sentry_event_id ?? '-'}</dd>
          </dl>
          {consoleErrors.length > 0 && (
            <>
              <p className="text-muted-foreground mt-4 mb-1 text-xs font-semibold tracking-wide uppercase">
                Erreurs console
              </p>
              <pre className="bg-muted max-h-64 overflow-auto rounded p-2 font-mono text-[10px] whitespace-pre-wrap">
                {JSON.stringify(consoleErrors, null, 2)}
              </pre>
            </>
          )}
        </Card>
      </div>

      <div className="space-y-4">
        <Card className="p-4">
          <p className="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">
            Workflow
          </p>
          <Label className="text-xs">Statut</Label>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {STATUS_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                type="button"
                size="sm"
                variant={status === opt.value ? 'default' : 'outline'}
                onClick={() => setStatus(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
          <div className="mt-4">
            <Label htmlFor="resolution-notes" className="text-xs">
              Notes de resolution
            </Label>
            <Textarea
              id="resolution-notes"
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
              placeholder="Ce qui a ete fait, le commit/PR, ce qui reste..."
              className="mt-1.5 min-h-24"
              maxLength={2000}
            />
          </div>
          <div className="mt-4">
            <Button
              type="button"
              onClick={handleSave}
              disabled={pending}
              className="w-full"
            >
              {pending ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
