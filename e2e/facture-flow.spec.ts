import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';

/**
 * Flux critique de facturation, bout en bout via l'UI :
 *   facture libre (brouillon) -> envoi (ref gapless FAC-XXX-NNNN) -> PDF valide.
 *
 * C'est LE chemin legal de l'app : numerotation sans trou + document PDF.
 * Necessite :
 *  - storageState admin (e2e/auth.setup.ts, gate par E2E_ADMIN_EMAIL/PASSWORD)
 *  - fixtures e2e/fixtures.sql (client E2E CLIENT TEST, trigramme ZZE)
 *  - bootstrap scripts/e2e-bootstrap.ts (compte admin)
 * Sans RESEND_API_KEY, l'envoi d'email est saute cote serveur (env optionnelle) :
 * le test valide l'emission, pas la delivrabilite.
 */

const STORAGE = 'e2e/.auth/admin.json';
const CLIENT_NAME = 'E2E CLIENT TEST';

test.describe('Facturation - flux critique brouillon -> emission -> PDF', () => {
  test.beforeAll(() => {
    if (!existsSync(STORAGE)) {
      test.skip(
        true,
        `Storage state manquant (${STORAGE}). Lancer auth.setup avec E2E_ADMIN_EMAIL/PASSWORD.`,
      );
    }
  });

  test.use({ storageState: STORAGE });

  test('facture libre -> envoi -> ref gapless + PDF servi', async ({
    page,
  }) => {
    // ----- 1. Creer un brouillon de facture libre via le dialog -----
    await page.goto('/facturation');
    await page
      .getByRole('button', { name: /facture libre/i })
      .first()
      .click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Choix client (fixture ZZE)
    await dialog.getByPlaceholder(/trigramme ou raison sociale/i).fill('ZZE');
    await dialog.getByText(CLIENT_NAME).first().click();

    // Une ligne : description + montant HT
    await dialog
      .getByPlaceholder('Description ligne 1')
      .fill('Prestation e2e - flux critique');
    await dialog.getByPlaceholder('Montant HT').first().fill('100');

    await dialog
      .getByRole('button', { name: /préparer le brouillon/i })
      .click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    // ----- 2. Envoyer le brouillon (= emission, ref assignee par trigger) -----
    // La table brouillons n'affiche pas la description : on cible par client
    // (fixture dediee, donc sans ambiguite).
    await page.getByRole('tab', { name: /brouillons/i }).click();
    const row = page.getByRole('row').filter({ hasText: CLIENT_NAME }).first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row
      .getByRole('button', { name: /envoyer/i })
      .first()
      .click();

    const sendDialog = page.getByRole('dialog');
    await expect(sendDialog).toBeVisible();
    // Destinataire requis par le dialog d'envoi (email non delivre en CI).
    const toInput = sendDialog.getByPlaceholder('email@exemple.com').first();
    await toInput.fill('destinataire@e2e.test');
    await toInput.press('Enter');
    await sendDialog
      .getByRole('button', { name: /^envoyer/i })
      .last()
      .click();
    await expect(sendDialog).toBeHidden({ timeout: 20_000 });

    // ----- 3. La facture emise porte une ref gapless (serie unique FAC-SOL-
    // depuis 20260610130000 ; regex tolerante au prefixe pour ne pas coupler
    // le test a la convention). On cible la LIGNE du client de test pour ne
    // pas attraper une autre facture.
    await page.getByRole('tab', { name: /^factures/i }).click();
    const emiseRow = page
      .getByRole('row')
      .filter({ hasText: CLIENT_NAME })
      .first();
    await expect(emiseRow).toBeVisible({ timeout: 15_000 });
    const rowText = (await emiseRow.textContent()) ?? '';
    const ref = rowText.match(/FAC-[A-Z]{3}-\d{4}/)?.[0];
    expect(ref, 'ref gapless extraite de la ligne du client e2e').toBeTruthy();

    // ----- 4. Le PDF est servi et valide (magic bytes %PDF) -----
    const pdfRes = await page.request.get(`/api/factures/${ref}/pdf`);
    expect(pdfRes.status(), 'GET /api/factures/[ref]/pdf').toBe(200);
    expect(pdfRes.headers()['content-type']).toContain('application/pdf');
    const body = await pdfRes.body();
    expect(body.length).toBeGreaterThan(1_000);
    expect(body.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
});
