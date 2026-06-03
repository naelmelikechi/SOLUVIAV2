'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Copy, Download, Eye, Loader2, Send, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { DevisStatusBadge } from './devis-status-badge';
import { DevisLignesEditor } from './devis-lignes-editor';
import { SendDevisDialog } from './send-devis-dialog';
import { CreateFactureFromDevisDialog } from './create-facture-from-devis-dialog';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { cancelDevis, reviseDevis } from '@/lib/actions/devis';
import type { DevisDetail } from '@/lib/queries/devis';

interface DevisDetailClientProps {
  devis: DevisDetail;
}

// oxlint-disable-next-line react-doctor/no-giant-component
export function DevisDetailClient({ devis }: DevisDetailClientProps) {
  const { push } = useRouter();
  const [sendOpen, setSendOpen] = useState(false);
  const [factureDialogOpen, setFactureDialogOpen] = useState(false);
  const [cancelPending, startCancel] = useTransition();
  const [revisePending, startRevise] = useTransition();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [reviseConfirmOpen, setReviseConfirmOpen] = useState(false);

  const isBrouillon = devis.statut === 'brouillon';
  const isEnvoye = devis.statut === 'envoye';
  const isAccepte = devis.statut === 'accepte';

  const totalDejaFactureHt = (devis.factures_liees ?? []).reduce(
    (sum, f) => sum + Number(f.montant_ht),
    0,
  );

  const publicLink = devis.acceptation_token
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/devis/public/${devis.acceptation_token}`
    : null;

  function handleCancel() {
    startCancel(async () => {
      const res = await cancelDevis(devis.id);
      if (res.success) {
        toast.success('Devis annulé.');
        push('/devis');
      } else {
        toast.error(res.error);
      }
    });
  }

  function handleRevise() {
    startRevise(async () => {
      const res = await reviseDevis(devis.id);
      if (res.success) {
        toast.success('Révision créée avec succès.');
        push(`/devis/${res.newDevisId}`);
      } else {
        toast.error(res.error);
      }
    });
  }

  function copyLink() {
    if (!publicLink) return;
    navigator.clipboard.writeText(publicLink).then(() => {
      toast.success('Lien copié dans le presse-papiers.');
    });
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">
              {devis.ref ?? 'Brouillon'}
            </h1>
            <DevisStatusBadge statut={devis.statut} />
          </div>
          <p className="text-muted-foreground mt-1 text-sm">{devis.objet}</p>
          <div className="text-muted-foreground mt-1 flex gap-4 text-xs">
            {devis.client && (
              <span>
                Client : {devis.client.trigramme} -{' '}
                {devis.client.raison_sociale}
              </span>
            )}
            {devis.societe_emettrice && (
              <span>Société : {devis.societe_emettrice.raison_sociale}</span>
            )}
          </div>
          {devis.date_validite && (
            <p className="text-muted-foreground text-xs">
              Valide jusqu&apos;au{' '}
              {new Date(devis.date_validite).toLocaleDateString('fr-FR')}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          {isBrouillon && (
            <>
              <Button onClick={() => setSendOpen(true)}>
                <Send className="mr-2 size-4" />
                Envoyer
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setPreviewLoaded(false);
                  setPreviewOpen(true);
                }}
              >
                <Eye className="mr-2 size-4" />
                Aperçu
              </Button>
              <Button
                variant="ghost"
                onClick={() => setCancelConfirmOpen(true)}
                disabled={cancelPending}
              >
                <XCircle className="mr-2 size-4" />
                Annuler
              </Button>
            </>
          )}
          {!isBrouillon && devis.acceptation_token && (
            <>
              <a
                href={`/api/devis/${devis.acceptation_token}/pdf`}
                download={`${devis.ref}.pdf`}
                className={cn(buttonVariants({ variant: 'outline' }))}
              >
                <Download className="mr-2 size-4" />
                Télécharger PDF
              </a>
              <Button variant="outline" onClick={copyLink}>
                <Copy className="mr-2 size-4" />
                Copier le lien
              </Button>
            </>
          )}
          {isAccepte && (
            <Button onClick={() => setFactureDialogOpen(true)}>
              Créer une facture
            </Button>
          )}
          {isEnvoye && (
            <Button
              variant="secondary"
              disabled={revisePending}
              onClick={() => setReviseConfirmOpen(true)}
            >
              Réviser
            </Button>
          )}
        </div>
      </div>

      {/* Lignes */}
      <div className="rounded-md border p-4">
        {isBrouillon ? (
          <DevisLignesEditor devisId={devis.id} lignes={devis.lignes} />
        ) : (
          <div className="space-y-3">
            <span className="text-sm font-medium">Lignes</span>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground border-b text-left">
                  <tr>
                    <th className="py-2">#</th>
                    <th>Libellé</th>
                    <th className="text-right">Qté</th>
                    <th className="text-right">PU HT</th>
                    <th className="text-right">TVA%</th>
                    <th className="text-right">Total HT</th>
                    <th className="text-right">Total TTC</th>
                  </tr>
                </thead>
                <tbody>
                  {devis.lignes.map((l) => (
                    <tr key={l.id} className="border-b last:border-0">
                      <td className="py-2 font-mono text-xs">{l.ordre}</td>
                      <td>
                        <div>{l.libelle}</div>
                        {l.description && (
                          <div className="text-muted-foreground text-xs">
                            {l.description}
                          </div>
                        )}
                      </td>
                      <td className="text-right tabular-nums">
                        {Number(l.quantite)}
                      </td>
                      <td className="text-right tabular-nums">
                        {Number(l.prix_unitaire_ht)
                          .toFixed(2)
                          .replace('.', ',')}{' '}
                        €
                      </td>
                      <td className="text-right tabular-nums">
                        {Number(l.taux_tva)} %
                      </td>
                      <td className="text-right tabular-nums">
                        {Number(l.total_ht).toFixed(2).replace('.', ',')} €
                      </td>
                      <td className="text-right font-medium tabular-nums">
                        {Number(l.total_ttc).toFixed(2).replace('.', ',')} €
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Totaux */}
      <div className="rounded-md border p-4">
        <div className="flex flex-col items-end gap-1 text-sm">
          <div>
            Sous-total HT :{' '}
            <span className="ml-4 font-mono tabular-nums">
              {Number(devis.montant_ht).toFixed(2).replace('.', ',')} €
            </span>
          </div>
          <div>
            TVA :{' '}
            <span className="ml-4 font-mono tabular-nums">
              {Number(devis.montant_tva).toFixed(2).replace('.', ',')} €
            </span>
          </div>
          <div className="mt-2 border-t pt-2 text-lg font-semibold">
            Total TTC :{' '}
            <span className="ml-4 font-mono tabular-nums">
              {Number(devis.montant_ttc).toFixed(2).replace('.', ',')} €
            </span>
          </div>
        </div>
      </div>

      {/* Timeline */}
      {!isBrouillon && (
        <div className="rounded-md border p-4">
          <h2 className="mb-3 text-sm font-medium">Historique</h2>
          <ol className="text-muted-foreground space-y-1 text-xs">
            <li>
              Créé le {new Date(devis.created_at).toLocaleDateString('fr-FR')}
            </li>
            {devis.date_envoi && (
              <li>
                Envoyé le{' '}
                {new Date(devis.date_envoi).toLocaleDateString('fr-FR')}
              </li>
            )}
            {devis.date_acceptation && (
              <li>
                Accepté le{' '}
                {new Date(devis.date_acceptation).toLocaleDateString('fr-FR')}
                {devis.acceptation_nom && ` par ${devis.acceptation_nom}`}
                {devis.acceptation_email && ` (${devis.acceptation_email})`}
              </li>
            )}
            {devis.date_refus && (
              <li>
                Refusé le{' '}
                {new Date(devis.date_refus).toLocaleDateString('fr-FR')}
                {devis.refus_motif && ` - Motif : ${devis.refus_motif}`}
              </li>
            )}
          </ol>
        </div>
      )}

      {/* Lien public */}
      {publicLink && (
        <div className="rounded-md border p-4">
          <h2 className="mb-2 text-sm font-medium">Lien public</h2>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={publicLink}
              aria-label="Lien public du devis"
              className="bg-muted text-muted-foreground flex-1 rounded-md px-3 py-1.5 text-xs"
            />
            <Button variant="outline" size="sm" onClick={copyLink}>
              <Copy className="size-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Factures emises depuis ce devis */}
      {devis.factures_liees && devis.factures_liees.length > 0 && (
        <div className="rounded-md border p-4">
          <h2 className="mb-3 text-sm font-medium">
            Factures émises depuis ce devis
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-muted-foreground border-b text-left">
                <tr>
                  <th className="py-2">Référence</th>
                  <th>Statut</th>
                  <th>Type</th>
                  <th className="text-right">HT</th>
                  <th className="text-right">TTC</th>
                  <th>Date d&apos;émission</th>
                </tr>
              </thead>
              <tbody>
                {devis.factures_liees.map((f) => (
                  <tr key={f.id} className="border-b last:border-0">
                    <td className="py-2 font-mono text-xs">
                      {f.ref ?? f.id.slice(0, 8)}
                    </td>
                    <td>{f.statut}</td>
                    <td>
                      {f.est_acompte ? 'Acompte' : 'Solde / Personnalisée'}
                    </td>
                    <td className="text-right tabular-nums">
                      {Number(f.montant_ht).toFixed(2).replace('.', ',')} €
                    </td>
                    <td className="text-right tabular-nums">
                      {Number(f.montant_ttc).toFixed(2).replace('.', ',')} €
                    </td>
                    <td>
                      {f.date_emission
                        ? new Date(f.date_emission).toLocaleDateString('fr-FR')
                        : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Apercu PDF du brouillon */}
      <Sheet
        open={previewOpen}
        onOpenChange={(open) => {
          setPreviewOpen(open);
          if (!open) setPreviewLoaded(false);
        }}
      >
        <SheetContent
          side="right"
          className="flex !w-[min(800px,95vw)] flex-col gap-0 p-0 data-[side=right]:sm:max-w-[min(800px,95vw)]"
        >
          <SheetHeader className="border-border flex flex-row items-center justify-between border-b p-4 pr-12">
            <SheetTitle>Aperçu du devis (brouillon)</SheetTitle>
            <a
              href={`/api/devis/brouillon/${devis.id}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              <Download className="mr-1.5 size-4" />
              Télécharger
            </a>
          </SheetHeader>
          <div className="relative flex-1">
            {!previewLoaded && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white">
                <Loader2 className="text-muted-foreground size-6 animate-spin" />
                <p className="text-muted-foreground text-sm">
                  Chargement du brouillon…
                </p>
              </div>
            )}
            {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
            <iframe
              src={`/api/devis/brouillon/${devis.id}/pdf?inline=true`}
              title="Aperçu du devis (brouillon)"
              onLoad={() => setPreviewLoaded(true)}
              className="absolute inset-0 size-full border-0 bg-white"
            />
          </div>
        </SheetContent>
      </Sheet>

      <SendDevisDialog
        devisId={devis.id}
        open={sendOpen}
        onOpenChange={setSendOpen}
      />

      <CreateFactureFromDevisDialog
        open={factureDialogOpen}
        onOpenChange={setFactureDialogOpen}
        devisId={devis.id}
        devisRef={devis.ref}
        totalHt={Number(devis.montant_ht)}
        totalDejaFactureHt={totalDejaFactureHt}
      />

      <ConfirmDialog
        open={cancelConfirmOpen}
        onOpenChange={setCancelConfirmOpen}
        title="Annuler ce devis brouillon ?"
        description="Le brouillon sera annulé et vous serez redirigé vers la liste des devis."
        confirmText="Annuler le devis"
        variant="destructive"
        isPending={cancelPending}
        onConfirm={handleCancel}
      />

      <ConfirmDialog
        open={reviseConfirmOpen}
        onOpenChange={setReviseConfirmOpen}
        title="Créer une révision de ce devis ?"
        description="Le devis actuel sera marqué comme remplacé et un nouveau brouillon éditable sera créé."
        confirmText="Créer la révision"
        isPending={revisePending}
        onConfirm={handleRevise}
      />
    </div>
  );
}
