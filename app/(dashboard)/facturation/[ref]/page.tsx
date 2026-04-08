'use client';

import { useParams, redirect } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import { Download, Mail, FileWarning } from 'lucide-react';
import { toast } from 'sonner';
import {
  getFactureByRef,
  getFactures,
  getPaiementsByFactureId,
} from '@/lib/mock-data';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { FactureDetailHeader } from '@/components/facturation/facture-detail-header';
import { FactureLignesTable } from '@/components/facturation/facture-lignes-table';
import { FactureTotaux } from '@/components/facturation/facture-totaux';
import { FacturePaiements } from '@/components/facturation/facture-paiements';
import { AvoirDialog } from '@/components/facturation/avoir-dialog';

// SOLUVIA company info (will come from admin params in production)
const EMETTEUR = {
  raison_sociale: 'SOLUVIA SAS',
  adresse: '15 Rue de la Formation, 75008 Paris',
  siret: '891 234 567 00015',
  tva: 'FR89 891 234 567',
};

export default function FactureDetailPage() {
  const params = useParams<{ ref: string }>();
  const facture = getFactureByRef(params.ref);
  const [avoirOpen, setAvoirOpen] = useState(false);

  if (!facture) {
    redirect('/facturation');
  }

  const paiements = getPaiementsByFactureId(facture.id);

  // Check if an avoir exists for this facture
  const avoirSurCetteFacture = getFactures().find(
    (f) => f.est_avoir && f.facture_origine_ref === facture.ref,
  );

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
    <div>
      {/* Header */}
      <FactureDetailHeader facture={facture} />

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
      {avoirSurCetteFacture && (
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

      {/* Émetteur / Destinataire */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="p-5">
          <div className="text-muted-foreground mb-2 text-[10px] font-semibold tracking-wider uppercase">
            Émetteur
          </div>
          <div className="text-sm font-semibold">{EMETTEUR.raison_sociale}</div>
          <div className="text-muted-foreground text-sm">
            {EMETTEUR.adresse}
          </div>
          <div className="text-muted-foreground mt-1 font-mono text-xs">
            SIRET {EMETTEUR.siret}
          </div>
          <div className="text-muted-foreground font-mono text-xs">
            TVA {EMETTEUR.tva}
          </div>
        </Card>
        <Card className="p-5">
          <div className="text-muted-foreground mb-2 text-[10px] font-semibold tracking-wider uppercase">
            Destinataire
          </div>
          <div className="text-sm font-semibold">
            {facture.client_raison_sociale}
          </div>
          <div className="text-muted-foreground text-sm">
            {/* Address from client — will come from Supabase */}—
          </div>
          <div className="text-muted-foreground mt-1 font-mono text-xs">
            SIRET —
          </div>
        </Card>
      </div>

      {/* Lignes */}
      <Card className="mb-6 overflow-hidden">
        <div className="border-b px-5 py-3">
          <h3 className="text-sm font-semibold">
            Lignes ({facture.lignes.length})
          </h3>
        </div>
        <FactureLignesTable
          lignes={facture.lignes}
          est_avoir={facture.est_avoir}
        />
      </Card>

      {/* Totaux */}
      <div className="mb-6">
        <FactureTotaux
          montant_ht={facture.montant_ht}
          taux_tva={facture.taux_tva}
          montant_tva={facture.montant_tva}
          montant_ttc={facture.montant_ttc}
          est_avoir={facture.est_avoir}
        />
      </div>

      <Separator className="my-6" />

      {/* Paiements */}
      <FacturePaiements
        paiements={paiements}
        statut={facture.statut}
        date_echeance={facture.date_echeance}
      />

      {/* Avoir Dialog */}
      {!facture.est_avoir && (
        <AvoirDialog
          facture={facture}
          open={avoirOpen}
          onOpenChange={setAvoirOpen}
        />
      )}
    </div>
  );
}
