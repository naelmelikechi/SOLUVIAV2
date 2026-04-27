'use client';

import { useMemo, useState, useTransition } from 'react';
import { Search, Plus, Filter } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  STATUT_IDEE_ORDER,
  CIBLE_IDEE_LABELS,
  type StatutIdee,
  type CibleIdee,
} from '@/lib/utils/constants';
import { cn } from '@/lib/utils';
import {
  validateIdea,
  rejectIdea,
  markIdeaImplemented,
  reopenIdea,
} from '@/lib/actions/idees';
import { IdeaColumn } from './idea-column';
import { IdeaSubmitDialog } from './idea-submit-dialog';
import { IdeaDetailSheet } from './idea-detail-sheet';
import type { IdeeWithRefs } from '@/lib/queries/idees';

interface IdeasBoardProps {
  initialGrouped: Record<StatutIdee, IdeeWithRefs[]>;
  currentUserId: string;
  isAdmin: boolean;
  canValidate: boolean;
  canShip: boolean;
}

type PendingReject = {
  id: string;
  titre: string;
};

const ALLOWED_TRANSITIONS: Record<StatutIdee, StatutIdee[]> = {
  proposee: ['validee', 'rejetee'],
  validee: ['implementee'],
  implementee: [],
  rejetee: ['proposee'],
};

