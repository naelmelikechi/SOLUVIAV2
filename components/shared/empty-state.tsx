import type { LucideIcon } from 'lucide-react';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  /**
   * Ligne pédagogique optionnelle : explique le concept ou le flux qui
   * remplit cette zone (onboarding), sous la description factuelle.
   */
  hint?: string;
  children?: React.ReactNode;
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  hint,
  children,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Icon className="text-muted-foreground/50 mb-4 size-12" />
      <h3 className="text-foreground text-sm font-medium">{title}</h3>
      {description && (
        <p className="text-muted-foreground mt-1 text-sm">{description}</p>
      )}
      {hint && (
        <p className="text-muted-foreground/70 mt-2 max-w-md text-xs">{hint}</p>
      )}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
