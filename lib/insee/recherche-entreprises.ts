import { logger } from '@/lib/utils/logger';

/**
 * Enrichissement d'identité d'entreprise via l'API publique
 * `recherche-entreprises.api.gouv.fr` (gratuite, sans clé ni quota
 * d'inscription, données INSEE Sirene + INPI). Sert à pré-remplir la fiche
 * prospect à partir d'un SIREN (Feature 2 §6).
 *
 * On ne dépend volontairement pas de l'API INSEE Sirene officielle (qui exige
 * un jeton OAuth et impose des quotas) : ce wrapper suffit au besoin commercial.
 */
const BASE = 'https://recherche-entreprises.api.gouv.fr/search';
const TIMEOUT_MS = 8000;

// Tranches d'effectif salarié INSEE (code → libellé lisible).
const TRANCHE_EFFECTIF: Record<string, string> = {
  '00': '0 salarié',
  '01': '1 à 2 salariés',
  '02': '3 à 5 salariés',
  '03': '6 à 9 salariés',
  '11': '10 à 19 salariés',
  '12': '20 à 49 salariés',
  '21': '50 à 99 salariés',
  '22': '100 à 199 salariés',
  '31': '200 à 249 salariés',
  '32': '250 à 499 salariés',
  '41': '500 à 999 salariés',
  '42': '1 000 à 1 999 salariés',
  '51': '2 000 à 4 999 salariés',
  '52': '5 000 à 9 999 salariés',
  '53': '10 000 salariés et plus',
};

export interface EntrepriseInsee {
  siren: string;
  raisonSociale: string;
  siret: string | null;
  adresse: string | null;
  formeJuridique: string | null;
  codeNaf: string | null;
  effectifTranche: string | null;
}

interface RechercheResult {
  siren?: string;
  nom_complet?: string;
  nom_raison_sociale?: string;
  nature_juridique?: string;
  activite_principale?: string;
  tranche_effectif_salarie?: string;
  siege?: { siret?: string; adresse?: string };
}

/** Normalise un SIREN (9 chiffres). Renvoie null si le format est invalide. */
export function normalizeSiren(raw: string | null | undefined): string | null {
  const clean = (raw ?? '').replace(/\s+/g, '');
  return /^\d{9}$/.test(clean) ? clean : null;
}

/**
 * Recherche une entreprise par SIREN. Renvoie `null` si SIREN invalide, API
 * indisponible, ou aucune correspondance exacte. Ne jette jamais : l'appelant
 * retombe sur une saisie manuelle (flag `insee_verifie = false`).
 */
export async function lookupEntrepriseBySiren(
  siren: string,
): Promise<EntrepriseInsee | null> {
  const clean = normalizeSiren(siren);
  if (!clean) return null;

  try {
    const res = await fetch(`${BASE}?q=${clean}&page=1&per_page=1`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      logger.warn('insee', 'recherche-entreprises non-OK', {
        status: res.status,
      });
      return null;
    }

    const json = (await res.json()) as { results?: RechercheResult[] };
    const r = json.results?.[0];
    if (!r || r.siren !== clean) return null;

    const effectifCode = r.tranche_effectif_salarie ?? '';
    return {
      siren: clean,
      raisonSociale: r.nom_complet || r.nom_raison_sociale || '',
      siret: r.siege?.siret ?? null,
      adresse: r.siege?.adresse ?? null,
      formeJuridique: r.nature_juridique ?? null,
      codeNaf: r.activite_principale ?? null,
      effectifTranche: TRANCHE_EFFECTIF[effectifCode] ?? null,
    };
  } catch (err) {
    logger.warn('insee', 'recherche-entreprises failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
