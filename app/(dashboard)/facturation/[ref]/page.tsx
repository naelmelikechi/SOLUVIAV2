import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  getFactureByRef,
  getPaiementsByFactureId,
  getAvoirForFacture,
  getFactureRefById,
  getProjetActiveContratsForFacturation,
} from '@/lib/queries/factures';
import { getContactsByClientId } from '@/lib/queries/clients';
import { getEmetteurInfo } from '@/lib/queries/parametres';
import { getCurrentUser } from '@/lib/queries/users';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ref: string }>;
}): Promise<Metadata> {
  const { ref } = await params;
  return { title: `${ref} - Facturation - SOLUVIA` };
}
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { FactureDetailHeader } from '@/components/facturation/facture-detail-header';
import { FactureLignesTable } from '@/components/facturation/facture-lignes-table';
import { FactureTotaux } from '@/components/facturation/facture-totaux';
import { FacturePaiements } from '@/components/facturation/facture-paiements';
import { FactureDetailActions } from '@/components/facturation/facture-detail-client';

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

  // Fetch paiements, avoir-on-this-facture, origin ref, emetteur, and projet
  // (pour edition des lignes en mode brouillon) in parallel
  const projetId = facture.projet?.id ?? '';
  const clientId = facture.client?.id;
  const [
    paiements,
    avoirSurCetteFacture,
    origineRef,
    EMETTEUR,
    projetData,
    contacts,
    currentUser,
  ] = await Promise.all([
    getPaiementsByFactureId(facture.id),
    facture.est_avoir ? Promise.resolve(null) : getAvoirForFacture(facture.id),
    facture.est_avoir && facture.facture_origine_id
      ? getFactureRefById(facture.facture_origine_id)
      : Promise.resolve(null),
    getEmetteurInfo(facture.societe_emettrice_id),
    projetId
      ? getProjetActiveContratsForFacturation(projetId)
      : Promise.resolve(null),
    clientId ? getContactsByClientId(clientId) : Promise.resolve([]),
    getCurrentUser(),
  ]);

  const isBrouillon = facture.statut === 'a_emettre';
  const tauxCommission = projetData?.tauxCommission ?? 10;

  return (
    <div>
      <Link
        href="/facturation"
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1.5 text-sm transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Retour à la facturation
      </Link>

      {/* Header */}
      <FactureDetailHeader facture={facture} avoirRef={origineRef} />

      {/* Client actions (PDF, email, avoir dialog) */}
      <FactureDetailActions
        facture={facture}
        avoirSurCetteFacture={avoirSurCetteFacture}
        contacts={(contacts ?? []).map((c) => ({
          id: c.id,
          nom: c.nom,
          email: c.email,
          recoit_factures: c.recoit_factures ?? false,
          recoit_factures_cc: c.recoit_factures_cc ?? false,
        }))}
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
            {facture.client?.adresse ?? '-'}
          </div>
          <div className="text-muted-foreground mt-1 font-mono text-xs">
            SIRET {facture.client?.siret ?? '-'}
          </div>
        </Card>
      </div>

      {/* Lignes */}
      <Card className="mb-6 overflow-x-auto">
        <div className="border-b px-5 py-3">
          <h3 className="text-sm font-semibold">
            Lignes ({facture.lignes.length})
          </h3>
        </div>
        <FactureLignesTable
          lignes={facture.lignes}
          est_avoir={facture.est_avoir}
          factureId={facture.id}
          projetId={projetId}
          isBrouillon={isBrouillon}
          tauxCommission={tauxCommission}
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
        factureId={facture.id}
        montantTtc={facture.montant_ttc}
        userRole={currentUser?.role ?? undefined}
        odooSynced={Boolean(facture.odoo_id)}
      />
    </div>
  );
}
