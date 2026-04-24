# SOLUVIA

Plateforme de pilotage stratégique pour organismes de formation français.
Lit les données opérationnelles depuis Eduvia, gère les processus internes
(suivi de temps, qualité, facturation) et pousse les factures vers Odoo.

## Stack

- **Frontend** : Next.js 16 (App Router), React 19, TypeScript 5 (strict)
- **UI** : TailwindCSS 4 + shadcn/ui (base-ui)
- **Backend** : Supabase (PostgreSQL + RLS + Auth + Storage + Realtime)
- **Intégrations** : Eduvia API (sync contrats/apprenants), Resend (emails), Odoo (désactivé)
- **Monitoring** : Sentry (gated sur DSN), Vercel Analytics + Speed Insights
- **Rate limiting** : Upstash Redis (gated sur URL/TOKEN)
- **Déploiement** : Vercel (région `cdg1`), crons Vercel

Spécifications détaillées : `specs/00-09*.html`.

## Démarrage local

### Prérequis

- Node.js 24 (LTS recommandé)
- Docker (pour Supabase local)
- Supabase CLI (`npm install -g supabase` ou via `npx supabase`)
- Compte Vercel si tu veux tester les crons/previews

### Setup

```bash
# 1. Dépendances
npm install

# 2. Copier les variables d'environnement
cp .env.example .env.local
# Remplir les valeurs (voir "Variables d'environnement" ci-dessous)

# 3. Démarrer Supabase local
npx supabase start
# Note les URL/clés affichées dans la sortie

# 4. Appliquer les migrations
npx supabase db push

# 5. Régénérer les types TypeScript
npx supabase gen types typescript --local > types/database.ts

# 6. Lancer le serveur de dev
npm run dev
# http://localhost:3000
```

### Scripts

| Commande                                                        | Description                         |
| --------------------------------------------------------------- | ----------------------------------- |
| `npm run dev`                                                   | Serveur de dev (Turbopack)          |
| `npm run build`                                                 | Build de production                 |
| `npm run start`                                                 | Serveur de production (après build) |
| `npm run lint`                                                  | ESLint                              |
| `npm run typecheck`                                             | TypeScript `--noEmit`               |
| `npx supabase start`                                            | Démarre Supabase local (Docker)     |
| `npx supabase stop`                                             | Arrête Supabase local               |
| `npx supabase db push`                                          | Applique les migrations             |
| `npx supabase gen types typescript --local > types/database.ts` | Régénère les types TS               |

## Variables d'environnement

Fichier `.env.local` à la racine. Les variables `NEXT_PUBLIC_*` sont
exposées au client (inlinées au build). Toutes les autres restent côté
serveur uniquement.

### Requises

- `NEXT_PUBLIC_SUPABASE_URL` — URL du projet Supabase
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — clé anonyme
- `SUPABASE_SERVICE_ROLE_KEY` — clé service-role, pour CRON + admin ops
- `ENCRYPTION_KEY` — 32+ caractères, pour chiffrer les clés API Eduvia
- `CRON_SECRET` — 16+ caractères, bearer auth des routes cron

**Attention** : en production (`VERCEL_ENV === 'production'`), les 3
dernières sont exigées par `lib/env.ts::superRefine`. Sans elles, le
boot échoue. Preview et dev n'ont pas cette contrainte.

### Optionnelles

