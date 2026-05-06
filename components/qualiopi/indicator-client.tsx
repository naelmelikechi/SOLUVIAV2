'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink, User as UserIcon, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { StatusBadge } from '@/components/shared/status-badge';
import {
  DELIVERABLE_STATUS_LABELS,
  EVIDENCE_STATUS_LABELS,
  RECURRENCE_LABELS,
  type QualityDeliverable,
  type QualityDeliverableStatus,
  type QualityEvidence,
} from '@/lib/eduvia/quality-types';
import type { QualiopiAssignment } from '@/lib/queries/qualiopi';
import type { ActiveUserMinimal } from '@/lib/queries/users';
import { assignIndicatorResponsible } from '@/lib/actions/qualiopi';

interface IndicatorClientProps {
  clientId: string;
  clientRef: string;
  campusId: number;
  criterionId: number;
  indicatorId: number;
  indicatorCode: string;
  deliverables: Array<{
    deliverable: QualityDeliverable;
    status: QualityDeliverableStatus | undefined;
  }>;
  selectedDeliverableId: number | null;
  selectedEvidences: QualityEvidence[];
  currentAssignment: QualiopiAssignment | null;
  availableUsers: ActiveUserMinimal[];
}

const STATUS_COLOR: Record<
  string,
  'green' | 'orange' | 'red' | 'gray' | 'blue' | 'purple'
> = {
  conform: 'green',
  to_review: 'orange',
  rejected: 'red',
  expired: 'red',
  missing: 'gray',
};

