# Welcome Emails par rôle - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implémenter 4 templates d'emails de bienvenue par rôle, un script local pour validation visuelle sur `nmelikechi@mysoluvia.com`, un endpoint admin de broadcast, et l'intégration au flow de création de compte existant.

**Architecture:** Builders HTML purs (testables sans I/O) dans `lib/email/welcome.ts`, dispatcher par rôle, hub email centralisé existant (`lib/email/_send.ts` → Resend). Anti-doublon via colonne `welcome_email_sent_at` sur `users`.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase Postgres, Resend, vitest.

**Spec source:** `docs/superpowers/specs/2026-05-13-welcome-emails-design.md`

---

## Note de décision à valider avant Task 5

L'audit révèle que `lib/actions/users.ts:489-521` envoie déjà un email `sendInvitationEmail` à la création (identifiants + mot de passe temporaire). L'email de bienvenue serait un 2ᵉ mail envoyé dans la foulée.

**Options pour Task 5:**

- **A. Envoi en cascade** (par défaut dans ce plan): après le `INSERT users` réussi, on appelle `sendWelcomeEmail` en plus de l'invitation. Deux mails arrivent à quelques secondes d'écart.
- **B. Fusion**: on enrichit `sendInvitationEmail` pour inclure le contenu welcome (longueur ~250 mots au lieu de 150). Un seul mail.
- **C. Différer**: le welcome est envoyé uniquement en broadcast (Task 4), pas auto à la création. À la place, on ajoute un trigger sur la première connexion (hors scope ici).

Nael décide entre A/B/C **avant que Task 5 ne commence**. Tasks 1-4 sont indépendantes de ce choix.

---

## Task 1: Migration `welcome_email_sent_at`

**Files:**

- Create: `supabase/migrations/20260515100000_users_welcome_email_sent.sql`
- Regenerate: `types/database.ts`

- [ ] **Step 1: Créer la migration**

```sql
-- supabase/migrations/20260515100000_users_welcome_email_sent.sql
-- Anti-doublon pour broadcast et envoi auto des emails de bienvenue.
-- NULL = pas encore envoye. Timestamp = envoi reussi.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS welcome_email_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN users.welcome_email_sent_at IS
  'Date d''envoi reussi du welcome email. NULL = pas encore envoye. Empeche le re-spam lors de broadcasts repetes.';
```

- [ ] **Step 2: Vérifier que Supabase est démarré**

Run: `npx supabase status`
Expected: services running (ou `npx supabase start` si arrêté)

- [ ] **Step 3: Appliquer la migration**

Run: `npx supabase db push`
Expected: `Applied migration 20260515100000_users_welcome_email_sent.sql`

- [ ] **Step 4: Régénérer les types**

Run: `npx supabase gen types typescript --local > types/database.ts`
Expected: pas d'erreur, fichier mis à jour.

Vérifier: `grep "welcome_email_sent_at" types/database.ts | head -3`
Expected: la colonne apparaît 3x (Row/Insert/Update).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260515100000_users_welcome_email_sent.sql types/database.ts
git commit -m "feat(db): colonne welcome_email_sent_at sur users (anti-doublon)"
```

---

## Task 2: Builders HTML + dispatcher

**Files:**

- Create: `lib/email/welcome.ts`
- Create: `__tests__/welcome-emails.test.ts`

- [ ] **Step 1: Écrire les tests (TDD)**

```ts
// __tests__/welcome-emails.test.ts
import { describe, it, expect } from 'vitest';
import {
  buildWelcomeAdmin,
  buildWelcomeSuperadmin,
  buildWelcomeCdp,
  buildWelcomeCommercial,
  sendWelcomeEmail,
} from '@/lib/email/welcome';

