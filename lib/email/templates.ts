/**
 * Email templates for facture/avoir emails.
 * All HTML uses inline styles only (no CSS classes) for email client compatibility.
 */

import type { EmetteurInfo } from '@/lib/queries/parametres';
import { formatDate } from '@/lib/utils/formatters';
import { escapeHtml } from '@/lib/utils/escape-html';

const EMETTEUR_FALLBACK: EmetteurInfo = {
  raison_sociale: 'SOLUVIA',
  adresse: '27 Rue Jacqueline Cochran, 79000 Niort',
  siret: '994 241 537 00012',
  tva: 'FR37994241537',
};

function formatEur(n: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(n);
}

export function buildFactureEmailHtml(params: {
  factureRef: string;
  isAvoir: boolean;
  montantTtc: number;
  dateEcheance: string;
  emetteur?: EmetteurInfo;
}): string {
  const { factureRef, isAvoir, montantTtc, dateEcheance } = params;
  const emetteur = params.emetteur ?? EMETTEUR_FALLBACK;
  const rawCompanyName =
    emetteur.raison_sociale.split(' ')[0] ?? emetteur.raison_sociale;

  const docType = isAvoir ? "l'avoir" : 'la facture';
  const montantFormatted = formatEur(Math.abs(montantTtc));
  const echeanceFormatted = formatDate(dateEcheance);

  // Tous les inputs user-controlled (raison_sociale via emetteur, factureRef
  // qui suit une convention mais peut etre custom) sont escapes avant
  // interpolation. Voir lib/utils/escape-html.ts.
  const escapedFactureRef = escapeHtml(factureRef);
  const companyName = escapeHtml(rawCompanyName);
  const fullCompanyName = escapeHtml(emetteur.raison_sociale);
  const adresse = escapeHtml(emetteur.adresse);
  const siret = escapeHtml(emetteur.siret);
  const tva = escapeHtml(emetteur.tva);

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${isAvoir ? 'Avoir' : 'Facture'} ${escapedFactureRef}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">
          <!-- Header avec logo officiel SOLUVIA -->
          <tr>
            <td style="background-color:#ffffff;padding:24px 32px;border-bottom:1px solid #e5e7eb;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <img src="https://app.mysoluvia.com/logo.png" alt="${companyName}" width="160" height="32" style="display:block;height:32px;width:auto;border:0;outline:none;text-decoration:none;" />
                  </td>
                  <td align="right">
                    <span style="font-size:13px;color:#6b7280;font-weight:500;">${isAvoir ? 'Avoir' : 'Facture'} ${escapedFactureRef}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px;font-size:15px;color:#1a1a1a;line-height:1.6;">
                Madame, Monsieur,
              </p>
              <p style="margin:0 0 16px;font-size:15px;color:#1a1a1a;line-height:1.6;">
                Veuillez trouver ci-joint ${docType} <strong>${escapedFactureRef}</strong> d'un montant de <strong>${montantFormatted} TTC</strong>.
              </p>

              <!-- Info box -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:4px 0;font-size:14px;color:#374151;">
                          <strong>Montant TTC :</strong>
                        </td>
                        <td align="right" style="padding:4px 0;font-size:14px;color:#1a1a1a;font-weight:bold;">
                          ${montantFormatted}
                        </td>
                      </tr>
                      ${
                        !isAvoir
                          ? `<tr>
                        <td style="padding:4px 0;font-size:14px;color:#374151;">
                          <strong>Date d'échéance :</strong>
                        </td>
                        <td align="right" style="padding:4px 0;font-size:14px;color:#1a1a1a;">
                          ${echeanceFormatted}
                        </td>
                      </tr>`
                          : ''
                      }
                    </table>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;font-size:15px;color:#1a1a1a;line-height:1.6;">
                Cordialement,
              </p>
              <p style="margin:0;font-size:15px;color:#1a1a1a;line-height:1.6;font-weight:bold;">
                L'équipe ${companyName}
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb;">
              <p style="margin:0 0 4px;font-size:11px;color:#9ca3af;line-height:1.5;">
                ${fullCompanyName} - ${adresse}
              </p>
              <p style="margin:0 0 4px;font-size:11px;color:#9ca3af;line-height:1.5;">
                SIRET ${siret} - TVA ${tva}
              </p>
              <p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.5;">
                Cet email a été envoyé automatiquement. Merci de ne pas y répondre directement.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
