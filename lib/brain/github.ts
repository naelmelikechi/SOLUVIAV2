import { env } from '@/lib/env';

export interface PutResult {
  ok: boolean;
  skipped?: boolean;
  status?: number;
}

/** Écrit/actualise un fichier du coffre GitHub (contents API). No-op si non configuré. */
export async function putNote(
  path: string,
  markdown: string,
  message: string,
): Promise<PutResult> {
  const repo = env.BRAIN_GITHUB_REPO;
  const token = env.BRAIN_GITHUB_TOKEN;
  const branch = env.BRAIN_GITHUB_BRANCH ?? 'main';
  if (!repo || !token) return { ok: false, skipped: true };

  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const api = `https://api.github.com/repos/${repo}/contents/${encodedPath}`;
  const headers = {
    authorization: `Bearer ${token}`,
    accept: 'application/vnd.github+json',
    'content-type': 'application/json',
    'user-agent': 'soluvia-brain',
  };

  let sha: string | undefined;
  const getRes = await fetch(`${api}?ref=${encodeURIComponent(branch)}`, {
    headers,
    cache: 'no-store',
  });
  if (getRes.ok) {
    const json = (await getRes.json()) as { sha?: string };
    sha = json.sha;
  }

  const content = Buffer.from(markdown, 'utf8').toString('base64');
  const putRes = await fetch(api, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      message,
      content,
      branch,
      ...(sha ? { sha } : {}),
    }),
  });
  if (!putRes.ok) {
    console.error('[brain/github] putNote', path, putRes.status);
    return { ok: false, status: putRes.status };
  }
  return { ok: true };
}
