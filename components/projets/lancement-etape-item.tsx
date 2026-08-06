'use client';

import { useState } from 'react';
import {
  ChevronDown,
  Download,
  Eye,
  FileText,
  Loader2,
  MessageSquare,
  Paperclip,
  Send,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { StatusBadge } from '@/components/shared/status-badge';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { DocumentPreviewSheet } from '@/components/shared/document-preview-sheet';
import { formatDate, formatDateTimeParis } from '@/lib/utils/formatters';
import { getDocumentDownloadUrl } from '@/lib/actions/documents';
import {
  setLancementEtapeStatut,
  setLancementEtapeDateObjectif,
  deleteLancementDocument,
  addLancementCommentaire,
  deleteLancementCommentaire,
} from '@/lib/actions/projet-lancement';
import {
  LANCEMENT_STATUTS,
  getLancementStatutMeta,
  type LancementStatut,
} from '@/lib/lancement/constants';
import { alerteEtape } from '@/lib/lancement/alertes';
import type {
  LancementDocument,
  LancementCommentaire,
} from '@/lib/queries/projet-lancement';
import { LancementUploadButton } from './lancement-upload-button';

const DOT_STYLES: Record<LancementStatut, string> = {
  non_commence: 'bg-muted text-muted-foreground ring-border',
  en_cours: 'bg-orange-500 text-white ring-orange-500/30',
  depose: 'bg-blue-600 text-white ring-blue-600/30',
  lance: 'bg-green-600 text-white ring-green-600/30',
};

interface LancementEtapeItemProps {
  projetId: string;
  projetRef: string;
  etapeKey: string;
  etapeLabel: string;
  index: number;
  isLast: boolean;
  statut: LancementStatut;
  documents: LancementDocument[];
  commentaires: LancementCommentaire[];
  canEdit: boolean;
  userIsAdmin: boolean;
  currentUserId: string | null;
  dateObjectif: string | null;
  dateRealisation: string | null;
  seuilEnlisementJours: number;
  aujourdHui: string;
}

export function LancementEtapeItem({
  projetId,
  projetRef,
  etapeKey,
  etapeLabel,
  index,
  isLast,
  statut,
  documents,
  commentaires,
  canEdit,
  userIsAdmin,
  currentUserId,
  dateObjectif,
  dateRealisation,
  seuilEnlisementJours,
  aujourdHui,
}: LancementEtapeItemProps) {
  const [expanded, setExpanded] = useState(false);
  const [savingStatut, setSavingStatut] = useState<string | null>(null);
  const statutMeta = getLancementStatutMeta(statut);
  const [savingDate, setSavingDate] = useState(false);
  const alerte = alerteEtape({
    statut,
    dateObjectif,
    dateRealisation,
    aujourdHui,
    seuilEnlisementJours,
  });
  const joursDepuisDepot = dateRealisation
    ? Math.floor(
        (Date.parse(`${aujourdHui}T00:00:00Z`) -
          Date.parse(`${dateRealisation}T00:00:00Z`)) /
          86_400_000,
      )
    : 0;

  async function handleDateObjectif(valeur: string) {
    setSavingDate(true);
    try {
      const result = await setLancementEtapeDateObjectif(
        projetId,
        projetRef,
        etapeKey,
        valeur === '' ? null : valeur,
      );
      if (result.success) {
        toast.success(
          valeur === ''
            ? "Date d'objectif effacée"
            : "Date d'objectif enregistrée",
        );
      } else {
        toast.error(result.error || "Erreur lors de l'enregistrement");
      }
    } catch {
      toast.error('Erreur inattendue');
    } finally {
      setSavingDate(false);
    }
  }

  async function handleStatut(next: LancementStatut) {
    if (next === statut || savingStatut) return;
    setSavingStatut(next);
    try {
      const result = await setLancementEtapeStatut(
        projetId,
        projetRef,
        etapeKey,
        next,
      );
      if (result.success) {
        toast.success('Statut mis à jour');
      } else {
        toast.error(result.error || 'Erreur lors de la mise à jour');
      }
    } catch {
      toast.error('Erreur inattendue');
    } finally {
      setSavingStatut(null);
    }
  }

  return (
    <li className="relative pl-11">
      {!isLast && (
        <span
          aria-hidden
          className="border-border absolute top-8 bottom-0 left-[13px] border-l"
        />
      )}
      <span
        className={cn(
          'absolute top-0.5 left-0 flex size-7 items-center justify-center rounded-full text-xs font-semibold ring-2',
          DOT_STYLES[statut],
        )}
      >
        {index + 1}
      </span>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="hover:bg-muted/50 -mx-2 flex w-[calc(100%+16px)] items-center gap-3 rounded-md px-2 py-1 text-left"
      >
        <span className="text-sm font-medium">{etapeLabel}</span>
        <StatusBadge label={statutMeta.label} color={statutMeta.color} />
        {alerte === 'en_retard' && (
          <StatusBadge label="En retard" color="red" />
        )}
        {alerte === 'enlise' && (
          <StatusBadge
            // "Deposé" figure deja dans le badge de statut et dans la date a
            // droite : le repeter une troisieme fois noie l'information utile,
            // qui est la duree d'attente chez le tiers instructeur.
            label={`En attente ${joursDepuisDepot} j`}
            color="orange"
          />
        )}
        <span className="text-muted-foreground ml-auto flex items-center gap-3 text-xs">
          {dateRealisation ? (
            // "Realise" et non "Depose" : la meme date sert aux etapes
            // terminees, et "Contrat signe / Depose le" se lit mal.
            <span className="hidden sm:inline">
              Réalisé le {formatDate(dateRealisation)}
            </span>
          ) : (
            dateObjectif && (
              <span className="hidden sm:inline">
                Objectif {formatDate(dateObjectif)}
              </span>
            )
          )}
          {documents.length > 0 && (
            <span className="flex items-center gap-1">
              <Paperclip className="size-3" /> {documents.length}
            </span>
          )}
          {commentaires.length > 0 && (
            <span className="flex items-center gap-1">
              <MessageSquare className="size-3" /> {commentaires.length}
            </span>
          )}
          <ChevronDown
            className={cn('size-4 transition-transform', {
              'rotate-180': expanded,
            })}
          />
        </span>
      </button>

      {expanded && (
        <div className="mt-2 mb-2 space-y-4 pb-2">
          {canEdit && (
            <div className="flex flex-wrap items-center gap-1.5">
              {LANCEMENT_STATUTS.map((s) => (
                <Button
                  key={s.key}
                  variant={s.key === statut ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 text-xs"
                  disabled={savingStatut !== null}
                  onClick={() => handleStatut(s.key)}
                >
                  {savingStatut === s.key ? (
                    <Loader2 className="mr-1 size-3 animate-spin" />
                  ) : null}
                  {s.label}
                </Button>
              ))}
              <label className="text-muted-foreground mt-2 flex w-full items-center gap-2 text-xs">
                Date d&apos;objectif
                <input
                  type="date"
                  defaultValue={dateObjectif ?? ''}
                  disabled={savingDate}
                  onChange={(e) => handleDateObjectif(e.target.value)}
                  className="border-input bg-background rounded-md border px-2 py-1 text-xs"
                />
                {savingDate && <Loader2 className="size-3 animate-spin" />}
                {dateRealisation && (
                  <span>Réalisé le {formatDate(dateRealisation)}</span>
                )}
              </label>
            </div>
          )}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium tracking-wider uppercase">
                <Paperclip className="size-3" /> Documents
              </h4>
              {canEdit && (
                <LancementUploadButton
                  projetId={projetId}
                  projetRef={projetRef}
                  etapeKey={etapeKey}
                />
              )}
            </div>
            {documents.length === 0 ? (
              <p className="text-muted-foreground text-xs">Aucun document</p>
            ) : (
              <ul className="divide-border divide-y">
                {documents.map((doc) => (
                  <LancementDocumentRow
                    key={doc.id}
                    doc={doc}
                    projetRef={projetRef}
                    canDelete={userIsAdmin || doc.user?.id === currentUserId}
                  />
                ))}
              </ul>
            )}
          </div>

          <LancementCommentaires
            projetId={projetId}
            projetRef={projetRef}
            etapeKey={etapeKey}
            commentaires={commentaires}
            canEdit={canEdit}
            userIsAdmin={userIsAdmin}
            currentUserId={currentUserId}
          />
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Ligne document : apercu / telechargement / suppression
// ---------------------------------------------------------------------------

function LancementDocumentRow({
  doc,
  projetRef,
  canDelete,
  // oxlint-disable-next-line react-doctor/prefer-useReducer
}: {
  doc: LancementDocument;
  projetRef: string;
  canDelete: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  async function handleOpen(mode: 'preview' | 'download') {
    setBusy(true);
    try {
      const result = await getDocumentDownloadUrl(
        doc.storage_path,
        'project-documents',
      );
      if (result.url) {
        if (mode === 'preview') {
          setPreviewUrl(result.url);
          setPreviewOpen(true);
        } else {
          window.open(result.url, '_blank');
        }
      } else {
        toast.error(result.error || 'Impossible de charger le document');
      }
    } catch {
      toast.error("Erreur lors de l'ouverture du document");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    try {
      const result = await deleteLancementDocument(doc.id, projetRef);
      if (result.success) {
        toast.success('Document supprimé');
      } else {
        toast.error(result.error || 'Erreur lors de la suppression');
      }
    } catch {
      toast.error('Erreur lors de la suppression');
    } finally {
      setBusy(false);
      setConfirmOpen(false);
    }
  }

  return (
    <li className="flex items-center gap-2 py-1.5">
      <FileText className="text-muted-foreground size-3.5 shrink-0" />
      <span className="truncate text-sm">{doc.nom_fichier}</span>
      <span className="text-muted-foreground ml-auto shrink-0 text-xs tabular-nums">
        {formatDate(doc.created_at)}
      </span>
      <span className="text-muted-foreground hidden shrink-0 text-xs sm:inline">
        {doc.user ? `${doc.user.prenom} ${doc.user.nom}` : '-'}
      </span>
      <span className="flex shrink-0 items-center">
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => handleOpen('preview')}
          title="Aperçu"
          className="size-7 p-0"
        >
          <Eye className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => handleOpen('download')}
          title="Télécharger"
          className="size-7 p-0"
        >
          <Download className="size-3.5" />
        </Button>
        {canDelete && (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => setConfirmOpen(true)}
            title="Supprimer"
            className="text-destructive hover:text-destructive size-7 p-0"
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </span>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Supprimer le document"
        description={`Voulez-vous supprimer "${doc.nom_fichier}" ? Cette action est irréversible.`}
        confirmText="Supprimer"
        isPending={busy}
        onConfirm={handleDelete}
      />
      <DocumentPreviewSheet
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        url={previewUrl}
        fileName={doc.nom_fichier}
        typeDocument={doc.type_document}
      />
    </li>
  );
}

// ---------------------------------------------------------------------------
// Commentaires d'etape
// ---------------------------------------------------------------------------

function LancementCommentaires({
  projetId,
  projetRef,
  etapeKey,
  commentaires,
  canEdit,
  userIsAdmin,
  currentUserId,
  // oxlint-disable-next-line react-doctor/prefer-useReducer
}: {
  projetId: string;
  projetRef: string;
  etapeKey: string;
  commentaires: LancementCommentaire[];
  canEdit: boolean;
  userIsAdmin: boolean;
  currentUserId: string | null;
}) {
  const [contenu, setContenu] = useState('');
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleSend() {
    const trimmed = contenu.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      const result = await addLancementCommentaire(
        projetId,
        projetRef,
        etapeKey,
        trimmed,
      );
      if (result.success) {
        setContenu('');
        toast.success('Commentaire ajouté');
      } else {
        toast.error(result.error || "Erreur lors de l'ajout");
      }
    } catch {
      toast.error('Erreur inattendue');
    } finally {
      setSending(false);
    }
  }

  async function handleDelete(commentaireId: string) {
    setDeletingId(commentaireId);
    try {
      const result = await deleteLancementCommentaire(commentaireId, projetRef);
      if (result.success) {
        toast.success('Commentaire supprimé');
      } else {
        toast.error(result.error || 'Erreur lors de la suppression');
      }
    } catch {
      toast.error('Erreur lors de la suppression');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      <h4 className="text-muted-foreground mb-2 flex items-center gap-1.5 text-xs font-medium tracking-wider uppercase">
        <MessageSquare className="size-3" /> Commentaires
      </h4>
      {commentaires.length === 0 ? (
        <p className="text-muted-foreground text-xs">Aucun commentaire</p>
      ) : (
        <ul className="space-y-2">
          {commentaires.map((c) => (
            <li key={c.id} className="bg-muted/40 rounded-md px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium">
                  {c.user ? `${c.user.prenom} ${c.user.nom}` : '-'}
                </span>
                <span className="text-muted-foreground text-[11px]">
                  {formatDateTimeParis(c.created_at)}
                </span>
                {(userIsAdmin || c.user?.id === currentUserId) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={deletingId === c.id}
                    onClick={() => handleDelete(c.id)}
                    title="Supprimer"
                    className="text-destructive hover:text-destructive ml-auto size-6 p-0"
                  >
                    {deletingId === c.id ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Trash2 className="size-3" />
                    )}
                  </Button>
                )}
              </div>
              <p className="mt-1 text-sm whitespace-pre-wrap">{c.contenu}</p>
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <div className="mt-2 flex items-end gap-2">
          <Textarea
            value={contenu}
            onChange={(e) => setContenu(e.target.value)}
            placeholder="Ajouter un commentaire..."
            rows={2}
            className="min-h-0 text-sm"
          />
          <Button
            size="sm"
            disabled={sending || contenu.trim().length === 0}
            onClick={handleSend}
          >
            {sending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Send className="size-3.5" />
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
