import { notFound } from 'next/navigation';
import {
  getFactureByRef,
  getPaiementsByFactureId,
  getAvoirForFacture,
  getFactureRefById,
} from '@/lib/queries/factures';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { FactureDetailHeader } from '@/components/facturation/facture-detail-header';
import { FactureLignesTable } from '@/components/facturation/facture-lignes-table';
import { FactureTotaux } from '@/components/facturation/facture-totaux';
import { FacturePaiements } from '@/components/facturation/facture-paiements';
import { FactureDetailActions } from '@/components/facturation/facture-detail-client';

// SOLUVIA company info (will come from admin params in production)
const EMETTEUR = {
  raison_sociale: 'SOLUVIA SAS',
  adresse: '15 Rue de la Formation, 75008 Paris',
  siret: '891 234 567 00015',
  tva: 'FR89 891 234 567',
};

export default async function FactureDetailPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const facture = await getFactureByRef(ref);

  if (!facture) {
    notFound();
  }

  // Fetch paiements, avoir-on-this-facture, and origin ref (for avoirs) in parallel
  const [paiements, avoirSurCetteFacture, origineRef] = await Promise.all([
    getPaiementsByFactureId(facture.id),
    facture.est_avoir ? Promise.resolve(null) : getAvoirForFacture(facture.id),
    facture.est_avoir && facture.facture_origine_id
      ? getFactureRefById(facture.facture_origine_id)
      : Promise.resolve(null),
  ]);

  return (
    <div>
      {/* Header */}
      <FactureDetailHeader facture={facture} avoirRef={origineRef} />

      {/* Client actions (PDF, email, avoir dialog) */}
      <FactureDetailActions
        facture={facture}
        avoirSurCetteFacture={avoirSurCetteFacture}
      />

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
            {facture.client?.raison_sociale ?? ''}
          </div>
          <div className="text-muted-foreground text-sm">
            {facture.client?.adresse ?? '—'}
          </div>
          <div className="text-muted-foreground mt-1 font-mono text-xs">
            SIRET {facture.client?.siret ?? '—'}
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
    </div>
  );
}
