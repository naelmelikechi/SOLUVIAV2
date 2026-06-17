'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Pencil,
  Trash2,
  FileText,
  Mail,
  MapPin,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/status-badge';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RdvFormDialog } from './rdv-form-dialog';
import { RdvCrEditor } from './rdv-cr-editor';
import { PostRdvMailDialog } from './post-rdv-mail-dialog';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils/formatters';
import {
  updateRdvCommercialStatut,
  deleteRdvCommercial,
} from '@/lib/actions/rdv';
import {
  TYPE_RDV_LABELS,
  FORMAT_RDV_LABELS,
  STATUT_RDV_LABELS,
  STATUT_RDV_COLORS,
  type TypeRdv,
  type FormatRdv,
  type StatutRdv,
} from '@/lib/utils/constants';
import type { ProspectDetail, ProspectContact } from '@/lib/queries/prospects';
import type { RdvCommercialWithRefs } from '@/lib/queries/rdv';
import type { FicheCommercial } from './fiche-tabs';

const STATUT_RDV_VALUES: StatutRdv[] = [
  'prevu',
  'realise',
  'annule',
  'reporte',
];

interface Props {
  prospect: ProspectDetail;
  rdvs: RdvCommercialWithRefs[];
  contacts: ProspectContact[];
  commerciaux: FicheCommercial[];
  currentUserId: string;
}

export function FicheRdvTab({
  prospect,
  rdvs,
  contacts,
  commerciaux,
  currentUserId,
}: Props) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<RdvCommercialWithRefs | null>(
    null,
  );
  const [crTarget, setCrTarget] = useState<RdvCommercialWithRefs | null>(null);
  const [mailTarget, setMailTarget] = useState<RdvCommercialWithRefs | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] =
    useState<RdvCommercialWithRefs | null>(null);
  const [pendingStatutId, setPendingStatutId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const contactName = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of contacts) m.set(c.id, c.nom);
    return m;
  }, [contacts]);

  const soluviaName = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of commerciaux) m.set(u.id, `${u.prenom} ${u.nom}`);
    return m;
  }, [commerciaux]);

  const currentUserName = useMemo(() => {
    const u = commerciaux.find((x) => x.id === currentUserId);
    return u ? `${u.prenom} ${u.nom}` : '';
  }, [commerciaux, currentUserId]);

  function handleStatut(id: string, statut: StatutRdv) {
    setPendingStatutId(id);
    startTransition(async () => {
      const r = await updateRdvCommercialStatut(id, statut);
      setPendingStatutId(null);
      if (r.success) {
        toast.success('Statut mis à jour');
        router.refresh();
      } else {
        toast.error(r.error ?? 'Erreur');
      }
    });
  }

  function handleDeleteConfirm() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    startTransition(async () => {
      const r = await deleteRdvCommercial(id);
      if (r.success) {
        toast.success('RDV supprimé');
        setDeleteTarget(null);
        router.refresh();
      } else {
        toast.error(r.error ?? 'Erreur');
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1 size-4" />
          Nouveau RDV
        </Button>
      </div>

      {rdvs.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Aucun RDV pour ce prospect.
        </p>
      ) : (
        <ul className="space-y-3">
          {rdvs.map((rdv) => {
            const prospectParts = rdv.participants_prospect
              .map((id) => contactName.get(id))
              .filter(Boolean) as string[];
            const soluviaParts = rdv.participants_soluvia
              .map((id) => soluviaName.get(id))
              .filter(Boolean) as string[];
            return (
              <li key={rdv.id}>
                <Card className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium tabular-nums">
                          {formatDate(rdv.date_prevue)}
                        </span>
                        <StatusBadge
                          label={STATUT_RDV_LABELS[rdv.statut as StatutRdv]}
                          color={STATUT_RDV_COLORS[rdv.statut as StatutRdv]}
                        />
                        <span className="text-muted-foreground text-sm">
                          {TYPE_RDV_LABELS[rdv.type_rdv as TypeRdv]}
                        </span>
                        {rdv.format && (
                          <span className="text-muted-foreground text-xs">
                            · {FORMAT_RDV_LABELS[rdv.format as FormatRdv]}
                          </span>
                        )}
                        {rdv.mail_post_envoye_at && (
                          <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                            <CheckCircle2 className="size-3.5" /> Soldé
                          </span>
                        )}
                      </div>
                      {rdv.objet && (
                        <p className="text-sm font-medium">{rdv.objet}</p>
                      )}
                      <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
                        {rdv.lieu && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="size-3.5" /> {rdv.lieu}
                          </span>
                        )}
                        {rdv.duree_min != null && (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="size-3.5" /> {rdv.duree_min} min
                          </span>
                        )}
                        {prospectParts.length > 0 && (
                          <span>Prospect : {prospectParts.join(', ')}</span>
                        )}
                        {soluviaParts.length > 0 && (
                          <span>Soluvia : {soluviaParts.join(', ')}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <Select
                        value={rdv.statut}
                        onValueChange={(v) =>
                          v && handleStatut(rdv.id, v as StatutRdv)
                        }
                        disabled={pendingStatutId === rdv.id}
                      >
                        <SelectTrigger size="sm" className="h-8 w-32">
                          <SelectValue>
                            {(v) =>
                              STATUT_RDV_LABELS[v as StatutRdv] ?? 'Statut'
                            }
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {STATUT_RDV_VALUES.map((s) => (
                            <SelectItem key={s} value={s}>
                              {STATUT_RDV_LABELS[s]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="size-8 p-0"
                        title="Compte-rendu"
                        onClick={() => setCrTarget(rdv)}
                      >
                        <FileText className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="size-8 p-0"
                        title="Mail post-RDV"
                        onClick={() => setMailTarget(rdv)}
                      >
                        <Mail className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="size-8 p-0"
                        title="Modifier"
                        onClick={() => setEditTarget(rdv)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive size-8 p-0"
                        title="Supprimer"
                        onClick={() => setDeleteTarget(rdv)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>

                  {rdv.compte_rendu && (
                    <p className="text-muted-foreground mt-3 line-clamp-3 border-t pt-3 text-sm whitespace-pre-line">
                      {rdv.compte_rendu}
                    </p>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <RdvFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        prospectId={prospect.id}
        contacts={contacts}
        commerciaux={commerciaux}
      />

      <RdvFormDialog
        open={editTarget != null}
        onOpenChange={(o) => !o && setEditTarget(null)}
        prospectId={prospect.id}
        contacts={contacts}
        commerciaux={commerciaux}
        rdv={editTarget}
      />

      {crTarget && (
        <RdvCrEditor
          open
          onOpenChange={(o) => !o && setCrTarget(null)}
          rdv={crTarget}
        />
      )}

      {mailTarget && (
        <PostRdvMailDialog
          open
          onOpenChange={(o) => !o && setMailTarget(null)}
          prospect={prospect}
          rdv={mailTarget}
          contacts={contacts}
          currentUserName={currentUserName}
        />
      )}

      <ConfirmDialog
        open={deleteTarget != null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Supprimer le RDV"
        description="Cette action est définitive."
        confirmText="Supprimer"
        variant="destructive"
        isPending={isPending}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
