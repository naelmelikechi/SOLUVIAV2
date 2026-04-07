import { cn } from '@/lib/utils';

interface ProjectRefProps {
  ref_: string;
  className?: string;
}

export function ProjectRef({ ref_, className }: ProjectRefProps) {
  return (
    <span
      className={cn(
        'text-primary inline-block rounded bg-[var(--primary-bg)] px-2 py-0.5 font-mono text-xs font-semibold',
        className,
      )}
    >
      {ref_}
    </span>
  );
}
