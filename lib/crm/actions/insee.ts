'use server';
import { requireCrmUser } from '@/lib/crm/auth/roles';
import {
  lookupEntrepriseBySiren,
  type EntrepriseInsee,
} from '@/lib/insee/recherche-entreprises';

/**
 * Enrichissement INSEE d'un compte à partir d'un SIREN (A4/A5, Feature 2 §6).
 * Ne persiste RIEN : renvoie simplement les données publiques (Sirene/INPI) pour
 * pré-remplir le formulaire compte côté client, qui décide ensuite d'enregistrer
 * via `updateCompteInsee`. `lookupEntrepriseBySiren` ne jette jamais : SIREN
 * invalide / API indisponible / aucune correspondance => `{ ok: false }`, le
 * commercial retombe sur la saisie manuelle.
 */
export async function enrichirCompteParSiren(
  siren: string,
): Promise<{ ok: true; data: EntrepriseInsee } | { ok: false }> {
  await requireCrmUser();
  const data = await lookupEntrepriseBySiren(siren);
  if (!data) return { ok: false };
  return { ok: true, data };
}
