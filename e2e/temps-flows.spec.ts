import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';

/**
 * Flows fiche de temps. Couvre les scenarios cles remontes utilisateur :
 *
 *  - "supprimer un conge sur une autre semaine" : avant le fix, le panneau
 *    rafraichissait via router.refresh() qui rerendait la semaine 0
 *    (codee en dur dans page.tsx), pas la semaine vue. Le delete passait
 *    en DB mais l UI ne le refletait jamais.
 *
 * Skip si E2E_ADMIN_EMAIL/PASSWORD ne sont pas configures (meme pattern
 * que admin-flows.spec.ts).
 */

const STORAGE = 'e2e/.auth/admin.json';

test.describe('Temps flows (necessite storageState)', () => {
  test.beforeAll(() => {
    if (!existsSync(STORAGE)) {
      test.skip(
        true,
        `Storage state manquant (${STORAGE}). Lancer auth.setup avec E2E_ADMIN_EMAIL/PASSWORD.`,
      );
    }
  });

  test.use({ storageState: STORAGE });

  test('navigation semaine recharge absences + jours feries', async ({
    page,
  }) => {
    await page.goto('/temps');

    // Navigateur de semaine present
    await expect(
      page.getByRole('button', { name: /semaine suivante/i }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /semaine précédente/i }),
    ).toBeVisible();

    // Naviguer 4 semaines en avant ; le panneau "Cette semaine" doit
    // rester monte et lisible sans afficher de stale absences.
    // NB : on attend le changement du libelle de plage ("8 - 14 juin 2026") -
    // l'ancien garde "Chargement..." ne matchait jamais (l'UI rend "…").
    const next = page.getByRole('button', { name: /semaine suivante/i });
    const rangeLabel = page.getByText(/^\d{1,2} - \d{1,2} /).first();
    for (let i = 0; i < 4; i++) {
      const before = await rangeLabel.textContent();
      await next.click();
      await expect(rangeLabel).not.toHaveText(before ?? '', { timeout: 5000 });
    }

    await expect(page.getByText(/Cette semaine/i).first()).toBeVisible();
  });

  test('creer puis supprimer un conge sur la semaine suivante', async ({
    page,
  }) => {
    await page.goto('/temps');

    // Aller sur S+1. Attendre que le libelle de plage CHANGE : ouvrir le
    // formulaire avant la fin de la transition ferait monter le formulaire
    // avec les weekDates de la semaine courante (date par defaut = today).
    const rangeLabel = page.getByText(/^\d{1,2} - \d{1,2} /).first();
    const before = await rangeLabel.textContent();
    await page.getByRole('button', { name: /semaine suivante/i }).click();
    await expect(rangeLabel).not.toHaveText(before ?? '', { timeout: 5000 });

    // Ouvrir le formulaire "Ajouter une absence"
    await page.getByRole('button', { name: /ajouter une absence/i }).click();

    // Type conges par defaut. La date par defaut est dans la semaine vue
    // (fix de la session : auparavant c etait toujours `today` qui pouvait
    // tomber en dehors). On soumet sans toucher aux dates.
    // NB : pas d'ancre $ - le bouton porte aussi le hint clavier ("Créer ⌘↵").
    await page.getByRole('button', { name: /^créer/i }).click();

    // Toast de succes
    await expect(page.getByText(/Absence enregistrée/i)).toBeVisible({
      timeout: 5000,
    });

    // Le bouton "Modifier l absence" doit apparaitre sur le jour selectionne
    // (le panneau renvoie en mode list, la pastille "Congés" est cliquable).
    await expect(page.getByText(/Congés/).first()).toBeVisible();

    // Cliquer sur la pastille pour editer
    await page
      .getByText(/Congés/)
      .first()
      .click();

    // Cliquer "Supprimer"
    await page.getByRole('button', { name: /^supprimer$/i }).click();

    // Toast de succes
    await expect(page.getByText(/Absence supprimée/i)).toBeVisible({
      timeout: 5000,
    });

    // La pastille "Congés" disparait du panneau SUR LA MEME SEMAINE
    // (regression test du bug "router.refresh rerend semaine 0")
    await expect(page.getByText(/Congés/)).toHaveCount(0, { timeout: 3000 });
  });
});
