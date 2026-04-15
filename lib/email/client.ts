import { Resend } from 'resend';
import { createElement, type ReactElement } from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { env } from '@/lib/env';
import { logger } from '@/lib/utils/logger';
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
    logger.warn('email', 'RESEND_API_KEY non configure — email non envoye');
    return { success: false, error: 'Service email non configure' };
  }

  const subject = params.isAvoir
    ? `Avoir ${params.factureRef} — SOLUVIA`
    : `Facture ${params.factureRef} — SOLUVIA`;

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
    logger.error('email', 'Echec envoi email', {
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
// Invitation email — sent via Resend with custom design
// ---------------------------------------------------------------------------

export async function sendInvitationEmail(params: {
  to: string;
  inviterName: string;
  role: string;
  link: string;
}): Promise<{ success: boolean; error?: string }> {
  if (!resend) {
    logger.warn(
      'email',
      'RESEND_API_KEY non configuré — invitation email non envoyé',
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
  role: string;
  link: string;
}): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;background-color:#f5f7f5;">
  <div style="max-width:520px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #d4e4d4;">
    <!-- Header -->
    <div style="background:#16a34a;padding:28px 32px;text-align:center;">
      <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:1px;">SOLUVIA</h1>
    </div>

    <!-- Body -->
    <div style="padding:32px;">
      <h2 style="margin:0 0 16px;font-size:18px;color:#1a2e1a;">Vous êtes invité(e) !</h2>
      <p style="margin:0 0 12px;color:#2d4a2d;font-size:14px;line-height:1.6;">
        <strong>${params.inviterName}</strong> vous a invité(e) à rejoindre SOLUVIA en tant que <strong>${params.role}</strong>.
      </p>
      <p style="margin:0 0 24px;color:#6b8a6b;font-size:14px;line-height:1.6;">
        SOLUVIA est la plateforme de pilotage stratégique pour les organismes de formation. Cliquez sur le bouton ci-dessous pour accéder à votre compte.
      </p>

      <!-- CTA -->
      <div style="text-align:center;margin:24px 0;">
        <a href="${params.link}" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:8px;font-size:14px;font-weight:600;">
          Accéder à SOLUVIA
        </a>
      </div>

      <p style="margin:24px 0 0;color:#6b8a6b;font-size:12px;line-height:1.5;">
        Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br>
        <a href="${params.link}" style="color:#16a34a;word-break:break-all;">${params.link}</a>
      </p>
    </div>

    <!-- Footer -->
    <div style="background:#f0f5f0;padding:16px 32px;border-top:1px solid #d4e4d4;">
      <p style="margin:0;color:#6b8a6b;font-size:11px;text-align:center;">
        SOLUVIA SAS · Plateforme de pilotage pour organismes de formation
      </p>
    </div>
  </div>
</body>
</html>`;
}
