import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/utils/logger';
import type { Database } from '@/types/database';

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
// getEmetteurInfo - company info for invoices (from societes_emettrices)
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
  // Mentions legales completes (forme + capital + SIRET + RCS + TVA) - rendu en
  // pied du PDF. Source authoritative : societes_emettrices.mentions_legales.
  mentions_legales?: string | null;
}

export const EMETTEUR_FALLBACK: EmetteurInfo = {
  raison_sociale: 'SOLUVIA',
  adresse: '27 Rue Jacqueline Cochran, 79000 Niort',
  siret: '994 241 537 00012',
  tva: 'FR37994241537',
  iban: null,
  bic: null,
  banque: null,
  titulaire_compte: null,
};

export type SocieteEmettriceRow =
  Database['public']['Tables']['societes_emettrices']['Row'];

// Mapping unique societes_emettrices -> EmetteurInfo. Source de verite partagee
// entre getEmetteurInfo (contexte requete) et le rendu PDF cron/script
// (attach-pdf, scripts), pour eviter toute derive de mapping des champs.
export function mapSocieteToEmetteur(s: SocieteEmettriceRow): EmetteurInfo {
  return {
    raison_sociale: s.raison_sociale,
    adresse: `${s.adresse}, ${s.code_postal} ${s.ville}`,
    siret: s.siret,
    tva: s.tva_intracom,
    iban: s.banque_iban,
    bic: s.banque_bic,
    banque: s.banque_nom,
    titulaire_compte: s.raison_sociale,
    mentions_legales: s.mentions_legales,
  };
}

/**
 * Charge les infos emetteur depuis societes_emettrices.
 *
 * - Si societeId fourni : charge cette societe specifique.
 * - Si null/undefined   : charge la societe par defaut (est_defaut=TRUE, actif=TRUE).
 * - En cas d'erreur ou d'absence de ligne : log warning + retourne EMETTEUR_FALLBACK.
 */
export async function getEmetteurInfo(
  societeId?: string | null,
): Promise<EmetteurInfo> {
  try {
    const supabase = await createClient();
    let query = supabase.from('societes_emettrices').select('*').limit(1);
    if (societeId) {
      query = query.eq('id', societeId);
    } else {
      query = query.eq('est_defaut', true).eq('actif', true);
    }
    const { data, error } = await query.maybeSingle();

    if (error || !data) {
      logger.warn('queries.parametres', 'getEmetteurInfo fallback used', {
        societeId,
        error: error?.message,
      });
      return EMETTEUR_FALLBACK;
    }

    return mapSocieteToEmetteur(data);
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

/**
 * Delai d'echeance par defaut (en jours) : `date_echeance = date_emission +
 * N`. Lu depuis le parametre `facturation.delai_echeance_jours` (modifiable
 * dans /admin/parametres). Fallback sur DEFAULT_DELAI_ECHEANCE_JOURS si le
 * parametre est absent, vide ou invalide - un parametre mal saisi ne doit
 * jamais bloquer la creation de factures.
 */
export const DEFAULT_DELAI_ECHEANCE_JOURS = 7;

export async function getDelaiEcheanceJours(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<number> {
  const { data } = await supabase
    .from('parametres')
    .select('valeur')
    .eq('cle', 'facturation.delai_echeance_jours')
    .maybeSingle();
  const raw = data?.valeur;
  if (raw == null || raw.trim() === '') return DEFAULT_DELAI_ECHEANCE_JOURS;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : DEFAULT_DELAI_ECHEANCE_JOURS;
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
