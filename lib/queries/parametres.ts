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

export async function getLastEduviaSyncDate(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('client_api_keys')
    .select('last_sync_at')
    .eq('is_active', true)
    .order('last_sync_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    logger.error('queries.parametres', 'getLastEduviaSyncDate failed', {
      error,
    });
    return null;
  }
  return data?.last_sync_at ?? null;
}

// ---------------------------------------------------------------------------
// getEmetteurInfo - company info for invoices (from parametres table)
// ---------------------------------------------------------------------------

export interface EmetteurInfo {
  raison_sociale: string;
  adresse: string;
  siret: string;
  tva: string;
}

const EMETTEUR_FALLBACK: EmetteurInfo = {
  raison_sociale: 'SOLUVIA SAS',
  adresse: '15 Rue de la Formation, 75008 Paris',
  siret: '891 234 567 00015',
  tva: 'FR89 891 234 567',
};

export async function getEmetteurInfo(): Promise<EmetteurInfo> {
  try {
    const params = await getParametresByCategorie('entreprise');
    const map = new Map(params.map((p) => [p.cle, p.valeur]));

    return {
      raison_sociale:
        map.get('raison_sociale') ?? EMETTEUR_FALLBACK.raison_sociale,
      adresse: map.get('adresse') ?? EMETTEUR_FALLBACK.adresse,
      siret: map.get('siret') ?? EMETTEUR_FALLBACK.siret,
      tva: map.get('tva') ?? EMETTEUR_FALLBACK.tva,
    };
  } catch (err) {
    logger.warn('queries.parametres', 'getEmetteurInfo fallback used', {
      error: err instanceof Error ? err.message : String(err),
    });
    return EMETTEUR_FALLBACK;
  }
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
