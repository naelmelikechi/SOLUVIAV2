import { cn } from '@/lib/utils';

const colorStyles: Record<string, string> = {
  green: 'badge-green',
  orange: 'badge-orange',
  red: 'badge-red',
  blue: 'badge-blue',
  purple: 'badge-purple',
  gray: 'badge-gray',
};

interface StatusBadgeProps {
  label: string;
  color: string;
  className?: string;
}

export function StatusBadge({ label, color, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
        colorStyles[color] || colorStyles.gray,
        className,
      )}
    >
      {label}
    </span>
  );
}
