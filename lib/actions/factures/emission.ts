'use server';

import { revalidatePath } from 'next/cache';
import { waitUntil } from '@vercel/functions';
import { z } from 'zod';
import { checkAuth } from '@/lib/auth/guards';
import { sendEmailForFacture } from '@/lib/email/client';
import { logger } from '@/lib/utils/logger';
import { logAudit } from '@/lib/utils/audit';

// ---------------------------------------------------------------------------
// Schemas Zod (validation cote serveur, defense en profondeur)
// ---------------------------------------------------------------------------

const SendFactureSchema = z.string().uuid('factureId doit être un UUID');

const EmailListSchema = z
  .array(z.string().email('Email invalide').max(254))
  .max(20, 'Trop de destinataires (max 20)');

const RecipientsOverrideSchema = z
  .object({
    to: EmailListSchema.optional(),
    cc: EmailListSchema.optional(),
  })
  .optional();

const SendFacturesBulkSchema = z
  .array(z.string().uuid('factureId doit être un UUID'))
  .min(1, 'Aucune facture sélectionnée')
  .max(500, 'Trop de factures sélectionnées');

// ---------------------------------------------------------------------------
// sendFacture - transition brouillon (a_emettre) -> emise (ou avoir).
// ---------------------------------------------------------------------------
// Au passage de statut, le trigger BEFORE UPDATE attribue ref + numero_seq
// (gapless). L'email est ensuite envoye en fire-and-forget. Le push Odoo se
// fera au prochain cron /api/sync/odoo (qui filtre statut IN ('emise','en_retard')
// et odoo_id IS NULL pour les factures, et est_avoir=true pour les avoirs).
export async function sendFacture(
  factureId: string,
  recipients?: { to?: string[]; cc?: string[] },
): Promise<{ success: boolean; ref?: string; error?: string }> {
  const parsed = SendFactureSchema.safeParse(factureId);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }
  factureId = parsed.data;

  const parsedRecipients = RecipientsOverrideSchema.safeParse(recipients);
  if (!parsedRecipients.success) {
    return {
      success: false,
      error:
        parsedRecipients.error.issues[0]?.message ?? 'Destinataires invalides',
    };
  }
  const override = parsedRecipients.data;

  const auth = await checkAuth();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  // Verrou + verification
  const { data: facture, error: fetchError } = await supabase
    .from('factures')
    .select(
      'id, statut, est_avoir, montant_ht, montant_ttc, client:clients!factures_client_id_fkey(id, raison_sociale, is_demo, tva_intracommunautaire, siret)',
    )
    .eq('id', factureId)
    .single();

  if (fetchError || !facture) {
    return { success: false, error: 'Facture introuvable' };
  }

  if (facture.statut !== 'a_emettre') {
    return {
      success: false,
      error: 'La facture n’est pas un brouillon (déjà envoyée ?)',
    };
  }

  // Mention legale obligatoire B2B : TVA intracommunautaire du client
  // (Art. 242 nonies A I-9 CGI). Skip clients demo (HEOLDEMO etc).
  if (
    facture.client &&
    !facture.client.is_demo &&
    (!facture.client.tva_intracommunautaire ||
      facture.client.tva_intracommunautaire.trim() === '')
  ) {
    return {
      success: false,
      error: `TVA intracommunautaire manquante pour le client ${facture.client.raison_sociale}. Mention obligatoire en B2B (Art. 242 nonies A CGI). Renseignez-la dans la fiche client.`,
    };
  }

  // Verifie qu'il y a au moins une ligne (eviter d'envoyer un brouillon vide)
  // + verifie que tous les contrats lies ont leur DECA OPCO (contract_number).
  // Sans DECA, le client OPCO refuserait la facture - on bloque l'emission et
  // on demande a l'utilisateur de renseigner le DECA dans Eduvia d'abord.
  const { data: lignes, error: lignesError } = await supabase
    .from('facture_lignes')
    .select(
      'id, contrat:contrats!facture_lignes_contrat_id_fkey(ref, contract_number, apprenant_nom, apprenant_prenom)',
    )
    .eq('facture_id', factureId);

  if (lignesError) {
    return { success: false, error: lignesError.message };
  }

  if (!lignes || lignes.length === 0) {
    return {
      success: false,
      error:
        'Brouillon sans ligne, impossible d’envoyer. Supprimez-le ou ajoutez une ligne.',
    };
  }

  const missingDecaRefs = Array.from(
    new Set(
      lignes.flatMap((l) => {
        if (
          !l.contrat ||
          (l.contrat.contract_number && l.contrat.contract_number.trim() !== '')
        ) {
          return [];
        }
        const ref = l.contrat.ref;
        return ref ? [ref] : [];
      }),
    ),
  );

  if (missingDecaRefs.length > 0) {
    return {
      success: false,
      error: `DECA OPCO manquant sur ${missingDecaRefs.length} contrat${missingDecaRefs.length > 1 ? 's' : ''} : ${missingDecaRefs.join(', ')}. Renseignez le DECA dans Eduvia, attendez la prochaine synchro, puis renvoyez.`,
    };
  }

  // Transition de statut. Le trigger assign_facture_ref_on_send attribue le
  // ref + numero_seq dans la meme transaction (gapless preserve).
  const targetStatut = facture.est_avoir ? 'avoir' : 'emise';
  const { data: updated, error: updateError } = await supabase
    .from('factures')
    .update({ statut: targetStatut })
    .eq('id', factureId)
    .eq('statut', 'a_emettre') // optimistic lock
    .select('id, ref, statut')
    .single();

  if (updateError || !updated) {
    logger.error('actions.factures', 'sendFacture update failed', {
      factureId,
      error: updateError,
    });
    return {
      success: false,
      error: updateError?.message ?? 'Échec de la mise à jour',
    };
  }

  logAudit(
    'facture_sent',
    'facture',
    updated.id,
    {
      ref: updated.ref,
      statut: updated.statut,
    },
    user.id,
  );

  // Email post-emission : encapsule dans waitUntil() pour que Vercel laisse
  // tourner la promesse apres le return du Server Action. Sans cela, la
  // fonction est tuee des le retour HTTP et l email n est jamais envoye.
  // En local (hors Vercel) waitUntil() est un no-op et la promesse part en
  // fire-and-forget classique. Si Resend echoue on n'echoue pas la facture
  // (deja en 'emise' avec ref, le bouton "Renvoyer par email" reste dispo).
  waitUntil(
    sendEmailForFacture(updated.id, supabase, override).catch((err) => {
      logger.error('actions.factures', 'Email post-emission failed', {
        factureId: updated.id,
        factureRef: updated.ref,
        error: err instanceof Error ? err.message : String(err),
      });
    }),
  );

  revalidatePath('/facturation');
  revalidatePath(`/facturation/${updated.ref}`);

  return { success: true, ref: updated.ref ?? undefined };
}

