import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/utils/logger';

export async function getQualiteSummaries() {
  const supabase = await createClient();

  // Get active/paused projects with client info
  const { data: projets, error: pError } = await supabase
    .from('projets')
    .select(
      'id, ref, statut, client:clients!projets_client_id_fkey(raison_sociale), cdp:users!projets_cdp_id_fkey(prenom, nom)',
    )
    .in('statut', ['actif', 'en_pause'])
    .order('ref');
  if (pError) {
    logger.error('queries.qualite', 'getQualiteSummaries failed (projets)', {
      error: pError,
    });
    throw new AppError(
      'QUALITE_FETCH_FAILED',
      'Impossible de charger les données qualité',
      { cause: pError },
    );
  }

  // Get quality tasks only for active projects (not ALL tasks in DB)
  const projetIds = projets.map((p) => p.id);
  const { data: taches, error: tError } = await supabase
    .from('taches_qualite')
    .select('projet_id, fait, famille_code')
    .in('projet_id', projetIds);
  if (tError) {
    logger.error('queries.qualite', 'getQualiteSummaries failed (taches)', {
      error: tError,
    });
    throw new AppError(
      'QUALITE_FETCH_FAILED',
      'Impossible de charger les tâches qualité',
      { cause: tError },
    );
  }

  // Aggregate per project
  return projets.map((p) => {
    const projectTaches = taches.filter((t) => t.projet_id === p.id);
    const terminees = projectTaches.filter((t) => t.fait).length;
    const total = projectTaches.length;

    // Group by famille_code to compute conformity
    const familleMap = new Map<string, boolean>();
    for (const t of projectTaches) {
      const current = familleMap.get(t.famille_code);
      // A famille is conforme only if ALL its taches are fait=true
      if (current === undefined) {
        familleMap.set(t.famille_code, t.fait);
      } else if (!t.fait) {
        familleMap.set(t.famille_code, false);
      }
    }
    const totalFamilles = familleMap.size;
    const famillesConformes = Array.from(familleMap.values()).filter(
      Boolean,
    ).length;

    return {
      projet: p,
      total,
      terminees,
      a_realiser: total - terminees,
      pct: total > 0 ? Math.round((terminees / total) * 100) : 0,
      famillesConformes,
      totalFamilles,
      statutGlobal:
        totalFamilles > 0 && famillesConformes === totalFamilles
          ? ('conforme' as const)
          : ('non_conforme' as const),
    };
  });
}

export type QualiteSummary = Awaited<
  ReturnType<typeof getQualiteSummaries>
>[number];

export async function getTachesByProjetRef(ref: string) {
  const supabase = await createClient();

  // Get project
  const { data: projet, error: pError } = await supabase
    .from('projets')
    .select('id, ref, client:clients!projets_client_id_fkey(raison_sociale)')
    .eq('ref', ref)
    .single();
  if (pError || !projet) {
    logger.error('queries.qualite', 'getTachesByProjetRef failed (projet)', {
      ref,
      error: pError,
    });
    return null;
  }

  // Get tasks
  const { data: taches, error: tError } = await supabase
    .from('taches_qualite')
    .select(
      'id, famille_code, famille_libelle, indicateur, livrable, fait, eduvia_url',
    )
    .eq('projet_id', projet.id)
    .order('famille_code')
    .order('livrable');
  if (tError) {
    logger.error('queries.qualite', 'getTachesByProjetRef failed (taches)', {
      ref,
      error: tError,
    });
    throw new AppError(
      'QUALITE_FETCH_FAILED',
      'Impossible de charger les tâches qualité',
      { cause: tError },
    );
  }

  return { projet, taches };
}

export type QualiteDetail = NonNullable<
  Awaited<ReturnType<typeof getTachesByProjetRef>>
>;
