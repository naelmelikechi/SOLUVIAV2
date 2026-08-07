import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { createCrmAdminClient } from '@/lib/crm/supabase/admin';
import { buildSyntheseSnapshotFromOpportunite } from '@/lib/queries/passation';
import { logger } from '@/lib/utils/logger';
import { logAudit } from '@/lib/utils/audit';
import type { Json } from '@/types/database';

// Pont Phase 2 (A2) : une opportunité CRM passée « gagnée » crée le client
// SOLUVIA (public.clients) puis génère la synthèse de passation (client-ancrée).
// Écritures cross-schéma via clients service-role (crm + public) : la RLS
// `public` ne couvre pas le schéma `crm`, et l'insert clients/document_synthese
// se fait hors session commerciale. Tout est idempotent et best-effort : un
// échec du pont ne doit jamais bloquer le déplacement d'étape dans le kanban.
const SCOPE = 'crm.pont';

/**
 * Crée le client SOLUVIA depuis le compte de l'opportunité et pose le back-link
 * `crm.opportunites.client_id`. Idempotent : si l'opp est déjà liée, renvoie ce
 * client sans rien recréer. Renvoie null si opp/compte introuvable ou échec.
 */
export async function createClientFromCompte(
  oppId: string,
): Promise<string | null> {
  const crm = createCrmAdminClient();
  const { data: opp } = await crm
    .from('opportunites')
    .select('id, compte_id, owner_id, client_id')
    .eq('id', oppId)
    .maybeSingle();
  if (!opp) return null;
  if (opp.client_id) return opp.client_id;

  // Deduplication par COMPTE et non seulement par opportunite (audit #122,
  // constat 10). Le seul controle etait `if (opp.client_id)`, donc par
  // opportunite : une SECONDE opportunite gagnee sur le meme compte inserait un
  // second client, avec la meme raison sociale et le meme SIRET. Projets,
  // contrats Eduvia, factures et encours se repartissaient alors silencieusement
  // sur deux fiches, et la serie de facturation se scindait.
  //
  // Ce n'est pas un cas tordu : le modele CRM est explicitement multi-sessions
  // par compte (volume_an1/an2/an3, mois_demarrage), une deuxieme promotion
  // vendue au meme client l'annee suivante est le cas NOMINAL, et il suffit de
  // deposer la carte dans la colonne « Gagne ».
  //
  // On reutilise ici une donnee deja presente plutot que d'introduire une regle
  // nouvelle (SIRET, back-link) : si une autre opportunite du meme compte a deja
  // produit un client, c'est celui-la.
  const { data: dejaLie } = await crm
    .from('opportunites')
    .select('client_id')
    .eq('compte_id', opp.compte_id)
    .not('client_id', 'is', null)
    .limit(1)
    .maybeSingle();
  if (dejaLie?.client_id) {
    // On rattache l'opportunite courante au client existant, pour que le
    // prochain passage sorte au premier test et que le lien soit trace.
    const { error: linkErr } = await crm
      .from('opportunites')
      .update({ client_id: dejaLie.client_id })
      .eq('id', opp.id);
    if (linkErr) {
      logger.error(SCOPE, 'rattachement au client existant echoue', {
        oppId,
        clientId: dejaLie.client_id,
        error: linkErr,
      });
      return null;
    }
    logger.info(SCOPE, 'compte deja lie a un client, reutilise', {
      oppId,
      compteId: opp.compte_id,
      clientId: dejaLie.client_id,
    });
    return dejaLie.client_id;
  }

  const { data: compte } = await crm
    .from('comptes')
    .select('nom, siret')
    .eq('id', opp.compte_id)
    .maybeSingle();
  if (!compte) return null;

  const pub = createAdminClient();
  const { data: client, error } = await pub
    .from('clients')
    .insert({
      trigramme: '',
      raison_sociale: compte.nom,
      siret: compte.siret,
      apporteur_commercial_id: opp.owner_id,
      apporteur_date: new Date().toISOString().slice(0, 10),
    })
    .select('id')
    .single();
  if (error || !client) {
    logger.error(SCOPE, 'createClientFromCompte insert failed', {
      oppId,
      error,
    });
    return null;
  }

  const { error: linkErr } = await crm
    .from('opportunites')
    .update({ client_id: client.id })
    .eq('id', oppId);
  if (linkErr) {
    // Client créé mais back-link raté : état partiellement incohérent mais non
    // bloquant (le client existe ; le pont se resynchronisera au prochain
    // passage car client_id reste null → idempotence non atteinte, doublon
    // possible → on loggue en error pour intervention).
    logger.error(SCOPE, 'link opportunite->client failed', {
      oppId,
      clientId: client.id,
      error: linkErr,
    });
  }
  return client.id;
}

/**
 * Génère la synthèse de passation (client-ancrée) depuis l'opportunité.
 * Idempotent : skip si une synthèse existe déjà pour ce client. Le rendu PDF
 * et la soumission (vague 1) restent inchangés côté workflow.
 */
export async function genererSyntheseFromOpportunite(
  oppId: string,
): Promise<{ id?: string; created: boolean }> {
  const built = await buildSyntheseSnapshotFromOpportunite(oppId);
  if (!built) return { created: false };
  const { snapshot, clientId, commercialId } = built;
  if (!clientId) return { created: false };

  const pub = createAdminClient();
  const { data: existing } = await pub
    .from('document_synthese')
    .select('id')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) return { id: existing.id, created: false };

  const { data: created, error } = await pub
    .from('document_synthese')
    .insert({
      client_id: clientId,
      statut: 'generee',
      contenu: snapshot as unknown as Json,
      reference_dossier: snapshot.meta.referenceDossier,
      genere_par: null,
    })
    .select('id')
    .single();
  if (error || !created) {
    logger.error(SCOPE, 'genererSyntheseFromOpportunite insert failed', {
      oppId,
      clientId,
      error,
    });
    return { created: false };
  }

  // Notifie le développeur (public.notifications, lien CRM) pour compléter les
  // sections 6/8, comme le fait le chemin prospect.
  if (commercialId) {
    await pub.from('notifications').insert({
      user_id: commercialId,
      type: 'passation_a_completer',
      titre: 'Synthèse de passation à compléter',
      message: `La synthèse de ${snapshot.identite.raisonSociale} est générée. Complétez les sections 6 et 8.`,
      lien: `/crm/pipeline?opp=${oppId}`,
    });
  }
  logAudit(
    'synthese_generee',
    'document_synthese',
    created.id,
    { oppId, clientId, auto: true },
    undefined,
  );
  return { id: created.id, created: true };
}

/**
 * Pont complet, déclenché au passage « gagnée » d'une opportunité. Best-effort,
 * non bloquant (toute erreur est loggée, jamais levée), idempotent (skip si
 * l'opp est déjà liée à un client).
 */
export async function onOpportuniteGagnee(oppId: string): Promise<void> {
  try {
    const crm = createCrmAdminClient();
    const { data: opp } = await crm
      .from('opportunites')
      .select('client_id')
      .eq('id', oppId)
      .maybeSingle();
    if (opp?.client_id) return; // pont déjà fait
    const clientId = await createClientFromCompte(oppId);
    if (!clientId) {
      logger.warn(SCOPE, 'onOpportuniteGagnee: aucun client créé', { oppId });
      return;
    }
    await genererSyntheseFromOpportunite(oppId);
  } catch (err) {
    logger.error(SCOPE, 'onOpportuniteGagnee failed', {
      oppId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