// ---------------------------------------------------------------------------
// sendFacturesBulk - itere sendFacture sur N brouillons. Continue meme si
// une transition echoue, retourne le detail.
// ---------------------------------------------------------------------------
export async function sendFacturesBulk(factureIds: string[]): Promise<{
  success: boolean;
  sent: { id: string; ref: string }[];
  errors: { id: string; error: string }[];
}> {
  const auth = await checkAuth();
  if (!auth.ok)
    return {
      success: false,
      sent: [],
      errors: [{ id: '', error: auth.error }],
    };
  const parsed = SendFacturesBulkSchema.safeParse(factureIds);
  if (!parsed.success) {
    return {
      success: false,
      sent: [],
      errors: [
        {
          id: '',
          error: parsed.error.issues[0]?.message ?? 'Données invalides',
        },
      ],
    };
  }
  factureIds = parsed.data;

  const sent: { id: string; ref: string }[] = [];
  const errors: { id: string; error: string }[] = [];
  for (const id of factureIds) {
    // oxlint-disable-next-line react-doctor/async-await-in-loop
    const r = await sendFacture(id);
    if (r.success && r.ref) sent.push({ id, ref: r.ref });
    else errors.push({ id, error: r.error ?? 'Erreur inconnue' });
  }
  return { success: errors.length === 0, sent, errors };
}
