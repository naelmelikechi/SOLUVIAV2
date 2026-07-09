'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Download,
  Mail,
  FileWarning,
  AlertTriangle,
  Send,
  Info,
  Pencil,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { AvoirDialog } from '@/components/facturation/avoir-dialog';
import { EditBrouillonInfoDialog } from '@/components/facturation/edit-brouillon-info-dialog';
import {
  SendFactureDialog,
  type FactureContact,
} from '@/components/facturation/send-facture-dialog';
import {
  sendFactureEmailAction,
  sendRelanceEmailAction,
} from '@/lib/actions/email';
import { sendFacture } from '@/lib/actions/factures';
import type { FactureDetail } from '@/lib/queries/factures';
import { logger } from '@/lib/utils/logger';

interface FactureDetailActionsProps {
  facture: FactureDetail;
  avoirSurCetteFacture: { id: string; ref: string | null } | null;
  contacts: FactureContact[];
}

export function FactureDetailActions({
  facture,
  avoirSurCetteFacture,
  contacts,
  // oxlint-disable-next-line react-doctor/prefer-useReducer
}: FactureDetailActionsProps) {
  const { replace, refresh } = useRouter();
  const [avoirOpen, setAvoirOpen] = useState(false);
  const [editInfoOpen, setEditInfoOpen] = useState(false);
  // Un seul dialog d'envoi, pilote par mode (envoi initial / renvoi /
  // relance) au lieu de 3 instances + 3 flags open.
  const [sendMode, setSendMode] = useState<
    'send' | 'resend' | 'relance' | null
  >(null);

  const isBrouillon = facture.statut === 'a_emettre';

  const handleConfirmSend = async (recipients: {
    to: string[];
    cc: string[];
  }) => {
    const result = await sendFacture(facture.id, recipients);
    if (result.success) {
      if (result.ref) {
        replace(`/facturation/${result.ref}`);
      } else {
        refresh();
      }
    }
    return result;
  };

  const handleConfirmResend = async (recipients: {
    to: string[];
    cc: string[];
  }) => {
    try {
      return await sendFactureEmailAction(facture.id, recipients);
    } catch (err) {
      // Le rendu PDF + Resend peut depasser le maxDuration serverless
      // pour les factures volumineuses (40+ lignes). Le browser recoit alors
      // une 500/504 et le await throw. On retourne un succes optimiste avec
      // hint pour que l'utilisateur verifie sa boite.
      logger.error('facture-detail-client.resend', err, {
        factureId: facture.id,
      });
      return {
        success: false,
        error:
          "Réponse serveur tardive. Vérifie ta boîte mail dans 1 min - l'envoi a probablement réussi.",
      };
    }
  };

  const handleConfirmRelance = async (recipients: {
    to: string[];
    cc: string[];
  }) => {
    return await sendRelanceEmailAction(facture.id, recipients);
  };

  // Le bouton "Envoyer" (brouillon) et "Renvoyer par email" ouvrent maintenant
  // le dialog SendFactureDialog au lieu d'envoyer directement, pour laisser
  // l'admin ajuster TO/CC. Idem pour la relance manuelle.
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

  return (
    <>
      {/* Bandeau brouillon */}
      {isBrouillon && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <Info className="mt-0.5 size-4 shrink-0" />
          <p>
            Brouillon non envoyé. Vérifiez puis cliquez sur Envoyer pour
            finaliser et déclencher la numérotation gapless + l’envoi email.
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="mb-6 flex flex-wrap gap-2">
        {isBrouillon && (
          <Button
            variant="default"
            size="sm"
            onClick={() => setSendMode('send')}
          >
            <Send className="mr-1.5 size-4" />
            Envoyer
          </Button>
        )}
        {isBrouillon && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditInfoOpen(true)}
          >
            <Pencil className="mr-1.5 size-4" />
            Modifier les infos
          </Button>
        )}
        {!isBrouillon && (
          <Button variant="outline" size="sm" onClick={handleDownloadPdf}>
            <Download className="mr-1.5 size-4" />
            Télécharger PDF
          </Button>
        )}
        {!facture.est_avoir && !isBrouillon && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSendMode('resend')}
          >
            <Mail className="mr-1.5 size-4" />
            Renvoyer par email
          </Button>
        )}
        {facture.statut === 'en_retard' && (
          <Button
            variant="outline"
            size="sm"
            className="border-orange-200 text-orange-600 hover:bg-orange-50 dark:border-orange-900 dark:text-orange-400 dark:hover:bg-orange-950/30"
            onClick={() => setSendMode('relance')}
          >
            <AlertTriangle className="mr-1.5 size-4" />
            Envoyer une relance
          </Button>
        )}
        {!facture.est_avoir && !isBrouillon && (
          <Button
            variant="outline"
            size="sm"
            className="border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/30"
            onClick={() => setAvoirOpen(true)}
          >
            <FileWarning className="mr-1.5 size-4" />
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
              (facture.lignes ?? []).flatMap((l) =>
                l.contrat_id
                  ? [
                      [
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
                      ] as const,
                    ]
                  : [],
              ),
            ).values(),
          )}
          open={avoirOpen}
          onOpenChange={setAvoirOpen}
        />
      )}

      {/* Edit info Dialog (brouillon only) */}
      {isBrouillon && (
        <EditBrouillonInfoDialog
          open={editInfoOpen}
          onOpenChange={setEditInfoOpen}
          factureId={facture.id}
          initial={{
            date_emission: facture.date_emission,
            date_echeance: facture.date_echeance,
            objet: facture.objet,
            conditions_reglement: facture.conditions_reglement,
          }}
          onSuccess={() => refresh()}
        />
      )}

      {/* Dialog d'envoi unique : le mode determine libelles et action */}
      <SendFactureDialog
        open={sendMode !== null}
        onOpenChange={(open) => {
          if (!open) setSendMode(null);
        }}
        factureRef={facture.ref}
        contacts={contacts}
        onConfirm={
          sendMode === 'relance'
            ? handleConfirmRelance
            : sendMode === 'resend'
              ? handleConfirmResend
              : handleConfirmSend
        }
        title={
          sendMode === 'relance'
            ? 'Envoyer une relance'
            : sendMode === 'resend'
              ? 'Renvoyer la facture par email'
              : 'Envoyer la facture'
        }
        confirmLabel={
          sendMode === 'relance'
            ? 'Envoyer la relance'
            : sendMode === 'resend'
              ? 'Renvoyer'
              : 'Envoyer'
        }
      />
    </>
  );
}
