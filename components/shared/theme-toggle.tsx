'use client';

import { useTheme } from 'next-themes';
import { useSyncExternalStore } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip';

const themeOrder = ['system', 'light', 'dark'] as const;

const themeLabels: Record<string, string> = {
  system: 'Systeme',
  light: 'Clair',
  dark: 'Sombre',
};

const themeIcons: Record<string, typeof Sun> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
};

const emptySubscribe = () => () => {};

function useMounted() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon-sm" aria-label="Changer le theme">
        <Monitor className="h-4 w-4" />
      </Button>
    );
  }

  const currentTheme = theme ?? 'system';
  const currentIndex = themeOrder.indexOf(
    currentTheme as (typeof themeOrder)[number],
  );
  const nextTheme =
    themeOrder[(currentIndex + 1) % themeOrder.length] ?? 'system';
  const Icon = themeIcons[currentTheme] ?? Monitor;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setTheme(nextTheme)}
            aria-label={`Theme : ${themeLabels[currentTheme]}. Cliquer pour passer en ${themeLabels[nextTheme]}`}
          />
        }
      >
        <Icon className="h-4 w-4" />
      </TooltipTrigger>
      <TooltipContent side="top">{themeLabels[currentTheme]}</TooltipContent>
    </Tooltip>
  );
}
