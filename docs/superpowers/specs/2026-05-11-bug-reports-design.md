# Bug reports - design

Date: 2026-05-11
Owner: Nael Melikechi

## Objectif

Permettre a tout utilisateur connecte (admin + CDP) de signaler un bug
depuis l'application avec commentaire obligatoire et screenshot optionnel.
Le rapport est analyse par une IA (triage + synthese), stocke en base, et
genere un email recapitulatif a l'admin.

## Stack reutilisee

- Resend pour l'email (`lib/email/_send.ts`)
- Supabase Storage pour le screenshot (bucket prive)
- Upstash Ratelimit (`lib/utils/rate-limit.ts`) etendu pour `bug-report`
- AI SDK + OpenAI `gpt-4o-mini` (vision) pour le triage
- Sentry deja installe -> on capture le dernier event id si dispo

## Section 1 - Flow utilisateur

- Bouton flottant fixe (icone bug) en bas a droite, dans `DashboardShell`
- Clic -> ouverture d'un Sheet (drawer lateral droit, base-ui)
- Champs:
  - `comment` (textarea, requis, min 20 caracteres)
  - `perceived_severity` (radio, optionnel) : "Gênant" | "Bloquant" | "Critique"
  - `screenshot` (optionnel) :
    - drop-zone + bouton "Choisir un fichier" (jpg/png, max 5 Mo)
    - support du collage clipboard (Cmd+V dans la zone)
    - apercu avant envoi
- Submit -> POST `/api/bugs`
- Reponse 200 -> toast Sonner "Bug signale, merci !" + ferme le drawer
- L'analyse IA + l'email se font apres la reponse (waitUntil)

## Section 2 - Data model

Migration: `20260511_bug_reports.sql`

```sql
create table public.bug_reports (
  id uuid primary key default gen_random_uuid(),
  ref text unique,                          -- BUG-0042 (trigger auto)
  user_id uuid references auth.users(id) on delete set null,
  user_email text not null,
  user_role text not null,

  comment text not null check (char_length(comment) >= 20),
  perceived_severity text check (perceived_severity in ('genant','bloquant','critique')),
  screenshot_path text,

  page_url text not null,
  user_agent text,
  viewport jsonb,
  console_errors jsonb,
  sentry_event_id text,
  extra_context jsonb,

  ai_status text not null default 'pending'
    check (ai_status in ('pending','done','failed','skipped')),
  ai_severity text check (ai_severity in ('low','medium','high','critical')),
  ai_category text,
  ai_summary text,
  ai_hypotheses jsonb,
  ai_error text,
  ai_processed_at timestamptz,

  status text not null default 'nouveau'
    check (status in ('nouveau','en_cours','resolu','wontfix')),
  resolution_notes text,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archive boolean not null default false
);
```

- Trigger sequence -> `ref = 'BUG-' || lpad(seq::text, 4, '0')`
- Trigger `updated_at` (pattern existant projet)
- Bucket Supabase Storage `bug-screenshots` (prive)
- RLS:
  - INSERT: tout user authentifie (avec check `user_id = auth.uid()`)
  - SELECT/UPDATE: admin uniquement (via `get_user_role()`)
  - Pas de DELETE (soft delete `archive = true`)

## Section 3 - Capture du contexte technique

Cote client, au moment du submit, on capture:

- `page_url` : `window.location.href`
- `user_agent` : `navigator.userAgent`
- `viewport` : `{ width, height, dpr: devicePixelRatio }`
- `console_errors` : buffer circulaire des 10 dernieres erreurs JS, alimente
  par un listener global `window.addEventListener('error', ...)` +
  `window.addEventListener('unhandledrejection', ...)` initialise dans
  un composant client root (BugReportProvider)
- `sentry_event_id` : `Sentry.getCurrentScope().lastEventId()` si Sentry init

L'utilisateur ne voit pas ces donnees mais elles sont jointes a l'envoi.

## Section 4 - Analyse IA

`lib/ai/bug-triage.ts`:

- Modele: `openai/gpt-4o-mini` (vision-capable, peu cher)
- AI SDK `generateObject` avec schema Zod:

```ts
const TriageSchema = z.object({
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  category: z.enum([
    'ui',
    'data',
    'auth',
    'perf',
    'email',
    'pdf',
    'navigation',
    'permissions',
    'autre',
  ]),
  summary: z.string().max(280),
  hypotheses: z.array(z.string()).max(5),
});
```

