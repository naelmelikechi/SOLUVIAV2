'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { StatusBadge } from '@/components/shared/status-badge';
import {
  DELIVERABLE_STATUS_LABELS,
  EVIDENCE_STATUS_LABELS,
  RECURRENCE_LABELS,
  type QualityDeliverable,
  type QualityDeliverableStatus,
  type QualityEvidence,
} from '@/lib/eduvia/quality-types';
import type { EvidenceNote, QualiopiAssignment } from '@/lib/queries/qualiopi';
import { uploadEvidence, validateEvidence } from '@/lib/actions/qualiopi';

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
  evidenceNotes: Map<number, EvidenceNote[]>;
  currentAssignment: QualiopiAssignment | null;
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
  evidenceNotes,
  currentAssignment,
}: IndicatorClientProps) {
  const router = useRouter();

  function selectDeliverable(deliverableId: number | null) {
    const base = `/qualiopi/${clientRef}/${campusId}/${criterionId}/${indicatorId}`;
    router.push(deliverableId ? `${base}?d=${deliverableId}` : base);
  }

  void clientId;
  void indicatorCode;
  void currentAssignment;

  const selectedDeliverable = deliverables.find(
    (d) => d.deliverable.id === selectedDeliverableId,
  )?.deliverable;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
      {/* Liste livrables */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold">
          Livrables ({deliverables.length})
        </h2>
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

      {/* Panneau evidences a droite */}
      <aside className="lg:sticky lg:top-4 lg:self-start">
        {selectedDeliverable ? (
          <EvidencesPanel
            clientRef={clientRef}
            clientId={clientId}
            campusId={campusId}
            deliverable={selectedDeliverable}
            evidences={selectedEvidences}
            notes={evidenceNotes}
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
// Sub: panneau evidences avec upload + valider/rejeter
// ---------------------------------------------------------------------------

function EvidencesPanel({
  clientRef,
  clientId,
  campusId,
  deliverable,
  evidences,
  notes,
  onClose,
}: {
  clientRef: string;
  clientId: string;
  campusId: number;
  deliverable: QualityDeliverable;
  evidences: QualityEvidence[];
  notes: Map<number, EvidenceNote[]>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectMotif, setRejectMotif] = useState('');
  void clientRef;

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('clientId', clientId);
    formData.append('campusId', String(campusId));
    formData.append('deliverableId', String(deliverable.id));
    formData.append('file', file);
    startTransition(async () => {
      const r = await uploadEvidence(formData);
      if (r.success) {
        toast.success('Pièce déposée');
        e.target.value = '';
        router.refresh();
      } else {
        toast.error(r.error ?? "Échec de l'upload");
      }
    });
  }

  function handleValidate(evidenceId: number) {
    startTransition(async () => {
      const r = await validateEvidence({
        clientId,
        campusId,
        evidenceId,
        status: 'conform',
      });
      if (r.success) {
        toast.success('Pièce validée');
        router.refresh();
      } else {
        toast.error(r.error ?? 'Erreur');
      }
    });
  }

  function handleReject(evidenceId: number) {
    if (!rejectMotif.trim()) {
      toast.error('Motif de rejet requis');
      return;
    }
    startTransition(async () => {
      const r = await validateEvidence({
        clientId,
        campusId,
        evidenceId,
        status: 'rejected',
        rejectionMotif: rejectMotif.trim(),
      });
      if (r.success) {
        toast.success('Pièce rejetée');
        setRejectingId(null);
        setRejectMotif('');
        router.refresh();
      } else {
        toast.error(r.error ?? 'Erreur');
      }
    });
  }

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

      <div className="border-b border-[var(--border-light)] p-4">
        <label
          className={cn(
            'border-primary/30 hover:bg-primary/5 flex cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-dashed py-3 text-sm font-medium transition-colors',
            pending && 'opacity-50',
          )}
        >
          <Upload className="h-4 w-4" />
          {pending ? 'Envoi...' : 'Déposer une pièce'}
          <input
            type="file"
            className="hidden"
            onChange={handleUpload}
            disabled={pending}
          />
        </label>
        <p className="text-muted-foreground mt-1.5 text-center text-xs">
          PDF, image, doc. Max 25 Mo.
        </p>
      </div>

      {/* Liste evidences */}
      <div className="max-h-[60vh] divide-y divide-[var(--border-light)] overflow-y-auto">
        {evidences.length === 0 ? (
          <p className="text-muted-foreground p-4 text-center text-sm">
            Aucune pièce déposée.
          </p>
        ) : (
          evidences.map((e) => {
            const evNotes = notes.get(e.id) ?? [];
            const lastRejection = evNotes.find((n) => n.kind === 'rejection');
            return (
              <div key={e.id} className="space-y-2 p-3">
                <div className="flex items-start justify-between gap-2">
                  <a
                    href={e.file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary inline-flex items-center gap-1 text-sm font-medium hover:underline"
                  >
                    {e.file_name}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                  <StatusBadge
                    label={EVIDENCE_STATUS_LABELS[e.status]}
                    color={STATUS_COLOR[e.status] ?? 'gray'}
                  />
                </div>
                <div className="text-muted-foreground text-xs">
                  Déposé le {formatDate(e.created_at)}
                  {e.expires_at
                    ? ` · Expire le ${formatDate(e.expires_at)}`
                    : ''}
                </div>

                {e.status === 'rejected' && lastRejection ? (
                  <div className="rounded bg-red-50 p-2 text-xs text-red-800">
                    <span className="font-semibold">Motif :</span>{' '}
                    {lastRejection.message}
                  </div>
                ) : null}

                {e.status === 'to_review' ? (
                  <>
                    {rejectingId === e.id ? (
                      <div className="space-y-2">
                        <Textarea
                          rows={2}
                          placeholder="Motif du rejet (obligatoire)"
                          value={rejectMotif}
                          onChange={(ev) => setRejectMotif(ev.target.value)}
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleReject(e.id)}
                            disabled={pending || !rejectMotif.trim()}
                          >
                            Confirmer le rejet
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setRejectingId(null);
                              setRejectMotif('');
                            }}
                          >
                            Annuler
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleValidate(e.id)}
                          disabled={pending}
                        >
                          Valider
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setRejectingId(e.id)}
                          disabled={pending}
                        >
                          Rejeter
                        </Button>
                      </div>
                    )}
                  </>
                ) : null}
              </div>
            );
          })
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
