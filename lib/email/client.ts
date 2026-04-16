import { Resend } from 'resend';
import { createElement, type ReactElement } from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { env } from '@/lib/env';
import { logger } from '@/lib/utils/logger';
import { formatDate } from '@/lib/utils/formatters';
import { buildFactureEmailHtml } from '@/lib/email/templates';
import { FacturePdf } from '@/components/facturation/facture-pdf';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

export async function sendFactureEmail(params: {
  to: string;
  factureRef: string;
  isAvoir: boolean;
  montantTtc: number;
  dateEcheance: string;
  pdfBuffer: Buffer;
}): Promise<{ success: boolean; error?: string }> {
  if (!resend) {
    logger.warn('email', 'RESEND_API_KEY non configuré - email non envoyé');
    return { success: false, error: 'Service email non configuré' };
  }

  const subject = params.isAvoir
    ? `Avoir ${params.factureRef} - SOLUVIA`
    : `Facture ${params.factureRef} - SOLUVIA`;

  try {
    await resend.emails.send({
      from: 'SOLUVIA Facturation <contact@mysoluvia.com>',
      to: params.to,
      subject,
      html: buildFactureEmailHtml(params),
      attachments: [
        {
          filename: `${params.factureRef}.pdf`,
          content: params.pdfBuffer,
        },
      ],
    });
    return { success: true };
  } catch (error) {
    logger.error('email', 'Échec envoi email', {
      error,
      to: params.to,
      ref: params.factureRef,
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erreur inconnue',
    };
  }
}

/**
 * Full workflow: fetch facture, find contact email, render PDF, send email.
 * Can be called from both the server action and from createFactures.
 */
export async function sendEmailForFacture(
  factureId: string,
  supabase: SupabaseClient<Database>,
): Promise<{ success: boolean; error?: string }> {
  // 1. Fetch facture with client + projet
  const { data: facture, error: factureError } = await supabase
    .from('factures')
    .select(
      `
      id, ref, numero_seq, date_emission, date_echeance, mois_concerne,
      montant_ht, taux_tva, montant_tva, montant_ttc,
      statut, est_avoir, avoir_motif, facture_origine_id, email_envoye, created_by,
      projet:projets!factures_projet_id_fkey(id, ref),
      client:clients!factures_client_id_fkey(id, trigramme, raison_sociale, siret, adresse),
      lignes:facture_lignes(id, contrat_id, description, montant_ht, contrat:contrats!facture_lignes_contrat_id_fkey(ref, apprenant_nom, apprenant_prenom))
    `,
    )
    .eq('id', factureId)
    .single();

  if (factureError || !facture) {
    return { success: false, error: 'Facture introuvable' };
  }

  // 2. Find first client contact with email
  const clientId = facture.client?.id;
  if (!clientId) {
    return { success: false, error: 'Client introuvable pour cette facture' };
  }

  const { data: contacts } = await supabase
    .from('client_contacts')
    .select('email')
    .eq('client_id', clientId)
    .not('email', 'is', null)
    .limit(1);

  const contactEmail = contacts?.[0]?.email;
  if (!contactEmail) {
    return {
      success: false,
      error: 'Aucun contact avec email pour ce client',
    };
  }

  // 3. Render PDF
  let origineRef: string | null = null;
  if (facture.est_avoir && facture.facture_origine_id) {
    const { data: origine } = await supabase
      .from('factures')
      .select('ref')
      .eq('id', facture.facture_origine_id)
      .single();
    origineRef = origine?.ref ?? null;
  }

  const element = createElement(FacturePdf, {
    facture,
    origineRef,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as ReactElement<any>;
  const buffer = await renderToBuffer(element);
  const pdfBuffer = Buffer.from(buffer);

  // 4. Send email
  const result = await sendFactureEmail({
    to: contactEmail,
    factureRef: facture.ref ?? '',
    isAvoir: facture.est_avoir,
    montantTtc: facture.montant_ttc,
    dateEcheance: facture.date_echeance ?? '',
    pdfBuffer,
  });

  // 5. On success: mark email_envoye
  if (result.success) {
    await supabase
      .from('factures')
      .update({ email_envoye: true })
      .eq('id', factureId);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Relance email - reminder for overdue invoices
// ---------------------------------------------------------------------------

export async function sendRelanceEmail(
  factureId: string,
  supabase: SupabaseClient<Database>,
): Promise<{ success: boolean; error?: string }> {
  if (!resend) {
    return { success: false, error: 'Service email non configuré' };
  }

  // Fetch facture
  const { data: facture } = await supabase
    .from('factures')
    .select(
      'id, ref, date_emission, date_echeance, montant_ttc, client:clients!factures_client_id_fkey(id, raison_sociale)',
    )
    .eq('id', factureId)
    .single();

  if (!facture) return { success: false, error: 'Facture introuvable' };

  // Find contact email
  const clientId = (facture.client as unknown as { id: string })?.id;
  if (!clientId) return { success: false, error: 'Client introuvable' };

  const { data: contacts } = await supabase
    .from('client_contacts')
    .select('email')
    .eq('client_id', clientId)
    .not('email', 'is', null)
    .limit(1);

  const contactEmail = contacts?.[0]?.email;
  if (!contactEmail) {
    return { success: false, error: 'Aucun contact avec email pour ce client' };
  }

  const montant = new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  }).format(facture.montant_ttc);

  const dateEcheance = facture.date_echeance
    ? formatDate(facture.date_echeance)
    : '-';

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;background-color:#f5f7f5;">
  <div style="max-width:520px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #d4e4d4;">
    <div style="background:#d97706;padding:28px 32px;text-align:center;">
      <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:1px;">SOLUVIA</h1>
      <p style="margin:8px 0 0;color:#fef3c7;font-size:13px;">Rappel de paiement</p>
    </div>
    <div style="padding:32px;">
      <h2 style="margin:0 0 16px;font-size:18px;color:#1a2e1a;">Facture ${facture.ref} en attente de paiement</h2>
      <p style="margin:0 0 12px;color:#2d4a2d;font-size:14px;line-height:1.6;">
        Madame, Monsieur,
      </p>
      <p style="margin:0 0 12px;color:#2d4a2d;font-size:14px;line-height:1.6;">
        Sauf erreur de notre part, nous n'avons pas encore reçu le règlement de la facture
        <strong>${facture.ref}</strong> d'un montant de <strong>${montant}</strong>,
        dont l'échéance était fixée au <strong>${dateEcheance}</strong>.
      </p>
      <p style="margin:0 0 12px;color:#2d4a2d;font-size:14px;line-height:1.6;">
        Nous vous serions reconnaissants de bien vouloir procéder au règlement dans les meilleurs délais.
        Si le paiement a déjà été effectué, nous vous prions de ne pas tenir compte de ce rappel.
      </p>
      <p style="margin:24px 0 0;color:#2d4a2d;font-size:14px;line-height:1.6;">
        Cordialement,<br>
        <strong>L'équipe SOLUVIA</strong>
      </p>
    </div>
    <div style="background:#fef3c7;padding:16px 32px;border-top:1px solid #fde68a;">
      <p style="margin:0;color:#92400e;font-size:11px;text-align:center;">
        SOLUVIA · Ce message est un rappel automatique · En cas de question, contactez-nous à contact@mysoluvia.com.
      </p>
    </div>
  </div>
</body>
</html>`;

  try {
    await resend.emails.send({
      from: 'SOLUVIA Facturation <contact@mysoluvia.com>',
      to: contactEmail,
      subject: `Rappel - Facture ${facture.ref} en attente de paiement`,
      html,
    });
    return { success: true };
  } catch (error) {
    logger.error('email', 'Échec envoi relance', {
      error,
      to: contactEmail,
      ref: facture.ref,
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erreur inconnue',
    };
  }
}

// ---------------------------------------------------------------------------
// Invitation email - sent via Resend with custom design
// ---------------------------------------------------------------------------

export async function sendInvitationEmail(params: {
  to: string;
  inviterName: string;
  inviteePrenom?: string;
  role: string;
  tempPassword: string;
}): Promise<{ success: boolean; error?: string }> {
  if (!resend) {
    logger.warn(
      'email',
      'RESEND_API_KEY non configuré - invitation email non envoyée',
    );
    return { success: false, error: 'Service email non configuré' };
  }

  const html = buildInvitationEmailHtml(params);

  try {
    await resend.emails.send({
      from: `${params.inviterName} via SOLUVIA <contact@mysoluvia.com>`,
      to: params.to,
      subject: `${params.inviterName} vous invite sur SOLUVIA`,
      html,
    });
    return { success: true };
  } catch (error) {
    logger.error('email', 'Échec envoi invitation', { error, to: params.to });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erreur inconnue',
    };
  }
}

function buildInvitationEmailHtml(params: {
  inviterName: string;
  inviteePrenom?: string;
  role: string;
  tempPassword: string;
}): string {
  const greeting = params.inviteePrenom
    ? `Bonjour ${params.inviteePrenom},`
    : 'Bonjour,';
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;background-color:#f5f7f5;">
  <div style="max-width:520px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #d4e4d4;">
    <div style="background:#16a34a;padding:28px 32px;text-align:center;">
      <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:1px;">SOLUVIA</h1>
    </div>

    <div style="padding:32px;">
      <h2 style="margin:0 0 16px;font-size:18px;color:#1a2e1a;">${greeting}</h2>
      <p style="margin:0 0 12px;color:#2d4a2d;font-size:14px;line-height:1.6;">
        <strong>${params.inviterName}</strong> vous a invité(e) à rejoindre SOLUVIA en tant que <strong>${params.role}</strong>.
      </p>
      <p style="margin:0 0 8px;color:#2d4a2d;font-size:14px;line-height:1.6;">
        Voici vos identifiants de connexion :
      </p>

      <div style="background:#f0f5f0;border:1px solid #d4e4d4;border-radius:8px;padding:16px 20px;margin:16px 0;">
        <p style="margin:0 0 8px;font-size:13px;color:#6b8a6b;">Adresse de connexion</p>
        <p style="margin:0 0 16px;font-size:14px;font-weight:600;color:#1a2e1a;">https://soluvia.vercel.app</p>
        <p style="margin:0 0 8px;font-size:13px;color:#6b8a6b;">Mot de passe temporaire</p>
        <p style="margin:0;font-size:16px;font-weight:700;font-family:monospace;color:#16a34a;letter-spacing:1px;">${params.tempPassword}</p>
      </div>

      <p style="margin:16px 0 0;color:#6b8a6b;font-size:13px;line-height:1.6;">
        Connectez-vous avec votre email et ce mot de passe, puis rendez-vous dans <strong>Mon compte</strong> pour le modifier.
      </p>

      <div style="text-align:center;margin:24px 0;">
        <a href="https://soluvia.vercel.app/login" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:8px;font-size:14px;font-weight:600;">
          Se connecter
        </a>
      </div>
    </div>

    <div style="background:#f0f5f0;padding:16px 32px;border-top:1px solid #d4e4d4;">
      <p style="margin:0;color:#6b8a6b;font-size:11px;text-align:center;">
        SOLUVIA - Plateforme de pilotage pour organismes de formation
      </p>
    </div>
  </div>
</body>
</html>`;
}
