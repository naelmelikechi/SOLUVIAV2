# Phase 1 — Socle CRM « Perf » dans SOLUVIA (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` (recommandé) ou `superpowers:executing-plans`. Étapes en cases à cocher (`- [ ]`).

**Goal :** Monter, dans l'app SOLUVIA (`app.mysoluvia`), le CRM commercial dupliqué depuis `outilcommercialPerf`, **au rendu identique à perf**, accessible aux **commerciaux + admins**, avec **un seul login** (auth SOLUVIA) et **zéro import** du repo perf.

**Architecture :** Le CRM est un **segment de route dédié `app/crm/*`** avec **sa propre coquille** (sidebar/topbar de perf dupliqués) — hors du `DashboardShell` SOLUVIA, pour ressembler exactement à perf. Il partage l'**auth + le projet Supabase SOLUVIA**, mais ses tables vivent dans un **schéma Postgres `crm`** (aucune collision). La couche auth de perf (`profiles`/`admin|membre`) est **remappée** sur `public.users`/rôles SOLUVIA. Cette phase n'enlève **rien** de l'existant `/commercial/*` (fait en phase 2).

**Tech Stack :** Next 16 (App Router, RSC, Server Actions) · React 19 · @supabase/ssr · Tailwind v4 · @base-ui/react · react-hook-form + zod · @dnd-kit/core · react-big-calendar · recharts · @tanstack/react-table · Resend.

**Réfs source (lecture, ne pas importer) :** `/Users/nael/Developer/outilcommercialPerf/` (routes `app/(app)/*`, `components/*`, `lib/*`, `supabase/migrations/0001→0016`, `seed.sql`).

**Convention de nommage (duplication) :** tout l'arbre perf → sous SOLUVIA :
`app/(app)/<x>` → `app/crm/<x>` · `components/<d>` → `components/crm/<d>` ·
`lib/<m>` → `lib/crm/<m>`. Tous les imports `@/…` du code copié sont réécrits
vers leur équivalent `@/…/crm/…`. **Aucun** chemin ne pointe vers le repo perf.

---

## Décisions verrouillées (contexte)

- **Emplacement** : `app/crm/*` (segment réel `/crm`, PAS un route-group), car les routes perf (`/dashboard`, `/pipeline`…) collisionnent avec SOLUVIA → préfixe `/crm/`.
- **Accès** : gate `canAccessPipeline(role, pipeline_access)` (= admin || pipeline_access, couvre les commerciaux) ; `/crm/recap` en plus `isAdmin`.
- **Données** : schéma Postgres `crm` dans le projet Supabase SOLUVIA.
- **Auth** : on **supprime** `profiles`, `handle_new_user`, l'écran `/utilisateurs` et `/compte` de perf ; on réutilise `public.users` + `/admin/utilisateurs` + `/parametres-compte` de SOLUVIA. Toutes les FK perf `→ profiles(id)` deviennent `→ public.users(id)`.
- **Notifications CRM** : table `crm.notifications` propre (cloche dans la coquille CRM), distincte des notifications SOLUVIA.
- **UI** : on **duplique aussi** `components/ui/*` de perf sous `components/crm/ui/*` + le thème perf **scopé** au sous-arbre `/crm`, pour une fidélité pixel et zéro couplage au design-system SOLUVIA.

---

## Structure de fichiers (cible)

| Zone       | Fichiers créés                                                                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Routes     | `app/crm/layout.tsx`, `app/crm/{dashboard,pipeline,relances,rdv,recap}/page.tsx`, `app/crm/{loading,error,not-found}.tsx`, `app/api/cron/crm-recap/route.ts` |
| Composants | `components/crm/{layout,pipeline,rdv,relances,dashboard,recap,shared,ui}/*`                                                                                  |
| Lib        | `lib/crm/{supabase,auth,queries,actions,domain,validators,notifications}/*`, `lib/crm/{email,recap,format,labels,utils}.ts`, `lib/crm/database.types.ts`     |
| DB         | `supabase/migrations/<ts>_crm_schema.sql`                                                                                                                    |
| Config     | `package.json` (déps), `supabase/config.toml` (schemas), `vercel.json` (cron), `app/crm/crm-theme.css`                                                       |