- `RESEND_API_KEY` — emails transactionnels (sinon emails skippés)
- `GIPHY_API_KEY` — recherche GIF dans le chat équipe
- `AVATAR_UNLOCK_SECRET` — 20 chars, easter egg freeze avatar
- `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` — error tracking (gated)
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` — rate limit
  auth (gated, fail-open sans)

## Architecture

### Routes App Router

- `(auth)` — pages publiques : `/login`, `/forgot-password`, `/set-password`,
  `/mentions-legales`, `/politique-de-confidentialite`
- `(dashboard)` — application authentifiée : `/projets`, `/facturation`,
  `/temps`, `/qualite`, `/indicateurs`, `/equipe`, `/admin/*`, etc.
- `api/` — route handlers :
  - `api/auth/callback` — callback reset password
  - `api/cron/*` — 10 jobs cron (voir `docs/CRONS.md`)
  - `api/sync/eduvia` — sync quotidien Eduvia
  - `api/factures/[ref]/pdf` — rendu PDF facture
  - `api/echeances/[id]/pdf-preview` — aperçu PDF échéance

### Proxy (`proxy.ts`)

Next.js 16 utilise `proxy.ts` au lieu de `middleware.ts`. Il gère :

- Skip des assets statiques et des routes API
- Redirection login/auth (throttle refresh session à 5 min)
- Redirection vers `/login` si pas de cookie Supabase

### Données

Tables SQL en français, snake_case. UUID PK, soft delete via `archive`.
Refs métier générées par triggers (projets `0042-DUP-APP`, contrats `CTR-00187`,
factures `FAC-DUP-0012`).

**Factures gapless** : numérotation séquentielle sans trou (exigence légale
française). Pas de policy DELETE, `LOCK TABLE + MAX(numero_seq)+1`. Voir
`docs/numerotation-factures.md`.

**RLS** : toutes les tables métier ont Row Level Security activé. Admin
voit tout (`is_admin()`). CDP filtré par `cdp_id = auth.uid() OR
backup_cdp_id = auth.uid()` sur les projets et cascade.

### Rôles

- `admin` / `superadmin` — accès complet
- `cdp` (Chef de Projet) — périmètre filtré par projet
- `commercial` — rôle dormant, remplacé par l'attribut `users.pipeline_access`

### Conventions

- Composants : PascalCase (`Sidebar.tsx`)
- Utilitaires : camelCase (`formatters.ts`)
- Domaine en français (projet, contrat, facture, qualité, temps)
- UI en français, **pas d'em-dash** (`—`), uniquement hyphens simples (`-`)
- DataTable partagé : `components/shared/data-table/`
- Auto-save : `useDebounce` 2s (temps tracking)

## Déploiement

Voir [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) pour :

- Workflow push → auto-deploy Vercel
- Recommandation : utiliser des feature branches (preview automatique)
- Procédure de rollback
- Incident checklist (prod down)

## Crons

11 jobs cron schedulés via `vercel.json`. Documentation complète dans
[`docs/CRONS.md`](docs/CRONS.md) : schedule, finalité, error handling,
observation.

## Sécurité

- Headers HTTP durcis (`next.config.ts`) : HSTS preload, X-Frame-Options DENY,
  X-Content-Type-Options nosniff, Referrer-Policy, Permissions-Policy
- Chiffrement AES-256-GCM des clés API Eduvia (`lib/utils/encryption.ts`)
- `CRON_SECRET` avec `timingSafeEqual` (`lib/utils/cron-auth.ts`)
- Rate limit Upstash sur `/login` (5/5min) et reset password (3/h)
- Supabase RLS comme défense en profondeur sur toutes les tables
- Storage policies scopées par owner + jointure sur tables de métadonnées

## Stack tests

Aucune suite de tests automatisés pour l'instant. Le CI valide :

- `npm run lint`
- `npm run typecheck`
- `npm run build`

Ajouter des tests sur les invariants critiques (gapless facturation,
chiffrement clés API, sync Eduvia) est dans le backlog.

## Aide au debug

- Logs Vercel : `vercel logs <deployment-url>`
- Logs Supabase : dashboard Supabase → Logs
- Sentry (si configuré) : dashboard Sentry
- Correlation ID : chaque requête Vercel a un `x-vercel-id` header,
  affiché aussi dans les logs (voir `lib/utils/request-id.ts`)

## Licence

Propriétaire — SOLUVIA. Voir `app/(auth)/mentions-legales/page.tsx`.