export function IndicatorClient({
  clientId,
  clientRef,
  campusId,
  criterionId,
  indicatorId,
  indicatorCode,
  deliverables,
  selectedDeliverableId,
  selectedEvidences,
  currentAssignment,
  availableUsers,
}: IndicatorClientProps) {
  const router = useRouter();
  const [assignOpen, setAssignOpen] = useState(false);

  function selectDeliverable(deliverableId: number | null) {
    const base = `/qualiopi/${clientRef}/${campusId}/${criterionId}/${indicatorId}`;
    router.push(deliverableId ? `${base}?d=${deliverableId}` : base);
  }

  void indicatorCode;

  const selectedDeliverable = deliverables.find(
    (d) => d.deliverable.id === selectedDeliverableId,
  )?.deliverable;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
      {/* Liste livrables */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            Livrables ({deliverables.length})
          </h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAssignOpen(true)}
          >
            <UserIcon className="mr-1.5 h-3.5 w-3.5" />
            {currentAssignment?.user
              ? `Resp. ${currentAssignment.user.prenom} ${currentAssignment.user.nom}`
              : 'Assigner un responsable'}
          </Button>
        </div>
        {deliverables.map(({ deliverable, status }) => {
          const statusValue = status?.status ?? 'missing';
          const isSelected = deliverable.id === selectedDeliverableId;
          return (
            <Card
              key={deliverable.id}
              onClick={() => selectDeliverable(deliverable.id)}
              className={cn(
                'cursor-pointer p-3 transition-colors',
                isSelected
                  ? 'border-primary bg-primary/5'
                  : 'hover:border-primary/30 hover:bg-muted/30',
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex items-center gap-2">
                    <StatusBadge
                      label={DELIVERABLE_STATUS_LABELS[statusValue]}
                      color={STATUS_COLOR[statusValue] ?? 'gray'}
                    />
                    <span className="truncate text-sm font-medium">
                      {deliverable.title}
                    </span>
                  </div>
                  <div className="text-muted-foreground flex items-center gap-2 text-xs">
                    <span className="font-mono">{deliverable.code}</span>
                    <span>·</span>
                    <span>
                      Mise à jour {RECURRENCE_LABELS[deliverable.recurrence]}
                    </span>
                    <span>·</span>
                    <span>
                      {status?.evidences_count ?? 0} pièce
                      {(status?.evidences_count ?? 0) > 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <AssignResponsibleDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        clientId={clientId}
        campusId={campusId}
        indicatorId={indicatorId}
        currentUserId={currentAssignment?.user?.id ?? null}
        users={availableUsers}
      />

      {/* Panneau evidences a droite */}
      <aside className="lg:sticky lg:top-4 lg:self-start">
        {selectedDeliverable ? (
          <EvidencesPanel
            deliverable={selectedDeliverable}
            evidences={selectedEvidences}
            onClose={() => selectDeliverable(null)}
          />
        ) : (
          <Card className="p-6 text-center">
            <p className="text-muted-foreground text-sm">
              Sélectionnez un livrable pour voir les pièces justificatives.
            </p>
          </Card>
        )}
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub: panneau evidences (lecture seule, l'API Eduvia ne permet pas l'ecriture)
// ---------------------------------------------------------------------------

function EvidencesPanel({
  deliverable,
  evidences,
  onClose,
}: {
  deliverable: QualityDeliverable;
  evidences: QualityEvidence[];
  onClose: () => void;
}) {
  return (
    <Card className="p-0">
      <div className="border-b border-[var(--border-light)] px-4 py-3">
        <div className="mb-1 flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold">{deliverable.title}</h3>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">
          <span className="font-mono">{deliverable.code}</span>
          <span className="mx-1">·</span>
          {RECURRENCE_LABELS[deliverable.recurrence]}
        </p>
      </div>

      <div className="max-h-[60vh] divide-y divide-[var(--border-light)] overflow-y-auto">
        {evidences.length === 0 ? (
          <p className="text-muted-foreground p-4 text-center text-sm">
            Aucune pièce déposée. Le dépôt se fait directement dans Eduvia.
          </p>
        ) : (
          evidences.map((e) => (
            <div key={e.id} className="space-y-2 p-3">
              <div className="flex items-start justify-between gap-2">
                {e.file_url ? (
                  <a
                    href={e.file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary inline-flex items-center gap-1 text-sm font-medium hover:underline"
                  >
                    {e.file_name ?? 'Pièce sans nom'}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <span className="text-muted-foreground text-sm font-medium italic">
                    {e.file_name ?? 'Pièce en cours de dépôt'}
                  </span>
                )}
                <StatusBadge
                  label={EVIDENCE_STATUS_LABELS[e.status]}
                  color={STATUS_COLOR[e.status] ?? 'gray'}
                />
              </div>
              <div className="text-muted-foreground text-xs">
                Déposé le {formatDate(e.created_at)}
                {e.expires_at ? ` · Expire le ${formatDate(e.expires_at)}` : ''}
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Sub: dialog assigner un responsable
// ---------------------------------------------------------------------------

function AssignResponsibleDialog({
  open,
  onOpenChange,
  clientId,
  campusId,
  indicatorId,
  currentUserId,
  users,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  campusId: number;
  indicatorId: number;
  currentUserId: string | null;
  users: ActiveUserMinimal[];
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(currentUserId);
  const [pending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      const r = await assignIndicatorResponsible({
        clientId,
        campusId,
        indicatorId,
        userId: selectedId,
      });
      if (r.success) {
        toast.success(
          selectedId ? 'Responsable assigné' : 'Responsable retiré',
        );
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(r.error ?? 'Erreur');
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assigner un responsable</DialogTitle>
        </DialogHeader>
        <div className="max-h-[50vh] overflow-y-auto">
          <button
            type="button"
            onClick={() => setSelectedId(null)}
            className={cn(
              'flex w-full cursor-pointer items-center gap-2 rounded px-3 py-2 text-left text-sm transition-colors',
              selectedId === null
                ? 'bg-primary/10 text-primary font-medium'
                : 'hover:bg-muted',
            )}
          >
            <span className="text-muted-foreground italic">
              Aucun responsable
            </span>
          </button>
          <div className="my-1 border-t border-[var(--border-light)]" />
          {users.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => setSelectedId(u.id)}
              className={cn(
                'flex w-full cursor-pointer items-center gap-2 rounded px-3 py-2 text-left text-sm transition-colors',
                selectedId === u.id
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'hover:bg-muted',
              )}
            >
              <UserIcon className="text-muted-foreground h-4 w-4" />
              <span>
                {u.prenom} {u.nom}
              </span>
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Annuler
          </Button>
          <Button onClick={handleSave} disabled={pending}>
            {pending ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
