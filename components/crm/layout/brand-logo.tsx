import Image from 'next/image';
import { cn } from '@/lib/crm/utils';

/**
 * Marque SOLUVIA (rebrand du CRM). Asset unique thémé par CSS
 * (`dark:brightness-0 dark:invert`), comme la sidebar SOLUVIA. Les props
 * `variant`/`themed` sont conservées pour compat des appelants (ignorées :
 * le thème est géré par CSS).
 */
export function BrandLogo({
  height = 36,
  className,
  priority,
}: {
  height?: number;
  /** Conservé pour compat des appelants perf ; ignoré (thème via CSS). */
  variant?: 'white' | 'dark';
  /** Conservé pour compat des appelants perf ; ignoré (thème via CSS). */
  themed?: boolean;
  className?: string;
  priority?: boolean;
}) {
  return (
    <div className={cn('flex items-center', className)}>
      <Image
        src="/logo.svg"
        alt="Soluvia"
        width={height * 5}
        height={height}
        priority={priority}
        className="dark:brightness-0 dark:invert"
      />
    </div>
  );
}
