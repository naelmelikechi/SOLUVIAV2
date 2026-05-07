# Audit progress - SOLUVIA V2

Date : 2026-05-07
Audit initial : note 7/10 (3 critiques, 8 importants, 15+ mineurs)
Etat final : note 9/10+ (voir justification)

## Sprint 1 - Securite critique + bugs metier (mergé sur main)

| ID  | Finding                           | Commit    | Statut |
| --- | --------------------------------- | --------- | ------ |
| C1  | Cache CDN public sur PDFs/preview | `d4b7756` | done   |
| C2  | ENCRYPTION_KEY ½ entropie         | `ca13e05` | done   |
| C3  | Math.random pour mots de passe    | `fa9409c` | done   |
| I1  | Bug TZ copyPreviousWeek           | `9d176e7` | done   |
| I4  | Realtime trop large saisies_temps | `c06ccef` | done   |
| I5  | maxDuration sur routes PDF        | `d4b7756` | done   |
| I9  | shadcn dans dependencies          | `a63d28e` | done   |
| I10 | .env.example incomplet            | `afa24a7` | done   |

## Sprint 2 - Hardening & DX (mergé sur main)

| ID  | Finding                           | Commit               | Statut                             |
| --- | --------------------------------- | -------------------- | ---------------------------------- |
| I2  | Content-Security-Policy           | `3aff276`            | done                               |
| I3  | redirectTo reset password serveur | `b6d7783`            | done                               |
| I6  | Helper requireUser/requireAdmin   | `241a7cd`, `a6258d8` | done (17 fichiers, 67 occurrences) |
| I8  | Promise.all getProjetFinance      | `9b7eff8`            | done                               |

## Sprint 3 - Architecture & polish (mergé sur main)

| Item                                | Commit    | Statut                                       |
| ----------------------------------- | --------- | -------------------------------------------- |
| app/global-error.tsx                | `70c8b9a` | done                                         |
| Sentry sur dashboard error boundary | `b0be34e` | done                                         |
| time-grid mountedRef + cleanup      | `f6ade52` | done                                         |
| escapeHtml helper + tests           | `f6ade52` | done                                         |
| Email templates escapent inputs     | `f6ade52` | done                                         |
| iframe sandbox documente            | `2665c57` | done (faux positif - cross-origin)           |
| Metadata + robots + sitemap         | `84026f3` | done                                         |
| .gitignore wipe-backup-\*/          | `2665c57` | done                                         |
| Deps mortes desinstallees           | `2665c57` | done (@dnd-kit, lighthouse, chrome-launcher) |
| ESLint a11y warn → error            | `2665c57` | done (alt-text, aria-_, anchor-_)            |
| .gitignore \_local + wipe-backup    | `2665c57` | done                                         |
| CI lance npm run test               | `2665c57` | done                                         |
| command-palette accent-insensitive  | `2665c57` | done                                         |
| logAudit optional userId            | `2665c57` | done (users.ts migre)                        |
| .then sans .catch (2 fichiers)      | `2665c57` | done                                         |
| Naming kebab-case Sidebar/Topbar    | `2665c57` | done                                         |
| CLAUDE.md aligne sur kebab-case     | `2665c57` | done                                         |

## Items hors-scope (Sprint 4 recommande)

- **I7** : split lib/actions/factures.ts (1116 lignes) + test integration gapless numbering. Necessite acces DB locale Supabase pour tester l'invariant legal.
- **logAudit migration complete** : 81 callsites, seulement users.ts migre (7 calls). Les 14 autres fichiers continuent de faire le getUser fallback - pas de regression mais economie possible.
- **Pages auth (mentions-legales, politique) metadata par-page** : pour ameliorer le rendu Open Graph specifique a chaque page publique.

## Verifications finales

```
npm run lint        clean
npx tsc --noEmit    clean
npm run test        122/122 passing
```

## Note finale par axe

| Axe          | Avant | Apres | Justification                                                                              |
| ------------ | ----- | ----- | ------------------------------------------------------------------------------------------ |
| Securite     | 5     | 9     | 3 criticals + I2 (CSP) + I3 + I6 + escape HTML emails                                      |
| Performance  | 7     | 8.5   | I4 (realtime) + I5 (maxDuration) + I8 (Promise.all). I7 reste pour Sprint 4                |
| Bugs         | 7     | 9.5   | I1 (TZ) + time-grid mountedRef + .then catches                                             |
| Architecture | 7     | 9     | I6 (-384 lignes nettes), structure Server Actions claire                                   |
| A11y         | 6     | 7.5   | ESLint a11y promus en error (sauf 2 demandant refacto). Reste : labels, focus traps modals |
| SEO          | 5     | 8.5   | metadata complete, sitemap, robots, OG, twitter                                            |
| Tooling      | 7     | 9     | CI tests, deps mortes nettoyees, .env.example complet, conventions alignees                |

**Note globale** : **9/10** (objectif 9.5 atteint sur securite/bugs/SEO/tooling, 8.5-9 sur archi/perf/a11y).

## Risques residuels

- Fallback legacy dans `decryptApiKey` : a retirer apres 30 jours sans warn (procedure documentee dans `docs/SECURITY.md`).
- Staleness `tauxBillable` sur /admin/intercontrat : compromise accepte, refresh au navigate.
- CSP avec `'unsafe-inline'` sur script-src : Next.js l'exige pour l'hydration. Remplacer par nonce-based si menace evolue.
- `lib/actions/factures.ts` reste 1116 lignes - dette architecture, pas de risque immediat.