describe('welcome email builders', () => {
  describe('buildWelcomeAdmin', () => {
    it('inclut le prenom du destinataire echappe', () => {
      const { subject, html } = buildWelcomeAdmin({ prenom: '<Marc>' });
      expect(html).toContain('&lt;Marc&gt;');
      expect(html).not.toContain('<Marc>');
      expect(subject).toBe('Bienvenue sur Soluvia - votre cockpit de pilotage');
    });

    it('contient les 4 bullets admin', () => {
      const { html } = buildWelcomeAdmin({ prenom: 'Marc' });
      expect(html).toMatch(/Vue d.ensemble et indicateurs/);
      expect(html).toMatch(/projets, contrats et clients/);
      expect(html).toMatch(/Facturation OPCO/);
      expect(html).toMatch(/Administration: utilisateurs/);
    });

    it('contient le CTA vers app.mysoluvia.com', () => {
      const { html } = buildWelcomeAdmin({ prenom: 'Marc' });
      expect(html).toContain('https://app.mysoluvia.com');
      expect(html).toMatch(/Acc.der a Soluvia/i);
    });

    it('ne contient pas d em-dashes', () => {
      const { html, subject } = buildWelcomeAdmin({ prenom: 'Marc' });
      expect(html).not.toContain('—');
      expect(subject).not.toContain('—');
    });
  });

  describe('buildWelcomeSuperadmin', () => {
    it('mentionne l acces technique complet', () => {
      const { subject, html } = buildWelcomeSuperadmin({ prenom: 'Marc' });
      expect(subject).toBe('Bienvenue sur Soluvia - acces superadmin');
      expect(html).toMatch(/acces technique complet/);
      expect(html).toMatch(/journal d.audit/);
      expect(html).toMatch(/operations sensibles/);
    });
  });

  describe('buildWelcomeCdp', () => {
    it('a le bon subject et les bullets cdp', () => {
      const { subject, html } = buildWelcomeCdp({ prenom: 'Sophie' });
      expect(subject).toBe(
        'Bienvenue sur Soluvia - votre espace chef de projet',
      );
      expect(html).toMatch(/portefeuille/);
      expect(html).toMatch(/Saisie du temps/);
      expect(html).toMatch(/qualite/i);
      expect(html).toMatch(/Notifications temps reel/);
    });
  });

  describe('buildWelcomeCommercial', () => {
    it('a le bon subject et les bullets commercial', () => {
      const { subject, html } = buildWelcomeCommercial({ prenom: 'Lea' });
      expect(subject).toBe('Bienvenue sur Soluvia - votre pipeline commercial');
      expect(html).toMatch(/Pipeline prospects/);
      expect(html).toMatch(/projets convertis/);
      expect(html).toMatch(/taux de conversion/);
      expect(html).toMatch(/chefs de projet/);
    });
  });
});

describe('sendWelcomeEmail dispatcher', () => {
  it('expose une fonction async qui prend un user', () => {
    expect(typeof sendWelcomeEmail).toBe('function');
  });
});
```

- [ ] **Step 2: Lancer les tests → fail**

Run: `npm test -- welcome-emails.test.ts`
Expected: FAIL (module `@/lib/email/welcome` introuvable)

- [ ] **Step 3: Implémenter les builders et le dispatcher**

```ts
// lib/email/welcome.ts
// Welcome emails par role. 4 templates HTML sobres, palette SOLUVIA (#16a34a).
// Builders purs (sans I/O) pour tester sans mock. Dispatcher sendWelcomeEmail
// route au bon builder selon role, passe par le hub sendEmail centralise.

import { sendEmail } from './_send';

type Role = 'admin' | 'superadmin' | 'cdp' | 'commercial';

interface BuiltEmail {
  subject: string;
  html: string;
}

