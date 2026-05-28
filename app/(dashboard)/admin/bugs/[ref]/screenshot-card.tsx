'use client';

import { useState } from 'react';
import { Maximize2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface ScreenshotCardProps {
  url: string;
  label: string;
}

export function ScreenshotCard({ url, label }: ScreenshotCardProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Card className="p-4">
        <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
          {label}
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group border-border relative block w-full cursor-zoom-in overflow-hidden rounded-md border"
          aria-label={`Agrandir : ${label}`}
        >
          {/* oxlint-disable-next-line react-doctor/nextjs-no-img-element */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={label}
            className="block w-full transition-opacity group-hover:opacity-90"
          />
          <span className="absolute top-2 right-2 flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-[11px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
            <Maximize2 className="size-3" />
            Agrandir
          </span>
        </button>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className={cn(
            'max-h-[95vh] w-[95vw] gap-0 p-2 sm:max-w-[95vw]',
            'flex items-center justify-center',
          )}
        >
          <DialogTitle className="sr-only">{label}</DialogTitle>
          {/* oxlint-disable-next-line react-doctor/nextjs-no-img-element */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={label}
            className="max-h-[90vh] w-auto max-w-full rounded-md object-contain"
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
