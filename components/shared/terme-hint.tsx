'use client';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { GLOSSAIRE, type TermeGlossaire } from '@/lib/utils/glossaire';
import { cn } from '@/lib/utils';

interface TermeHintProps {
  /** Clé du glossaire (lib/utils/glossaire.ts). */
  terme: TermeGlossaire;
  /** Texte affiché (par défaut : children obligatoire, ex. "Avoir"). */
  children: React.ReactNode;
  className?: string;
}

/**
 * Terme métier avec définition au survol : souligné pointillé discret +
 * tooltip. Zéro coût pour qui connaît le terme, une bouée pour les autres.
 */
export function TermeHint({ terme, children, className }: TermeHintProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              className={cn(
                'cursor-help underline decoration-dotted decoration-1 underline-offset-3',
                className,
              )}
            />
          }
        >
          {children}
        </TooltipTrigger>
        <TooltipContent className="max-w-72 text-left">
          {GLOSSAIRE[terme]}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
