'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Download,
  Mail,
  FileWarning,
  Loader2,
  AlertTriangle,
  Send,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { AvoirDialog } from '@/components/facturation/avoir-dialog';
import {
  sendFactureEmailAction,
  sendRelanceEmailAction,
} from '@/lib/actions/email';
import { sendFacture } from '@/lib/actions/factures';
import type { FactureDetail } from '@/lib/queries/factures';

interface FactureDetailActionsProps {
  facture: FactureDetail;
  avoirSurCetteFacture: { id: string; ref: string | null } | null;
}

export function FactureDetailActions({
  facture,
  avoirSurCetteFacture,
}: FactureDetailActionsProps) {
  const router = useRouter();
  const [avoirOpen, setAvoirOpen] = useState(false);
  const [emailPending, startEmailTransition] = useTransition();
  const [relancePending, startRelanceTransition] = useTransition();
  const [sendPending, startSendTransition] = useTransition();

  const isBrouillon = facture.statut === 'a_emettre';

  const handleSendBrouillon = () => {
    startSendTransition(async () => {
      const result = await sendFacture(facture.id);
      if (result.success) {
        toast.success(
          result.ref
            ? `Envoyé : ${result.ref}`
            : 'Brouillon envoyé avec succès',
        );
        if (result.ref) {
          // Le ref vient d'etre attribue, l'URL doit pointer vers le nouveau
          // ref (la route etait sur l'ancienne URL UUID-less). Pour les
          // brouillons sans ref, le detail est probablement accede via l'id.
          router.replace(`/facturation/${result.ref}`);
        } else {
          router.refresh();
        }
      } else {
        toast.error(result.error ?? "Erreur lors de l'envoi");
      }
    });
  };

  const handleDownloadPdf = async () => {
    try {
      const response = await fetch(`/api/factures/${facture.ref}/pdf`);
      if (!response.ok) throw new Error('Erreur de génération');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${facture.ref}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Erreur lors de la génération du PDF');
    }
  };

  const handleResendEmail = () => {
    startEmailTransition(async () => {
      try {
        const result = await sendFactureEmailAction(facture.id);
        if (result.success) {
          toast.success('Email envoyé avec succès');
        } else {
          toast.error(result.error ?? "Erreur lors de l'envoi");
        }
      } catch (err) {
        // Le rendu PDF + Resend peut depasser le maxDuration serverless
        // pour les factures volumineuses (40+ lignes). Dans ce cas le
        // browser recoit une 500/504 et le await throw. Sans ce catch,
        // aucun toast n etait affiche -> utilisateur croit que rien ne
        // se passe alors que l email a souvent bien ete envoye avant
        // le timeout.
        toast.error(
          'Reponse serveur tardive. Verifie ta boite mail dans 1 min - l envoi a probablement reussi.',
        );

        console.error('sendFactureEmailAction failed:', err);
      }
    });
  };

  return (
    <>
      {/* Bandeau brouillon */}
      {isBrouillon && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            {
              'Brouillon non envoyé. Vérifiez puis cliquez sur Envoyer pour finaliser et déclencher la numérotation gapless + l’envoi email.'
            }
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="mb-6 flex flex-wrap gap-2">
        {isBrouillon && (
          <Button
            variant="default"
            size="sm"
            onClick={handleSendBrouillon}
            disabled={sendPending}
          >
            {sendPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-1.5 h-4 w-4" />
            )}
            {sendPending ? 'Envoi en cours...' : 'Envoyer'}
          </Button>
        )}
        {!isBrouillon && (
          <Button variant="outline" size="sm" onClick={handleDownloadPdf}>
            <Download className="mr-1.5 h-4 w-4" />
            Télécharger PDF
          </Button>
        )}
        {!facture.est_avoir && !isBrouillon && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleResendEmail}
            disabled={emailPending}
          >
            {emailPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Mail className="mr-1.5 h-4 w-4" />
            )}
            {emailPending ? 'Envoi en cours...' : 'Renvoyer par email'}
          </Button>
        )}
        {facture.statut === 'en_retard' && (
          <Button
            variant="outline"
            size="sm"
            className="border-orange-200 text-orange-600 hover:bg-orange-50 dark:border-orange-900 dark:text-orange-400 dark:hover:bg-orange-950/30"
            disabled={relancePending}
            onClick={() =>
              startRelanceTransition(async () => {
                const result = await sendRelanceEmailAction(facture.id);
                if (result.success) {
                  toast.success('Relance envoyée avec succès');
                } else {
                  toast.error(result.error ?? "Erreur lors de l'envoi");
                }
              })
            }
          >
            {relancePending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <AlertTriangle className="mr-1.5 h-4 w-4" />
            )}
            {relancePending ? 'Envoi...' : 'Envoyer une relance'}
          </Button>
        )}
        {!facture.est_avoir && !isBrouillon && (
          <Button
            variant="outline"
            size="sm"
            className="border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/30"
            onClick={() => setAvoirOpen(true)}
          >
            <FileWarning className="mr-1.5 h-4 w-4" />
            Émettre un avoir
          </Button>
        )}
      </div>

      {/* Avoir link */}
      {avoirSurCetteFacture && avoirSurCetteFacture.ref && (
        <div className="mb-6 rounded-lg border border-orange-200 bg-orange-50 px-4 py-2.5 text-sm text-orange-700 dark:border-orange-900 dark:bg-orange-950/30 dark:text-orange-400">
          Un avoir a été émis sur cette facture :{' '}
          <Link
            href={`/facturation/${avoirSurCetteFacture.ref}`}
            className="font-semibold underline underline-offset-2"
          >
            {avoirSurCetteFacture.ref}
          </Link>
        </div>
      )}

      {/* Avoir Dialog */}
      {!facture.est_avoir && (
        <AvoirDialog
          factureRef={facture.ref ?? ''}
          factureOrigineId={facture.id}
          montantHtDefault={facture.montant_ht}
          contrats={Array.from(
            new Map(
              (facture.lignes ?? [])
                .filter((l) => l.contrat_id)
                .map((l) => [
                  l.contrat_id as string,
                  {
                    contratId: l.contrat_id as string,
                    ref: l.contrat?.ref ?? null,
                    apprenant: [
                      l.contrat?.apprenant_prenom,
                      l.contrat?.apprenant_nom,
                    ]
                      .filter(Boolean)
                      .join(' ')
                      .trim(),
                  },
                ]),
            ).values(),
          )}
          open={avoirOpen}
          onOpenChange={setAvoirOpen}
        />
      )}
    </>
  );
}
