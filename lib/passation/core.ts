import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sendSyntheseGenereeEmail } from '@/lib/email/passation-templates';
import { buildSyntheseSnapshotFromProspect } from '@/lib/queries/passation';
import { getAppUrl } from '@/lib/utils/app-url';
import { logAudit } from '@/lib/utils/audit';
import { logger } from '@/lib/utils/logger';
import type { Database, Json } from '@/types/database';

type Supabase = SupabaseClient<Database>;

export interface GenererSyntheseOpts {
  /** Utilisateur à l'origine (null pour le webhook Yousign). */
  generePar?: string | null;
  signatureId?: string | null;
  signatureSigneeAt?: string | null;
}

/**
 * Génère (ou complète) la synthèse de passation d'un prospect : snapshot V2
 * figé + ligne document_synthese en statut 'generee'. N'effectue PAS le rendu
 * PDF (fait à la soumission) pour rester rapide dans le webhook Yousign.
 *
 * Idempotent : si une synthèse existe déjà pour le prospect, elle est
 * conservée telle quelle (on complète juste signature_id/signature_signee_at
 * manquants) - le bouton "Régénérer" de l'UI passe par `forcerRegeneration`.
 *
 * Le client Supabase est fourni par l'appelant : client RLS pour les server
 * actions, client service-role pour le webhook.
 */
export async function genererSyntheseCore(
  supabase: Supabase,
  prospectId: string,
  opts: GenererSyntheseOpts = {},
): Promise<{ id?: string; created: boolean; error?: string }> {
  const { data: existing } = await supabase
    .from('document_synthese')
    .select('id, signature_id, signature_signee_at')
    .eq('prospect_id', prospectId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    // Complète l'ancrage signature si on le découvre maintenant (utile quand
    // la synthèse a été générée manuellement avant la signature).
    if (
      (opts.signatureId && !existing.signature_id) ||
      (opts.signatureSigneeAt && !existing.signature_signee_at)
    ) {
      await supabase
        .from('document_synthese')
        .update({
          signature_id: existing.signature_id ?? opts.signatureId ?? null,
          signature_signee_at:
            existing.signature_signee_at ?? opts.signatureSigneeAt ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
    }
    return { id: existing.id, created: false };
  }

  return regenerer(supabase, prospectId, opts, null);
}

/**
 * (Re)construit le snapshot et écrit la ligne. `existingId` non nul = mise à
 * jour de la synthèse existante (bouton "Régénérer" : les saisies 6/8 et les
 * échéances sont conservées, seul le snapshot et les PDFs sont invalidés).
 */
export async function regenerer(
  supabase: Supabase,
  prospectId: string,
  opts: GenererSyntheseOpts,
  existingId: string | null,
): Promise<{ id?: string; created: boolean; error?: string }> {
  const built = await buildSyntheseSnapshotFromProspect(supabase, prospectId);
  if (!built) return { created: false, error: 'Prospect introuvable' };

  const { snapshot, clientId, commercialId, signature } = built;
  const contenu = snapshot as unknown as Json;
  const signatureId = opts.signatureId ?? signature?.id ?? null;
  const signatureSigneeAt =
    opts.signatureSigneeAt ?? signature?.signedAt ?? null;

  let id: string;
  if (existingId) {
    const { error } = await supabase
      .from('document_synthese')
      .update({
        contenu,
        reference_dossier: snapshot.meta.referenceDossier,
        client_id: clientId,
        signature_id: signatureId,
        signature_signee_at: signatureSigneeAt,
        // Les PDFs déjà rendus ne correspondent plus au snapshot.
        pdf_path_complet: null,
        pdf_path_cdp: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingId);
    if (error) {
      logger.error('passation.core', 'regenerer update failed', {
        prospectId,
        error,
      });
      return { created: false, error: error.message };
    }
    id = existingId;
  } else {
    const { data: created, error } = await supabase
      .from('document_synthese')
      .insert({
        prospect_id: prospectId,
        client_id: clientId,
        statut: 'generee',
        contenu,
        reference_dossier: snapshot.meta.referenceDossier,
        signature_id: signatureId,
        signature_signee_at: signatureSigneeAt,
        genere_par: opts.generePar ?? null,
      })
      .select('id')
      .single();
    if (error || !created) {
      logger.error('passation.core', 'generer insert failed', {
        prospectId,
        error,
      });
      return { created: false, error: error?.message ?? 'Création impossible' };
    }
    id = created.id;

    // Notifie le Développeur en charge (sauf s'il est lui-même à l'origine).
    if (commercialId && commercialId !== opts.generePar) {
      const lienFiche = `${getAppUrl()}/commercial/prospects/${prospectId}`;
      await supabase.from('notifications').insert({
        user_id: commercialId,
        type: 'passation_a_completer',
        titre: 'Synthèse de passation à compléter',
        message: `La synthèse de ${snapshot.identite.raisonSociale} est générée. Complétez les sections 6 et 8 sous 48h.`,
        lien: `/commercial/prospects/${prospectId}`,
      });
      const { data: dev } = await supabase
        .from('users')
        .select('email')
        .eq('id', commercialId)
        .maybeSingle();
      if (dev?.email) {
        await sendSyntheseGenereeEmail({
          to: dev.email,
          prospectNom: snapshot.identite.raisonSociale,
          referenceDossier: snapshot.meta.referenceDossier,
          lienFiche,
        });
      }
    }
  }

  logAudit(
    existingId ? 'synthese_regeneree' : 'synthese_generee',
    'document_synthese',
    id,
    { prospectId, auto: opts.generePar == null },
    opts.generePar ?? undefined,
  );
  return { id, created: !existingId };
}
