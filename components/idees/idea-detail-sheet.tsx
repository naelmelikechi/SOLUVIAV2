'use client';

import { useState, useTransition } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { StatusBadge } from '@/components/shared/status-badge';
import {
  Lightbulb,
  CheckCircle,
  XCircle,
  Rocket,
  Loader2,
  Pencil,
  User,
} from 'lucide-react';
import {
  STATUT_IDEE_LABELS,
  STATUT_IDEE_COLORS,
  CIBLE_IDEE_LABELS,
  CIBLE_IDEE_COLORS,
} from '@/lib/utils/constants';
import {
  validateIdea,
  rejectIdea,
  markIdeaImplemented,
} from '@/lib/actions/idees';
import { toast } from 'sonner';
import { formatDateLong } from '@/lib/utils/formatters';
import { IdeaSubmitDialog } from './idea-submit-dialog';
import type { IdeeWithRefs } from '@/lib/queries/idees';

interface IdeaDetailSheetProps {
  idee: IdeeWithRefs | null;
  currentUserId: string;
  canValidate: boolean;
  canShip: boolean;
  onOpenChange: (open: boolean) => void;
}

export function IdeaDetailSheet({
  idee,
  currentUserId,
  canValidate,
  canShip,
  onOpenChange,
}: IdeaDetailSheetProps) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const [motif, setMotif] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (!idee) {
    return (
      <Sheet open={false} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="hidden" />
      </Sheet>
    );
  }

  const isAuthor = idee.auteur_id === currentUserId;
  const canEdit = isAuthor && idee.statut === 'proposee';
  const showValidateActions = canValidate && idee.statut === 'proposee';
  const showShipAction = canShip && idee.statut === 'validee';

  function handleValidate() {
    if (!idee) return;
    startTransition(async () => {
      const r = await validateIdea(idee.id);
      if (r.success) {
        toast.success('Idée validée');
        onOpenChange(false);
      } else toast.error(r.error ?? 'Erreur');
    });
  }

  function handleReject() {
    if (!idee) return;
    if (!motif.trim()) {
      toast.error('Le motif est requis');
      return;
    }
    startTransition(async () => {
      const r = await rejectIdea(idee.id, motif);
      if (r.success) {
        toast.success('Idée rejetée');
        setRejectOpen(false);
        setMotif('');
        onOpenChange(false);
      } else toast.error(r.error ?? 'Erreur');
    });
  }

  function handleShip() {
    if (!idee) return;
    startTransition(async () => {
      const r = await markIdeaImplemented(idee.id);
      if (r.success) {
        toast.success('Idée marquée comme implémentée');
        onOpenChange(false);
      } else toast.error(r.error ?? 'Erreur');
    });
  }

  return (
    <>
      <Sheet open={idee !== null} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="flex !w-[min(600px,95vw)] flex-col gap-0 overflow-y-auto p-0 data-[side=right]:sm:max-w-[min(600px,95vw)]"
        >
          <SheetHeader className="border-border from-primary/[0.03] border-b bg-gradient-to-b to-transparent p-5">
            <div className="flex items-start gap-3">
              <div className="bg-primary/10 text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-md">
                <Lightbulb className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <SheetTitle className="text-left text-base leading-tight">
                  {idee.titre}
                </SheetTitle>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <StatusBadge
                    label={STATUT_IDEE_LABELS[idee.statut]}
                    color={STATUT_IDEE_COLORS[idee.statut]}
                  />
                  <StatusBadge
                    label={CIBLE_IDEE_LABELS[idee.cible]}
                    color={CIBLE_IDEE_COLORS[idee.cible]}
                  />
                </div>
              </div>
            </div>
          </SheetHeader>

          <div className="flex-1 space-y-6 p-5">
            {idee.description && (
              <section>
                <h4 className="text-muted-foreground mb-2 text-[11px] font-semibold tracking-wider uppercase">
                  Description
                </h4>
                <p className="bg-muted/40 rounded-md p-3 text-sm whitespace-pre-wrap">
                  {idee.description}
                </p>
              </section>
            )}

            {/* Timeline */}
            <section>
              <h4 className="text-muted-foreground mb-3 text-[11px] font-semibold tracking-wider uppercase">
                Historique
              </h4>
              <ol className="space-y-3">
                <TimelineStep
                  icon={<User className="h-3.5 w-3.5" />}
                  done
                  label="Proposée"
                  detail={
                    <>
                      {formatDateLong(idee.created_at)}
                      {idee.auteur && (
                        <>
                          {' '}
                          par {idee.auteur.prenom} {idee.auteur.nom}
                        </>
                      )}
                    </>
                  }
                />
                {idee.validee_at && (
                  <TimelineStep
                    icon={<CheckCircle className="h-3.5 w-3.5" />}
                    done
                    color="blue"
                    label="Validée"
                    detail={
                      <>
                        {formatDateLong(idee.validee_at)}
                        {idee.validee_par_user && (
                          <>
                            {' '}
                            par {idee.validee_par_user.prenom}{' '}
                            {idee.validee_par_user.nom}
                          </>
                        )}
                      </>
                    }
                  />
                )}
                {idee.implementee_at && (
                  <TimelineStep
                    icon={<Rocket className="h-3.5 w-3.5" />}
                    done
                    color="green"
                    label="Implémentée"
                    detail={
                      <>
                        {formatDateLong(idee.implementee_at)}
                        {idee.implementee_par_user && (
                          <>
                            {' '}
                            par {idee.implementee_par_user.prenom}{' '}
                            {idee.implementee_par_user.nom}
                          </>
                        )}
                      </>
                    }
                  />
                )}
                {idee.statut === 'rejetee' && (
                  <TimelineStep
                    icon={<XCircle className="h-3.5 w-3.5" />}
                    done
                    color="red"
                    label="Rejetée"
                    detail={idee.rejet_motif ?? 'Motif non précisé'}
                  />
                )}
              </ol>
            </section>

            {/* Actions */}
            {(canEdit || showValidateActions || showShipAction) && (
              <section>
                <Separator className="mb-4" />
                <div className="space-y-2">
                  {canEdit && (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => setEditOpen(true)}
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      Modifier mon idée
                    </Button>
                  )}
                  {showValidateActions && !rejectOpen && (
                    <>
                      <Button
                        className="w-full"
                        onClick={handleValidate}
                        disabled={isPending}
                      >
                        {isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle className="mr-2 h-4 w-4" />
                        )}
                        Valider l&apos;idée
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => setRejectOpen(true)}
                      >
                        <XCircle className="mr-2 h-4 w-4" />
                        Rejeter
                      </Button>
                    </>
                  )}
                  {showValidateActions && rejectOpen && (
                    <div className="border-border space-y-2 rounded-md border p-3">
                      <Textarea
                        value={motif}
                        onChange={(e) => setMotif(e.target.value)}
                        placeholder="Motif du rejet (obligatoire)..."
                        rows={3}
                      />
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setRejectOpen(false);
                            setMotif('');
                          }}
                        >
                          Annuler
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={handleReject}
                          disabled={isPending || !motif.trim()}
                        >
                          Confirmer le rejet
                        </Button>
                      </div>
                    </div>
                  )}
                  {showShipAction && (
                    <Button
                      className="w-full"
                      onClick={handleShip}
                      disabled={isPending}
                    >
                      {isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Rocket className="mr-2 h-4 w-4" />
                      )}
                      Marquer implémentée
                    </Button>
                  )}
                </div>
              </section>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {canEdit && (
        <IdeaSubmitDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          initial={{
            id: idee.id,
            titre: idee.titre,
            description: idee.description,
            cible: idee.cible,
          }}
        />
      )}
    </>
  );
}

function TimelineStep({
  icon,
  done,
  color = 'primary',
  label,
  detail,
}: {
  icon: React.ReactNode;
  done?: boolean;
  color?: 'primary' | 'blue' | 'green' | 'red';
  label: string;
  detail: React.ReactNode;
}) {
  const colorCls = {
    primary: done
      ? 'bg-primary/15 text-primary'
      : 'bg-muted text-muted-foreground',
    blue: 'bg-blue-500/15 text-blue-600',
    green: 'bg-green-500/15 text-green-600',
    red: 'bg-red-500/15 text-red-600',
  }[color];

  return (
    <li className="flex items-start gap-3">
      <span
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${colorCls}`}
      >
        {icon}
      </span>
      <div className="flex-1 pt-0.5">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-muted-foreground text-xs">{detail}</div>
      </div>
    </li>
  );
}
