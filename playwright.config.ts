import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright e2e config (sprint 6).
 *
 * Lance automatiquement le dev server Next sur :3000 et execute les tests
 * dans `e2e/`. Les tests qui ont besoin d'une session authentifiee
 * utilisent storageState pre-genere dans `e2e/auth.setup.ts`.
 *
 * Pour lancer en local :
 *   npm run test:e2e            # headless
 *   npm run test:e2e -- --ui    # mode UI Playwright
 *
 * Sur CI (Vercel preview, GitHub Actions) : config auto-detecte CI=true
 * via `process.env.CI` -> retries activees, workers reduit, no headed.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Demarre le dev server automatiquement si on n attaque pas une URL deja
  // up. PLAYWRIGHT_BASE_URL=https://preview.vercel.app skip ce step.
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
