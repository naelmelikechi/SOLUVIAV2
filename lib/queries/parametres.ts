import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/utils/logger';

export async function getParametresByCategorie(categorie: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('parametres')
    .select('id, cle, valeur, description')
    .eq('categorie', categorie)
    .order('cle');
  if (error) {
    logger.error('queries.parametres', 'getParametresByCategorie failed', {
      categorie,
      error,
    });
    throw new AppError(
      'PARAMETRES_FETCH_FAILED',
      'Impossible de charger les paramètres',
      { cause: error },
    );
  }
  return data;
}

export async function getTypologies() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('typologies_projet')
    .select('id, code, libelle, actif')
    .order('code');
  if (error) {
    logger.error('queries.parametres', 'getTypologies failed', { error });
    throw new AppError(
      'PARAMETRES_FETCH_FAILED',
      'Impossible de charger les typologies',
      { cause: error },
    );
  }
  return data;
}

export async function getAxesTemps() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('axes_temps')
    .select('id, code, libelle, couleur, ordre')
    .order('ordre');
  if (error) {
    logger.error('queries.parametres', 'getAxesTemps failed', { error });
    throw new AppError(
      'PARAMETRES_FETCH_FAILED',
      'Impossible de charger les axes temps',
      { cause: error },
    );
  }
  return data;
}

export async function getJoursFeries(annee: number) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('jours_feries')
    .select('id, date, libelle')
    .eq('annee', annee)
    .order('date');
  if (error) {
    logger.error('queries.parametres', 'getJoursFeries failed', {
      annee,
      error,
    });
    throw new AppError(
      'PARAMETRES_FETCH_FAILED',
      'Impossible de charger les jours fériés',
      { cause: error },
    );
  }
  return data;
}
