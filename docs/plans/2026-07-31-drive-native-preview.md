# Niveau 2 — Aperçu natif des livrables Drive dans Soluvia — Plan

**Goal:** Afficher les fichiers Drive des livrables **dans l'app** (aperçu inline) au lieu de rediriger vers Google Drive. Récupération côté serveur via un **compte de service** (approche « SA + dossier partagé »).

**Architecture:** Une route Next `GET /api/process/drive/[fileId]` récupère le fichier via l'API Drive (auth compte de service, `google-auth-library` → access token, scope `drive.readonly`), et le **streame inline** (PDF/image directs ; Google Docs/Sheets/Slides → export PDF). Sécurité : la route ne sert QUE des fichiers **référencés dans un livrable de `process_index`** (pas un proxy Drive ouvert). Côté UI, chaque livrable Drive gagne un bouton **Aperçu** ouvrant une visionneuse (Dialog + iframe), avec repli « Ouvrir dans Drive ».

**Dépendance externe (bloquant activation, PAS le code) :** un **compte de service Google** + API Drive activée + dossier des livrables partagé avec l'email du SA + la clé JSON en env prod `GOOGLE_SERVICE_ACCOUNT_KEY`. Sans la clé, la route répond 503 et l'UI retombe sur le lien externe (dégradation propre). Le code est livrable et se déploie tel quel.

**Repo:** `~/Desktop/SOLUVIAV2`, branche `feat/drive-native-preview`. Next 16, shadcn (`components/ui/dialog.tsx`). Tests `__tests__/*.test.ts`. `noUncheckedIndexedAccess`. Ajout dep `google-auth-library`.

---

## Task D1 — Backend : lib Drive + route + env

**Files:** Create `lib/process/drive.ts`, `app/api/process/drive/[fileId]/route.ts` ; Modify `lib/env.ts` ; Test `__tests__/process-drive.test.ts`. Add dep `google-auth-library`.

- [ ] **Step 1 — dep** : `npm install google-auth-library`.

- [ ] **Step 2 — env** : dans `lib/env.ts` serverSchema, ajouter (optionnel) :

```ts
    // Compte de service Google (JSON) pour l'aperçu natif des livrables Drive.
    // Optionnel : sans lui, l'aperçu est désactivé (503) et on garde le lien externe.
    GOOGLE_SERVICE_ACCOUNT_KEY: z.string().min(1).optional(),
```