- Le screenshot (s'il existe) est envoye en input image (URL signee
  Supabase, valide 1h) au modele
- Le prompt inclut: contexte Soluvia (rappel court de ce que fait l'app),
  role/page de l'utilisateur, commentaire, console errors, Sentry id
- Pas de `tool calling` ni d'acces au code source (V1 minimaliste)
- Echec IA -> `ai_status = 'failed'`, on envoie quand meme l'email
  avec le contenu brut

## Section 5 - Email + dashboard admin

**Email** (template dans `lib/email/templates.ts` -> nouvelle fonction
`buildBugReportEmailHtml`):

- Destinataire: `env.ADMIN_BUG_REPORT_EMAIL` (fallback `naelmelikechi7@gmail.com`)
- Sujet: `[BUG-0042] [HIGH/UI] Resume IA en 1 ligne...`
- Corps:
  - Header SOLUVIA (reuse pattern existant)
  - Badge severite IA + categorie
  - Resume IA (1 paragraphe)
  - Hypotheses IA (bullets)
  - Section "Reporte par": email, role, page URL
  - Section "Contexte technique": UA, viewport, sentry id, console errors
  - Section "Commentaire original" (verbatim user)
  - Lien signe vers le screenshot (valide 7 jours)
  - Lien vers `/admin/bugs/{ref}`

**Dashboard admin** (`/admin/bugs`):

- Liste DataTable: ref, date, user, severite IA (badge), categorie,
  statut workflow, page URL (tronque)
- Filtres: status, severite, categorie
- Detail (route `/admin/bugs/[ref]`) : tout le contenu + apercu screenshot
  - champs editables (status, resolution_notes)
- Lien dans la sidebar admin: "Bugs" avec badge nouveaux (realtime via
  `useBadgeCounts` hook etendu)

## Section 6 - Securite + async

- **Rate limit** : 5 reports / heure / user (Upstash sliding window),
  cle `bug-report:{user_id}`. Si limit -> 429 avec retry-after
- **Validation** : Zod cote serveur sur le body (longueur comment, MIME
  type screenshot, taille max 5 Mo)
- **Storage** : upload server-side (route handler) pour ne pas exposer
  le service role cote client. Le client envoie le fichier via FormData
- **Async** : `waitUntil(processBugReport(bug.id))` apres l'insert. Le
  process appelle l'IA puis envoie l'email puis update la ligne avec
  `ai_status = 'done'`. Echec -> `ai_status = 'failed' + ai_error`,
  email envoye quand meme
- **Privacy** : aucune info utilisateur sensible envoyee a OpenAI au-dela
  de ce que l'utilisateur a tape + screenshot
- **OPENAI_API_KEY absente** : `ai_status = 'skipped'`, on envoie l'email
  brut sans synthese. Pas de blocage du flow

## Files

Nouveaux:

- `supabase/migrations/20260511120000_bug_reports.sql`
- `app/api/bugs/route.ts`
- `lib/ai/bug-triage.ts`
- `lib/queries/bug-reports.ts`
- `lib/actions/bug-reports.ts` (server action update status)
- `components/bug-report/bug-report-launcher.tsx` (bouton flottant)
- `components/bug-report/bug-report-sheet.tsx` (drawer formulaire)
- `components/bug-report/console-error-buffer.tsx` (listener global)
- `app/(dashboard)/admin/bugs/page.tsx`
- `app/(dashboard)/admin/bugs/[ref]/page.tsx`
- `app/(dashboard)/admin/bugs/bugs-table.tsx`
- `app/(dashboard)/admin/bugs/bug-detail.tsx`

Modifies:

- `lib/env.ts` (OPENAI_API_KEY, ADMIN_BUG_REPORT_EMAIL)
- `lib/email/templates.ts` (buildBugReportEmailHtml)
- `lib/utils/rate-limit.ts` (LimiterKey + getter `bug-report`)
- `components/layout/dashboard-shell.tsx` (mount launcher)
- `components/layout/sidebar.tsx` (lien admin Bugs)
- `package.json` (`ai`, `@ai-sdk/openai`, `@vercel/functions`)

## Non-objectifs (V1)

- Pas de re-classification manuelle de la severite IA
- Pas d'attribution de bug a un developpeur
- Pas de regroupement automatique de bugs similaires
- Pas de notification au reporter quand le bug est resolu (peut-etre V2)
- Pas de suggestion de fix par l'IA (option ecartee a la question 3)
