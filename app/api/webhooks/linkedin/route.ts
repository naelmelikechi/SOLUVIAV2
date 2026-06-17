import { NextResponse } from 'next/server';
import { timingSafeStrEqual } from '@/lib/utils/secure-compare';
import { logger } from '@/lib/utils/logger';
import { ingestLinkedinEvent } from '@/lib/actions/linkedin';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Webhook récepteur du connecteur LinkedIn (Feature 9).
 *
 * DORMANT par défaut : tant que `LINKEDIN_WEBHOOK_SECRET` n'est pas configuré,
 * l'endpoint répond 503 (« connecteur non configuré ») et n'ingère rien. Une
 * fois l'éditeur de l'outil de prospection choisi, on positionne le secret et
 * on branche son webhook sur cette URL.
 *
 * Le secret est lu directement via `process.env` : il n'appartient pas au
 * schéma `lib/env` (figé) car le connecteur est optionnel et désactivé par
 * défaut. Authentification : header `x-linkedin-secret` comparé en temps
 * constant à `LINKEDIN_WEBHOOK_SECRET`.
 *
 * Contrat JSON attendu (le mapping exact au payload de l'outil sera ajusté à
 * l'intégration) :
 * {
 *   "outil_source":          string,   // ex. "phantombuster", "waalaxy"
 *   "type_evenement":        "reponse_positive" | "connexion_acceptee"
 *                          | "mention_interet" | "rdv_demande",
 *   "linkedin_profil_url":   string,    // URL du profil du contact
 *   "linkedin_company_url":  string,    // URL de la page entreprise
 *   "linkedin_company_name": string,    // raison sociale détectée
 *   "prenom_nom":            string,    // nom du contact
 *   "fonction":              string,    // intitulé de poste
 *   "contenu_message":       string,    // message / réponse capté
 *   "date_evenement":        string     // ISO 8601
 * }
 */
export async function POST(request: Request) {
  const secret = process.env.LINKEDIN_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'Connecteur LinkedIn non configuré' },
      { status: 503 },
    );
  }

  const provided = request.headers.get('x-linkedin-secret');
  if (!timingSafeStrEqual(provided, secret)) {
    logger.warn('webhook.linkedin', 'secret invalide');
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON invalide' }, { status: 400 });
  }

  const result = await ingestLinkedinEvent(payload);

  // Payload rejeté avant toute persistance (schéma invalide) → 400.
  if (!result.success && !result.eventId) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 400 },
    );
  }

  // Évènement enregistré (traité / ignoré / erreur) → 200 rapide.
  return NextResponse.json({
    ok: result.success,
    eventId: result.eventId,
    statut: result.statut,
    prospectId: result.prospectId,
    raison: result.raison,
  });
}
