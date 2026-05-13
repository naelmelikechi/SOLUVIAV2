'use client';

import { useEffect, useRef, useState } from 'react';
import { Bug } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { BugReportSheet } from './bug-report-sheet';
import { ensureConsoleErrorBuffer } from './console-error-buffer';
import { capturePageScreenshot } from './capture-page';

export function BugReportLauncher() {
  const [open, setOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [autoCapture, setAutoCapture] = useState<Blob | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    ensureConsoleErrorBuffer();
  }, []);

  // Au clic : on cache d'abord le bouton (sinon il apparait dans la
  // capture), on capture, puis on ouvre la sheet.
  async function handleOpen() {
    if (capturing) return;
    setCapturing(true);
    // Cache le bouton dans le DOM pendant la capture pour qu'il ne se
    // retrouve pas dans le screenshot.
    const btn = buttonRef.current;
    const prev = btn?.style.visibility ?? '';
    if (btn) btn.style.visibility = 'hidden';

    // Laisse le navigateur peindre la frame sans le bouton
    await new Promise((r) => requestAnimationFrame(() => r(null)));

    const blob = await capturePageScreenshot();

    if (btn) btn.style.visibility = prev;
    setAutoCapture(blob);
    setCapturing(false);
    setOpen(true);
    if (!blob) {
      toast.info(
        "Capture automatique indisponible. Vous pouvez joindre un screenshot manuellement (Cmd+V ou bouton 'Joindre').",
      );
    }
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setAutoCapture(null);
  }

  return (
    <>
      <Button
        ref={buttonRef}
        type="button"
        variant="default"
        size="icon"
        aria-label="Signaler un bug"
        title="Signaler un bug"
        onClick={handleOpen}
        disabled={capturing}
        data-tour="bug-report"
        className="fixed right-4 bottom-4 z-40 size-10 rounded-full shadow-lg"
      >
        <Bug className="size-4" />
      </Button>
      <BugReportSheet
        open={open}
        onOpenChange={handleOpenChange}
        autoCapture={autoCapture}
      />
    </>
  );
}
