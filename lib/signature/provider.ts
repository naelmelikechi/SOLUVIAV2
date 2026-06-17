import type { Database } from '@/types/database';

export type StatutSignature = Database['public']['Enums']['statut_signature'];

/**
 * Seam d'intégration d'un prestataire de signature électronique (Feature 5).
 *
 * V1 = mode MANUEL : aucun prestataire n'est branché ; le contrat signé est
 * uploadé à la main (cf. lib/actions/signatures.ts → uploadSignedDocument), et
 * `signature_requests.provider = 'manuel'`.
 *
 * Pour brancher Yousign / Oodrive / DocuSign (décision + clé API à acter par la
 * Direction), implémenter cette interface dans un module dédié
 * (`lib/signature/<provider>.ts`, clé via variable d'environnement) :
 *   - `send()` crée la demande chez le prestataire et renvoie son identifiant,
 *     qu'on stocke dans `provider_request_id` ;
 *   - une route webhook (à ajouter) appelle `mapStatus()` pour faire évoluer le
 *     statut et déposer la preuve signée.
 * Le modèle de données et l'UI restent inchangés.
 */
export interface SignatureProvider {
  readonly id: string;
  send(input: {
    documentPath: string;
    signerEmail: string;
    signerName: string;
    titre: string;
  }): Promise<{ providerRequestId: string }>;
  mapStatus(providerStatus: string): StatutSignature;
}