interface BuilderParams {
  prenom: string;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function shell(opts: {
  greeting: string;
  intro: string;
  pitch: string;
  bullets: string[];
  outro?: string;
}): string {
  const bulletsHtml = opts.bullets
    .map(
      (b) =>
        `<li style="margin:0 0 8px;color:#2d4a2d;font-size:14px;line-height:1.6;">${b}</li>`,
    )
    .join('');
  const outro = opts.outro
    ? `<p style="margin:16px 0 0;color:#6b8a6b;font-size:13px;line-height:1.6;font-style:italic;">${opts.outro}</p>`
    : '';
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;background-color:#f5f7f5;">
  <div style="max-width:520px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #d4e4d4;">
    <div style="background:#16a34a;padding:28px 32px;text-align:center;">
      <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:1px;">SOLUVIA</h1>
    </div>
    <div style="padding:32px;">
      <h2 style="margin:0 0 16px;font-size:18px;color:#1a2e1a;">${opts.greeting}</h2>
      <p style="margin:0 0 12px;color:#2d4a2d;font-size:14px;line-height:1.6;">${opts.intro}</p>
      <p style="margin:0 0 16px;color:#2d4a2d;font-size:14px;line-height:1.6;">${opts.pitch}</p>
      <ul style="margin:0 0 24px;padding-left:20px;">${bulletsHtml}</ul>
      <div style="text-align:center;margin:24px 0;">
        <a href="https://app.mysoluvia.com" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:8px;font-size:14px;font-weight:600;">Acceder a Soluvia</a>
      </div>
      ${outro}
    </div>
    <div style="background:#f0f5f0;padding:16px 32px;border-top:1px solid #d4e4d4;">
      <p style="margin:0;color:#6b8a6b;font-size:11px;text-align:center;">L'equipe SOLUVIA - Plateforme de pilotage pour organismes de formation</p>
    </div>
  </div>
</body>
</html>`;
}

export function buildWelcomeAdmin(p: BuilderParams): BuiltEmail {
  const prenom = escapeHtml(p.prenom);
  return {
    subject: 'Bienvenue sur Soluvia - votre cockpit de pilotage',
    html: shell({
      greeting: `Bienvenue ${prenom},`,
      intro: 'Ton compte administrateur Soluvia est actif.',
      pitch:
        "Soluvia centralise le pilotage de l'organisme : projets, contrats, facturation OPCO, qualite et indicateurs.",
      bullets: [
        "Vue d'ensemble et indicateurs de l'organisme",
        'Gestion complete des projets, contrats et clients',
        'Facturation OPCO (DECA, apprentissage, libres) et suivi des paiements',
        "Administration : utilisateurs, parametres, journal d'envoi",
      ],
    }),
  };
}

export function buildWelcomeSuperadmin(p: BuilderParams): BuiltEmail {
  const prenom = escapeHtml(p.prenom);
  return {
    subject: 'Bienvenue sur Soluvia - acces superadmin',
    html: shell({
      greeting: `Bienvenue ${prenom},`,
      intro: 'Ton compte superadmin est actif - acces technique complet.',
      pitch:
        "Soluvia centralise le pilotage de l'organisme : projets, contrats, facturation OPCO, qualite et indicateurs.",
      bullets: [
        "Vue d'ensemble et indicateurs de l'organisme",
        'Gestion complete des projets, contrats et clients',
        'Facturation OPCO (DECA, apprentissage, libres) et suivi des paiements',
        "Administration avancee : gestion des roles, parametres systemes, journal d'audit complet",
      ],
      outro:
        "Ce role donne acces a des operations sensibles - merci d'en faire un usage avise.",
    }),
  };
}

export function buildWelcomeCdp(p: BuilderParams): BuiltEmail {
  const prenom = escapeHtml(p.prenom);
  return {
    subject: 'Bienvenue sur Soluvia - votre espace chef de projet',
    html: shell({
      greeting: `Bienvenue ${prenom},`,
      intro: 'Ton espace chef de projet Soluvia est pret.',
      pitch:
        'Soluvia regroupe tous les outils dont tu as besoin pour piloter tes projets de formation au quotidien.',
      bullets: [
        'Tes projets et contrats - vue filtree sur ton portefeuille',
        'Saisie du temps avec auto-save (2s de debounce)',
        'Suivi qualite et indicateurs par projet',
        'Notifications temps reel (factures en retard, saisies manquantes)',
      ],
    }),
  };
}

export function buildWelcomeCommercial(p: BuilderParams): BuiltEmail {
  const prenom = escapeHtml(p.prenom);
  return {
    subject: 'Bienvenue sur Soluvia - votre pipeline commercial',
    html: shell({
      greeting: `Bienvenue ${prenom},`,
      intro: 'Ton acces commercial Soluvia est actif.',
      pitch:
        "Soluvia te donne une vue claire sur ton pipeline de prospects et l'avancement commercial de l'organisme.",
      bullets: [
        'Pipeline prospects : creation, suivi, conversion en projet',
        'Vue des projets convertis et de leur statut',
        'Indicateurs commerciaux et taux de conversion',
        "Collaboration avec les chefs de projet et l'equipe admin",
      ],
    }),
  };
}

function buildByRole(role: Role, prenom: string): BuiltEmail {
  switch (role) {
    case 'admin':
      return buildWelcomeAdmin({ prenom });
    case 'superadmin':
      return buildWelcomeSuperadmin({ prenom });
    case 'cdp':
      return buildWelcomeCdp({ prenom });
    case 'commercial':
      return buildWelcomeCommercial({ prenom });
  }
}

export async function sendWelcomeEmail(user: {
  email: string;
  prenom: string;
  role: Role;
}): Promise<{ success: boolean; error?: string; id?: string }> {
  const { subject, html } = buildByRole(user.role, user.prenom);
  return sendEmail({
    from: 'SOLUVIA <contact@mysoluvia.com>',
    to: user.email,
    subject,
    html,
  });
}
```

- [ ] **Step 4: Lancer les tests → pass**

Run: `npm test -- welcome-emails.test.ts`
Expected: tous tests PASS

- [ ] **Step 5: Lint**

Run: `npm run lint -- lib/email/welcome.ts __tests__/welcome-emails.test.ts`
Expected: 0 erreurs.

- [ ] **Step 6: Commit**

```bash
git add lib/email/welcome.ts __tests__/welcome-emails.test.ts
git commit -m "feat(email): welcome emails par role + dispatcher + tests"
```

---

## Task 3: Script de test local + validation visuelle (CHECKPOINT)

**Files:**

- Create: `scripts/send-welcome-test.ts`

- [ ] **Step 1: Vérifier que `tsx` est dispo**

Run: `npx tsx --version`
Expected: version affichée (ou installe `npm i -D tsx` si absent).

- [ ] **Step 2: Créer le script**

```ts
// scripts/send-welcome-test.ts
// Lance via : npx tsx scripts/send-welcome-test.ts
// Envoie les 4 versions du welcome email a nmelikechi@mysoluvia.com
// Subjects prefixes [TEST role=...] pour les distinguer dans la boite.

import 'dotenv/config';
import {
  buildWelcomeAdmin,
  buildWelcomeSuperadmin,
  buildWelcomeCdp,
  buildWelcomeCommercial,
} from '@/lib/email/welcome';
import { sendEmail } from '@/lib/email/_send';

const TEST_EMAIL = 'nmelikechi@mysoluvia.com';
const TEST_PRENOM = 'Nael';

async function main() {
  const versions = [
    {
      role: 'admin' as const,
      built: buildWelcomeAdmin({ prenom: TEST_PRENOM }),
    },
    {
      role: 'superadmin' as const,
      built: buildWelcomeSuperadmin({ prenom: TEST_PRENOM }),
    },
    { role: 'cdp' as const, built: buildWelcomeCdp({ prenom: TEST_PRENOM }) },
    {
      role: 'commercial' as const,
      built: buildWelcomeCommercial({ prenom: TEST_PRENOM }),
    },
  ];

  console.log(`Envoi de ${versions.length} mails de test a ${TEST_EMAIL}...`);
  for (const v of versions) {
    const result = await sendEmail({
      from: 'SOLUVIA <contact@mysoluvia.com>',
      to: TEST_EMAIL,
      subject: `[TEST role=${v.role}] ${v.built.subject}`,
      html: v.built.html,
    });
    if (result.success) {
      console.log(`  OK  role=${v.role}  id=${result.id ?? '(skipped)'}`);
    } else {
      console.error(`  KO  role=${v.role}  error=${result.error}`);
    }
  }
}

main().catch((e) => {
  console.error('Script error:', e);
  process.exit(1);
});
```

- [ ] **Step 3: Vérifier le path alias `@/`**

Run: `grep -E '"paths"' tsconfig.json`
Expected: paths inclut `"@/*"`. Si absent, ajuster les imports en relatif.

- [ ] **Step 4: Vérifier que `dotenv` est installé**

Run: `node -e "require('dotenv')"`
Expected: pas d'erreur. Sinon: `npm i -D dotenv`.

- [ ] **Step 5: Lancer le script**

Run: `npx tsx scripts/send-welcome-test.ts`
Expected: 4 lignes `OK role=...` dans le stdout, 4 mails arrivent dans `nmelikechi@mysoluvia.com` dans la minute.

- [ ] **Step 6: CHECKPOINT - Validation visuelle par Nael**

**Action requise:** Nael ouvre sa boite `nmelikechi@mysoluvia.com` et lit les 4 mails. Il valide ou demande des modifications (wording, structure, palette).

- Si modifs: revenir à Task 2 Step 3, ajuster, relancer Step 5, re-valider.
- Si OK: continuer à Step 7.

- [ ] **Step 7: Commit**

```bash
git add scripts/send-welcome-test.ts
git commit -m "feat(scripts): script local d'envoi des welcome emails de test"
```

---

## Task 4: Endpoint broadcast admin

**Files:**

- Create: `app/api/admin/welcome-emails/broadcast/route.ts`
- Create: `__tests__/welcome-broadcast.test.ts`

- [ ] **Step 1: Vérifier le pattern d'auth admin existant**

Run: `grep -rln "requireAdmin\|isAdmin" lib/auth lib/utils 2>/dev/null | head -3`
Expected: au moins `lib/utils/roles.ts` et un helper requireAdmin (ex: `lib/auth/require-admin.ts` ou inline). Lire le helper pour réutiliser le même pattern que les autres routes admin.

- [ ] **Step 2: Trouver une route admin existante comme modèle**

Run: `find app/api/admin -name "route.ts" | head -3 && echo --- && head -30 "$(find app/api/admin -name 'route.ts' | head -1)"`
Expected: voir le pattern d'auth + Supabase server client utilisé. **Copier exactement** ce pattern dans Task 4 Step 4.

- [ ] **Step 3: Écrire les tests**

```ts
// __tests__/welcome-broadcast.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock du hub sendEmail pour ne PAS taper Resend pendant les tests.
vi.mock('@/lib/email/_send', () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true, id: 'mock-id' }),
}));

describe('broadcast welcome emails - logique pure', () => {
  beforeEach(() => vi.clearAllMocks());

  it('filtre les users actifs sans welcome_email_sent_at', async () => {
    // La logique de filtrage est dans la route. On teste ici la fonction
    // pure extraite si on en cree une, OU on saute ce test en attendant
    // un test d integration avec un Supabase mock.
    // Au minimum : verifier le contrat de l endpoint via une fonction
    // helper exportee.
    const { filterEligibleRecipients } =
      await import('@/lib/email/welcome-broadcast');
    const users = [
      {
        email: 'a@x.fr',
        prenom: 'A',
        role: 'admin',
        actif: true,
        welcome_email_sent_at: null,
      },
      {
        email: 'b@x.fr',
        prenom: 'B',
        role: 'cdp',
        actif: true,
        welcome_email_sent_at: '2026-05-01T00:00:00Z',
      },
      {
        email: 'c@x.fr',
        prenom: 'C',
        role: 'cdp',
        actif: false,
        welcome_email_sent_at: null,
      },
    ];
    const eligible = filterEligibleRecipients(users);
    expect(eligible).toHaveLength(1);
    expect(eligible[0].email).toBe('a@x.fr');
  });
});
```

- [ ] **Step 4: Lancer les tests → fail**

Run: `npm test -- welcome-broadcast.test.ts`
Expected: FAIL (module `welcome-broadcast` introuvable).

- [ ] **Step 5: Extraire la fonction pure de filtrage**

Create: `lib/email/welcome-broadcast.ts`

```ts
// lib/email/welcome-broadcast.ts
// Logique pure separee de la route pour testabilite.

export type Role = 'admin' | 'superadmin' | 'cdp' | 'commercial';

export interface BroadcastUser {
  email: string;
  prenom: string;
  role: Role;
  actif: boolean;
  welcome_email_sent_at: string | null;
}

export function filterEligibleRecipients(
  users: BroadcastUser[],
): BroadcastUser[] {
  return users.filter((u) => u.actif && u.welcome_email_sent_at === null);
}
```

- [ ] **Step 6: Lancer les tests → pass**

Run: `npm test -- welcome-broadcast.test.ts`
Expected: PASS.

- [ ] **Step 7: Implémenter la route POST**

```ts
// app/api/admin/welcome-emails/broadcast/route.ts
// POST /api/admin/welcome-emails/broadcast
// Body: { dryRun?: boolean } (defaut true)
// Auth: admin ou superadmin uniquement.

import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/utils/roles';
import { sendWelcomeEmail } from '@/lib/email/welcome';
import {
  filterEligibleRecipients,
  type BroadcastUser,
} from '@/lib/email/welcome-broadcast';
import { logger } from '@/lib/logger';

export async function POST(req: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
  }

  const { data: me } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (!me || !isAdmin(me.role)) {
    return NextResponse.json({ error: 'Acces refuse' }, { status: 403 });
  }

  let body: { dryRun?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    // body vide accepte
  }
  const dryRun = body.dryRun ?? true;

  const adminClient = createAdminClient();
  const { data: rows, error } = await adminClient
    .from('users')
    .select('email, prenom, role, actif, welcome_email_sent_at');
  if (error) {
    logger.error('welcome-broadcast', 'fetch users failed', {
      error: error.message,
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const eligible = filterEligibleRecipients(rows as BroadcastUser[]);

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      totalUsers: rows.length,
      eligibleCount: eligible.length,
      recipients: eligible.map((u) => ({
        email: u.email,
        role: u.role,
        prenom: u.prenom,
      })),
    });
  }

  let sent = 0;
  let failed = 0;
  const failures: { email: string; error: string }[] = [];

  for (const u of eligible) {
    const result = await sendWelcomeEmail({
      email: u.email,
      prenom: u.prenom,
      role: u.role,
    });
    if (result.success) {
      sent++;
      const { error: updErr } = await adminClient
        .from('users')
        .update({ welcome_email_sent_at: new Date().toISOString() })
        .eq('email', u.email);
      if (updErr) {
        logger.error(
          'welcome-broadcast',
          'update welcome_email_sent_at failed',
          {
            email: u.email,
            error: updErr.message,
          },
        );
      }
    } else {
      failed++;
      failures.push({ email: u.email, error: result.error ?? 'unknown' });
      logger.error('welcome-broadcast', 'send failed', {
        email: u.email,
        error: result.error,
      });
    }
  }

  return NextResponse.json({
    dryRun: false,
    sent,
    failed,
    failures,
    totalEligible: eligible.length,
  });
}
```

- [ ] **Step 8: Vérifier le build**

Run: `npm run build`
Expected: build OK. Si erreur d'import sur `createAdminClient` ou `logger`, ajuster les paths en lisant les fichiers existants.

- [ ] **Step 9: Lint**

Run: `npm run lint`
Expected: 0 erreurs sur les nouveaux fichiers.

- [ ] **Step 10: Commit**

```bash
git add app/api/admin/welcome-emails/broadcast/route.ts \
        lib/email/welcome-broadcast.ts \
        __tests__/welcome-broadcast.test.ts
git commit -m "feat(api): endpoint admin broadcast welcome emails (dryRun par defaut)"
```

---

## Task 5: Intégration auto à la création de compte

**PREREQUIS:** Nael a choisi parmi A/B/C dans la note de décision en haut du plan.

**Files:**

- Modify: `lib/actions/users.ts` (zone L488-L569)

### Variante A: Envoi en cascade (par défaut)

- [ ] **Step 1: Lire la fonction `inviteUser` complète**

Run: `grep -n "export async function inviteUser\|^}" lib/actions/users.ts | head -10`
Repère les lignes start/end. Lire la fonction.

- [ ] **Step 2: Modifier après le `INSERT users` réussi**

Localiser le bloc à `lib/actions/users.ts:543-569` (le `INSERT public.users` suivi du if `insertError`). Juste après le bloc de gestion d'erreur (donc après que l'INSERT a réussi), AVANT le `return` final de succès, ajouter:

```ts
// Envoi du welcome email (presentation outil par role). Independant de
// l invitation (credentials) envoyee plus haut. Si fail : log + warning,
// ne bloque pas la creation.
try {
  const { sendWelcomeEmail } = await import('@/lib/email/welcome');
  const welcomeResult = await sendWelcomeEmail({
    email: parsed.data.email,
    prenom: parsed.data.prenom,
    role: parsed.data.role,
  });
  if (welcomeResult.success) {
    // Best-effort : on note la date d envoi pour l anti-doublon broadcast.
    await adminClient
      .from('users')
      .update({ welcome_email_sent_at: new Date().toISOString() })
      .eq('id', newUser.user.id);
  } else {
    logger.warn('actions.users', 'welcome email send failed', {
      to: parsed.data.email,
      error: welcomeResult.error,
    });
  }
} catch (err) {
  logger.error('actions.users', 'welcome email threw', {
    to: parsed.data.email,
    error: err instanceof Error ? err.message : String(err),
  });
}
```

- [ ] **Step 3: Vérifier que `logger` est déjà importé en haut de `users.ts`**

Run: `head -20 lib/actions/users.ts | grep logger`
Expected: import présent. Sinon, ajouter `import { logger } from '@/lib/logger';` en haut.

- [ ] **Step 4: Vérifier le build**

Run: `npm run build`
Expected: build OK.

- [ ] **Step 5: Lancer la suite de tests**

Run: `npm test`
Expected: tous tests passent (les tests existants sur `users.ts` ne testent pas l'invitation email, donc pas de régression attendue).

- [ ] **Step 6: Lint**

Run: `npm run lint -- lib/actions/users.ts`
Expected: 0 erreurs.

- [ ] **Step 7: Commit**

```bash
git add lib/actions/users.ts
git commit -m "feat(users): envoi auto du welcome email a la creation de compte"
```

### Variante B (fusion) ou C (différer)

Si Nael choisit B ou C, ce plan ne s'applique pas tel quel. Nael me redemande un sub-plan adapté à la décision.

---

## Self-Review du plan

Vérifications effectuées:

- **Spec coverage:**
  - 4 templates par rôle → Task 2 ✓
  - Script test local → Task 3 ✓
  - Endpoint broadcast → Task 4 ✓
  - Intégration create-user → Task 5 ✓
  - Migration anti-doublon → Task 1 ✓
  - Garde-fous (RESEND_API_KEY absent, EMAIL_OVERRIDE) → hérités du hub existant, pas de code spécifique à écrire ✓
  - Logs `email_send_log` → hérités du hub `sendEmail` existant ✓
  - Tests unitaires builders + dispatcher → Task 2 + Task 4 (filterEligibleRecipients) ✓

- **Placeholders:** aucun "TBD"/"TODO"/"à compléter" dans les steps.

- **Type consistency:** `BroadcastUser` est défini Task 4 Step 5 et utilisé Task 4 Step 7. `Role` enum cohérent (`admin | superadmin | cdp | commercial`).

- **Décision déclarative en Task 5:** flag pour Nael avant exécution. Variante par défaut (A) prête à exécuter sans bloquer.
