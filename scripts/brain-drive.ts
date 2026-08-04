/**
 * Ingestion des DOCUMENTS du Drive « SOLUVIA BRAIN » dans le cerveau, via Max.
 *
 * Crawle récursivement le dossier partagé (compte de service), déduplique les
 * doublons de format (Markdown > PDF > docx > HTML), et pour chaque document
 * nouveau/modifié (par md5) : télécharge → analyse via `claude -p` (tokens Max)
 * → upsert une note `document` dans `brain_notes`.
 *
 * Prérequis (.env.local) : GOOGLE_SERVICE_ACCOUNT_KEY (Drive), SUPAVIA_DASHBOARD_*
 * + NEXT_PUBLIC_SUPABASE_URL (pg-meta), et `claude` authentifié Max.
 *
 * Usage :
 *   tsx scripts/brain-drive.ts --manifest              # inventaire dédupliqué (aucune écriture)
 *   tsx scripts/brain-drive.ts                         # ingère tout SOLUVIA BRAIN (incrémental)
 *   tsx scripts/brain-drive.ts --folder "G — Qualité"  # limite à un dossier
 *   tsx scripts/brain-drive.ts --vault /chemin/coffre  # + régénère & pousse le coffre
 */
import { config } from 'dotenv';
import { resolve, join } from 'node:path';
import { createSign } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { slugify } from '../lib/brain/note';

config({ path: resolve(process.cwd(), '.env.local') });

const KEY = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
const BASE = (
  process.env.SUPAVIA_API_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
)?.replace(/\/$/, '');
const USER = process.env.SUPAVIA_DASHBOARD_USER;
const PASS = process.env.SUPAVIA_DASHBOARD_PASSWORD;
if (!KEY || !BASE || !USER || !PASS)
  throw new Error(
    'Env manquant : GOOGLE_SERVICE_ACCOUNT_KEY + SUPAVIA_DASHBOARD_* + SUPABASE_URL.',
  );
const creds = JSON.parse(KEY) as { client_email: string; private_key: string };
const AUTH = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');
const PGMETA = `${BASE}/api/platform/pg-meta/default/query`;
const lit = (x: string) => `'${String(x).replace(/'/g, "''")}'`;
const arr = (a: string[]) =>
  a.length ? `ARRAY[${a.map(lit).join(',')}]::text[]` : `ARRAY[]::text[]`;

async function pg<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const res = await fetch(PGMETA, {
        method: 'POST',
        headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: sql }),
      });
      const json: unknown = await res.json();
      if (Array.isArray(json)) return json as T[];
      throw new Error(`pg-meta: ${JSON.stringify(json).slice(0, 160)}`);
    } catch (e) {
      if (attempt === 6) throw e;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  return [];
}

// ---------------------------------------------------------------- Drive
const b64 = (o: unknown) =>
  Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString(
    'base64url',
  );

async function driveToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const input =
    b64({ alg: 'RS256', typ: 'JWT' }) +
    '.' +
    b64({
      iss: creds.client_email,
      scope: 'https://www.googleapis.com/auth/drive.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    });
  const signer = createSign('RSA-SHA256');
  signer.update(input);
  signer.end();
  const jwt =
    input + '.' + signer.sign(creds.private_key).toString('base64url');
  const res = (await (
    await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    })
  ).json()) as { access_token?: string };
  if (!res.access_token) throw new Error('Auth Drive échouée');
  return res.access_token;
}

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
  md5Checksum?: string;
}

