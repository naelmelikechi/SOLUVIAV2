import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Explicit project-wide rules for quality & maintainability (Phase 1.3)
    rules: {
      // Ban `any`, force explicit typing
      '@typescript-eslint/no-explicit-any': 'error',
      // Unused variables are errors, `_`-prefixed are intentional
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
      // Consistent type-only imports
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      // React hooks discipline
      'react-hooks/exhaustive-deps': 'error',
      // a11y rules promues en error (Sprint 4 : on durcit progressivement).
      // no-noninteractive-element-interactions reste warn car cas legitimes
      // (iframes externes, tooltips presentationnels).
      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/aria-props': 'error',
      'jsx-a11y/aria-role': 'error',
      'jsx-a11y/aria-unsupported-elements': 'error',
      'jsx-a11y/anchor-has-content': 'error',
      'jsx-a11y/anchor-is-valid': 'error',
      'jsx-a11y/click-events-have-key-events': 'error',
      'jsx-a11y/heading-has-content': 'error',
      'jsx-a11y/img-redundant-alt': 'error',
      'jsx-a11y/no-redundant-roles': 'error',
      'jsx-a11y/role-has-required-aria-props': 'error',
      'jsx-a11y/role-supports-aria-props': 'error',
      // Promues 'error' au sprint 5 #11 apres verification : 0 warning sur
      // le codebase actuel. Si une violation legitime apparait (iframe externe,
      // tooltip presentationnel), prefer un eslint-disable ciblee + commentaire
      // plutot que de redescendre toute la regle.
      'jsx-a11y/no-noninteractive-element-interactions': 'error',
      'jsx-a11y/no-static-element-interactions': 'error',
    },
  },
  {
    // logAudit() est fire-safe par design : la fonction defere l'INSERT
    // via Next.js `after()` en interne (voir lib/utils/audit.ts), donc
    // Vercel attend la fin avant tear-down sans bloquer la reponse. Pas
    // besoin de `await` ni de wrapper avec `after()` aux callsites - les
    // deux formes sont du bruit et faussent l'intention. Voir le test
    // d'invariant dans __tests__/audit.test.ts.
    files: ['lib/actions/**/*.ts', 'lib/actions/**/*.tsx', 'app/**/*.ts', 'app/**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "AwaitExpression > CallExpression[callee.name='logAudit']",
          message:
            "logAudit() est fire-safe (defere via after() en interne). Ne pas await.",
        },
        {
          selector: "CallExpression[callee.name='after'] > ArrowFunctionExpression > CallExpression[callee.name='logAudit']",
          message:
            "logAudit() est deja deferee via after() en interne (lib/utils/audit.ts). Ne pas la wrapper a nouveau.",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'playwright-report/**',
    'test-results/**',
  ]),
]);

export default eslintConfig;
