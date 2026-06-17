/**
 * Adaptateur Yousign (signature électronique, API v3) — Feature 5.
 *
 * Branche le seam `SignatureProvider` (@/lib/signature/provider) sur l'API REST
 * Yousign v3 (https://developers.yousign.com).
 *
 * PRÉREQUIS D'ACTIVATION : la clé API doit être provisionnée par la Direction
 * dans la variable d'environnement `YOUSIGN_API_KEY` (et, en option,
 * `YOUSIGN_BASE_URL` pour cibler le bac à sable, p. ex.
 * https://api-sandbox.yousign.app/v3). Sans clé, `getSignatureProvider`
 * (@/lib/signature) renvoie `null` et l'application reste en mode manuel ; les
 * fonctions de ce module lèvent une erreur explicite plutôt que de planter.
 *
 * Flux `send()` (4 appels, cf. doc « Create your first Signature Request ») :
 *   1. POST /signature_requests                       -> crée un brouillon
 *   2. POST /signature_requests/{id}/documents (multipart) -> dépose le PDF
 *   3. POST /signature_requests/{id}/signers          -> ajoute le signataire + champ
 *   4. POST /signature_requests/{id}/activate         -> notifie le signataire par email
 * L'identifiant renvoyé (Signature Request id) est stocké dans
 * `signature_requests.provider_request_id`.
 *
 * La route webhook (app/api/webhooks/yousign) appelle `mapStatus()` pour faire
 * évoluer le statut local et `downloadSignedDocument()` pour récupérer la preuve.
 */
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/utils/logger';
import type {
  SignatureProvider,
  StatutSignature,
} from '@/lib/signature/provider';

const SCOPE = 'signature.yousign';
// Les contrats à signer sont stockés dans ce bucket (cf. lib/actions/signatures.ts).
const BUCKET = 'signature-documents';
const DEFAULT_BASE_URL = 'https://api.yousign.app/v3';

function baseUrl(): string {
  const raw = process.env.YOUSIGN_BASE_URL ?? DEFAULT_BASE_URL;
  return raw.replace(/\/+$/, '');
}

function requireApiKey(): string {
  const key = process.env.YOUSIGN_API_KEY;
  if (!key) {
    throw new Error(
      'YOUSIGN_API_KEY non configurée : le flux de signature Yousign est inactif.',
    );
  }
  return key;
}

/** Appel JSON authentifié à l'API Yousign. Lève une erreur si la réponse n'est pas 2xx. */
async function ysJson<T>(
  path: string,
  method: 'POST' | 'GET',
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${requireApiKey()}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    throw new Error(`Yousign ${method} ${path} -> ${res.status} ${detail}`);
  }
  return (await res.json()) as T;
}

/** Yousign exige first_name ET last_name : on scinde le nom complet du signataire. */
function splitNom(nomComplet: string): { firstName: string; lastName: string } {
  const parts = nomComplet.trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] ?? 'Signataire';
  const lastName = parts.length > 1 ? parts.slice(1).join(' ') : firstName;
  return { firstName, lastName };
}

// Statuts Yousign (Signature Request) -> statut local. Table statique => Record.
const STATUS_MAP: Record<string, StatutSignature> = {
  draft: 'brouillon',
  ongoing: 'envoyee',
  approval: 'envoyee',
  approving: 'envoyee',
  done: 'signee',
  declined: 'refusee',
  rejected: 'refusee',
  expired: 'expiree',
  canceled: 'annulee',
  cancelled: 'annulee',
};

export const yousignProvider: SignatureProvider = {
  id: 'yousign',

  async send({ documentPath, signerEmail, signerName, titre }) {
    // 1. Récupère le PDF du contrat depuis le stockage (RLS contournée : appel
    //    serveur-à-serveur déclenché par une server action déjà authentifiée).
    const admin = createAdminClient();
    const { data: pdf, error } = await admin.storage
      .from(BUCKET)
      .download(documentPath);
    if (error || !pdf) {
      throw new Error(`Document de signature introuvable (${documentPath}).`);
    }
    const filename = documentPath.split('/').pop() || 'contrat.pdf';

    // 2. Crée la Signature Request (brouillon) ; livraison email gérée par Yousign.
    const sr = await ysJson<{ id: string }>('/signature_requests', 'POST', {
      name: titre,
      delivery_mode: 'email',
    });

    // 3. Dépose le document signable (multipart/form-data : la frontière est
    //    posée automatiquement par fetch, ne pas fixer Content-Type à la main).
    const form = new FormData();
    form.append('file', pdf, filename);
    form.append('nature', 'signable_document');
    const upRes = await fetch(
      `${baseUrl()}/signature_requests/${sr.id}/documents`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${requireApiKey()}`,
          Accept: 'application/json',
        },
        body: form,
        cache: 'no-store',
        signal: AbortSignal.timeout(60_000),
      },
    );
    if (!upRes.ok) {
      const detail = (await upRes.text().catch(() => '')).slice(0, 300);
      throw new Error(`Yousign upload document -> ${upRes.status} ${detail}`);
    }
    const doc = (await upRes.json()) as { id: string; total_pages?: number };

    // 4. Ajoute le signataire (signature simple SES, sans OTP) + un champ
    //    signature sur la dernière page. Coordonnées par défaut (bas de page
    //    A4) ; à affiner via smart anchors si les contrats portent un repère
    //    textuel dédié.
    const { firstName, lastName } = splitNom(signerName);
    await ysJson(`/signature_requests/${sr.id}/signers`, 'POST', {
      info: {
        first_name: firstName,
        last_name: lastName,
        email: signerEmail,
        locale: 'fr',
      },
      signature_level: 'electronic_signature',
      signature_authentication_mode: 'no_otp',
      fields: [
        {
          type: 'signature',
          document_id: doc.id,
          page: Math.max(1, doc.total_pages ?? 1),
          x: 77,
          y: 700,
        },
      ],
    });

    // 5. Active la demande : les emails de signature partent automatiquement.
    await ysJson(`/signature_requests/${sr.id}/activate`, 'POST');

    logger.info(SCOPE, 'Signature request Yousign activée', { srId: sr.id });
    return { providerRequestId: sr.id };
  },

  mapStatus(providerStatus) {
    return STATUS_MAP[providerStatus] ?? 'envoyee';
  },
};

/**
 * Télécharge la preuve signée (PDF de tous les documents) d'une Signature
 * Request terminée. Utilisé par la route webhook quand le statut passe à
 * « signee ». Lève une erreur si la clé manque ou si l'appel échoue.
 */
export async function downloadSignedDocument(
  providerRequestId: string,
): Promise<Blob> {
  const res = await fetch(
    `${baseUrl()}/signature_requests/${providerRequestId}/documents/download`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${requireApiKey()}`,
        Accept: 'application/pdf',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(60_000),
    },
  );
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 200);
    throw new Error(`Yousign download -> ${res.status} ${detail}`);
  }
  return res.blob();
}
