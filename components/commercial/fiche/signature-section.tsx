'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Download, FileSignature, Upload } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/shared/status-badge';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import {
  STATUT_SIGNATURE_LABELS,
  STATUT_SIGNATURE_COLORS,
} from '@/lib/utils/constants';
import { formatDate } from '@/lib/utils/formatters';
import {
  createSignatureRequest,
  updateSignatureStatut,
  uploadSignedDocument,
  getSignatureDocumentUrl,
} from '@/lib/actions/signatures';
import type { SignatureRequestWithInitiator } from '@/lib/queries/signatures';

async function openDocument(id: string, kind: 'document' | 'signed') {
  const res = await getSignatureDocumentUrl(id, kind);
  if (res.url) {
    window.open(res.url, '_blank', 'noopener,noreferrer');
  } else {
    toast.error(res.error ?? 'Document indisponible');
  }
}

export function SignatureSection({
  prospectId,
  signatures,
  locked,
}: {
  prospectId: string;
  signatures: SignatureRequestWithInitiator[];
  locked: boolean;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [uploadFor, setUploadFor] = useState<string | null>(null);

  return (
    <div className="mt-6 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <FileSignature className="size-4" />
          Signature du contrat
        </h3>
        {!locked && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setCreateOpen(true)}
          >
            Nouvelle demande
          </Button>
        )}
      </div>

      {signatures.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Aucune demande de signature.
        </p>
      ) : (
        <ul className="divide-border divide-y rounded-md border">
          {signatures.map((s) => (
            <SignatureRow
              key={s.id}
              signature={s}
              onUpload={() => setUploadFor(s.id)}
            />
          ))}
        </ul>
      )}

      <CreateSignatureDialog
        key={`create-${String(createOpen)}`}
        prospectId={prospectId}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
      <UploadSignedDialog
        key={`upload-${uploadFor ?? 'none'}`}
        requestId={uploadFor}
        onClose={() => setUploadFor(null)}
      />
    </div>
  );
}

// oxlint-disable-next-line react-doctor/no-multi-comp
function SignatureRow({
  signature: s,
  onUpload,
}: {
  signature: SignatureRequestWithInitiator;
  onUpload: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const terminal = s.statut === 'signee' || s.statut === 'annulee';

  const changeStatut = (
    statut: 'envoyee' | 'refusee' | 'expiree' | 'annulee',
  ) => {
    startTransition(async () => {
      const r = await updateSignatureStatut(s.id, statut);
      if (r.success) {
        toast.success('Statut mis à jour');
        router.refresh();
      } else {
        toast.error(r.error ?? 'Erreur');
      }
    });
  };

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{s.titre}</span>
          <StatusBadge
            label={STATUT_SIGNATURE_LABELS[s.statut]}
            color={STATUT_SIGNATURE_COLORS[s.statut]}
          />
        </div>
        <p className="text-muted-foreground text-xs">
          Créée le {formatDate(s.created_at)}
          {s.signed_at ? ` · signée le ${formatDate(s.signed_at)}` : ''}
        </p>
      </div>
      <div className="flex items-center gap-1.5">
        {s.document_path && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => openDocument(s.id, 'document')}
          >
            <Download className="size-3.5" /> Contrat
          </Button>
        )}
        {s.signed_document_path && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => openDocument(s.id, 'signed')}
          >
            <Download className="size-3.5" /> Signé
          </Button>
        )}
        {!terminal && (
          <>
            {s.statut === 'brouillon' && (
              <Button
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={() => changeStatut('envoyee')}
              >
                Marquer envoyée
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={onUpload}>
              <Upload className="size-3.5" /> Déposer le signé
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={isPending}
              onClick={() => setConfirmOpen(true)}
            >
              Annuler
            </Button>
            <ConfirmDialog
              open={confirmOpen}
              onOpenChange={setConfirmOpen}
              title="Annuler la demande de signature ?"
              description="La demande sera marquée comme annulée."
              confirmText="Confirmer"
              variant="destructive"
              isPending={isPending}
              onConfirm={() => {
                setConfirmOpen(false);
                changeStatut('annulee');
              }}
            />
          </>
        )}
      </div>
    </li>
  );
}

// oxlint-disable-next-line react-doctor/no-multi-comp
function CreateSignatureDialog({
  prospectId,
  open,
  onOpenChange,
}: {
  prospectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [titre, setTitre] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    if (!titre.trim()) {
      toast.error('Titre requis');
      return;
    }
    const fd = new FormData();
    fd.append('titre', titre.trim());
    if (file) fd.append('file', file);
    startTransition(async () => {
      const r = await createSignatureRequest(prospectId, fd);
      if (r.success) {
        toast.success('Demande de signature créée');
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(r.error ?? 'Erreur');
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouvelle demande de signature</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="sig-titre">Titre</Label>
            <Input
              id="sig-titre"
              value={titre}
              onChange={(e) => setTitre(e.target.value)}
              placeholder="Contrat-cadre 2026"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sig-file">Contrat à signer (optionnel)</Label>
            <Input
              id="sig-file"
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Annuler
          </Button>
          <Button onClick={submit} disabled={isPending || !titre.trim()}>
            {isPending ? 'Création...' : 'Créer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// oxlint-disable-next-line react-doctor/no-multi-comp
function UploadSignedDialog({
  requestId,
  onClose,
}: {
  requestId: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    if (!file || !requestId) {
      toast.error('Fichier requis');
      return;
    }
    const fd = new FormData();
    fd.append('file', file);
    startTransition(async () => {
      const r = await uploadSignedDocument(requestId, fd);
      if (r.success) {
        toast.success('Contrat signé déposé');
        onClose();
        router.refresh();
      } else {
        toast.error(r.error ?? 'Erreur');
      }
    });
  };

  return (
    <Dialog open={requestId != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Déposer le contrat signé</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="signed-file">Fichier signé (PDF)</Label>
          <Input
            id="signed-file"
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={isPending}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={isPending || !file}>
            {isPending ? 'Dépôt...' : 'Déposer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
