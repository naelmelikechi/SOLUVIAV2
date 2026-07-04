// Regles pures : statut de transmission Peppol (e-invoicing) d'une facture.
// Source de verite : account.move.peppol_move_state cote Odoo. Valeurs
// observees sur l'instance prod (Odoo 19.2, fields_get 2026-07) :
//   ready (Ready to send), to_send (Queued), processing (Pending Reception),
//   done (Done), error (Error), submitted (Submitted),
//   made_available (Made Available), AB (Received), AP (Approved),
//   PD (With Payments), RE (Rejected), refused (Refused), cancelled (Cancelled).
// 'skipped' (versions Odoo anterieures) est gere defensivement ; toute valeur
// inconnue retombe sur un badge gris avec le code brut.

import type { BadgeColor } from '@/components/shared/status-badge';

/**
 * Normalise la valeur brute Odoo : false / chaine vide = jamais transmis
 * -> null en DB. Toute chaine non vide est conservee telle quelle.
 */
export function normalizePeppolMoveState(
  raw: string | false | null | undefined,
): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Decide si factures.peppol_state doit etre mis a jour : compare la valeur
 * DB courante a la valeur Odoo normalisee. Pas d'ecriture quand rien ne change
 * (le pull re-verifie l'ensemble des factures non payees a chaque run).
 */
export function resolvePeppolStateUpdate(
  dbState: string | null,
  odooRaw: string | false | null | undefined,
): { changed: boolean; next: string | null } {
  const next = normalizePeppolMoveState(odooRaw);
  return { changed: next !== dbState, next };
}

// Groupes de statuts -> label FR affiche dans l'UI.
const PEPPOL_TRANSMISE = new Set([
  'done',
  'submitted',
  'made_available',
  'AB', // Received (cycle de vie PDP FR)
  'AP', // Approved
  'PD', // With Payments
]);
const PEPPOL_EN_COURS = new Set(['ready', 'to_send', 'processing']);
const PEPPOL_ERREUR = new Set(['error', 'RE', 'refused']);
const PEPPOL_IGNOREE = new Set(['skipped', 'cancelled']);

export interface PeppolStateBadge {
  label: string;
  color: BadgeColor;
}

/**
 * Badge UI "Peppol : <label FR>" pour un statut de transmission donne.
 * null (jamais transmis) -> pas de badge. Valeur inconnue -> code brut en gris.
 */
export function getPeppolStateBadge(
  state: string | null,
): PeppolStateBadge | null {
  if (state === null) return null;
  if (PEPPOL_TRANSMISE.has(state))
    return { label: 'Peppol : Transmise', color: 'green' };
  if (PEPPOL_EN_COURS.has(state))
    return { label: 'Peppol : En cours', color: 'blue' };
  if (PEPPOL_ERREUR.has(state))
    return { label: 'Peppol : Erreur', color: 'red' };
  if (PEPPOL_IGNOREE.has(state))
    return { label: 'Peppol : Ignorée', color: 'gray' };
  return { label: `Peppol : ${state}`, color: 'gray' };
}
