import Image from 'next/image';
import { cn } from '@/lib/crm/utils';

/**
 * Marque Perf.
 * `height` pilote la hauteur du mark.
 * Variante `white` (défaut) pour fonds sombres, `dark` pour fonds clairs.
 */
export function BrandLogo({
  height = 36,
  variant = 'white',
  themed = false,
  className,
  priority,
}: {
  height?: number;
  /** Couleur de la marque pour un fond fixe : `white` (fond sombre), `dark` (fond clair). */
  variant?: 'white' | 'dark';
  /** Si vrai : s'adapte au thème (asset clair en thème clair, asset blanc en `.dark`). */
  themed?: boolean;
  className?: string;
  priority?: boolean;
}) {
  const lockup = (v: 'white' | 'dark', extraClass?: string) => {
    const perf =
      v === 'white' ? '/brand/perf-mark.png' : '/brand/perf-mark-dark.png';
    return (
      <span className={cn('flex items-center', extraClass)}>
        <Image
          src={perf}
          alt="Perf"
          width={height}
          height={height}
          priority={priority}
        />
      </span>
    );
  };

  // Mode adaptatif : on rend les deux variantes, bascule par CSS via `dark:`.
  if (themed) {
    return (
      <div className={cn('flex items-center', className)}>
        {lockup('dark', 'dark:hidden')}
        {lockup('white', 'hidden dark:flex')}
      </div>
    );
  }
  return (
    <div className={cn('flex items-center', className)}>{lockup(variant)}</div>
  );
}
