import * as React from 'react';
import { Button } from '@/components/crm/ui/button';
import { cn } from '@/lib/crm/utils';

/**
 * Bouton d'action flottant : fixe en bas à droite, toujours visible
 * (même en scroll horizontal/vertical). Utilisé pour les actions « Nouveau … ».
 */
export function Fab({
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      className={cn(
        'fixed right-6 bottom-6 z-30 h-11 rounded-full px-5 shadow-lg',
        className,
      )}
      {...props}
    />
  );
}
