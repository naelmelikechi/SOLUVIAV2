import type { SupabaseClient } from '@supabase/supabase-js';
import type { FicheDetail } from './types';

export interface MissionSummary {
  code: string;
  nom: string;
  count: number;
}
export interface ProcessListItem {
  source_fiche_id: string;
  fiche_code: string;
  mission_code: string;
  mission_nom: string;
  titre: string;
  steps: number;
  sub: string;
}

interface Row {
  source_fiche_id: string;
  fiche_code: string;
  mission_code: string;
  mission_nom: string;
  titre: string;
  detail: FicheDetail | null;
}

async function fetchRows(admin: SupabaseClient): Promise<Row[]> {
  const { data, error } = await admin
    .from('process_index')
    .select(
      'source_fiche_id, fiche_code, mission_code, mission_nom, titre, detail',
    )
    .order('mission_code');
  if (error) {
    console.error('[process/browse]', error.message);
    return [];
  }
  return (data ?? []) as Row[];
}

/** Missions présentes dans l'index, avec nombre de process finalisés. */
export async function listMissions(
  admin: SupabaseClient,
): Promise<MissionSummary[]> {
  const rows = await fetchRows(admin);
  const by = new Map<string, MissionSummary>();
  for (const r of rows) {
    const cur = by.get(r.mission_code) ?? {
      code: r.mission_code,
      nom: r.mission_nom,
      count: 0,
    };
    cur.count += 1;
    by.set(r.mission_code, cur);
  }
  return [...by.values()].sort((a, b) => a.code.localeCompare(b.code));
}

/** Tous les process finalisés, pour la liste du hub. */
export async function listAllProcess(
  admin: SupabaseClient,
): Promise<ProcessListItem[]> {
  const rows = await fetchRows(admin);
  return rows.map((r) => {
    const taches = r.detail?.taches ?? [];
    const first = taches.find((t) => t.description)?.description ?? '';
    return {
      source_fiche_id: r.source_fiche_id,
      fiche_code: r.fiche_code,
      mission_code: r.mission_code,
      mission_nom: r.mission_nom,
      titre: r.titre,
      steps: taches.length,
      sub: first, // sub nettoyé côté UI via stripMarkdown
    };
  });
}
