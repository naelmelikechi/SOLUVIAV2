import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';

/**
 * Flux passation (Feature 6, post-Phase 2 CRM) : sur la synthese seedee
 * (fixture E2E PASSATION TEST, client-ancree, statut generee), ouvrir la
 * liste /commercial/passations, entrer dans le detail, saisir les sections 6
 * (points de vigilance) et 8 (recommandation), soumettre au Referent CDP
 * -> statut "En attente d'arbitrage" + PDFs telechargeables.
 *
 * Necessite :
 *  - storageState admin (e2e/auth.setup.ts)
 *  - fixtures e2e/fixtures.sql (client ZZP + document_synthese 'generee')
 *
 * Sans RESEND_API_KEY, le mail vague 1 est non-bloquant (sendEmail skippe) :
 * le test valide le workflow et la production des PDFs, pas la delivrabilite.
 */

const STORAGE = 'e2e/.auth/admin.json';
const CLIENT_NAME = 'E2E PASSATION TEST';

test.describe('Passation - liste -> saisies -> soumission', () => {
  test.beforeAll(() => {
    if (!existsSync(STORAGE)) {
      test.skip(
        true,
        `Storage state manquant (${STORAGE}). Lancer auth.setup avec E2E_ADMIN_EMAIL/PASSWORD.`,
      );
    }
  });

  test.use({ storageState: STORAGE });

  test('lister -> completer 6+8 -> soumettre -> en attente d arbitrage', async ({
    page,
  }) => {
    // Rendu de 2 PDFs + upload storage : parcours long en dev.
    test.setTimeout(120_000);

    // ----- 1. La liste des passations affiche la synthese seedee -----
    await page.goto('/commercial/passations');
    const lien = page.getByRole('link', { name: CLIENT_NAME }).first();
    await expect(lien).toBeVisible({ timeout: 15_000 });

    // ----- 2. Ouvrir le detail de la synthese -----
    await lien.click();
    await expect(page.getByRole('heading', { name: CLIENT_NAME })).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByText(/synthèse de passation/i).first(),
    ).toBeVisible();

    // Le formulaire des saisies apparait avec la synthese.
    const vigilance = page.locator('#passation-vigilance');
    await expect(vigilance).toBeVisible({ timeout: 15_000 });

    // Rejouabilite : si un precedent run a deja soumis, le champ est verrouille
    // et le badge deja en attente d'arbitrage - on s'arrete la. (.first() :
    // le libelle apparait aussi dans le texte d'aide sous les boutons.)
    if (await vigilance.isDisabled()) {
      await expect(
        page.getByText(/en attente d'arbitrage/i).first(),
      ).toBeVisible();
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

    // ----- 4. Soumettre au Referent CDP (vague 1 : PDFs + mail) -----
    await page
      .getByRole('button', { name: /soumettre au référent cdp/i })
      .click();
    await expect(page.getByText(/synthèse soumise/i)).toBeVisible({
      timeout: 60_000,
    });

    // ----- 5. Statut + PDFs disponibles -----
    await expect(
      page.getByText(/en attente d'arbitrage/i).first(),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /pdf complet/i }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /pdf cdp/i })).toBeVisible();
  });
});
