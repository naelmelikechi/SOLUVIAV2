/**
 * Email templates for facture/avoir emails.
 * All HTML uses inline styles only (no CSS classes) for email client compatibility.
 */

function formatEur(n: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(n);
}

function formatDateFr(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function buildFactureEmailHtml(params: {
  factureRef: string;
  isAvoir: boolean;
  montantTtc: number;
  dateEcheance: string;
}): string {
  const { factureRef, isAvoir, montantTtc, dateEcheance } = params;

  const docType = isAvoir ? "l'avoir" : 'la facture';
  const montantFormatted = formatEur(Math.abs(montantTtc));
  const echeanceFormatted = formatDateFr(dateEcheance);

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${isAvoir ? 'Avoir' : 'Facture'} ${factureRef}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">
          <!-- Header -->
          <tr>
            <td style="background-color:#16a34a;padding:24px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <span style="font-size:22px;font-weight:bold;color:#ffffff;letter-spacing:1px;">SOLUVIA</span>
                  </td>
                  <td align="right">
                    <span style="font-size:13px;color:#dcfce7;">${isAvoir ? 'Avoir' : 'Facture'} ${factureRef}</span>
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
                Veuillez trouver ci-joint ${docType} <strong>${factureRef}</strong> d'un montant de <strong>${montantFormatted} TTC</strong>.
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
                          <strong>Date d'echeance :</strong>
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
                L'equipe SOLUVIA
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb;">
              <p style="margin:0 0 4px;font-size:11px;color:#9ca3af;line-height:1.5;">
                SOLUVIA SAS — 15 Rue de la Formation, 75008 Paris
              </p>
              <p style="margin:0 0 4px;font-size:11px;color:#9ca3af;line-height:1.5;">
                SIRET 891 234 567 00015 — TVA FR89 891 234 567
              </p>
              <p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.5;">
                Cet email a ete envoye automatiquement. Merci de ne pas y repondre directement.
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
