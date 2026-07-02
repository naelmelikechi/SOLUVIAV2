import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';

/**
 * Flux devis bout en bout - le seul parcours PUBLIC de l'app :
 *   creation brouillon (UI admin) -> envoi (ref DEV-SOL-NNNN + token public)
 *   -> consultation + acceptation ANONYME via /devis/public/<token>
 *   -> transformation en facture cote admin.
 *
 * Necessite :
 *  - storageState admin (e2e/auth.setup.ts, gate par E2E_ADMIN_EMAIL/PASSWORD)
 *  - fixtures e2e/fixtures.sql (client E2E CLIENT TEST, trigramme ZZE)
 *  - bootstrap scripts/e2e-bootstrap.ts (compte admin)
 *
 * Sans RESEND_API_KEY, l'envoi d'email est non-bloquant cote serveur (try/catch
 * dans sendDevis) : le test valide l'emission et le parcours public, pas la
 * delivrabilite. Le portail public est rate-limite via Upstash (10 accept/min,
 * 30 lectures/min par IP) mais fail-open quand Upstash est absent (local + CI).
 */

const STORAGE = 'e2e/.auth/admin.json';
const CLIENT_NAME = 'E2E CLIENT TEST';

test.describe('Devis - flux public creation -> acceptation -> facture', () => {
  test.beforeAll(() => {
    if (!existsSync(STORAGE)) {
      test.skip(
        true,
        `Storage state manquant (${STORAGE}). Lancer auth.setup avec E2E_ADMIN_EMAIL/PASSWORD.`,
      );
    }
  });

  test.use({ storageState: STORAGE });

  test('brouillon -> envoi (DEV-SOL-NNNN) -> acceptation publique anonyme -> facture', async ({
    page,
    browser,
  }) => {
    // Parcours long (5 pages + PDF) sur serveur qui compile a la demande en dev.
    test.setTimeout(120_000);

    // Objet unique pour isoler ce run (la spec est rejouable sans reset DB).
    const objet = `Devis e2e ${Date.now()}`;

    // ----- 1. Creer un brouillon de devis via le dialog admin -----
    await page.goto('/devis');
    await page.getByRole('button', { name: /nouveau devis/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await dialog.getByLabel(/objet/i).fill(objet);

    // Choix client (fixture ZZE)
    await dialog.getByPlaceholder(/trigramme ou raison sociale/i).fill('ZZE');
    await dialog
      .getByRole('button', { name: new RegExp(CLIENT_NAME, 'i') })
      .click();

    // Une ligne : libelle + PU HT (quantite=1 et TVA=20% par defaut)
    await dialog.getByPlaceholder('Libellé *').fill('Prestation e2e devis');
    await dialog.getByPlaceholder('PU HT (€)').fill('1000');

    await dialog.getByRole('button', { name: /créer le devis/i }).click();

    // Redirection vers la page detail du brouillon (UUID, pas encore de ref)
    await page.waitForURL(/\/devis\/[0-9a-f-]{36}/, { timeout: 20_000 });
    await expect(
      page.getByRole('heading', { name: /brouillon/i }),
    ).toBeVisible();

    // ----- 2. Envoyer le devis (trigger DB : ref DEV-SOL-NNNN + token) -----
    await page.getByRole('button', { name: /^envoyer$/i }).click();
    const sendDialog = page.getByRole('dialog');
    await expect(sendDialog).toBeVisible();
    await sendDialog.getByLabel(/destinataires/i).fill('destinataire@e2e.test');
    await sendDialog.getByRole('button', { name: /^envoyer$/i }).click();
    await expect(sendDialog).toBeHidden({ timeout: 20_000 });

    // Numerotation par societe : DEV-<code societe>-NNNN (SOLUVIA = SOL).
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toHaveText(/DEV-SOL-\d{4}/, { timeout: 20_000 });
    const ref = ((await heading.textContent()) ?? '').match(
      /DEV-SOL-\d{4}/,
    )?.[0];
    expect(ref, 'ref devis extraite du heading').toBeTruthy();

    // Lien public expose cote admin (input readonly, URL complete avec token)
    const publicLink = await page
      .getByLabel('Lien public du devis')
      .inputValue();
    expect(publicLink).toMatch(/\/devis\/public\/[0-9a-f-]{36}$/);

    // ----- 3. Parcours PUBLIC : contexte ANONYME (aucune session) -----
    const anonContext = await browser.newContext();
    try {
      const anonPage = await anonContext.newPage();
      await anonPage.goto(publicLink);

      // Le devis est consultable sans auth (RPC get_devis_public par token)
      await expect(
        anonPage.getByRole('heading', { name: new RegExp(`Devis ${ref}`) }),
      ).toBeVisible({ timeout: 20_000 });
      await expect(anonPage.getByText('En attente')).toBeVisible();
      await expect(anonPage.getByText('1000,00 €').first()).toBeVisible();

      // PDF public servi par token (magic bytes %PDF)
      const token = publicLink.split('/').pop()!;
      const origin = new URL(publicLink).origin;
      const pdfRes = await anonPage.request.get(
        `${origin}/api/devis/${token}/pdf`,
      );
      expect(pdfRes.status(), 'GET /api/devis/[token]/pdf').toBe(200);
      expect(pdfRes.headers()['content-type']).toContain('application/pdf');
      const body = await pdfRes.body();
      expect(body.length).toBeGreaterThan(1_000);
      expect(body.subarray(0, 5).toString('latin1')).toBe('%PDF-');

      // Acceptation via le formulaire public (signataire + engagement)
      await anonPage
        .getByRole('button', { name: /accepter le devis/i })
        .click();
      await anonPage.getByLabel(/nom du signataire/i).fill('Signataire E2E');
      await anonPage.getByLabel(/^email$/i).fill('signataire@e2e.test');
      await anonPage.getByRole('checkbox').check();
      await anonPage
        .getByRole('button', { name: /confirmer l'acceptation/i })
        .click();
      await expect(
        anonPage.getByRole('heading', { name: /merci/i }),
      ).toBeVisible({ timeout: 20_000 });
    } finally {
      await anonContext.close();
    }

    // ----- 4. Cote admin : devis accepte -> transformation en facture -----
    await page.goto(`/devis/${ref}`);
    await expect(page.getByText('Accepté', { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/par Signataire E2E/)).toBeVisible();

    await page.getByRole('button', { name: /créer une facture/i }).click();
    const factureDialog = page.getByRole('dialog');
    await expect(factureDialog).toBeVisible();
    // Mode solde : facture le reste a facturer (= 100% ici, 1000 EUR HT)
    await factureDialog
      .getByRole('radio', { name: /solde \(reste à facturer\)/i })
      .check();
    await expect(factureDialog.getByText('1000,00 EUR HT')).toBeVisible();
    await factureDialog
      .getByRole('button', { name: /créer la facture/i })
      .click();

    // Succes = redirection /facturation (facture brouillon 'a_emettre' creee)
    await page.waitForURL(/\/facturation/, { timeout: 20_000 });

    // ----- 5. La facture liee est visible sur le detail du devis -----
    await page.goto(`/devis/${ref}`);
    const facturesSection = page
      .getByRole('heading', { name: /factures émises depuis ce devis/i })
      .locator('..');
    await expect(facturesSection).toBeVisible({ timeout: 20_000 });
    const factureRow = facturesSection.getByRole('row').nth(1);
    await expect(factureRow).toContainText('Solde / Personnalisée');
    await expect(factureRow).toContainText('1000,00 €');
  });
});
