import Link from 'next/link';
import { cn } from '@/lib/utils';

interface ProjectRefProps {
  ref_: string;
  className?: string;
  /** When true, render as a plain span without link (e.g. on the project detail page itself) */
  noLink?: boolean;
}

export function ProjectRef({ ref_, className, noLink }: ProjectRefProps) {
  const classes = cn(
    'text-primary inline-block rounded bg-[var(--primary-bg)] px-2 py-0.5 font-mono text-xs font-semibold',
    !noLink && 'hover:bg-[var(--primary-bg)]/80 transition-colors',
    className,
  );

  if (noLink || !ref_) {
    return <span className={classes}>{ref_}</span>;
  }

  return (
    <Link href={`/projets/${ref_}`} className={classes}>
      {ref_}
    </Link>
  );
}
