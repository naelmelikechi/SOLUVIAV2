import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';

/**
 * Flux passation (Feature 6) : sur un prospect signé (fixture E2E PASSATION
 * TEST), générer la synthèse, saisir les sections 6 (points de vigilance) et
 * 8 (recommandation), soumettre au Référent CDP -> statut "En attente
 * d'arbitrage" + PDFs téléchargeables.
 *
 * Necessite :
 *  - storageState admin (e2e/auth.setup.ts)
 *  - fixtures e2e/fixtures.sql (prospect E2E PASSATION TEST, stage signe)
 *
 * Sans RESEND_API_KEY, le mail vague 1 est non-bloquant (sendEmail skippe) :
 * le test valide le workflow et la production des PDFs, pas la delivrabilite.
 */

const STORAGE = 'e2e/.auth/admin.json';
const PROSPECT_NAME = 'E2E PASSATION TEST';

test.describe('Passation - generation -> saisies -> soumission', () => {
  test.beforeAll(() => {
    if (!existsSync(STORAGE)) {
      test.skip(
        true,
        `Storage state manquant (${STORAGE}). Lancer auth.setup avec E2E_ADMIN_EMAIL/PASSWORD.`,
      );
    }
  });

  test.use({ storageState: STORAGE });

  test('generer -> completer 6+8 -> soumettre -> en attente d arbitrage', async ({
    page,
  }) => {
    // Rendu de 2 PDFs + upload storage : parcours long en dev.
    test.setTimeout(120_000);

    // ----- 1. Ouvrir la fiche du prospect signé (clic ligne du tableau) -----
    await page.goto('/commercial/prospects');
    await page.getByText(PROSPECT_NAME, { exact: true }).first().click();
    await expect(
      page.getByRole('heading', { name: PROSPECT_NAME }),
    ).toBeVisible({ timeout: 15_000 });

    // La section passation vit dans l'onglet Négociation.
    await page.getByRole('tab', { name: /négociation/i }).click();

    // ----- 2. Générer la synthèse si première exécution (spec rejouable) -----
    const genererBtn = page.getByRole('button', {
      name: /générer la synthèse de passation/i,
    });
    if (await genererBtn.isVisible().catch(() => false)) {
      await genererBtn.click();
      await expect(
        page.getByText(/synthèse de passation générée/i),
      ).toBeVisible({ timeout: 15_000 });
    }

    // Le formulaire des saisies apparaît avec la synthèse.
    const vigilance = page.locator('#passation-vigilance');
    await expect(vigilance).toBeVisible({ timeout: 15_000 });

    // Rejouabilité : si un précédent run a déjà soumis, le champ est verrouillé
    // et le badge déjà en attente d'arbitrage - on s'arrête là.
    if (await vigilance.isDisabled()) {
      await expect(page.getByText(/en attente d'arbitrage/i)).toBeVisible();
      return;
    }

    // ----- 3. Saisir sections 6 + 8 et enregistrer le brouillon -----
    await vigilance.fill(
      'DRH récente : relation à ménager\nCanal préféré : téléphone',
    );
    await page
      .locator('#passation-promesses')
      .fill('Point mensuel avec le Président la première année.');
    await page
      .locator('#passation-cdp-ideal')
      .fill('Profil expérimenté sur la création de centre.');
    await page
      .getByRole('button', { name: /enregistrer le brouillon/i })
      .click();
    await expect(page.getByText(/saisies enregistrées/i)).toBeVisible({
      timeout: 10_000,
    });

    // ----- 4. Soumettre au Référent CDP (vague 1 : PDFs + mail) -----
    await page
      .getByRole('button', { name: /soumettre au référent cdp/i })
      .click();
    await expect(page.getByText(/synthèse soumise/i)).toBeVisible({
      timeout: 60_000,
    });

    // ----- 5. Statut + PDFs disponibles -----
    await expect(page.getByText(/en attente d'arbitrage/i)).toBeVisible();
    await expect(
      page.getByRole('button', { name: /pdf complet/i }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /pdf cdp/i })).toBeVisible();
  });
});
