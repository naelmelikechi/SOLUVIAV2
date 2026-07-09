'use client';
import { useState, useTransition } from 'react';
import { ArchiveRestore, ChevronDown, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmButton } from '@/components/crm/shared/confirm-button';
import { runWithToast } from '@/components/crm/shared/run-with-toast';
import { restoreRelance, deleteRelance } from '@/lib/crm/actions/relances';
import { formatDate } from '@/lib/crm/format';
import { label, prioriteLabel } from '@/lib/crm/labels';
import { cn } from '@/lib/crm/utils';

type ArchivedRel = {
  id: string;
  titre: string;
  date_echeance: string;
  priorite: string;
  archived_at: string | null;
  opportunite: { id: string; intitule: string } | null;
  compte: { id: string; nom: string } | null;
};

function ArchivedRow({ r }: { r: ArchivedRel }) {
  // restoreRelance/deleteRelance revalident /relances (route courante) : pas de router.refresh().
  const [pending, start] = useTransition();
  return (
    <li className="flex items-center gap-3 p-3 text-sm">
      <div className="flex-1">
        <div className="text-muted-foreground">{r.titre}</div>
        <div className="text-muted-foreground/80 text-xs">
          {r.compte?.nom ?? r.opportunite?.intitule ?? ''} ·{' '}
          {formatDate(r.date_echeance)} · {label(prioriteLabel, r.priorite)}
          {r.archived_at ? ` · archivée le ${formatDate(r.archived_at)}` : ''}
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(() =>
            runWithToast(() => restoreRelance(r.id), {
              success: 'Relance restaurée',
              error: 'Restauration impossible',
            }),
          )
        }
      >
        <ArchiveRestore className="h-4 w-4" />
        Restaurer
      </Button>
      <ConfirmButton
        trigger={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Supprimer définitivement"
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        }
        title="Supprimer définitivement"
        description={`« ${r.titre} » sera définitivement supprimée. Action irréversible.`}
        confirmLabel="Supprimer définitivement"
        errorMessage="Suppression impossible"
        onConfirm={async () => {
          await deleteRelance(r.id);
        }}
      />
    </li>
  );
}

/** Vue Archives repliable : relances archivées (suppression douce), restaurables. */
export function RelanceArchive({ relances }: { relances: ArchivedRel[] }) {
  const [open, setOpen] = useState(false);
  if (!relances.length) return null;
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-sm font-semibold transition-colors"
      >
        <ChevronDown
          className={cn('h-4 w-4 transition-transform', open && 'rotate-180')}
        />
        Archives ({relances.length})
      </button>
      {open && (
        <ul className="divide-border border-border divide-y rounded-xl border">
          {relances.map((r) => (
            <ArchivedRow key={r.id} r={r} />
          ))}
        </ul>
      )}
    </div>
  );
}