---

## Task 1 : Dépendances npm

**Files :** `package.json`

- [ ] **Step 1 — Ajouter les déps manquantes** (vérifiées comme réellement importées par perf) :

```bash
npm i react-hook-form@^7.80.0 @hookform/resolvers@^5.4.0 @dnd-kit/core@^6.3.1 react-big-calendar@^1.20.0
npm i -D @types/react-big-calendar@^1.16.3
```

- [ ] **Step 2 — NE PAS ajouter** `@dnd-kit/sortable` ni `@dnd-kit/utilities` (déclarés chez perf mais jamais importés — le kanban n'utilise que `@dnd-kit/core`).
- [ ] **Step 3 — Aligner** `@base-ui/react` (perf ^1.6.0 > SOLUVIA ^1.3.0) et `lucide-react` (perf ^1.21.0 > SOLUVIA ^1.8.0) vers les versions perf, car les primitives `components/crm/ui/*` en dépendent : `npm i @base-ui/react@^1.6.0 lucide-react@^1.21.0`.
- [ ] **Step 4 — Vérifier présents** (aucun ajout) : `@tanstack/react-table`, `recharts`, `cmdk`, `sonner`, `date-fns`, `next-themes`, `zod`, `class-variance-authority`, `clsx`, `tailwind-merge`, `tw-animate-css`.
- [ ] **Step 5 — `npm run build`** : Attendu PASS (pas encore de code CRM, on valide juste l'install + l'alignement de versions ui existant SOLUVIA).
- [ ] **Step 6 — Commit** : `chore(crm): add react-hook-form, dnd-kit/core, react-big-calendar; align base-ui/lucide`.

---

## Task 2 : Schéma Postgres `crm` (migration)

**Files :** `supabase/migrations/<timestamp>_crm_schema.sql` (créer), `supabase/config.toml` (modifier)

Adapter les migrations perf `0001→0016` + `seed.sql` en **une** migration namespacée. Règles de portage :

- `create schema if not exists crm;` en tête ; toutes les tables/fn/trigger/index préfixés `crm.`.
- **Supprimer** `profiles`, `handle_new_user`, `prevent_profile_priv_escalation`, `is_admin()` de perf.
- Remplacer **toute** FK `references profiles(id)` par `references public.users(id)` (même `on delete` : `set null` / `cascade` selon l'original).
- Conserver : `etapes, comptes, contacts, adresses, opportunites, activites, relances, rdv, rdv_commerciaux, notifications, recaps` + enums CHECK + RPC `create_opportunite_complete` + `set_updated_at()` + index + contraintes CHECK (0015).
- `rdv_commerciaux.profile_id` → renommer `user_id references public.users(id) on delete cascade` (M2M rdv↔users).
- `notifications.user_id/actor_id` → `public.users(id)`.

- [ ] **Step 1 — Écrire l'en-tête + schéma + `set_updated_at`** :

```sql
-- CRM (dup. outilcommercialPerf) — schéma isolé, FK vers public.users
create schema if not exists crm;
create extension if not exists pgcrypto;

create or replace function crm.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
```

- [ ] **Step 2 — Porter les 11 tables** depuis `0001_init.sql`, `0004` (rdv_commerciaux), `0007` (colonnes création unifiée : `comptes.nombre_collaborateurs`, `opportunites.cfa`, `opportunites.date_cible_prochain_rdv`), `0008` (`relances.archived_at`), `0009` (`adresses`), `0011` (`notifications`), `0013` (`recaps`), `0015` (CHECK), en préfixant `crm.` et en repointant les FK profiles→`public.users`. Exemple (opportunites) :

```sql
create table crm.opportunites (
  id uuid primary key default gen_random_uuid(),
  intitule text not null,
  compte_id uuid not null references crm.comptes(id) on delete cascade,
  contact_principal_id uuid references crm.contacts(id) on delete set null,
  etape_id uuid not null references crm.etapes(id) on delete restrict,
  montant numeric(12,2) default 0 check (montant >= 0),
  probabilite int default 0 check (probabilite between 0 and 100),
  date_cloture_prevue date,
  statut text not null default 'ouverte' check (statut in ('ouverte','gagnee','perdue')),
  motif_perte text,
  nb_alternants int default 1 check (nb_alternants >= 0),
  formation_visee text, date_demarrage_souhaitee date, source text,
  cfa boolean not null default false,
  date_cible_prochain_rdv date,
  owner_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger opportunites_updated before update on crm.opportunites for each row execute function crm.set_updated_at();
create index opportunites_compte_idx on crm.opportunites(compte_id);
create index opportunites_etape_idx on crm.opportunites(etape_id);
```

- [ ] **Step 3 — Porter la RPC `create_opportunite_complete`** depuis `0012` en `crm.create_opportunite_complete(p jsonb) returns uuid` (SECURITY INVOKER), en qualifiant les tables `crm.*` et les FK utilisateur sur `public.users`.
- [ ] **Step 4 — RLS « équipe de confiance », gate SOLUVIA.** Activer RLS sur toutes les tables `crm.*` ; policies via les helpers DB SOLUVIA existants :

```sql
alter table crm.comptes enable row level security;
create policy crm_comptes_all on crm.comptes for all
  using (public.has_pipeline_access() or public.is_admin())
  with check (public.has_pipeline_access() or public.is_admin());
-- idem pour etapes/contacts/adresses/opportunites/activites/relances/rdv/rdv_commerciaux
-- notifications : owner-only (user_id = auth.uid()); recaps : select is_admin(), insert trigger='manuel'
```

- [ ] **Step 5 — Seed 7 étapes** (depuis `seed.sql`) : `insert into crm.etapes (libelle, ordre, couleur, type) values …`.
- [ ] **Step 6 — Exposer le schéma `crm`.** Dans `supabase/config.toml` (local) : `schemas = ["public", "graphql_public", "crm"]`. **Prod** : ajouter `crm` dans Dashboard → Settings → API → Exposed schemas (noter dans le runbook — non versionné).
- [ ] **Step 7 — Appliquer** la migration (procédure repo : SQL Editor Studio / `db:migrate`) sur la base de dev. **NE PAS régénérer** les types via `supabase gen types` : `lib/crm/database.types.ts` est **écrit à la main** (rebranché sur `public.users` + unions littérales locales) et serait écrasé par la génération. À toute évolution du schéma `crm`, éditer ce fichier à la main pour qu'il corresponde.
- [ ] **Step 8 — Vérifier** : `select * from crm.etapes;` renvoie 7 lignes ; `\d crm.opportunites` montre `owner_id → public.users`.
- [ ] **Step 9 — Commit** : `feat(crm): crm schema (tables/rpc/rls) mapped onto public.users`.

---

## Task 3 : Clients Supabase CRM (schéma `crm`)

**Files :** `lib/crm/supabase/{server,client,admin}.ts` (créer)

Réutilise le pattern SOLUVIA (`lib/supabase/server.ts`) mais **scopé au schéma `crm`** et typé sur les types régénérés. Les cookies/auth restent ceux de SOLUVIA → session partagée.

- [ ] **Step 1 — `lib/crm/supabase/server.ts`** :

```ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';
import type { Database } from '@/lib/crm/database.types';

export async function createCrmClient() {
  const cookieStore = await cookies();
  return createServerClient<Database, 'crm'>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      db: { schema: 'crm' },
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {}
        },
      },
    },
  );
}
```

- [ ] **Step 2 — `lib/crm/supabase/admin.ts`** : `createServerClient<Database,'crm'>(URL, SERVICE_ROLE_KEY, { db:{schema:'crm'}, cookies:{ getAll:()=>[], setAll(){} } })` (server-only, pour le cron récap + inserts SECURITY DEFINER-like). Réutiliser `env.SUPABASE_SERVICE_ROLE_KEY`.
- [ ] **Step 3 — `lib/crm/supabase/client.ts`** : `createBrowserClient<Database,'crm'>(URL, ANON, { db:{schema:'crm'} })` (kanban Realtime).
- [ ] **Step 4 — Vérifier typé** : `tsc --noEmit` ne relève pas d'erreur sur `createCrmClient().from('opportunites')`.
- [ ] **Step 5 — Commit** : `feat(crm): schema-scoped supabase clients`.

---

## Task 4 : Remap de la couche auth CRM → SOLUVIA

**Files :** `lib/crm/auth/roles.ts`, `lib/crm/auth/hidden.ts` (créer)

Remplace `lib/auth/roles.ts` de perf. **Ne pas** porter `getCurrentProfile` (table `profiles`) : s'appuyer sur `getUser()` SOLUVIA + helpers `roles`.

- [ ] **Step 1 — `lib/crm/auth/roles.ts`** (interface identique à perf pour minimiser les diffs dans le code copié) :

```ts
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { getUser } from '@/lib/queries/users';
import { isAdmin, canAccessPipeline } from '@/lib/utils/roles';

export type CrmRole = 'admin' | 'membre';
export type CurrentProfile = {
  id: string;
  email: string | null;
  nom_complet: string | null;
  avatar_url: string | null;
  role: CrmRole;
};

export const getCurrentProfile = cache(
  async (): Promise<CurrentProfile | null> => {
    const u = await getUser();
    if (!u) return null;
    return {
      id: u.id,
      email: u.email ?? null,
      nom_complet:
        [u.prenom, u.nom].filter(Boolean).join(' ') || (u.email ?? null),
      avatar_url: null,
      role: isAdmin(u.role) ? 'admin' : 'membre',
    };
  },
);

export const cachedGetUser = cache(async () => (await getUser()) ?? null);

export async function requireCrmUser() {
  const u = await getUser();
  if (!u || !canAccessPipeline(u.role, u.pipeline_access)) redirect('/accueil');
  return u;
}
export async function requireCrmAdmin() {
  const u = await getUser();
  if (!u) redirect('/login');
  if (!isAdmin(u.role)) redirect('/crm/dashboard');
  return u;
}
```

- [ ] **Step 2 — `lib/crm/auth/hidden.ts`** : porter `isHiddenEmail` (env `HIDDEN_USER_EMAILS`) verbatim (mécanisme comptes fantômes conservé).
- [ ] **Step 3 — Adapter les appels** dans le code copié : `requireUser→requireCrmUser`, `requireAdmin→requireCrmAdmin`, `createClient→createCrmClient`. (Fait au fil des Tasks 5-8.)
- [ ] **Step 4 — Commit** : `feat(crm): auth remap onto SOLUVIA users/roles`.

---

## Task 5 : Duplication lib pure (domain, validators, format, email, notifications, recap)

**Files :** copier depuis perf → `lib/crm/` : `domain/*` (enums, pipeline, recap, relances, geo, geo-stats, dates, france-regions + `*.test.ts`), `validators/*`, `format.ts`, `labels.ts`, `utils.ts`, `email.ts`, `notifications/notify.ts`, `recap.ts`.

- [ ] **Step 1 — Copier `lib/domain/*` + tests** → `lib/crm/domain/*` (logique pure, **zéro** modif sauf chemins `@/lib/domain→@/lib/crm/domain`).
- [ ] **Step 2 — Copier `validators/*`, `format.ts`, `labels.ts`, `utils.ts`** → `lib/crm/*` (réécrire imports internes).
- [ ] **Step 3 — Copier `email.ts` + `recap.ts` + `notifications/notify.ts`** → `lib/crm/*` ; remplacer `createClient/admin` par `createCrmClient/`admin CRM`, `profiles`→`public.users`(requêtes destinataires récap via client public standard`@/lib/supabase/admin`), env Resend réutilisée (`RESEND_API_KEY`).
- [ ] **Step 4 — `npm test -- lib/crm/domain`** : les tests portés passent (Attendu PASS ; ils sont autonomes).
- [ ] **Step 5 — Commit** : `feat(crm): port pure domain/validators/email/recap libs`.

---

## Task 6 : Duplication queries + actions

**Files :** perf `lib/queries/*` → `lib/crm/queries/*` ; perf `lib/actions/*` → `lib/crm/actions/*`.

- [ ] **Step 1 — Copier `lib/queries/*`** (opportunites, dashboard, rdv, relances, comptes, notifications, recap) → `lib/crm/queries/*`. Adapter : `createClient→createCrmClient` ; `unstable_cache` conservé ; `profiles`→`users` dans les selects (colonnes : `nom_complet` remplacé par `prenom,nom` — exposer un helper `fullName()` dans `lib/crm/format.ts`).
- [ ] **Step 2 — Copier `lib/actions/*`** (opportunites, rdv, relances, activites, adresses, notifications, auth→**drop** (géré par SOLUVIA), recap, errors) → `lib/crm/actions/*`. Adapter clients + `requireCrm*` + `revalidatePath('/crm/…')`.
- [ ] **Step 3 — `tsc --noEmit`** sur `lib/crm/**` : Attendu PASS (résoudre les écarts de colonnes users/profiles).
- [ ] **Step 4 — Commit** : `feat(crm): port queries + server actions (schema crm, soluvia auth)`.

---

## Task 7 : Duplication composants + thème perf scopé

**Files :** perf `components/*` → `components/crm/*` (ui, shared, layout, pipeline, rdv, relances, dashboard, recap) ; `app/crm/crm-theme.css` (créer).

- [ ] **Step 1 — Copier `components/ui/*`** (21 primitives base-ui) → `components/crm/ui/*` (fidélité pixel, zéro couplage au ui SOLUVIA).
- [ ] **Step 2 — Copier `components/{shared,layout,pipeline,rdv,relances,dashboard,recap}/*`** → `components/crm/*`. Réécrire tous les imports `@/components/*`→`@/components/crm/*`, `@/lib/*`→`@/lib/crm/*`. `layout/nav.ts` : réécrire les hrefs `→ /crm/dashboard|pipeline|relances|rdv|recap` (drop Utilisateurs → pointer `/admin/utilisateurs` SOLUVIA ou retirer).
- [ ] **Step 3 — Thème perf scopé.** Extraire le bloc thème de `perf/app/globals.css` (variables Tailwind v4 + theming react-big-calendar) dans `app/crm/crm-theme.css`, **scopé** sous un sélecteur racine (ex. `[data-crm] { --primary: …; … }`) + import du CSS `react-big-calendar/lib/css/react-big-calendar.css`. La coquille `app/crm/layout.tsx` pose `data-crm` sur son conteneur racine.
- [ ] **Step 4 — Realtime kanban** : garder `NEXT_PUBLIC_REALTIME` (off par défaut) ; le canal utilise `createCrmClient` browser sur `crm.opportunites`.
- [ ] **Step 5 — Commit** : `feat(crm): port components + scoped perf theme`.

---

## Task 8 : Routes `app/crm/*` + coquille

**Files :** `app/crm/layout.tsx`, `app/crm/{dashboard,pipeline,relances,rdv,recap}/page.tsx`, `app/crm/{loading,error,not-found}.tsx`.

- [ ] **Step 1 — `app/crm/layout.tsx`** (reproduit `perf/app/(app)/layout.tsx`, gate SOLUVIA, pose `data-crm`, importe `crm-theme.css`) :

```tsx
import { redirect } from 'next/navigation';
import '@/app/crm/crm-theme.css';
import { getUser } from '@/lib/queries/users';
import { canAccessPipeline, isAdmin } from '@/lib/utils/roles';
import { Sidebar } from '@/components/crm/layout/sidebar';
import { Topbar } from '@/components/crm/layout/topbar';
import {
  listMyNotifications,
  countMyUnread,
} from '@/lib/crm/queries/notifications';

export default async function CrmLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();
  if (!user) redirect('/login');
  if (!canAccessPipeline(user.role, user.pipeline_access)) redirect('/accueil');
  const admin = isAdmin(user.role);
  const [notifications, unread] = await Promise.all([
    listMyNotifications(),
    countMyUnread(),
  ]);
  return (
    <div data-crm className="flex min-h-screen">
      <Sidebar isAdmin={admin} />
      <div className="flex flex-1 flex-col">
        <Topbar
          profile={{
            nom_complet: [user.prenom, user.nom].filter(Boolean).join(' '),
            email: user.email,
            avatar_url: null,
            role: admin ? 'admin' : 'membre',
          }}
          notifications={notifications}
          unread={unread}
          isAdmin={admin}
        />
        <main className="flex-1 overflow-auto p-6 pb-24">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 2 — Copier les 5 pages** `perf/app/(app)/{dashboard,pipeline,relances,rdv,recap}/page.tsx` → `app/crm/…/page.tsx` ; imports `@/lib/*→@/lib/crm/*`, `@/components/*→@/components/crm/*` ; `/recap` : `requireCrmAdmin()`.
- [ ] **Step 3 — `loading/error/not-found`** copiés → `app/crm/*`.
- [ ] **Step 4 — Vérif manuelle (dev)** : `npm run dev`, se connecter en commercial → `/crm/pipeline` affiche le kanban perf (thème perf), `/crm/rdv` le calendrier, `/crm/dashboard` les KPIs ; un non-commercial est redirigé `/accueil` ; `/crm/recap` réservé admin.
- [ ] **Step 5 — Commit** : `feat(crm): /crm routes + perf-styled shell (soluvia auth)`.

---

## Task 9 : Middleware + point d'entrée sidebar SOLUVIA

**Files :** `proxy.ts` (modifier), `components/layout/nav-config.tsx` (modifier).

- [ ] **Step 1 — `proxy.ts`** : les routes `/crm/*` sont déjà couvertes par le check de présence cookie (redirect `/login` sinon) — **aucune** logique perf à porter. Retirer/repointer l'alias `'/pipeline': '/commercial/prospects'` → `'/crm/pipeline'` (le `/commercial/*` disparaît en phase 2).
- [ ] **Step 2 — `nav-config.tsx`** : dans la section `Commercial`, remplacer temporairement les 5 entrées par une entrée **CRM** `{ href: '/crm/dashboard', label: 'CRM', icon: KanbanSquare, requiresPipelineAccess: true }` (le nettoyage complet de la section + `/commercial/*` est en phase 2 ; ici on ajoute juste le point d'entrée sans rien casser).
- [ ] **Step 3 — Vérif** : depuis la sidebar SOLUVIA, « CRM » mène à `/crm/dashboard` et bascule dans la coquille perf.
- [ ] **Step 4 — Commit** : `feat(crm): sidebar entry + /pipeline alias → /crm`.

---

## Task 10 : Cron récap

**Files :** `app/api/cron/crm-recap/route.ts` (créer), `vercel.json` (modifier).

- [ ] **Step 1 — Route** : porter `perf/app/api/cron/recap/route.ts` → `app/api/cron/crm-recap/route.ts` (Bearer `CRON_SECRET`, `?dry=1` preview, `runtime='nodejs'`, `force-dynamic`), imports `@/lib/crm/*`, client admin CRM.
- [ ] **Step 2 — `vercel.json`** : ajouter au tableau `crons` `{ "path": "/api/cron/crm-recap", "schedule": "0 16 * * 1,3,5" }` (fusion, sans toucher aux crons existants).
- [ ] **Step 3 — Env** : documenter `RECAP_RECIPIENTS` (remplacer le défaut codé `iladj@mysoluvia.com`), `RECAP_BCC`, `NEXT_PUBLIC_SITE_URL` (doit pointer SOLUVIA), `RESEND_FROM` (rebrand) dans `.env.example`.
- [ ] **Step 4 — Vérif** : `GET /api/cron/crm-recap?dry=1` avec Bearer renvoie le HTML du récap (aucun envoi).
- [ ] **Step 5 — Commit** : `feat(crm): recap cron (Mon/Wed/Fri) + env docs`.

---

## Task 11 : Rebrand + CSP

**Files :** `components/crm/layout/brand-logo.tsx`, `public/brand/*`, `next.config.ts`.

- [ ] **Step 1 — Logo** : remplacer l'asset `perf-mark.png` par le logo SOLUVIA (`public/logo*.svg`) dans `brand-logo.tsx` + emails.
- [ ] **Step 2 — CSP** : vérifier que `next.config.ts` (SOLUVIA) autorise en `connect-src` `https://geo.api.gouv.fr` (zone-combobox) + `*.supabase.co` (REST + wss Realtime). Ajouter si absent.
- [ ] **Step 3 — Commit** : `feat(crm): rebrand assets + CSP allowances`.

---

## Task 12 : Vérification de phase

- [ ] **Step 1 — `npm run typecheck`** : PASS (aucune erreur `lib/crm/**`, `app/crm/**`, `components/crm/**`).
- [ ] **Step 2 — `npm run build`** : PASS.
- [ ] **Step 3 — `npm test`** : les tests domaine CRM portés sont verts ; les tests SOLUVIA existants restent verts (aucune régression).
- [ ] **Step 4 — Smoke e2e (manuel dev)** : login commercial → parcours `/crm/{dashboard,pipeline,rdv,relances}` (création unifiée d'une opportunité via le FAB → apparaît dans le kanban → RDV créé visible au calendrier → relance créée). Rendu visuellement identique à perf (thème scopé). Parcours SOLUVIA (facturation, projets, temps) **inchangés**.
- [ ] **Step 5 — Isolation** : `grep -r "outilcommercialPerf" app lib components` → **0** résultat (aucun couplage au repo perf).
- [ ] **Step 6 — Commit** : `test(crm): phase-1 verification green`.

---

## Hors périmètre (phases suivantes)

- **Phase 2** — suppression `/commercial/*` + `prospects` & tables filles + repointage des ~12 consommateurs externes (crons prospect-alertes/kpi-digest, webhook Yousign, passation, `indicateurs/commercial`, redirect accueil, ~40 deep-links), suppression `commercial/kpis` + `CommercialSection`, sortie de **Modèles** & **CDP plan-de-charge** hors « Commercial », retrait **LinkedIn**.
- **Phase 3** — simplification IA (fusion des 4 vues d'ensemble, `projets/internes` & `temps/equipe` en onglets, Idées → « Produit », OPCO/orphelins/libellé mort) + refactor `sidebar.tsx`.

## Auto-revue (writing-plans)

- Couverture socle : déps ✓, schéma+RLS ✓, clients ✓, auth remap ✓, libs ✓, queries/actions ✓, composants+thème ✓, routes+coquille ✓, middleware+nav ✓, cron ✓, rebrand ✓, vérif ✓.
- **Vérifié** : `lib/supabase/admin.ts` exporte `createAdminClient()` ; `public.users.id REFERENCES auth.users(id)` (`00003_users.sql`) → les FK CRM `→ public.users(id)` sont saines. **Reste côté runbook** : (c) procédure d'application migration du repo (`db:migrate` vs Studio) ; (d) exposition du schéma `crm` en prod (Dashboard → API → Exposed schemas).
