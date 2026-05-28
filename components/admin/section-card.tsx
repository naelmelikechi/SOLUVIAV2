'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/card';

interface SectionCardProps {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  muted?: boolean;
}

export function SectionCard({
  icon,
  title,
  children,
  defaultOpen = true,
  muted = false,
}: SectionCardProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card className={muted ? 'opacity-60' : undefined}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-2 px-4 text-left"
      >
        {open ? (
          <ChevronDown className="text-muted-foreground size-4 shrink-0" />
        ) : (
          <ChevronRight className="text-muted-foreground size-4 shrink-0" />
        )}
        {icon}
        <span className="text-sm font-semibold">{title}</span>
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </Card>
  );
}
