import 'server-only';

// Client HTTP minimal pour l'API Plane (plane.eduvia.dev). Les tâches
// transverses vivent dans Plane ; SOLUVIA les affiche et permet de les
// cocher pour éviter de jongler entre outils.
//
// Env (toutes optionnelles : sans clé, la feature est simplement absente) :
//   PLANE_API_URL   ex. https://plane.eduvia.dev
//   PLANE_WORKSPACE ex. eduvia (slug du workspace)
//   PLANE_API_KEY   clé API (X-API-Key)

export function planeConfigured(): boolean {
  return Boolean(
    process.env.PLANE_API_URL &&
    process.env.PLANE_WORKSPACE &&
    process.env.PLANE_API_KEY,
  );
}

export function planeWebUrl(path: string): string {
  const base = (process.env.PLANE_API_URL ?? '').replace(/\/$/, '');
  return `${base}/${process.env.PLANE_WORKSPACE}${path}`;
}

export async function planeFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const base = (process.env.PLANE_API_URL ?? '').replace(/\/$/, '');
  const res = await fetch(
    `${base}/api/v1/workspaces/${process.env.PLANE_WORKSPACE}${path}`,
    {
      ...init,
      headers: {
        'X-API-Key': process.env.PLANE_API_KEY ?? '',
        'Content-Type': 'application/json',
        ...init?.headers,
      },
      // Donnees d'action : toujours fraiches (pas de cache Next).
      cache: 'no-store',
    },
  );
  if (!res.ok) {
    throw new Error(`Plane ${init?.method ?? 'GET'} ${path} -> ${res.status}`);
  }
  return (await res.json()) as T;
}
