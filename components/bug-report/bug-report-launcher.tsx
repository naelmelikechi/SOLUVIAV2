'use client';

import { useEffect, useState } from 'react';
import { Bug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BugReportSheet } from './bug-report-sheet';
import { ensureConsoleErrorBuffer } from './console-error-buffer';

export function BugReportLauncher() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    ensureConsoleErrorBuffer();
  }, []);

  return (
    <>
      <Button
        type="button"
        variant="default"
        size="icon"
        aria-label="Signaler un bug"
        title="Signaler un bug"
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-4 z-40 size-10 rounded-full shadow-lg"
      >
        <Bug className="size-4" />
      </Button>
      <BugReportSheet open={open} onOpenChange={setOpen} />
    </>
  );
}
