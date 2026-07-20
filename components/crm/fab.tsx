import * as React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/crm/utils';

/**
 * Bouton d'action flottant : fixe en bas à droite, toujours visible
 * (même en scroll horizontal/vertical). Utilisé pour les actions « Nouveau … ».
 *
 * `bottom-20` (et non `bottom-6`) : le launcher « Signaler un bug » global
 * (dashboard-shell) est ancré en `bottom-6 right-6` (40px). On empile cette
 * FAB juste au-dessus pour éviter le chevauchement.
 */
export function Fab({
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      className={cn(
        'fixed right-6 bottom-20 z-30 h-11 rounded-full px-5 shadow-lg',
        className,
      )}
      {...props}
    />
  );
}
