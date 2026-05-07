import { test as setup, expect } from '@playwright/test';

/**
 * Setup d auth pour les tests e2e qui necessitent une session.
 *
 * Cree un storageState reutilise par les autres tests via :
 *   test.use({ storageState: 'e2e/.auth/admin.json' });
 *
 * Pre-requis (gates le run, skip si manquant) :
 *   - E2E_ADMIN_EMAIL    : email d un compte admin de test
 *   - E2E_ADMIN_PASSWORD : mot de passe associe
 *
 * Le compte doit exister AVANT de lancer ce setup. Recommandation :
 * - Creer un user admin dedie via /admin/utilisateurs (role=admin) ou
 *   via Supabase Studio. Email : ci-test@<your-domain>.test
 * - Stocker E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD dans :
 *     - .env.test.local (gitignore deja en place via .env*.local)
 *     - GitHub Actions secrets pour la CI
 *
 * NE JAMAIS hardcoder les creds dans ce fichier.
 */

const adminEmail = process.env.E2E_ADMIN_EMAIL;
const adminPassword = process.env.E2E_ADMIN_PASSWORD;

setup('authenticate as admin', async ({ page }) => {
  if (!adminEmail || !adminPassword) {
    setup.skip(
      true,
      'E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD non definis - skip auth.setup',
    );
    return;
  }

  await page.goto('/login');
  await page.getByLabel(/email/i).fill(adminEmail);
  await page.getByRole('textbox', { name: 'Mot de passe' }).fill(adminPassword);
  await page.getByRole('button', { name: /connexion|se connecter/i }).click();

  // Attend le redirect vers /projets (route par defaut post-login)
  await expect(page).toHaveURL(/\/projets/);

  // Persist la session pour les autres specs
  await page.context().storageState({ path: 'e2e/.auth/admin.json' });
});
