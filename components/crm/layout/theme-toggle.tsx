'use client';
import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/crm/ui/button';

/**
 * Bascule clair/sombre. L'icône est pilotée en CSS via la variante `dark:`
 * (pas de lecture de thème au render → aucun mismatch d'hydratation). `setTheme`
 * n'est appelé qu'au clic (post-hydratation), où `resolvedTheme` est défini.
 */
export function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Changer de thème"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
    >
      <Sun className="hidden h-4 w-4 dark:block" />
      <Moon className="block h-4 w-4 dark:hidden" />
    </Button>
  );
}
