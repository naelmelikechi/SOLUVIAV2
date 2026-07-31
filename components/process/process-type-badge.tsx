import type { LucideIcon } from 'lucide-react';
import { Blocks, CheckCircle2, FileText, GraduationCap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TypeConfig {
  label: string;
  Icon: LucideIcon;
  className: string;
}

const TYPE_CONFIG: Record<string, TypeConfig> = {
  document: {
    label: 'Document',
    Icon: FileText,
    className: 'text-blue-600 bg-blue-500/10 dark:text-blue-400',
  },
  feature: {
    label: 'Fonctionnalité',
    Icon: Blocks,
    className: 'text-[var(--purple)] bg-[var(--purple)]/12',
  },
  formation: {
    label: 'Formation',
    Icon: GraduationCap,
    className: 'text-amber-600 bg-amber-500/10 dark:text-amber-400',
  },
  validation: {
    label: 'Validation',
    Icon: CheckCircle2,
    className: 'text-primary bg-primary/10',
  },
};

/** Badge type d'étape (document/feature/formation/validation) : icône + libellé FR. */
export function ProcessTypeBadge({
  type,
  className,
}: {
  type: string | null;
  className?: string;
}) {
  const config = type ? TYPE_CONFIG[type] : undefined;
  if (!config) return null;
  const { label, Icon } = config;
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-[11.5px] font-semibold whitespace-nowrap',
        config.className,
        className,
      )}
    >
      <Icon className="size-[13px]" />
      {label}
    </span>
  );
}
