import 'server-only';
import { planeConfigured, planeFetch, planeWebUrl } from '@/lib/plane/client';
import { logger } from '@/lib/utils/logger';

// ---------------------------------------------------------------------------
// Lecture des tâches Plane assignées à un utilisateur (mapping par email :
// les comptes Plane utilisent les mêmes adresses que SOLUVIA).
// Volumes faibles (dizaines d'issues par projet) : filtrage en JS.
// ---------------------------------------------------------------------------

export interface PlaneTask {
  id: string;
  projectId: string;
  /** Identifiant lisible du projet (SOL, EDUVIA). */
  projectIdentifier: string;
  /** Ref lisible de l'issue, ex. SOL-83. */
  ref: string;
  name: string;
  priority: string | null;
  targetDate: string | null;
  /** Lien profond vers l'issue dans Plane. */
  url: string;
}

interface PlaneListResponse<T> {
  results: T[];
  next_cursor?: string | null;
  next_page_results?: boolean;
}

interface PlaneProject {
  id: string;
  identifier: string;
  name: string;
}

interface PlaneState {
  id: string;
  group: 'backlog' | 'unstarted' | 'started' | 'completed' | 'cancelled';
}

interface PlaneIssue {
  id: string;
  name: string;
  state: string;
  assignees: string[];
  priority: string | null;
  target_date: string | null;
  sequence_id: number;
}

async function listAll<T>(path: string): Promise<T[]> {
  // Pagination par curseur Plane ; borne dure de securite a 10 pages.
  const out: T[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 10; page++) {
    const sep = path.includes('?') ? '&' : '?';
    const url: string = cursor ? `${path}${sep}cursor=${cursor}` : path;
    const res: PlaneListResponse<T> =
      await planeFetch<PlaneListResponse<T>>(url);
    out.push(...res.results);
    if (!res.next_page_results || !res.next_cursor) break;
    cursor = res.next_cursor;
  }
  return out;
}

async function findMemberIdByEmail(email: string): Promise<string | null> {
  const members =
    await planeFetch<
      Array<{
        id?: string;
        email?: string;
        member?: { id: string; email: string };
      }>
    >('/members/');
  for (const m of members) {
    const mm = m.member ?? m;
    if (mm.email?.toLowerCase() === email.toLowerCase()) return mm.id ?? null;
  }
  return null;
}

export interface PlaneProjectStates {
  doneStateId: string;
  todoStateId: string;
}

/** États done/todo d'un projet (pour le toggle). */
export async function getPlaneProjectStates(
  projectId: string,
): Promise<PlaneProjectStates | null> {
  const states = await listAll<PlaneState>(`/projects/${projectId}/states/`);
  const done = states.find((s) => s.group === 'completed');
  const todo = states.find((s) => s.group === 'unstarted');
  if (!done || !todo) return null;
  return { doneStateId: done.id, todoStateId: todo.id };
}

/**
 * Tâches Plane OUVERTES (ni terminées ni annulées) assignées à cet email,
 * tous projets du workspace confondus. Retourne null si Plane n'est pas
 * configuré ou si l'email n'a pas de compte Plane.
 */
export async function getPlaneTasksForEmail(
  email: string,
): Promise<PlaneTask[] | null> {
  if (!planeConfigured()) return null;
  try {
    const memberId = await findMemberIdByEmail(email);
    if (!memberId) return null;

    const projects = await listAll<PlaneProject>('/projects/');
    const perProject = await Promise.all(
      projects.map(async (p) => {
        const [states, issues] = await Promise.all([
          listAll<PlaneState>(`/projects/${p.id}/states/`),
          listAll<PlaneIssue>(`/projects/${p.id}/issues/?per_page=100`),
        ]);
        const closedStates = new Set(
          states
            .filter((s) => s.group === 'completed' || s.group === 'cancelled')
            .map((s) => s.id),
        );
        return issues
          .filter(
            (i) => i.assignees.includes(memberId) && !closedStates.has(i.state),
          )
          .map(
            (i): PlaneTask => ({
              id: i.id,
              projectId: p.id,
              projectIdentifier: p.identifier,
              ref: `${p.identifier}-${i.sequence_id}`,
              name: i.name,
              priority: i.priority === 'none' ? null : i.priority,
              targetDate: i.target_date,
              url: planeWebUrl(`/projects/${p.id}/issues/${i.id}`),
            }),
          );
      }),
    );

    // Échéance la plus proche d'abord, les sans-date à la fin.
    return perProject
      .flat()
      .sort((a, b) =>
        (a.targetDate ?? '9999').localeCompare(b.targetDate ?? '9999'),
      );
  } catch (error) {
    // Best-effort : Plane indisponible ne doit jamais casser l'accueil.
    logger.error('plane.queries', 'getPlaneTasksForEmail failed', { error });
    return null;
  }
}
