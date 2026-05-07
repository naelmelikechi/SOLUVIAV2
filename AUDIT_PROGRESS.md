# Audit progress - SOLUVIA V2

Date : 2026-05-07
Audit initial : note 7/10 (3 critiques, 8 importants, 15+ mineurs)
Etat final : **note 9.5/10** apres 4 sprints (voir justification)

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

## Sprint 4 - Architecture finale & a11y deep dive (mergé sur main)

| Item                                               | Commit    | Statut                                                          |
| -------------------------------------------------- | --------- | --------------------------------------------------------------- |
| I7a - split lib/actions/factures.ts en 4 modules   | `7cc3935` | done (brouillons, emission, avoirs, payments + index barrel)    |
| I7b - tests d'integrite gapless invoice numbering  | `56bfcc5` | done (8 tests : sendFacture + deleteBrouillon)                  |
| logAudit migration complete (14 fichiers restants) | `ac2a08a` | done (73 callsites migres, total 80/80)                         |
| A11y deep dive                                     | `bc6e796` | done (a11y rules promues, 7 violations fixees, 0 warning final) |

## Items hors-scope (Sprint 5+ recommande)

- **Tests d'integration SQL** : trigger BEFORE UPDATE pour ref + numero_seq atomique, RLS DELETE policies, concurrence sendFacture. Necessite Supabase local + migration de test, hors scope vitest pure.
- **Tests e2e Playwright** : flows critiques login → facturation → emission → email. Necessite infrastructure DB de test (Supabase branch ou docker-compose) et fixtures auth.
- **Pages auth (mentions-legales, politique) metadata par-page** : pour ameliorer le rendu Open Graph specifique a chaque page publique.
- **Drag-and-drop kanban a11y** : pipeline-board, idea-column ont des limitations HTML5 DnD natives (non-keyboard accessible). Une alternative existe (menu deroulant change-de-statut) mais pourrait etre rendue plus visible.

## Verifications finales (apres Sprint 4)

```
npm run lint        0 errors, 0 warnings
npx tsc --noEmit    clean
npm run test        130/130 passing (13 fichiers)
```

## Note finale par axe (apres 4 sprints)

| Axe          | Avant | S1-3 | **S4**  | Justification                                               |
| ------------ | ----- | ---- | ------- | ----------------------------------------------------------- |
| Securite     | 5     | 9    | **9.5** | 3 criticals + CSP + I3 + helpers + escape + a11y aria-roles |
| Performance  | 7     | 8.5  | **9**   | I4 + I5 + I8 + logAudit (-80 round-trips auth)              |
| Bugs         | 7     | 9.5  | **9.5** | I1 + time-grid + .then catches                              |
| Architecture | 7     | 9    | **9.5** | I6 + I7 (split factures) + barrel pattern propre            |
| A11y         | 6     | 7.5  | **9**   | a11y rules promues, 7 violations fixees, 0 warning          |
| SEO          | 5     | 8.5  | **8.5** | metadata + sitemap + robots + OG (inchange)                 |
| Tooling      | 7     | 9    | **9.5** | CI tests + deps mortes + tests d'invariants metier          |

**Note globale : 9.5/10** (objectif atteint).

## Risques residuels

- Fallback legacy dans `decryptApiKey` : a retirer apres 30 jours sans warn (procedure documentee dans `docs/SECURITY.md`).
- Staleness `tauxBillable` sur /admin/intercontrat : compromise accepte, refresh au navigate.
- CSP avec `'unsafe-inline'` sur script-src : Next.js l'exige pour l'hydration. Remplacer par nonce-based si menace evolue.
- Drag-and-drop kanban : limitations clavier HTML5 DnD native. Alternative menu deroulant existe mais pourrait etre rendue plus visible.
- Invariants gapless DB-level (trigger atomic, RLS DELETE, concurrence) : non couverts par tests vitest, prevus pour Sprint 5+ via tests SQL contre Supabase local.
