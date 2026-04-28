'use client';

import Link from 'next/link';
import { Sparkles, ArrowRight } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface UnassignedBannerProps {
  visible: boolean;
}

/**
 * Affiche un bandeau persistant pour les collaborateurs sans projet client
 * affecte. Pointe vers /accueil pour suivre l onboarding.
 */
export function UnassignedBanner({ visible }: UnassignedBannerProps) {
  if (!visible) return null;

  return (
    <div
      className={cn(
        'border-primary/30 bg-primary/5 border-b px-4 py-2.5 md:px-6',
        'flex flex-wrap items-center justify-between gap-3',
      )}
    >
      <div className="flex items-center gap-2.5">
        <Sparkles className="text-primary h-4 w-4 shrink-0" />
        <p className="text-foreground text-sm">
          <span className="font-semibold">En attente d’affectation</span>
          <span className="text-muted-foreground ml-2">
            Suis ton onboarding et saisis ton temps interne en attendant.
          </span>
        </p>
      </div>
      <Link
        href="/accueil"
        className={buttonVariants({ variant: 'default', size: 'sm' })}
      >
        Mon accueil
        <ArrowRight className="ml-1 h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
