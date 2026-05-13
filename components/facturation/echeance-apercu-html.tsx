'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { formatDate } from '@/lib/utils/formatters';

interface PreviewData {
  ref: string;
  date_emission: string;
  date_echeance: string;
  mois_concerne: string;
  montant_ht: number;
  taux_tva: number;
  montant_tva: number;
  montant_ttc: number;
  projet: { ref: string };
  client: {
    raison_sociale: string;
    siret: string | null;
    adresse: string | null;
    localisation: string | null;
    tva_intracommunautaire: string | null;
  } | null;
  lignes: Array<{
    id: string;
    contrat_ref: string;
    apprenant_prenom: string | null;
    apprenant_nom: string | null;
    description: string;
    montant_ht: number;
  }>;
  emetteur: {
    raison_sociale: string;
    adresse: string;
    siret: string;
    tva: string;
  };
}

function formatEur(n: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(n);
}

export function EcheanceApercuHtml({ echeanceId }: { echeanceId: string }) {
  const [data, setData] = useState<PreviewData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/echeances/${echeanceId}/preview-data`)
      .then((r) => {
        if (!r.ok) throw new Error('Aperçu indisponible');
        return r.json();
      })
      .then((d: PreviewData) => {
        if (!cancelled) setData(d);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [echeanceId]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <p className="text-sm text-[var(--destructive)]">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
        <p className="text-muted-foreground text-sm">
          Chargement de l’aperçu...
        </p>
      </div>
    );
  }

  const adresseParts = data.emetteur.adresse.split(',').map((s) => s.trim());
  const adresseLigne1 = adresseParts[0] ?? data.emetteur.adresse;
  const adresseLigne2 = adresseParts.slice(1).join(', ');

  return (
    <div className="h-full overflow-auto bg-neutral-100 p-6">
      <div className="mx-auto max-w-3xl bg-white p-10 shadow-sm">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div className="text-xs">
            <p className="text-base font-bold text-green-700">
              {data.emetteur.raison_sociale}
            </p>
            <p>{adresseLigne1}</p>
            {adresseLigne2 ? <p>{adresseLigne2}</p> : null}
            <p className="text-neutral-500">SIRET {data.emetteur.siret}</p>
            <p className="text-neutral-500">TVA {data.emetteur.tva}</p>
          </div>
          <div className="text-right text-xs">
            <p className="text-sm font-bold">APERÇU FACTURE</p>
            <p className="text-base font-bold text-amber-600">{data.ref}</p>
            <p>Date : {formatDate(data.date_emission)}</p>
            <p>Échéance : {formatDate(data.date_echeance)}</p>
          </div>
        </div>

        {/* Draft banner */}
        <div className="mb-4 rounded border border-amber-300 bg-amber-50 p-3 text-xs">
          <p className="font-bold text-amber-700">
            Document provisoire - Aperçu d&apos;échéance non émise
          </p>
          <p className="mt-1">
            Ce PDF n&apos;est pas une facture légale. Il sera régénéré avec un
            numéro officiel lors de l&apos;émission.
          </p>
        </div>

        {/* Destinataire */}
        <div className="mb-4 rounded bg-neutral-50 p-3 text-xs">
          <p className="mb-1 text-[10px] font-bold tracking-wider text-neutral-500 uppercase">
            Facturer à
          </p>
          <p className="font-bold">{data.client?.raison_sociale ?? ''}</p>
          {data.client?.adresse && <p>{data.client.adresse}</p>}
          {data.client?.localisation && <p>{data.client.localisation}</p>}
          {data.client?.siret && (
            <p className="text-neutral-500">SIRET {data.client.siret}</p>
          )}
          {data.client?.tva_intracommunautaire && (
            <p className="text-neutral-500">
              TVA {data.client.tva_intracommunautaire}
            </p>
          )}
        </div>

        {/* Objet */}
        <div className="mb-4 text-xs">
          <p className="mb-1 text-[10px] font-bold tracking-wider text-neutral-500 uppercase">
            Objet
          </p>
          <p>
            Commission de gestion - Projet {data.projet.ref} -{' '}
            {data.mois_concerne}
          </p>
        </div>

        {/* Table */}
        <div className="text-xs">
          <div className="grid grid-cols-12 border-b border-neutral-200 bg-neutral-100 px-2 py-1.5 font-bold">
            <div className="col-span-2">Contrat</div>
            <div className="col-span-3">Apprenant</div>
            <div className="col-span-5">Description</div>
            <div className="col-span-2 text-right">Montant HT</div>
          </div>
          {data.lignes.map((l) => (
            <div
              key={l.id}
              className="grid grid-cols-12 border-b border-neutral-100 px-2 py-1"
            >
              <div className="col-span-2">{l.contrat_ref}</div>
              <div className="col-span-3">
                {`${l.apprenant_prenom ?? ''} ${l.apprenant_nom ?? ''}`.trim()}
              </div>
              <div className="col-span-5 text-neutral-500">{l.description}</div>
              <div className="col-span-2 text-right tabular-nums">
                {formatEur(l.montant_ht)}
              </div>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div className="mt-4 flex justify-end">
          <div className="w-56 text-xs">
            <div className="flex justify-between py-0.5">
              <span className="text-neutral-500">Sous-total HT</span>
              <span className="tabular-nums">{formatEur(data.montant_ht)}</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="text-neutral-500">TVA {data.taux_tva}%</span>
              <span className="tabular-nums">
                {formatEur(data.montant_tva)}
              </span>
            </div>
            <div className="mt-1 flex justify-between border-t border-neutral-900 pt-1.5 text-sm font-bold">
              <span>Total TTC</span>
              <span className="tabular-nums">
                {formatEur(data.montant_ttc)}
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-12 border-t border-neutral-200 pt-3 text-[9px] leading-relaxed text-neutral-400">
          <p>
            Conditions de paiement : 30 jours fin de mois. En cas de retard de
            paiement, une pénalité égale à 3 fois le taux d&apos;intérêt légal
            sera appliquée, ainsi qu&apos;une indemnité forfaitaire de 40 € pour
            frais de recouvrement. Pas d&apos;escompte pour paiement anticipé.
          </p>
          <p className="mt-2">
            {data.emetteur.raison_sociale} - SIRET {data.emetteur.siret} - TVA{' '}
            {data.emetteur.tva}
          </p>
        </div>
      </div>
    </div>
  );
}
