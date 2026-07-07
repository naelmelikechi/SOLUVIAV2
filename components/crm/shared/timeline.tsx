import { formatDateTime } from '@/lib/crm/format';
import { label, activiteTypeLabel } from '@/lib/crm/labels';

export type TimelineItem = {
  id: string;
  type: string;
  contenu: string;
  created_at: string;
  auteur: { prenom: string | null; nom: string | null } | null;
};

export function Timeline({ items }: { items: TimelineItem[] }) {
  if (!items.length)
    return <p className="text-muted-foreground text-sm">Aucune activité.</p>;
  return (
    <ol className="border-border space-y-4 border-l pl-4">
      {items.map((it) => (
        <li key={it.id} className="relative">
          <span className="bg-primary absolute top-1 -left-[21px] h-2 w-2 rounded-full" />
          <div className="text-sm">{it.contenu}</div>
          <div className="text-muted-foreground text-xs">
            {[it.auteur?.prenom, it.auteur?.nom].filter(Boolean).join(' ') ||
              '-'}{' '}
            · {formatDateTime(it.created_at)} ·{' '}
            {label(activiteTypeLabel, it.type)}
          </div>
        </li>
      ))}
    </ol>
  );
}
