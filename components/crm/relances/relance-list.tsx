'use client';
import { useTransition } from 'react';
import { Archive, Pencil } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { RelanceQuickEdit } from '@/components/crm/relances/relance-quick-edit';
import { bucketRelances } from '@/lib/crm/domain/relances';
import { parseDateOnly } from '@/lib/crm/domain/dates';
import { toggleRelance, archiveRelance } from '@/lib/crm/actions/relances';
import { runWithToast } from '@/components/crm/shared/run-with-toast';
import { formatDateParis } from '@/lib/utils/formatters';
import { label, prioriteLabel } from '@/lib/crm/labels';

type Rel = {
  id: string;
  titre: string;
  date_echeance: string;
  fait: boolean;
  priorite: string;
  note: string | null;
  opportunite: { id: string; intitule: string } | null;
  compte: { id: string; nom: string } | null;
  assignee: { prenom: string | null; nom: string | null } | null;
};

function RelanceRow({ r }: { r: Rel }) {
  // toggleRelance/archiveRelance revalident /relances (route courante) : pas de router.refresh().
  const [pending, start] = useTransition();
  const assigneeNom = [r.assignee?.prenom, r.assignee?.nom]
    .filter(Boolean)
    .join(' ');
  return (
    <li className="flex items-center gap-3 p-3 text-sm">
      <Checkbox
        checked={r.fait}
        disabled={pending} // évite le double-clic pendant la requête (U-L5)
        onCheckedChange={(v) =>
          start(() =>
            runWithToast(() => toggleRelance(r.id, Boolean(v)), {
              error: 'Erreur',
            }),
          )
        }
      />
      <div className="flex-1">
        <div>{r.titre}</div>
        <div className="text-muted-foreground text-xs">
          {r.compte?.nom ?? r.opportunite?.intitule ?? ''} ·{' '}
          {formatDateParis(r.date_echeance)} ·{' '}
          {label(prioriteLabel, r.priorite)}
          {assigneeNom ? ` · ${assigneeNom}` : ''}
        </div>
        {r.note && (
          <div className="text-muted-foreground/80 mt-0.5 text-xs italic">
            {r.note}
          </div>
        )}
      </div>
      <RelanceQuickEdit
        key={`${r.id}-${r.titre}-${r.date_echeance}-${r.priorite}`}
        relance={{
          id: r.id,
          titre: r.titre,
          date_echeance: r.date_echeance,
          priorite: r.priorite,
        }}
        trigger={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Modifier la relance"
            className="text-muted-foreground hover:text-foreground"
          >
            <Pencil className="h-4 w-4" />
          </Button>
        }
      />
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Archiver la relance"
        disabled={pending}
        className="text-muted-foreground hover:text-foreground"
        onClick={() =>
          start(() =>
            runWithToast(() => archiveRelance(r.id), {
              success: 'Relance archivée',
              error: 'Archivage impossible',
            }),
          )
        }
      >
        <Archive className="h-4 w-4" />
      </Button>
    </li>
  );
}

function Section({
  titre,
  items,
  tone = 'normal',
}: {
  titre: string;
  items: Rel[];
  tone?: 'normal' | 'urgent' | 'warn';
}) {
  if (!items.length) return null;
  const heading =
    tone === 'urgent'
      ? 'text-destructive'
      : tone === 'warn'
        ? 'text-warning'
        : 'text-muted-foreground';
  const ring =
    tone === 'urgent'
      ? 'border-destructive/30'
      : tone === 'warn'
        ? 'border-warning/30'
        : 'border-border';
  return (
    <div className="space-y-2">
      <h2 className={`text-sm font-semibold ${heading}`}>
        {titre} ({items.length})
      </h2>
      <ul className={`divide-border divide-y rounded-xl border ${ring}`}>
        {items.map((r) => (
          <RelanceRow key={r.id} r={r} />
        ))}
      </ul>
    </div>
  );
}

export function RelanceList({
  relances,
  today,
}: {
  relances: Rel[];
  today: string;
}) {
  // `today` est calculé côté serveur en Europe/Paris pour éviter le décalage
  // UTC vs fuseau du navigateur dans le classement des relances.
  const b = bucketRelances(relances, parseDateOnly(today));
  const vide = [b.enRetard, b.aujourdhui, b.aVenir, b.plusTard].every(
    (x) => !x.length,
  );
  return (
    <div className="space-y-6">
      <Section titre="En retard" items={b.enRetard} tone="urgent" />
      <Section titre="Aujourd'hui" items={b.aujourdhui} tone="warn" />
      <Section titre="À venir (7j)" items={b.aVenir} />
      <Section titre="Plus tard" items={b.plusTard} />
      {vide && (
        <p className="text-muted-foreground">Aucune relance en cours 🎉</p>
      )}
    </div>
  );
}
