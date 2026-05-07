import { test, expect } from '@playwright/test';

/**
 * Smoke tests : verifient que l app boot, que le router proxy.ts fait
 * son job, et que les pages publiques rendent.
 *
 * NE NECESSITE PAS de session Supabase (tests anonymes). Les tests qui
 * requierent une session vivront dans des fichiers separes avec un
 * `test.use({ storageState: ... })` qui pointe vers un compte CI dedie.
 */

test.describe('Smoke - acces anonyme', () => {
  test('redirect / -> /login quand non authentifie', async ({ page }) => {
    const response = await page.goto('/');
    // Le proxy redirige immediatement vers /login en absence de cookie sb-*
    expect(page.url()).toMatch(/\/login$/);
    expect(response?.status()).toBeLessThan(400);
  });

  test('redirect /projets -> /login quand non authentifie', async ({
    page,
  }) => {
    await page.goto('/projets');
    expect(page.url()).toMatch(/\/login$/);
  });

  test('page /login rend le formulaire email + password', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(
      page.getByRole('textbox', { name: 'Mot de passe' }),
    ).toBeVisible();
  });

  test('page /mentions-legales accessible sans login', async ({ page }) => {
    const response = await page.goto('/mentions-legales');
    expect(response?.status()).toBeLessThan(400);
    // La page doit rendre du contenu (pas un blank).
    const body = await page.textContent('body');
    expect(body?.trim().length ?? 0).toBeGreaterThan(50);
  });

  test('page /politique-de-confidentialite accessible sans login', async ({
    page,
  }) => {
    const response = await page.goto('/politique-de-confidentialite');
    expect(response?.status()).toBeLessThan(400);
  });

  test('login avec credentials invalides reste sur /login + erreur', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('nobody@example.com');
    await page
      .getByRole('textbox', { name: 'Mot de passe' })
      .fill('wrong-password-1234');
    await page.getByRole('button', { name: /connexion|se connecter/i }).click();
    // Reste sur login (pas de redirect projets)
    await expect(page).toHaveURL(/\/login/);
    // Le message d erreur "Identifiants invalides" finit par apparaitre.
    await expect(page.getByText(/identifiants invalides/i)).toBeVisible({
      timeout: 5_000,
    });
  });
});
