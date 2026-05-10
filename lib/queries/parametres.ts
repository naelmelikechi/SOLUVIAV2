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
  // Coordonnees bancaires - optionnelles : si absentes, le PDF n affiche
  // pas la section "Modalites de paiement" / RIB.
  iban?: string | null;
  bic?: string | null;
  banque?: string | null;
  titulaire_compte?: string | null;
}

const EMETTEUR_FALLBACK: EmetteurInfo = {
  raison_sociale: 'SOLUVIA',
  adresse: '27 Rue Jacqueline Cochran, 79000 Niort',
  siret: '994 241 537 00012',
  tva: 'FR37994241537',
  iban: null,
  bic: null,
  banque: null,
  titulaire_compte: null,
};

export async function getEmetteurInfo(): Promise<EmetteurInfo> {
  try {
    const params = await getParametresByCategorie('entreprise');
    // Les cles en BD sont prefixees par la categorie (ex: entreprise.iban).
    // On fournit les deux formes (avec et sans prefixe) pour rester
    // compatible si la convention evolue.
    const get = (k: string) => {
      const row = params.find(
        (p) => p.cle === k || p.cle === `entreprise.${k}`,
      );
      return row?.valeur ?? null;
    };

    return {
      raison_sociale: get('raison_sociale') ?? EMETTEUR_FALLBACK.raison_sociale,
      adresse: get('adresse') ?? EMETTEUR_FALLBACK.adresse,
      siret: get('siret') ?? EMETTEUR_FALLBACK.siret,
      tva: get('tva') ?? get('tva_intracommunautaire') ?? EMETTEUR_FALLBACK.tva,
      iban: get('iban'),
      bic: get('bic'),
      banque: get('banque'),
      titulaire_compte: get('titulaire_compte'),
    };
  } catch (err) {
    logger.warn('queries.parametres', 'getEmetteurInfo fallback used', {
      error: err instanceof Error ? err.message : String(err),
    });
    return EMETTEUR_FALLBACK;
  }
}

/**
 * Lit la valeur d un parametre par sa cle. Retourne null si absent ou en
 * cas d erreur (fail-soft : la lecture d un parametre optionnel ne doit
 * jamais bloquer le rendu).
 */
export async function getParametreValeur(cle: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('parametres')
    .select('valeur')
    .eq('cle', cle)
    .maybeSingle();
  if (error) {
    logger.warn('queries.parametres', 'getParametreValeur failed', {
      cle,
      error,
    });
    return null;
  }
  return data?.valeur ?? null;
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
