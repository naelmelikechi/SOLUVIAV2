import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['__tests__/**/*.test.ts', '__tests__/**/*.test.tsx'],
    exclude: ['node_modules', '.next', 'dist'],
    // Dummy NEXT_PUBLIC_* pour que @/lib/env (zod, evalue a l'import) ne jette
    // pas en CI ou aucun .env.local n'existe. Les tests ne doivent pas dependre
    // de l'env ambiant ; les vraies valeurs ne servent qu'au dev local.
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
    },
  },
});