function isAllowedTransition(from: StatutIdee, to: StatutIdee): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function IdeasBoard({
  initialGrouped,
  currentUserId,
  isAdmin,
  canValidate,
  canShip,
}: IdeasBoardProps) {
  const [submitOpen, setSubmitOpen] = useState(false);
  const [selected, setSelected] = useState<IdeeWithRefs | null>(null);
  const [search, setSearch] = useState('');
  const [cibleFilter, setCibleFilter] = useState<string>('all');
  const [authorFilter, setAuthorFilter] = useState<string>('all');

  const [overrides, setOverrides] = useState<Record<string, StatutIdee>>({});
  const [groupedRef, setGroupedRef] = useState(initialGrouped);
  if (groupedRef !== initialGrouped) {
    setGroupedRef(initialGrouped);
    setOverrides({});
  }

  const [draggedIdee, setDraggedIdee] = useState<IdeeWithRefs | null>(null);
  const [pendingReject, setPendingReject] = useState<PendingReject | null>(
    null,
  );
  const [rejectMotif, setRejectMotif] = useState('');
  const [, startTransition] = useTransition();

  const groupedWithOverrides = useMemo(() => {
    if (Object.keys(overrides).length === 0) return initialGrouped;
    const result: Record<StatutIdee, IdeeWithRefs[]> = {
      proposee: [],
      validee: [],
      implementee: [],
      rejetee: [],
    };
    for (const s of STATUT_IDEE_ORDER) {
      for (const idee of initialGrouped[s]) {
        const override = overrides[idee.id];
        const targetStatut = override ?? idee.statut;
        result[targetStatut].push(
          override ? { ...idee, statut: override } : idee,
        );
      }
    }
    return result;
  }, [initialGrouped, overrides]);

  const filtered = useMemo(() => {
    const result = {} as Record<StatutIdee, IdeeWithRefs[]>;
    for (const s of STATUT_IDEE_ORDER) {
      result[s] = groupedWithOverrides[s].filter((i) => {
        if (
          search &&
          !i.titre.toLowerCase().includes(search.toLowerCase()) &&
          !(i.description ?? '').toLowerCase().includes(search.toLowerCase())
        )
          return false;
        if (cibleFilter !== 'all' && i.cible !== cibleFilter) return false;
        if (authorFilter === 'me' && i.auteur_id !== currentUserId)
          return false;
        return true;
      });
    }
    return result;
  }, [groupedWithOverrides, search, cibleFilter, authorFilter, currentUserId]);

  const totals = useMemo(() => {
    const proposees = filtered.proposee.length;
    const validees = filtered.validee.length;
    const implementees = filtered.implementee.length;
    return { proposees, validees, implementees };
  }, [filtered]);

  const hasActiveFilter =
    search !== '' || cibleFilter !== 'all' || authorFilter !== 'all';

  function setOverride(id: string, statut: StatutIdee) {
    setOverrides((prev) => ({ ...prev, [id]: statut }));
  }

  function clearOverride(id: string) {
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function handleCardDragStart(idee: IdeeWithRefs) {
    setDraggedIdee(idee);
  }

  function handleCardDragEnd() {
    setDraggedIdee(null);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>, to: StatutIdee) {
    const id = e.dataTransfer.getData('application/x-idee-id');
    const from = e.dataTransfer.getData(
      'application/x-idee-statut',
    ) as StatutIdee;
    setDraggedIdee(null);

    if (!id || !from) return;
    if (!isAllowedTransition(from, to)) return;

    if (to === 'validee') {
      setOverride(id, 'validee');
      startTransition(async () => {
        const r = await validateIdea(id);
        if (r.success) {
          toast.success('Idée validée');
        } else {
          clearOverride(id);
          toast.error(r.error ?? 'Erreur');
        }
      });
      return;
    }

    if (to === 'implementee') {
      setOverride(id, 'implementee');
      startTransition(async () => {
        const r = await markIdeaImplemented(id);
        if (r.success) {
          toast.success('Idée marquée comme implémentée');
        } else {
          clearOverride(id);
          toast.error(r.error ?? 'Erreur');
        }
      });
      return;
    }

    if (to === 'rejetee') {
      const idee = groupedWithOverrides[from].find((i) => i.id === id);
      if (!idee) return;
      setPendingReject({ id, titre: idee.titre });
      setRejectMotif('');
      return;
    }

    if (to === 'proposee' && from === 'rejetee') {
      setOverride(id, 'proposee');
      startTransition(async () => {
        const r = await reopenIdea(id);
        if (r.success) {
          toast.success('Idée remise en proposée');
        } else {
          clearOverride(id);
          toast.error(r.error ?? 'Erreur');
        }
      });
      return;
    }
  }

  function handleConfirmReject() {
    if (!pendingReject) return;
    const motif = rejectMotif.trim();
    if (!motif) {
      toast.error('Le motif est requis');
      return;
    }
    const id = pendingReject.id;
    setOverride(id, 'rejetee');
    setPendingReject(null);
    setRejectMotif('');
    startTransition(async () => {
      const r = await rejectIdea(id, motif);
      if (r.success) {
        toast.success('Idée rejetée');
      } else {
        clearOverride(id);
        toast.error(r.error ?? 'Erreur');
      }
    });
  }

  function handleCancelReject() {
    setPendingReject(null);
    setRejectMotif('');
  }

  const validDropTargets = useMemo(() => {
    if (!draggedIdee) return new Set<StatutIdee>();
    return new Set(ALLOWED_TRANSITIONS[draggedIdee.statut]);
  }, [draggedIdee]);

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Proposées" value={totals.proposees} />
        <StatTile label="Validées" value={totals.validees} accent="blue" />
        <StatTile
          label="Implémentées"
          value={totals.implementees}
          accent="green"
        />
      </div>

      <div className="border-border/60 bg-card/50 flex flex-wrap items-center gap-2 rounded-lg border p-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2" />
          <Input
            placeholder="Rechercher une idée..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border-transparent bg-transparent pl-8 focus-visible:border-transparent"
          />
        </div>

        <div className="bg-border/60 mx-1 h-6 w-px" aria-hidden />

        <Filter className="text-muted-foreground ml-1 h-3.5 w-3.5" />

        <Select
          value={cibleFilter}
          onValueChange={(v) => setCibleFilter(v ?? 'all')}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Cible" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes cibles</SelectItem>
            {(Object.keys(CIBLE_IDEE_LABELS) as CibleIdee[]).map((c) => (
              <SelectItem key={c} value={c}>
                {CIBLE_IDEE_LABELS[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={authorFilter}
          onValueChange={(v) => setAuthorFilter(v ?? 'all')}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Auteur" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous auteurs</SelectItem>
            <SelectItem value="me">Mes idées</SelectItem>
          </SelectContent>
        </Select>

        {hasActiveFilter && (
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setCibleFilter('all');
              setAuthorFilter('all');
            }}
            className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline"
          >
            Réinitialiser
          </button>
        )}

        <div className="ml-auto">
          <Button size="sm" onClick={() => setSubmitOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Proposer une idée
          </Button>
        </div>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {STATUT_IDEE_ORDER.map((s) => (
          <IdeaColumn
            key={s}
            statut={s}
            idees={filtered[s]}
            onCardClick={setSelected}
            draggable={isAdmin}
            onCardDragStart={handleCardDragStart}
            onCardDragEnd={handleCardDragEnd}
            onDropIdee={handleDrop}
            isValidDropTarget={validDropTargets.has(s)}
          />
        ))}
      </div>

      <IdeaSubmitDialog open={submitOpen} onOpenChange={setSubmitOpen} />

      <IdeaDetailSheet
        idee={selected}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
        canValidate={canValidate}
        canShip={canShip}
        onOpenChange={(open) => !open && setSelected(null)}
      />

      <Dialog
        open={pendingReject !== null}
        onOpenChange={(o) => !o && handleCancelReject()}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rejeter l&apos;idée</DialogTitle>
          </DialogHeader>
          {pendingReject && (
            <div className="space-y-3">
              <p className="text-muted-foreground text-sm">
                &laquo; {pendingReject.titre} &raquo;
              </p>
              <Textarea
                value={rejectMotif}
                onChange={(e) => setRejectMotif(e.target.value)}
                placeholder="Motif du rejet (obligatoire)..."
                rows={4}
                autoFocus
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={handleCancelReject}>
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmReject}
              disabled={!rejectMotif.trim()}
            >
              Confirmer le rejet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: 'blue' | 'green';
}) {
  return (
    <div
      className={cn(
        'border-border/60 rounded-lg border p-4 transition-colors',
        accent === 'blue' && 'border-blue-500/20 bg-blue-500/5',
        accent === 'green' && 'border-green-500/20 bg-green-500/5',
        !accent && 'bg-card',
      )}
    >
      <div className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
        {label}
      </div>
      <div
        className={cn(
          'mt-1 text-2xl font-semibold tabular-nums',
          accent === 'blue' && 'text-blue-600',
          accent === 'green' && 'text-green-600',
        )}
      >
        {value.toLocaleString('fr-FR')}
      </div>
    </div>
  );
}
