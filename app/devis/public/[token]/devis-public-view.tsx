'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AcceptForm } from './accept-form';
import { RefuseForm } from './refuse-form';

interface DevisPublicPayload {
  devis: {
    ref: string;
    statut: string;
    objet: string;
    date_emission: string | null;
    date_validite: string | null;
    acceptation_token_expire_at: string;
    montant_ht: number;
    montant_tva: number;
    montant_ttc: number;
    conditions_reglement: string | null;
  };
  lignes: Array<{
    ordre: number;
    libelle: string;
    description: string | null;
    quantite: number;
    prix_unitaire_ht: number;
    taux_tva: number;
    total_ht: number;
    total_tva: number;
    total_ttc: number;
  }>;
  societe: {
    code: string;
    raison_sociale: string;
    forme_juridique: string | null;
    siret: string;
    tva_intracom: string;
    adresse: string;
    code_postal: string;
    ville: string;
    pays: string;
    email_contact: string;
    banque_nom: string | null;
    banque_iban: string | null;
    banque_bic: string | null;
    mentions_legales: string | null;
    conditions_reglement_default: string | null;
    logo_url: string | null;
  };
  client: {
    raison_sociale: string;
    adresse: string | null;
    localisation: string | null;
  };
}

const STATUT_LABELS: Record<string, string> = {
  envoye: 'En attente',
  accepte: 'Accepté',
  refuse: 'Refusé',
  expire: 'Expiré',
  remplace: 'Remplacé',
  annule: 'Annulé',
};

export function DevisPublicView({
  token,
  payload,
}: {
  token: string;
  payload: DevisPublicPayload;
}) {
  const [view, setView] = useState<'main' | 'accept' | 'refuse' | 'done'>(
    'main',
  );
  const { devis, lignes, societe, client } = payload;

  if (view === 'done') {
    return (
      <div className="rounded-md border bg-white p-8 text-center">
        <h1 className="text-2xl font-semibold">Merci !</h1>
        <p className="mt-2 text-gray-500">
          Votre réponse a bien été enregistrée.
        </p>
      </div>
    );
  }

  if (view === 'accept')
    return (
      <AcceptForm
        token={token}
        devisRef={devis.ref}
        onDone={() => setView('done')}
        onCancel={() => setView('main')}
      />
    );

  if (view === 'refuse')
    return (
      <RefuseForm
        token={token}
        onDone={() => setView('done')}
        onCancel={() => setView('main')}
      />
    );

  return (
    <div className="space-y-6">
      {/* En-tete */}
      <div className="rounded-md border bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Devis {devis.ref}</h1>
            <p className="text-sm text-gray-500">{societe.raison_sociale}</p>
          </div>
          <Badge variant="outline">
            {STATUT_LABELS[devis.statut] ?? devis.statut}
          </Badge>
        </div>
        <p className="mt-4 text-sm">
          <strong>Objet :</strong> {devis.objet}
        </p>
        {devis.date_validite && (
          <p className="mt-1 text-xs text-gray-500">
            Valide jusqu&apos;au{' '}
            {new Date(devis.date_validite).toLocaleDateString('fr-FR')}
          </p>
        )}
        <p className="mt-2 text-sm">
          <strong>Client :</strong> {client.raison_sociale}
        </p>
      </div>

      {/* Lignes */}
      <div className="rounded-md border bg-white p-6">
        <h2 className="mb-3 text-sm font-semibold text-gray-500 uppercase">
          Lignes
        </h2>
        <table className="w-full text-sm">
          <thead className="border-b text-left text-gray-500">
            <tr>
              <th className="py-2">#</th>
              <th>Libellé</th>
              <th className="text-right">Qté</th>
              <th className="text-right">PU HT</th>
              <th className="text-right">Montant HT</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <tr key={l.ordre} className="border-b last:border-0">
                <td className="py-2">{l.ordre}</td>
                <td>
                  {l.libelle}
                  {l.description && (
                    <div className="text-xs text-gray-500">{l.description}</div>
                  )}
                </td>
                <td className="text-right tabular-nums">{l.quantite}</td>
                <td className="text-right tabular-nums">
                  {Number(l.prix_unitaire_ht).toFixed(2).replace('.', ',')} €
                </td>
                <td className="text-right tabular-nums">
                  {Number(l.total_ht).toFixed(2).replace('.', ',')} €
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totaux */}
        <div className="mt-4 flex flex-col items-end gap-1 text-sm">
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

      {/* Conditions reglement */}
      {(devis.conditions_reglement || societe.conditions_reglement_default) && (
        <div className="rounded-md border bg-white p-6">
          <h2 className="mb-2 text-sm font-semibold text-gray-500 uppercase">
            Modalités de paiement
          </h2>
          <p className="text-sm whitespace-pre-line">
            {devis.conditions_reglement ?? societe.conditions_reglement_default}
          </p>
        </div>
      )}

      {/* RIB */}
      {(societe.banque_iban || societe.banque_nom) && (
        <div className="rounded-md border bg-white p-6">
          <h2 className="mb-2 text-sm font-semibold text-gray-500 uppercase">
            Coordonnées bancaires
          </h2>
          <dl className="space-y-1 text-sm">
            {societe.banque_nom && (
              <div>
                <dt className="inline font-medium">Banque : </dt>
                <dd className="inline">{societe.banque_nom}</dd>
              </div>
            )}
            {societe.banque_iban && (
              <div>
                <dt className="inline font-medium">IBAN : </dt>
                <dd className="inline font-mono">{societe.banque_iban}</dd>
              </div>
            )}
            {societe.banque_bic && (
              <div>
                <dt className="inline font-medium">BIC : </dt>
                <dd className="inline font-mono">{societe.banque_bic}</dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
        <a
          href={`/api/devis/${token}/pdf`}
          download={`${devis.ref}.pdf`}
          className="inline-flex items-center justify-center rounded-md border bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-gray-50"
        >
          Télécharger PDF
        </a>
        {devis.statut === 'envoye' && (
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setView('refuse')}>
              Refuser
            </Button>
            <Button onClick={() => setView('accept')}>Accepter le devis</Button>
          </div>
        )}
      </div>

      {/* Footer societe */}
      <p className="text-center text-xs text-gray-400">
        SIRET {societe.siret} - TVA {societe.tva_intracom} -{' '}
        {societe.email_contact}
      </p>
    </div>
  );
}
