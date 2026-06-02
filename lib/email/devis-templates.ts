import { sendEmail } from '@/lib/email/_send';
import { getDevisById } from '@/lib/queries/devis';
import { renderDevisPdfBuffer } from '@/lib/utils/render-devis-pdf';
import { getAppUrl } from '@/lib/utils/app-url';
import { logger } from '@/lib/utils/logger';
import { createAdminClient } from '@/lib/supabase/admin';

const FROM = 'SOLUVIA <contact@mysoluvia.com>';

interface SendDevisParams {
  devisId: string;
  to?: string[];
  cc?: string[];
}

export async function sendDevisEmail(p: SendDevisParams): Promise<void> {
  const devis = await getDevisById(p.devisId);
  if (
    !devis ||
    !devis.ref ||
    !devis.acceptation_token ||
    !devis.societe_emettrice
  ) {
    logger.error('email.devis', 'sendDevisEmail: devis incomplet', {
      id: p.devisId,
    });
    return;
  }

  const link = `${getAppUrl()}/devis/public/${devis.acceptation_token}`;
  const pdfBuffer = await renderDevisPdfBuffer(devis);

  // Recipients : si p.to fourni, l utiliser. Sinon warning (V1).
  const recipients = p.to;
  if (!recipients || recipients.length === 0) {
    logger.warn(
      'email.devis',
      'aucun destinataire fourni pour sendDevisEmail',
      { id: devis.id },
    );
    return;
  }

  const subject = `[${devis.societe_emettrice.code}] Devis ${devis.ref} - ${devis.objet}`;
  const html = `
    <div style="font-family: -apple-system, sans-serif; color: #1a1a1a;">
      <p>Bonjour,</p>
      <p>Veuillez trouver ci-joint le devis <strong>${devis.ref}</strong> émis par <strong>${devis.societe_emettrice.raison_sociale}</strong>.</p>
      <p><strong>Objet :</strong> ${devis.objet}<br />
         <strong>Montant TTC :</strong> ${Number(devis.montant_ttc).toFixed(2).replace('.', ',')} EUR<br />
         <strong>Valide jusqu'au :</strong> ${devis.date_validite ?? 'voir devis'}</p>
      <p>Pour consulter, télécharger ou accepter ce devis en ligne :</p>
      <p><a href="${link}" style="display: inline-block; background: #16a34a; color: white; padding: 12px 20px; border-radius: 6px; text-decoration: none;">Accéder au devis</a></p>
      <p>Le devis PDF est également joint à cet email.</p>
      <p>Cordialement,<br />${devis.societe_emettrice.raison_sociale}</p>
      <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;" />
      <p style="font-size: 11px; color: #6b7280;">
        Ce devis est valable ${devis.date_validite ? `jusqu'au ${devis.date_validite}` : '90 jours'}.
        Pour toute question : ${devis.societe_emettrice.email_contact}.
      </p>
    </div>
  `;

  const result = await sendEmail({
    from: FROM,
    to: recipients,
    cc: p.cc,
    replyTo: devis.societe_emettrice.email_contact,
    subject,
    html,
    attachments: [{ filename: `${devis.ref}.pdf`, content: pdfBuffer }],
  });
  logger.info('email.devis', 'sendDevisEmail OK', {
    ref: devis.ref,
    success: result.success,
  });
}

interface ConfirmationParams {
  devisId: string;
  signataireEmail: string;
  signataireNom: string;
}

export async function sendDevisAcceptationConfirmation(
  p: ConfirmationParams,
): Promise<void> {
  const devis = await getDevisById(p.devisId);
  if (!devis || !devis.societe_emettrice) return;
  const subject = `Confirmation acceptation devis ${devis.ref}`;
  const html = `
    <div style="font-family: -apple-system, sans-serif;">
      <p>Bonjour ${p.signataireNom},</p>
      <p>Nous confirmons votre acceptation du devis <strong>${devis.ref}</strong> émis par <strong>${devis.societe_emettrice.raison_sociale}</strong>.</p>
      <p>Montant accepté : ${Number(devis.montant_ttc).toFixed(2).replace('.', ',')} EUR TTC.</p>
      <p>Nous reviendrons vers vous très prochainement pour la suite.</p>
      <p>Cordialement,<br />${devis.societe_emettrice.raison_sociale}</p>
    </div>
  `;
  await sendEmail({
    from: FROM,
    to: [p.signataireEmail],
    replyTo: devis.societe_emettrice.email_contact,
    subject,
    html,
  });
}

// ---------------------------------------------------------------------------
// Relances J+7 / J+14
// ---------------------------------------------------------------------------

interface RelanceParams {
  devisId: string;
  niveau: 'j7' | 'j14';
}

export async function sendDevisRelanceEmail(p: RelanceParams): Promise<void> {
  // Utilise createAdminClient car appele depuis un cron (pas de cookies HTTP)
  const supabase = createAdminClient();

  const { data: devisRow, error: devisErr } = await supabase
    .from('devis')
    .select(
      `*, societe_emettrice:societes_emettrices(id, code, raison_sociale, email_contact)`,
    )
    .eq('id', p.devisId)
    .maybeSingle();

  if (devisErr || !devisRow) {
    logger.warn('email.devis.relance', 'devis introuvable', { id: p.devisId });
    return;
  }

  const devis = devisRow as typeof devisRow & {
    societe_emettrice: { raison_sociale: string; email_contact: string } | null;
  };

  if (
    !devis.ref ||
    !devis.acceptation_token ||
    !devis.societe_emettrice ||
    !devis.client_id
  ) {
    logger.warn('email.devis.relance', 'devis incomplet', { id: p.devisId });
    return;
  }

  const { data: contacts } = await supabase
    .from('client_contacts')
    .select('email')
    .eq('client_id', devis.client_id)
    .eq('recoit_factures', true);

  const to = (contacts ?? []).flatMap((c) =>
    c.email ? [c.email] : [],
  ) as string[];
  if (to.length === 0) {
    logger.warn('email.devis.relance', 'aucun contact recoit_factures', {
      ref: devis.ref,
    });
    return;
  }

  const link = `${getAppUrl()}/devis/public/${devis.acceptation_token}`;

  const intro =
    p.niveau === 'j7'
      ? `Nous nous permettons un petit rappel concernant le devis ${devis.ref}, envoyé il y a une semaine.`
      : `Nous revenons vers vous concernant le devis ${devis.ref}, envoyé il y a deux semaines. Sa validité expire le ${devis.date_validite}.`;

  const subject =
    p.niveau === 'j7'
      ? `[Rappel] Devis ${devis.ref} - ${devis.objet}`
      : `[Rappel important] Devis ${devis.ref} expire bientôt`;

  const html = `
    <div style="font-family: -apple-system, sans-serif; color: #1a1a1a;">
      <p>Bonjour,</p>
      <p>${intro}</p>
      <p>Pour consulter et accepter en ligne :</p>
      <p><a href="${link}" style="display:inline-block;background:#16a34a;color:white;padding:12px 20px;border-radius:6px;text-decoration:none;">Accéder au devis</a></p>
      <p>Cordialement,<br />${devis.societe_emettrice.raison_sociale}</p>
    </div>
  `;

  await sendEmail({
    from: FROM,
    to,
    subject,
    html,
    replyTo: devis.societe_emettrice.email_contact,
  });

  logger.info('email.devis.relance', `relance ${p.niveau} envoyee`, {
    ref: devis.ref,
  });
}

// ---------------------------------------------------------------------------

interface RefusNotifParams {
  devisId: string;
  motif?: string | null;
}

export async function notifyAdminsDevisRefuse(
  p: RefusNotifParams,
): Promise<void> {
  const devis = await getDevisById(p.devisId);
  if (!devis) return;
  // Recuperer les emails des admins
  const { createClient } = await import('@/lib/supabase/server');
  const supabase = await createClient();
  const { data: admins } = await supabase
    .from('users')
    .select('email')
    .in('role', ['admin', 'superadmin']);
  const to = (admins ?? []).flatMap((a) =>
    a.email ? [a.email] : [],
  ) as string[];
  if (to.length === 0) return;

  const subject = `[Devis] ${devis.ref} refusé par le client`;
  const html = `
    <p>Le devis <strong>${devis.ref}</strong> (${devis.objet}) a été refusé par le client.</p>
    <p>Motif : ${p.motif ?? '(aucun)'}</p>
    <p>Voir : ${getAppUrl()}/devis/${devis.ref}</p>
  `;
  await sendEmail({ from: FROM, to, subject, html });
}
