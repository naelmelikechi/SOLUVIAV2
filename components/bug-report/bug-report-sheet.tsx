'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Upload, X, Image as ImageIcon } from 'lucide-react';
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

export function BugReportSheet({ open, onOpenChange }: BugReportSheetProps) {
  const [comment, setComment] = useState('');
  const [severity, setSeverity] = useState<Severity | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset state at close
  useEffect(() => {
    if (!open) {
      setComment('');
      setSeverity(null);
      setFile(null);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    }
  }, [open]);

  // Build preview when file changes
  useEffect(() => {
    if (!file) {
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const handleFile = useCallback((f: File | null) => {
    if (!f) {
      setFile(null);
      return;
    }
    if (!ALLOWED_MIME.has(f.type)) {
      toast.error('Format non supporte (PNG, JPG ou WebP).');
      return;
    }
    if (f.size > MAX_BYTES) {
      toast.error('Image trop volumineuse (max 5 Mo).');
      return;
    }
    setFile(f);
  }, []);

  // Clipboard paste (Cmd+V quand le sheet est ouvert)
  useEffect(() => {
    if (!open) return;
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const it of items) {
        if (it.kind === 'file' && it.type.startsWith('image/')) {
          const f = it.getAsFile();
          if (f) {
            handleFile(f);
            e.preventDefault();
            return;
          }
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [open, handleFile]);

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
      if (file) formData.append('screenshot', file, file.name);

      const res = await fetch('/api/bugs', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Erreur lors de l'envoi du bug.");
        return;
      }

      toast.success('Bug signale, merci ! On regarde ca.');
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
            Decris ce qui ne va pas. Plus c&apos;est precis, plus on peut
            corriger vite. Tu peux coller une capture d&apos;ecran (Cmd+V) ou en
            deposer une.
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
              placeholder="Qu'est-ce qui ne va pas ? Que tentais-tu de faire ? Que s'est-il passe ?"
              className="mt-1.5 min-h-32"
              maxLength={5000}
            />
            <p className="text-muted-foreground mt-1 text-xs">
              {comment.trim().length < MIN_COMMENT
                ? `${MIN_COMMENT - comment.trim().length} caracteres minimum`
                : `${comment.length} / 5000`}
            </p>
          </div>

          <div>
            <Label>Severite ressentie</Label>
            <div className="mt-1.5 flex gap-2">
              {(
                [
                  { value: 'genant', label: 'Genant' },
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
            <Label>Capture d&apos;ecran</Label>
            {previewUrl ? (
              <div className="relative mt-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl}
                  alt="Apercu"
                  className="border-border w-full rounded-md border"
                />
                <Button
                  type="button"
                  size="icon-sm"
                  variant="secondary"
                  className="absolute top-2 right-2"
                  onClick={() => setFile(null)}
                  aria-label="Retirer l'image"
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
                  if (dropped) handleFile(dropped);
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
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
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
