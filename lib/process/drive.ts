import { JWT } from 'google-auth-library';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FicheDetail } from './types';
import { env } from '@/lib/env';

import { extractDriveFileId } from './drive-url';

export { extractDriveFileId } from './drive-url';

/** Export PDF pour les types Google natifs ; null sinon (téléchargement direct). */
function exportMimeFor(mimeType: string): string | null {
  if (mimeType.startsWith('application/vnd.google-apps.')) {
    // Docs/Sheets/Slides/Drawings → PDF ; dossiers/formulaires non exportables.
    if (/document|spreadsheet|presentation|drawing/.test(mimeType))
      return 'application/pdf';
    return null;
  }
  return null;
}

let jwtClient: JWT | null = null;
function getJwt(): JWT {
  if (jwtClient) return jwtClient;
  if (!env.GOOGLE_SERVICE_ACCOUNT_KEY)
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY manquant');
  const creds = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_KEY) as {
    client_email: string;
    private_key: string;
  };
  jwtClient = new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  return jwtClient;
}

export function driveConfigured(): boolean {
  return Boolean(env.GOOGLE_SERVICE_ACCOUNT_KEY);
}

interface DriveFetch {
  status: number;
  contentType: string;
  body: ReadableStream<Uint8Array> | null;
}

/** Récupère un fichier Drive (export PDF si Google natif, sinon média brut). */
export async function fetchDriveFile(fileId: string): Promise<DriveFetch> {
  const jwt = getJwt();
  const { token } = await jwt.getAccessToken();
  if (!token) return { status: 500, contentType: 'text/plain', body: null };
  const auth = { Authorization: `Bearer ${token}` };

  const metaRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=mimeType,name&supportsAllDrives=true`,
    { headers: auth },
  );
  if (!metaRes.ok)
    return { status: metaRes.status, contentType: 'text/plain', body: null };
  const meta = (await metaRes.json()) as { mimeType: string; name: string };

  const exportMime = exportMimeFor(meta.mimeType);
  const fileRes = exportMime
    ? await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(exportMime)}`,
        { headers: auth },
      )
    : await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`,
        { headers: auth },
      );

  if (!fileRes.ok)
    return { status: fileRes.status, contentType: 'text/plain', body: null };
  return {
    status: 200,
    contentType: exportMime ?? meta.mimeType,
    body: fileRes.body,
  };
}

/** Vrai si l'ID correspond à un livrable réellement indexé (empêche le proxy Drive ouvert). */
export async function isKnownDeliverable(
  admin: SupabaseClient,
  fileId: string,
): Promise<boolean> {
  const { data } = await admin.from('process_index').select('detail');
  for (const row of data ?? []) {
    const detail = (row as { detail: FicheDetail | null }).detail;
    for (const t of detail?.taches ?? []) {
      for (const l of t.liens) {
        if (extractDriveFileId(l.url) === fileId) return true;
      }
    }
  }
  return false;
}