et le mapping `GOOGLE_SERVICE_ACCOUNT_KEY: process.env.GOOGLE_SERVICE_ACCOUNT_KEY,` (pas de `.trim()` — c'est du JSON).

- [ ] **Step 3 — test `extractDriveFileId` (rouge d'abord)** `__tests__/process-drive.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { extractDriveFileId } from '@/lib/process/drive';

describe('extractDriveFileId', () => {
  it('extrait l’ID des formes /file/d, /document/d, /spreadsheets/d, /presentation/d', () => {
    expect(
      extractDriveFileId(
        'https://drive.google.com/file/d/1iC0qWfLIr6gHIX5cARcmrVX_4CVMrb7m/view?usp=drive',
      ),
    ).toBe('1iC0qWfLIr6gHIX5cARcmrVX_4CVMrb7m');
    expect(
      extractDriveFileId('https://docs.google.com/document/d/ABC123_xy/edit'),
    ).toBe('ABC123_xy');
    expect(
      extractDriveFileId(
        'https://docs.google.com/spreadsheets/d/SHEET-9/edit#gid=0',
      ),
    ).toBe('SHEET-9');
    expect(
      extractDriveFileId('https://docs.google.com/presentation/d/PRES_7/edit'),
    ).toBe('PRES_7');
    expect(extractDriveFileId('https://drive.google.com/open?id=OPEN_42')).toBe(
      'OPEN_42',
    );
  });
  it('renvoie null hors Drive / dossier', () => {
    expect(extractDriveFileId('https://example.com/x')).toBeNull();
    expect(
      extractDriveFileId('https://drive.google.com/drive/folders/FOLDER1'),
    ).toBeNull();
  });
});
```

Run → FAIL.

- [ ] **Step 4 — `lib/process/drive.ts`** :

```ts
import { JWT } from 'google-auth-library';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FicheDetail } from './types';
import { env } from '@/lib/env';

const FILE_ID_RE =
  /\/(?:file|document|spreadsheets|presentation)\/d\/([a-zA-Z0-9_-]+)/;
const OPEN_ID_RE = /[?&]id=([a-zA-Z0-9_-]+)/;

/** Extrait l'ID d'un fichier Drive depuis une URL, ou null (dossier / non-Drive). */
export function extractDriveFileId(url: string): string | null {
  if (!/drive\.google\.com|docs\.google\.com/.test(url)) return null;
  if (/\/folders\//.test(url)) return null;
  const m = url.match(FILE_ID_RE) ?? url.match(OPEN_ID_RE);
  return m ? m[1] : null;
}

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
```

Run test → PASS.

- [ ] **Step 5 — route `app/api/process/drive/[fileId]/route.ts`** :

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  driveConfigured,
  fetchDriveFile,
  isKnownDeliverable,
} from '@/lib/process/drive';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const { fileId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (!driveConfigured())
    return NextResponse.json(
      { error: 'drive_not_configured' },
      { status: 503 },
    );

  if (!/^[a-zA-Z0-9_-]+$/.test(fileId))
    return NextResponse.json({ error: 'bad_id' }, { status: 400 });
  const admin = createAdminClient();
  if (!(await isKnownDeliverable(admin, fileId)))
    return NextResponse.json({ error: 'not_found' }, { status: 404 });

  try {
    const res = await fetchDriveFile(fileId);
    if (res.status !== 200 || !res.body) {
      console.error('[process/drive] fetch échec', fileId, res.status);
      return NextResponse.json({ error: 'drive_error' }, { status: 502 });
    }
    return new NextResponse(res.body, {
      status: 200,
      headers: {
        'content-type': res.contentType,
        'content-disposition': 'inline',
        'x-content-type-options': 'nosniff',
        'cache-control': 'private, max-age=300',
      },
    });
  } catch (e) {
    console.error(
      '[process/drive]',
      e instanceof Error ? e.message : String(e),
    );
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
```

- [ ] **Step 6 — vérif** : `npx vitest run __tests__/process-drive.test.ts && npx tsc --noEmit && npm run lint && npm run build`. Commit : `feat(process): backend aperçu Drive (route + lib compte de service)`.

---

## Task D2 — UI : visionneuse inline

**Files:** Create `components/process/deliverable-link.tsx` ; Modify `components/process/process-step.tsx`.

- [ ] **Step 1 — `components/process/deliverable-link.tsx`** (`'use client'`) :
  - Props `{ libelle: string; url: string }`.
  - `id = extractDriveFileId(url)`. (Importer `extractDriveFileId` depuis `@/lib/process/drive` — fonction pure, safe côté client ; si l'import tire des deps serveur, dupliquer une petite version pure dans un module client, ex. `lib/process/drive-url.ts`, et l'utiliser des deux côtés.)
  - Nettoyer le libellé d'affichage : retirer un préfixe `__VISUEL__`/`__ECRIT__`.
  - Si `id` :
    - un bouton **« Aperçu »** (icône œil) qui ouvre un `Dialog` (`components/ui/dialog`) contenant `<iframe src={/api/process/drive/${id}} className="h-[80vh] w-full rounded-md border-0" title={libelle} />` + un lien « Ouvrir dans Drive » (url d'origine, `target=_blank rel=noreferrer`).
    - Gestion d'erreur : sur `onError` de l'iframe OU si un fetch HEAD renvoie 503, afficher « Aperçu indisponible — ouvrir dans Drive » (repli). (Simple : afficher toujours le lien externe sous l'iframe ; en cas d'échec l'utilisateur a le repli.)
  - Sinon (URL non-Drive) : lien externe simple, comme aujourd'hui.
  - Style cohérent avec les chips de livrables actuelles (`process-step.tsx`).

- [ ] **Step 2 — brancher dans `process-step.tsx`** : remplacer la boucle `tache.liens.map(...)` (les `<a>` actuels) par `tache.liens.map((l, j) => <DeliverableLink key={j} libelle={l.libelle} url={l.url} />)`.

- [ ] **Step 3 — vérif** : `npx tsc --noEmit && npm run lint && npm run build`. Commit : `feat(process): visionneuse inline des livrables (Aperçu Drive)`.

---

## Task D3 — Déploiement + activation

- [ ] PR `feat/drive-native-preview` → CI → merge → deploy. **Sans la clé**, l'app garde le lien externe (aperçu 503) — rien ne casse.
- [ ] **Côté utilisateur (activation)** : créer le compte de service Google (API Drive), partager le dossier des livrables avec son email, puis `npx vercel env add GOOGLE_SERVICE_ACCOUNT_KEY production` (coller le JSON). Redeploy.
- [ ] Vérifier : ouvrir une fiche → « Aperçu » sur un livrable → le PDF/image s'affiche inline.

---

## Auto-revue

| Élément                                                          | Task   |
| ---------------------------------------------------------------- | ------ |
| Auth compte de service + token                                   | D1     |
| Route streaming (PDF/image direct, Google natif → export PDF)    | D1     |
| Sécurité : seulement les livrables indexés (pas de proxy ouvert) | D1     |
| Dégradation si pas de clé (503 + lien externe)                   | D1, D2 |
| Visionneuse inline + repli Drive                                 | D2     |
| Déploiement + procédure d'activation                             | D3     |

**Vigilance :** (1) `extractDriveFileId` doit être importable côté client sans tirer `google-auth-library`/env serveur → si besoin, isoler l'URL-parsing pur dans `lib/process/drive-url.ts`. (2) `isKnownDeliverable` scanne tout `process_index.detail` (OK sur petit corpus ; à indexer si ça grossit). (3) iframe same-origin de notre route → pas de souci CSP ; `content-disposition: inline`. (4) La clé SA est un secret : c'est **l'utilisateur** qui l'ajoute en env prod, pas l'agent.
