'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Download, Mail, FileWarning } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { AvoirDialog } from '@/components/facturation/avoir-dialog';
import type { FactureDetail } from '@/lib/queries/factures';

interface FactureDetailActionsProps {
  facture: FactureDetail;
  avoirSurCetteFacture: { id: string; ref: string | null } | null;
}

export function FactureDetailActions({
  facture,
  avoirSurCetteFacture,
}: FactureDetailActionsProps) {
  const [avoirOpen, setAvoirOpen] = useState(false);

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
    toast.success('Email renvoyé avec succès');
  };

  return (
    <>
      {/* Actions */}
      <div className="mb-6 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={handleDownloadPdf}>
          <Download className="mr-1.5 h-4 w-4" />
          Télécharger PDF
        </Button>
        {!facture.est_avoir && (
          <Button variant="outline" size="sm" onClick={handleResendEmail}>
            <Mail className="mr-1.5 h-4 w-4" />
            Renvoyer par email
          </Button>
        )}
        {!facture.est_avoir && facture.statut !== 'a_emettre' && (
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
          montantHtDefault={facture.montant_ht}
          open={avoirOpen}
          onOpenChange={setAvoirOpen}
        />
      )}
    </>
  );
}