async function listDrive(token: string): Promise<DriveFile[]> {
  const files: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const p = new URLSearchParams({
      pageSize: '1000',
      q: 'trashed = false',
      fields: 'nextPageToken, files(id,name,mimeType,parents,md5Checksum)',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    });
    if (pageToken) p.set('pageToken', pageToken);
    const j = (await (
      await fetch('https://www.googleapis.com/drive/v3/files?' + p, {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).json()) as { files?: DriveFile[]; nextPageToken?: string };
    files.push(...(j.files ?? []));
    pageToken = j.nextPageToken;
  } while (pageToken);
  return files;
}

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const EXT: Record<string, string> = {
  'text/x-markdown': 'md',
  'application/pdf': 'pdf',
  'text/html': 'html',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'docx',
};
// Préférence de format pour la dédup : md < pdf < docx < html < autre.
const PREF: Record<string, number> = {
  'text/x-markdown': 0,
  'application/pdf': 1,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 2,
  'text/html': 3,
};

interface DocEntry extends DriveFile {
  parentPath: string;
  topFolder: string;
}

/** Liste dédupliquée des documents ingérables, avec chemin de dossier. */
function buildManifest(files: DriveFile[]): DocEntry[] {
  const byId = new Map(files.map((f) => [f.id, f]));
  const pathOf = (f: DriveFile): string => {
    const parts: string[] = [];
    let cur: DriveFile | undefined = f;
    let guard = 0;
    while (cur && guard++ < 30) {
      parts.unshift(cur.name);
      const pid: string | undefined = cur.parents?.[0];
      cur = pid ? byId.get(pid) : undefined;
    }
    return parts.join('/');
  };
  const base = (n: string) =>
    n
      .replace(/\.[a-z0-9]+$/i, '')
      .trim()
      .toLowerCase();
  const groups = new Map<string, DocEntry[]>();
  for (const f of files) {
    if (f.mimeType === FOLDER_MIME || !EXT[f.mimeType]) continue;
    const parentId = f.parents?.[0];
    const parentPath = parentId ? pathOf(byId.get(parentId)!) : '(racine)';
    const topFolder =
      parentPath.replace(/^SOLUVIA BRAIN\/?/, '').split('/')[0] || 'divers';
    const key = parentPath + '||' + base(f.name);
    const g = groups.get(key) ?? [];
    g.push({ ...f, parentPath, topFolder });
    groups.set(key, g);
  }
  const out: DocEntry[] = [];
  for (const g of groups.values()) {
    g.sort((a, b) => (PREF[a.mimeType] ?? 4) - (PREF[b.mimeType] ?? 4));
    out.push(g[0]!);
  }
  return out;
}

// ---------------------------------------------------------------- analyse (Max)
interface Analysis {
  title: string;
  summary: string;
  key_points: string[];
  entities: string[];
  aliases: string[];
  tags: string[];
}
const SCHEMA = `Renvoie UNIQUEMENT un JSON valide : {"title": string(<=120), "summary": string(2-4 phrases,<=600), "key_points": string[](<=12), "entities": string[](<=15, OPCO/Qualiopi/RNCP/tickets/outils cités), "aliases": string[](<=6), "tags": string[](<=8)}. En français. Synthétise, n'invente rien.`;

function analyzeFile(filePath: string): Analysis {
  const out = execFileSync(
    'claude',
    [
      '-p',
      `Analyse le document @${filePath} pour une base de connaissance de process internes d'un organisme de formation.\n${SCHEMA}`,
    ],
    { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
  );
  const m = out.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('réponse sans JSON');
  const o = JSON.parse(m[0]) as Partial<Analysis>;
  const asArr = (v: unknown, n: number) =>
    (Array.isArray(v)
      ? v.filter((x): x is string => typeof x === 'string')
      : []
    ).slice(0, n);
  return {
    title: String(o.title ?? '').slice(0, 120),
    summary: String(o.summary ?? '').slice(0, 600),
    key_points: asArr(o.key_points, 12),
    entities: asArr(o.entities, 15),
    aliases: asArr(o.aliases, 6),
    tags: asArr(o.tags, 8),
  };
}

// ---------------------------------------------------------------- main
async function main() {
  const args = process.argv.slice(2);
  const manifestOnly = args.includes('--manifest');
  const fi = args.indexOf('--folder');
  const folderFilter = fi >= 0 ? args[fi + 1] : undefined;
  const vi = args.indexOf('--vault');
  const vaultDir = vi >= 0 ? args[vi + 1] : undefined;

  const token = await driveToken();
  const manifest = buildManifest(await listDrive(token)).filter(
    (d) => !folderFilter || d.parentPath.includes(folderFilter),
  );

  if (manifestOnly) {
    const perTop: Record<string, number> = {};
    for (const d of manifest)
      perTop[d.topFolder] = (perTop[d.topFolder] ?? 0) + 1;
    console.log(`Documents uniques : ${manifest.length}`);
    for (const [t, c] of Object.entries(perTop).sort((a, b) => b[1] - a[1]))
      console.log(`  ${String(c).padStart(3)}  ${t}`);
    return;
  }

  const seen = new Map(
    (
      await pg<{ source_ref: string; source_hash: string }>(
        `select source_ref, source_hash from public.brain_notes where type='document'`,
      )
    ).map((r) => [r.source_ref, r.source_hash]),
  );

  const tmp = mkdtempSync(join(tmpdir(), 'brain-drive-'));
  let done = 0;
  let skipped = 0;
  let failed = 0;
  try {
    for (const d of manifest) {
      if (seen.get(d.id) === (d.md5Checksum ?? '')) {
        skipped++;
        continue;
      }
      try {
        const bytes = Buffer.from(
          await (
            await fetch(
              `https://www.googleapis.com/drive/v3/files/${d.id}?alt=media&supportsAllDrives=true`,
              { headers: { Authorization: `Bearer ${token}` } },
            )
          ).arrayBuffer(),
        );
        const fp = join(tmp, `${d.id}.${EXT[d.mimeType]}`);
        writeFileSync(fp, bytes);
        const a = analyzeFile(fp);
        const entityLinks = a.entities.map((e) => `entites/${slugify(e)}`);
        const path = `documents/${slugify(d.topFolder)}/${slugify(d.name.replace(/\.[a-z0-9]+$/i, ''))}.md`;
        const body = [
          `# ${a.title || d.name}`,
          '',
          `**Résumé.** ${a.summary}`,
          '',
          '## Points clés',
          a.key_points.map((p) => `- ${p}`).join('\n') || '- (aucun)',
          ...(entityLinks.length
            ? ['', '## Entités', entityLinks.map((l) => `[[${l}]]`).join(' · ')]
            : []),
          '',
          '## Source',
          `Document Drive · dossier « ${d.topFolder} » · [ouvrir](https://drive.google.com/file/d/${d.id}/view)`,
        ].join('\n');
        const fm = JSON.stringify({
          drive_folder: d.topFolder,
          drive_name: d.name,
        });
        await pg(
          `insert into public.brain_notes (path,type,title,aliases,tags,links,body,frontmatter,source_ref,source_hash,updated_at)
           values (${lit(path)},'document',${lit(a.title || d.name)},${arr(a.aliases)},${arr(a.tags)},${arr(entityLinks)},${lit(body)},${lit(fm)}::jsonb,${lit(d.id)},${lit(d.md5Checksum ?? '')},now())
           on conflict (path) do update set title=excluded.title,aliases=excluded.aliases,tags=excluded.tags,links=excluded.links,body=excluded.body,frontmatter=excluded.frontmatter,source_ref=excluded.source_ref,source_hash=excluded.source_hash,updated_at=now();`,
        );
        done++;
        console.log(`  ✓ ${d.name.slice(0, 55)}`);
      } catch (e) {
        failed++;
        console.error(
          `  ✗ ${d.name.slice(0, 45)} : ${(e instanceof Error ? e.message : String(e)).slice(0, 80)}`,
        );
      }
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  console.log(
    `\nDocuments — ingérés: ${done} · inchangés: ${skipped} · échecs: ${failed}`,
  );

  if (vaultDir) {
    execFileSync('tsx', ['scripts/brain-vault-sync.ts', vaultDir], {
      stdio: 'inherit',
    });
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
