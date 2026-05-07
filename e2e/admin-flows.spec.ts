import { test, expect } from '@playwright/test';

/**
 * Flows critiques post-login. Necessite un storageState genere par
 * e2e/auth.setup.ts (qui lui-meme est gate par E2E_ADMIN_EMAIL/PASSWORD).
 *
 * Si le storageState n existe pas, les tests sont skipped (CI sans creds
 * = on ne casse pas le run). Quand l infra CI sera en place :
 *   - Definir E2E_ADMIN_EMAIL + E2E_ADMIN_PASSWORD dans secrets GitHub
 *   - Le job CI lance auth.setup avant les autres specs
 *   - Les flows tournent automatiquement a chaque PR
 */

import { existsSync } from 'node:fs';

const STORAGE = 'e2e/.auth/admin.json';

test.describe('Admin flows (necessite storageState)', () => {
  test.beforeAll(() => {
    if (!existsSync(STORAGE)) {
      test.skip(
        true,
        `Storage state manquant (${STORAGE}). Lancer auth.setup avec E2E_ADMIN_EMAIL/PASSWORD.`,
      );
    }
  });

  test.use({ storageState: STORAGE });

  test('dashboard charge sans flash UI vide (sprint 5 #3)', async ({
    page,
  }) => {
    await page.goto('/projets');
    // Sidebar doit etre rendue immediatement (server-side)
    await expect(
      page.getByRole('navigation', { name: /sidebar|menu/i }).first(),
    ).toBeVisible({ timeout: 2000 });
    // L user info doit etre presente sans flash null
    await expect(page.getByText(/projets/i).first()).toBeVisible();
  });

  test('navigation /facturation rend les onglets', async ({ page }) => {
    await page.goto('/facturation');
    await expect(page.getByRole('tab', { name: /factures/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /brouillons/i })).toBeVisible();
  });

  test('navigation /admin/utilisateurs (admin only)', async ({ page }) => {
    await page.goto('/admin/utilisateurs');
    // Pas de redirect vers /projets
    await expect(page).toHaveURL(/\/admin\/utilisateurs/);
  });
});
