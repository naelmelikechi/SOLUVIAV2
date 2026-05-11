'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Upload,
  X,
  Image as ImageIcon,
  RefreshCcw,
  Loader2,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { getConsoleErrors } from './console-error-buffer';
import { capturePageScreenshot } from './capture-page';

type Severity = 'genant' | 'bloquant' | 'critique';

const MIN_COMMENT = 20;
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
]);

interface BugReportSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  autoCapture: Blob | null;
}

function getSentryEventId(): string | null {
  try {
    const Sentry = (
      globalThis as unknown as {
        Sentry?: { lastEventId?: () => string | undefined };
      }
    ).Sentry;
    return Sentry?.lastEventId?.() ?? null;
  } catch {
    return null;
  }
}

export function BugReportSheet({
  open,
  onOpenChange,
  autoCapture,
}: BugReportSheetProps) {
  const [comment, setComment] = useState('');
  const [severity, setSeverity] = useState<Severity | null>(null);
  const [autoBlob, setAutoBlob] = useState<Blob | null>(null);
  const [autoUrl, setAutoUrl] = useState<string | null>(null);
  const [recapturing, setRecapturing] = useState(false);
  const [extraFile, setExtraFile] = useState<File | null>(null);
  const [extraUrl, setExtraUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync autoCapture from parent into local state when sheet opens
  useEffect(() => {
    if (open) {
      setAutoBlob(autoCapture);
    } else {
      // Reset all state on close
      setComment('');
      setSeverity(null);
      setAutoBlob(null);
      setExtraFile(null);
    }
  }, [open, autoCapture]);

  // Build preview URLs (revoke on change/unmount)
  useEffect(() => {
    if (!autoBlob) {
      setAutoUrl(null);
      return;
    }
    const url = URL.createObjectURL(autoBlob);
    setAutoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [autoBlob]);

  useEffect(() => {
    if (!extraFile) {
      setExtraUrl(null);
      return;
    }
    const url = URL.createObjectURL(extraFile);
    setExtraUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [extraFile]);

  const handleExtraFile = useCallback((f: File | null) => {
    if (!f) {
      setExtraFile(null);
      return;
    }
    if (!ALLOWED_MIME.has(f.type)) {
      toast.error('Format non supporté (PNG, JPG ou WebP).');
      return;
    }
    if (f.size > MAX_BYTES) {
      toast.error('Image trop volumineuse (max 5 Mo).');
      return;
    }
    setExtraFile(f);
  }, []);

  // Clipboard paste (Cmd+V quand la sheet est ouverte) : alimente extra
  useEffect(() => {
    if (!open) return;
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const it of items) {
        if (it.kind === 'file' && it.type.startsWith('image/')) {
          const f = it.getAsFile();
          if (f) {
            handleExtraFile(f);
            e.preventDefault();
            return;
          }
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [open, handleExtraFile]);

  async function recapture() {
    if (recapturing) return;
    setRecapturing(true);
    // Ferme temporairement la sheet pour qu'elle n'apparaisse pas dans la
    // capture. On re-ouvre apres.
    onOpenChange(false);
    await new Promise((r) => setTimeout(r, 250));
    const blob = await capturePageScreenshot();
    setAutoBlob(blob);
    setRecapturing(false);
    onOpenChange(true);
    if (!blob) toast.error('La capture a échoué.');
  }

  const canSubmit = comment.trim().length >= MIN_COMMENT && !submitting;

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const payload = {
        comment: comment.trim(),
        perceivedSeverity: severity,
        pageUrl: window.location.href,
        userAgent: navigator.userAgent,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          dpr: window.devicePixelRatio,
        },
        consoleErrors: getConsoleErrors(),
        sentryEventId: getSentryEventId(),
      };

      const formData = new FormData();
      formData.append('payload', JSON.stringify(payload));
      if (autoBlob) {
        formData.append('auto_screenshot', autoBlob, 'auto.png');
      }
      if (extraFile) {
        formData.append('extra_screenshot', extraFile, extraFile.name);
      }

      const res = await fetch('/api/bugs', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Erreur lors de l'envoi du bug.");
        return;
      }

      toast.success('Bug signalé, merci ! On regarde ça.');
      onOpenChange(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Erreur lors de l'envoi.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Signaler un bug</SheetTitle>
          <SheetDescription>
            Décris ce qui ne va pas. Une capture de la page a été ajoutée
            automatiquement. Tu peux en ajouter une seconde (Cmd+V, drag, ou
            upload).
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-4 px-4 pb-4">
          <div>
            <Label htmlFor="bug-comment">
              Que se passe-t-il ? <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="bug-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Qu'est-ce qui ne va pas ? Que tentais-tu de faire ? Que s'est-il passé ?"
              className="mt-1.5 min-h-32"
              maxLength={5000}
            />
            <p className="text-muted-foreground mt-1 text-xs">
              {comment.trim().length < MIN_COMMENT
                ? `${MIN_COMMENT - comment.trim().length} caractères minimum`
                : `${comment.length} / 5000`}
            </p>
          </div>

          <div>
            <Label>Sévérité ressentie</Label>
            <div className="mt-1.5 flex gap-2">
              {(
                [
                  { value: 'genant', label: 'Gênant' },
                  { value: 'bloquant', label: 'Bloquant' },
                  { value: 'critique', label: 'Critique' },
                ] as const
              ).map((opt) => (
                <Button
                  key={opt.value}
                  type="button"
                  size="sm"
                  variant={severity === opt.value ? 'default' : 'outline'}
                  onClick={() =>
                    setSeverity((s) => (s === opt.value ? null : opt.value))
                  }
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label>Capture automatique de la page</Label>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                onClick={recapture}
                disabled={recapturing}
                data-icon="inline-start"
              >
                {recapturing ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <RefreshCcw className="size-3" />
                )}
                {recapturing ? 'Capture...' : 'Refaire la capture'}
              </Button>
            </div>
            {autoUrl ? (
              <div className="relative mt-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={autoUrl}
                  alt="Capture automatique"
                  className="border-border w-full rounded-md border"
                />
                <Button
                  type="button"
                  size="icon-sm"
                  variant="secondary"
                  className="absolute top-2 right-2"
                  onClick={() => setAutoBlob(null)}
                  aria-label="Retirer la capture automatique"
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            ) : (
              <div className="border-border bg-muted/30 text-muted-foreground mt-1.5 rounded-md border border-dashed px-4 py-3 text-xs">
                Aucune capture automatique. Tu peux en relancer une.
              </div>
            )}
          </div>

          <div>
            <Label>Capture supplémentaire (optionnelle)</Label>
            {extraUrl ? (
              <div className="relative mt-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={extraUrl}
                  alt="Capture supplémentaire"
                  className="border-border w-full rounded-md border"
                />
                <Button
                  type="button"
                  size="icon-sm"
                  variant="secondary"
                  className="absolute top-2 right-2"
                  onClick={() => setExtraFile(null)}
                  aria-label="Retirer la capture supplémentaire"
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            ) : (
              <div
                role="button"
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const dropped = e.dataTransfer.files?.[0];
                  if (dropped) handleExtraFile(dropped);
                }}
                className={cn(
                  'border-border bg-muted/30 text-muted-foreground hover:bg-muted/50 mt-1.5 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed px-4 py-6 text-sm transition',
                  dragOver && 'border-primary bg-primary/5',
                )}
              >
                <ImageIcon className="size-5" />
                <p className="text-center">
                  Cliquer, glisser une image ici, ou Cmd+V pour coller
                </p>
                <p className="text-xs">PNG, JPG, WebP - max 5 Mo</p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp"
              className="hidden"
              onChange={(e) => handleExtraFile(e.target.files?.[0] ?? null)}
            />
          </div>
        </div>

        <div className="border-border flex justify-end gap-2 border-t p-4">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Annuler
          </Button>
          <Button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            data-icon="inline-start"
          >
            <Upload className="size-3.5" />
            {submitting ? 'Envoi...' : 'Envoyer'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
