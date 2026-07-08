import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      '__tests__/**/*.test.ts',
      '__tests__/**/*.test.tsx',
      'lib/crm/**/*.test.ts',
      'lib/crm/**/*.test.tsx',
    ],
    exclude: ['node_modules', '.next', 'dist'],
    // Dummy NEXT_PUBLIC_* pour que @/lib/env (zod, evalue a l'import) ne jette
    // pas en CI ou aucun .env.local n'existe. Les tests ne doivent pas dependre
    // de l'env ambiant ; les vraies valeurs ne servent qu'au dev local.
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
    },
    coverage: {
      provider: 'v8',
      // Scope la couverture aux deux zones à seuils : force TOUS leurs fichiers
      // dans le rapport à chaque run (dénominateur déterministe). Sans ça, la
      // couverture v8 sous workers parallèles peut omettre un fichier du rapport
      // en CI (ex. echeancier/ajustements.ts mesuré 81% en local mais ~28% en
      // CI selon le sharding), faisant chuter la zone sous son seuil de façon
      // non déterministe.
      include: ['lib/echeancier/**', 'lib/queries/billable-events/**'],
      // Filets anti-regression sur les deux zones critiques de calcul
      // (echeanciers contractuels + evenements facturables). Valeurs fixees
      // ~5 points SOUS la couverture mesuree le 2026-07-02 (agregat par zone :
      // echeancier 56/42/81/58, billable-events 69/60/72/73) : le but est de
      // bloquer une regression de couverture, pas d'imposer un objectif.
      thresholds: {
        'lib/echeancier/**': {
          statements: 51,
          branches: 37,
          functions: 76,
          lines: 53,
        },
        'lib/queries/billable-events/**': {
          statements: 64,
          branches: 55,
          functions: 67,
          lines: 68,
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
    },
  },
});
