# Module Projet - Lot 0 : socle de navigation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Découper la fiche projet `/projets/[ref]`, aujourd'hui une seule page qui scrolle, en une synthèse de 5 cartes cliquables plus 5 sous-routes de détail, sans ajouter ni modifier la moindre donnée métier.

**Architecture:** Un layout partagé `app/(dashboard)/projets/[ref]/layout.tsx` porte l'en-tête projet et une sous-navigation par liens. Chaque sous-route charge uniquement ses propres données. Une fonction pure `buildSyntheseCards` construit les 5 cartes à partir d'agrégats déjà calculés, ce qui rend la contrainte de densité testable plutôt que déclarative. `getProjetByRef` est mémoïsée par requête pour que layout et page ne fassent pas deux allers-retours.

**Tech Stack:** Next.js 16 App Router, TypeScript, React Server Components, TailwindCSS 4, shadcn/ui sur base-ui, Supabase, Vitest.

**Spec de référence:** `docs/superpowers/specs/2026-08-06-module-projet-synthese-details-design.md`

---

## Contexte pour l'implémenteur

La fiche projet actuelle (`app/(dashboard)/projets/[ref]/page.tsx`, 198 lignes) charge **dix requêtes en parallèle** puis rend six sections ancrées. Toutes ces requêtes existent déjà et fonctionnent : ce lot ne fait que les **répartir** entre les routes qui en ont besoin.

Trois règles qui priment sur tout le reste dans ce lot :

1. **Aucune donnée métier ne change.** Pas de nouvelle colonne, pas de nouvelle migration, pas de nouveau calcul. Si tu te retrouves à écrire une requête SQL, tu es sorti du périmètre.
2. **À l'issue du lot, l'information affichée est la même qu'avant**, seulement répartie. C'est le critère de non-régression.
3. **Densité plafonnée** : chaque carte de synthèse porte une valeur et une ligne de contexte, rien d'autre.

Pièges spécifiques à ce codebase :

- shadcn/ui est monté sur **base-ui**, pas radix. Pas de prop `asChild`, pas de `delayDuration` sur `Tooltip`.
- La route `app/(dashboard)/projets/[ref]/contrats/[id]/page.tsx` **existe déjà** (détail d'un contrat). Créer `contrats/page.tsx` ajoute simplement l'index de ce segment, ça ne casse rien.
- `npm test` doit passer avant chaque push (un hook pre-push l'impose, ne jamais utiliser `--no-verify`).

## Structure des fichiers

**À créer :**

| Fichier                                                                                     | Responsabilité                                           |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `lib/projets/synthese.ts`                                                                   | Types et fonction pure `buildSyntheseCards`. Aucune I/O. |
| `__tests__/projet-synthese.test.ts`                                                         | Tests de `buildSyntheseCards`.                           |
| `app/(dashboard)/projets/[ref]/layout.tsx`                                                  | En-tête projet + sous-nav, partagés par les 6 routes.    |
| `components/projets/projet-sous-nav.tsx`                                                    | Sous-nav par liens, surligne la route courante.          |
| `components/projets/projet-synthese-cards.tsx`                                              | Rendu des 5 cartes.                                      |
| `components/projets/projet-suivi-panel.tsx`                                                 | Bloc Suivi (documents + tâches Plane).                   |
| `app/(dashboard)/projets/[ref]/lancement/page.tsx`                                          | Timeline.                                                |
| `app/(dashboard)/projets/[ref]/production/page.tsx`                                         | Apprenants + performance.                                |
| `app/(dashboard)/projets/[ref]/finance/page.tsx`                                            | Finance + temps + échéancier.                            |
| `app/(dashboard)/projets/[ref]/qualite/page.tsx`                                            | Renvoi vers le module Qualiopi.                          |
| `app/(dashboard)/projets/[ref]/contrats/page.tsx`                                           | Table des contrats.                                      |
| `components/projets/projet-sous-page-skeleton.tsx`                                          | Squelette de chargement partagé.                         |
| `app/(dashboard)/projets/[ref]/{lancement,production,finance,qualite,contrats}/loading.tsx` | 5 fichiers de 3 lignes réutilisant le squelette.         |

**À modifier :**

| Fichier                                     | Changement                                  |
| ------------------------------------------- | ------------------------------------------- |
| `lib/queries/projets.ts:183`                | Envelopper `getProjetByRef` dans `cache()`. |
| `app/(dashboard)/projets/[ref]/page.tsx`    | Devient la synthèse seule.                  |
| `app/(dashboard)/projets/[ref]/loading.tsx` | Aligné sur la nouvelle synthèse.            |

**Inchangés, seulement déplacés :** tous les composants de `components/projets/` déjà existants, `components/taches/entite-taches-section.tsx`, et toutes les fonctions de `lib/queries/`.

---

## Task 1 : Mémoïser `getProjetByRef`

Le layout et chaque page ont tous deux besoin du projet. Sans mémoïsation, chaque affichage déclenche deux requêtes identiques. `cache()` de React déduplique à l'échelle d'une requête HTTP.

**Files:**

- Modify: `lib/queries/projets.ts:183`

- [ ] **Step 1: Vérifier l'état actuel**

Run: `grep -n "^import\|export async function getProjetByRef" lib/queries/projets.ts | head -20`

Attendu : la liste des imports, et `getProjetByRef` déclarée en ligne 183 sans `cache`.

- [ ] **Step 2: Ajouter l'import de `cache`**

En tête de `lib/queries/projets.ts`, ajouter en première ligne :

```ts
import { cache } from 'react';
```

- [ ] **Step 3: Envelopper la fonction**

Remplacer la ligne `export async function getProjetByRef(ref: string) {` par :

```ts
// Memoise par requete HTTP : le layout de /projets/[ref] et chacune de ses
// sous-pages appellent tous getProjetByRef. Sans cache(), afficher une
// sous-page declencherait deux fois la meme requete Supabase.
export const getProjetByRef = cache(async (ref: string) => {
```

Puis, à la fin de cette fonction, remplacer l'accolade fermante `}` par `});`.

Attention : la fonction fait environ 50 lignes et se termine juste avant `export type ProjetDetail` ou la fonction suivante. Repérer précisément sa fermeture avant d'éditer.

- [ ] **Step 4: Vérifier que les types tiennent toujours**

Run: `npm run typecheck`
Attendu : aucune erreur. En particulier `ProjetDetail` (dérivé par `Awaited<ReturnType<typeof getProjetByRef>>`) doit rester inchangé.

- [ ] **Step 5: Vérifier la non-régression**

Run: `npm test`
Attendu : suite verte.

- [ ] **Step 6: Commit**

```bash
git add lib/queries/projets.ts
git commit -m "perf(projet): memoise getProjetByRef par requete

Prepare le layout partage : layout + page appelleront tous deux
getProjetByRef, cache() evite le doublon de requete Supabase."
```

---

## Task 2 : Fonction pure `buildSyntheseCards`

C'est le cœur du lot. Toute la logique d'affichage des cartes vit ici, hors de React, donc testable sans rendu. La contrainte « une valeur, une ligne de contexte » devient une propriété vérifiée par des tests plutôt qu'une intention.

**Files:**

- Create: `lib/projets/synthese.ts`
- Test: `__tests__/projet-synthese.test.ts`

- [ ] **Step 1: Écrire le test qui échoue**

Créer `__tests__/projet-synthese.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { buildSyntheseCards, type SyntheseInput } from '@/lib/projets/synthese';

const BASE: SyntheseInput = {
  projetRef: '0016-HEO-APP',
  lancement: { terminees: 3, total: 7 },
  production: { apprentisActifs: 12, progressionPct: 85 },
  finance: { produitHt: 24000, factureHt: 18000 },
  qualite: { realise: 18, total: 29 },
  contrats: { total: 15, actifs: 12 },
};

describe('buildSyntheseCards', () => {
  it('produit exactement cinq cartes, dans l ordre de la sous-nav', () => {
    const cards = buildSyntheseCards(BASE);
    expect(cards.map((c) => c.cle)).toEqual([
      'lancement',
      'production',
      'finance',
      'qualite',
      'contrats',
    ]);
  });

  it('pointe chaque carte vers sa sous-route', () => {
    const cards = buildSyntheseCards(BASE);
    expect(cards.map((c) => c.href)).toEqual([
      '/projets/0016-HEO-APP/lancement',
      '/projets/0016-HEO-APP/production',
      '/projets/0016-HEO-APP/finance',
      '/projets/0016-HEO-APP/qualite',
      '/projets/0016-HEO-APP/contrats',
    ]);
  });

  it('encode la ref dans l URL', () => {
    const cards = buildSyntheseCards({ ...BASE, projetRef: 'a b' });
    expect(cards[0]!.href).toBe('/projets/a%20b/lancement');
  });

  it('affiche l avancement du lancement en fraction', () => {
    const c = buildSyntheseCards(BASE)[0]!;
    expect(c.valeur).toBe('3/7');
    expect(c.contexte).toBe('étapes terminées');
    expect(c.ton).toBe('attention');
  });

  it('passe le lancement en neutre quand toutes les etapes sont terminees', () => {
    const c = buildSyntheseCards({
      ...BASE,
      lancement: { terminees: 7, total: 7 },
    })[0]!;
    expect(c.ton).toBe('neutre');
  });

  it('colore la production selon la progression', () => {
    const bon = buildSyntheseCards(BASE)[1]!;
    expect(bon.valeur).toBe('85 %');
    expect(bon.ton).toBe('neutre');

    const moyen = buildSyntheseCards({
      ...BASE,
      production: { apprentisActifs: 12, progressionPct: 60 },
    })[1]!;
    expect(moyen.ton).toBe('attention');

    const mauvais = buildSyntheseCards({
      ...BASE,
      production: { apprentisActifs: 12, progressionPct: 40 },
    })[1]!;
    expect(mauvais.ton).toBe('alerte');
  });

  it('reste neutre et affiche un tiret quand la progression est inconnue', () => {
    const c = buildSyntheseCards({
      ...BASE,
      production: { apprentisActifs: 0, progressionPct: null },
    })[1]!;
    expect(c.valeur).toBe('-');
    expect(c.ton).toBe('neutre');
    expect(c.contexte).toBe('aucun apprenti actif');
  });

  it('accorde le contexte de production au singulier', () => {
    const c = buildSyntheseCards({
      ...BASE,
      production: { apprentisActifs: 1, progressionPct: 85 },
    })[1]!;
    expect(c.contexte).toBe('1 apprenti actif');
  });

  it('alerte sur la finance quand rien n est facture alors qu il y a du produit', () => {
    const c = buildSyntheseCards({
      ...BASE,
      finance: { produitHt: 24000, factureHt: 0 },
    })[2]!;
    expect(c.ton).toBe('alerte');
  });

  it('reste neutre sur la finance quand il n y a rien a facturer', () => {
    const c = buildSyntheseCards({
      ...BASE,
      finance: { produitHt: 0, factureHt: 0 },
    })[2]!;
    expect(c.ton).toBe('neutre');
  });

  it('affiche la qualite en pourcentage avec le detail des livrables', () => {
    const c = buildSyntheseCards(BASE)[3]!;
    expect(c.valeur).toBe('62 %');
    expect(c.contexte).toBe('18/29 livrables');
    expect(c.ton).toBe('attention');
  });

  it('neutralise la qualite quand aucun referentiel n est disponible', () => {
    const c = buildSyntheseCards({
      ...BASE,
      qualite: { realise: 0, total: 0 },
    })[3]!;
    expect(c.valeur).toBe('-');
    expect(c.ton).toBe('neutre');
    expect(c.contexte).toBe('référentiel non disponible');
  });

  it('resume les contrats', () => {
    const c = buildSyntheseCards(BASE)[4]!;
    expect(c.valeur).toBe('15');
    expect(c.contexte).toBe('12 actifs');
  });

  it('tient la contrainte de densite : une seule ligne de contexte par carte', () => {
    for (const c of buildSyntheseCards(BASE)) {
      expect(c.contexte).not.toContain('\n');
      expect(c.contexte.length).toBeLessThanOrEqual(40);
    }
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run __tests__/projet-synthese.test.ts`
Attendu : ÉCHEC, `Failed to resolve import "@/lib/projets/synthese"`.

- [ ] **Step 3: Écrire l'implémentation**

Créer `lib/projets/synthese.ts` :

```ts
import { formatCurrency } from '@/lib/utils/formatters';

/**
 * Ton visuel d'une carte de synthese. Volontairement limite a trois valeurs :
 * une palette plus riche pousse a colorer des cartes qui n'ont rien a signaler,
 * et la synthese redevient un mur d'informations.
 */
export type TonCarte = 'neutre' | 'attention' | 'alerte';

export type CleCarte =
  | 'lancement'
  | 'production'
  | 'finance'
  | 'qualite'
  | 'contrats';

export interface CarteSynthese {
  cle: CleCarte;
  titre: string;
  /** Le chiffre-cle, deja formate pour l'affichage. */
  valeur: string;
  /** UNE ligne de contexte. Jamais deux, jamais un paragraphe. */
  contexte: string;
  href: string;
  ton: TonCarte;
}

export interface SyntheseInput {
  projetRef: string;
  lancement: { terminees: number; total: number };
  production: { apprentisActifs: number; progressionPct: number | null };
  finance: { produitHt: number; factureHt: number };
  qualite: { realise: number; total: number };
  contrats: { total: number; actifs: number };
}

/** Vert au-dessus de 80, orange entre 50 et 79, rouge en dessous. Meme echelle
 * que les volets de performance (lib/queries/projet-performance.ts) pour ne pas
 * qu'un CDP apprenne deux codes couleur differents. */
function tonDepuisPct(pct: number): TonCarte {
  if (pct >= 80) return 'neutre';
  if (pct >= 50) return 'attention';
  return 'alerte';
}

export function buildSyntheseCards(input: SyntheseInput): CarteSynthese[] {
  const base = `/projets/${encodeURIComponent(input.projetRef)}`;

  const { terminees, total: totalEtapes } = input.lancement;
  const lancement: CarteSynthese = {
    cle: 'lancement',
    titre: 'Lancement',
    valeur: `${terminees}/${totalEtapes}`,
    contexte: 'étapes terminées',
    href: `${base}/lancement`,
    ton: terminees >= totalEtapes ? 'neutre' : 'attention',
  };

  const { apprentisActifs, progressionPct } = input.production;
  const production: CarteSynthese = {
    cle: 'production',
    titre: 'Production',
    valeur: progressionPct == null ? '-' : `${Math.round(progressionPct)} %`,
    contexte:
      apprentisActifs === 0
        ? 'aucun apprenti actif'
        : `${apprentisActifs} apprenti${apprentisActifs > 1 ? 's' : ''} actif${apprentisActifs > 1 ? 's' : ''}`,
    href: `${base}/production`,
    // Progression inconnue = pas d'information, donc pas d'alarme.
    ton: progressionPct == null ? 'neutre' : tonDepuisPct(progressionPct),
  };

  const { produitHt, factureHt } = input.finance;
  const finance: CarteSynthese = {
    cle: 'finance',
    titre: 'Finance',
    valeur: formatCurrency(produitHt),
    contexte: `${formatCurrency(factureHt)} facturés`,
    href: `${base}/finance`,
    // Un projet sans production n'a rien a facturer : ce n'est pas un retard.
    ton:
      produitHt <= 0 ? 'neutre' : tonDepuisPct((factureHt / produitHt) * 100),
  };

  const { realise, total: totalLivrables } = input.qualite;
  const qualitePct =
    totalLivrables > 0 ? (realise / totalLivrables) * 100 : null;
  const qualite: CarteSynthese = {
    cle: 'qualite',
    titre: 'Qualité',
    valeur: qualitePct == null ? '-' : `${Math.round(qualitePct)} %`,
    contexte:
      qualitePct == null
        ? 'référentiel non disponible'
        : `${realise}/${totalLivrables} livrables`,
    href: `${base}/qualite`,
    ton: qualitePct == null ? 'neutre' : tonDepuisPct(qualitePct),
  };

  const contrats: CarteSynthese = {
    cle: 'contrats',
    titre: 'Contrats',
    valeur: String(input.contrats.total),
    contexte: `${input.contrats.actifs} actifs`,
    href: `${base}/contrats`,
    ton: 'neutre',
  };

  return [lancement, production, finance, qualite, contrats];
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run __tests__/projet-synthese.test.ts`
Attendu : PASS, 14 tests.

Si le test de densité échoue sur `finance`, c'est que `formatCurrency` produit une chaîne plus longue que prévu pour de gros montants. Dans ce cas, allonger la borne du test à 48 caractères plutôt que de raccourcir le libellé.

- [ ] **Step 5: Commit**

```bash
git add lib/projets/synthese.ts __tests__/projet-synthese.test.ts
git commit -m "feat(projet): fonction pure buildSyntheseCards

5 cartes de synthese construites hors React, donc testables. La
contrainte de densite (une valeur, une ligne de contexte) est
verifiee par un test plutot que laissee a l'appreciation du rendu."
```

---

## Task 3 : Sous-navigation par liens

Remplace `SectionNav` (ancres + scroll-spy) par une navigation entre routes. `SectionNav` reste en place, il est utilisé ailleurs dans l'app.

**Files:**

- Create: `components/projets/projet-sous-nav.tsx`

- [ ] **Step 1: Écrire le composant**

Créer `components/projets/projet-sous-nav.tsx` :

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const ONGLETS = [
  { segment: '', label: 'Synthèse' },
  { segment: 'lancement', label: 'Lancement' },
  { segment: 'production', label: 'Production' },
  { segment: 'finance', label: 'Finance' },
  { segment: 'qualite', label: 'Qualité' },
  { segment: 'contrats', label: 'Contrats' },
] as const;

/**
 * Navigation entre les sous-routes d'un projet. Remplace l'ancienne SectionNav
 * a ancres : chaque zone est desormais une vraie page, donc un vrai lien.
 */
export function ProjetSousNav({ projetRef }: { projetRef: string }) {
  const pathname = usePathname();
  const base = `/projets/${encodeURIComponent(projetRef)}`;

  return (
    <nav
      aria-label="Sections du projet"
      className="bg-background/95 sticky top-0 z-10 -mx-1 mb-4 flex gap-1 overflow-x-auto px-1 py-2 backdrop-blur"
    >
      {ONGLETS.map((onglet) => {
        const href = onglet.segment ? `${base}/${onglet.segment}` : base;
        // La synthese ne doit pas rester active sur les sous-routes, d'ou
        // l'egalite stricte plutot qu'un startsWith.
        const actif = pathname === href;
        return (
          <Link
            key={onglet.segment || 'synthese'}
            href={href}
            aria-current={actif ? 'page' : undefined}
            className={cn(
              'rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors',
              actif
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
            )}
          >
            {onglet.label}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: Vérifier les types**

Run: `npm run typecheck`
Attendu : aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add components/projets/projet-sous-nav.tsx
git commit -m "feat(projet): sous-nav par liens entre les routes du projet"
```

---

## Task 4 : Layout partagé

**Files:**

- Create: `app/(dashboard)/projets/[ref]/layout.tsx`

- [ ] **Step 1: Écrire le layout**

Créer `app/(dashboard)/projets/[ref]/layout.tsx` :

```tsx
import { notFound } from 'next/navigation';
import { getProjetByRef } from '@/lib/queries/projets';
import { createClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/utils/roles';
import { Breadcrumbs } from '@/components/shared/breadcrumbs';
import { ProjetDetailHeader } from '@/components/projets/projet-detail-header';
import { ProjetDuplicateButton } from '@/components/projets/projet-duplicate-button';
import { ProjetSousNav } from '@/components/projets/projet-sous-nav';

/**
 * En-tete et sous-nav partages par la synthese et les 5 sous-pages : le
 * contexte projet reste affiche en permanence, on ne se perd pas dans les
 * niveaux. getProjetByRef est memoise (cache()), donc l'appel ici ne coute
 * rien de plus a la page enfant qui le rappelle.
 */
export default async function ProjetLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ ref: string }>;
}) {
  const [{ ref }, supabase] = await Promise.all([params, createClient()]);
  const [projet, authUserRes] = await Promise.all([
    getProjetByRef(ref),
    supabase.auth.getUser(),
  ]);

  if (!projet) {
    notFound();
  }

  const authUser = authUserRes.data.user;
  const currentUserRes = authUser
    ? await supabase.from('users').select('role').eq('id', authUser.id).single()
    : null;
  const userIsAdmin = isAdmin(currentUserRes?.data?.role ?? null);

  return (
    <div>
      <Breadcrumbs
        items={[{ label: 'Projets', href: '/projets' }, { label: ref }]}
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <ProjetDetailHeader projet={projet} />
        {userIsAdmin && (
          <ProjetDuplicateButton
            projetId={projet.id}
            projetRef={projet.ref ?? ''}
          />
        )}
      </div>

      <ProjetSousNav projetRef={ref} />

      {children}
    </div>
  );
}
```

- [ ] **Step 2: Vérifier les types**

Run: `npm run typecheck`
Attendu : aucune erreur. La page actuelle rend encore son propre en-tête, il y aura donc temporairement un doublon visuel à l'écran : c'est normal, la Task 5 le supprime.

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/projets/[ref]/layout.tsx"
git commit -m "feat(projet): layout partage avec en-tete et sous-nav"
```

---

## Task 5 : Page de synthèse

La page actuelle est vidée de ses six sections et ne garde que les cinq cartes. **Ne pas supprimer les composants de section** : ils sont réutilisés tels quels par les Tasks 6 à 10.

**Files:**

- Create: `components/projets/projet-synthese-cards.tsx`
- Modify: `app/(dashboard)/projets/[ref]/page.tsx` (réécriture complète)

- [ ] **Step 1: Écrire le composant de cartes**

Créer `components/projets/projet-synthese-cards.tsx` :

```tsx
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { CarteSynthese, TonCarte } from '@/lib/projets/synthese';

const TON_VALEUR: Record<TonCarte, string> = {
  neutre: 'text-foreground',
  attention: 'text-amber-600 dark:text-amber-500',
  alerte: 'text-red-600 dark:text-red-400',
};

export function ProjetSyntheseCards({ cartes }: { cartes: CarteSynthese[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cartes.map((carte) => (
        <Link key={carte.cle} href={carte.href} className="group">
          <Card className="hover:border-primary/40 h-full gap-2 p-5 transition-colors">
            <div className="text-muted-foreground flex items-center justify-between text-[11px] font-medium tracking-wider uppercase">
              <span>{carte.titre}</span>
              <ArrowRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
            <p
              className={`text-3xl font-bold tabular-nums ${TON_VALEUR[carte.ton]}`}
            >
              {carte.valeur}
            </p>
            <p className="text-muted-foreground text-sm">{carte.contexte}</p>
          </Card>
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Réécrire la page de synthèse**

Remplacer **tout** le contenu de `app/(dashboard)/projets/[ref]/page.tsx` par :

```tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  getProjetByRef,
  getContratsByProjetId,
  getProjetFinance,
} from '@/lib/queries/projets';
import { getLancementByProjetId } from '@/lib/queries/projet-lancement';
import { getProjetPerformance } from '@/lib/queries/projet-performance';
import {
  computeQualiopiCompletionForClients,
  type QualiopiCompletion,
} from '@/lib/queries/qualiopi-stats';
import { ProjetSyntheseCards } from '@/components/projets/projet-synthese-cards';
import { ProjetSuiviPanel } from '@/components/projets/projet-suivi-panel';
import { buildSyntheseCards } from '@/lib/projets/synthese';
import { ttcToHt } from '@/lib/utils/montant-ht';
import { isContratActif } from '@/lib/utils/contrat-states';
import { LANCEMENT_ETAPES } from '@/lib/lancement/constants';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ref: string }>;
}): Promise<Metadata> {
  const { ref } = await params;
  return { title: `${ref} - Projets - SOLUVIA` };
}

export default async function ProjetSynthesePage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const projet = await getProjetByRef(ref);
  if (!projet) notFound();

  const [contrats, finance, performance, lancement, qualiopiParClient] =
    await Promise.all([
      getContratsByProjetId(projet.id),
      getProjetFinance(projet.id),
      getProjetPerformance(projet.id),
      getLancementByProjetId(projet.id),
      projet.client?.id
        ? computeQualiopiCompletionForClients([projet.client.id])
        : Promise.resolve(new Map<string, QualiopiCompletion>()),
    ]);

  const qualite = (projet.client?.id
    ? qualiopiParClient.get(projet.client.id)
    : null) ?? { realise: 0, total: 0 };

  // Production SOLUVIA en HT : le taux de commission donne un montant TTC,
  // ttcToHt en deduit le HT (convention project_affichage_ht).
  const produitHt = finance
    ? finance.production_opco * ttcToHt(finance.taux_commission / 100)
    : 0;

  const cartes = buildSyntheseCards({
    projetRef: ref,
    lancement: {
      terminees: lancement.etapes.filter((e) => e.statut === 'lance').length,
      total: LANCEMENT_ETAPES.length,
    },
    production: {
      apprentisActifs: contrats.filter((c) => isContratActif(c.contract_state))
        .length,
      progressionPct: performance.pedagogie.value,
    },
    finance: {
      produitHt,
      factureHt: finance?.facture_soluvia ?? 0,
    },
    qualite,
    contrats: {
      total: contrats.length,
      actifs: contrats.filter((c) => isContratActif(c.contract_state)).length,
    },
  });

  return (
    <div className="space-y-6">
      <ProjetSyntheseCards cartes={cartes} />
      <ProjetSuiviPanel projetId={projet.id} projetRef={ref} />
    </div>
  );
}
```

- [ ] **Step 3: Vérifier le typage des champs de finance**

Run: `grep -n "facture_soluvia\|production_opco\|taux_commission" lib/queries/projets.ts | head -10`

Attendu : ces trois noms existent bien dans le retour de `getProjetFinance`. S'ils diffèrent, corriger la page pour utiliser les noms réels plutôt que d'inventer des alias.

- [ ] **Step 4: Vérifier les types**

Run: `npm run typecheck`
Attendu : **une seule** erreur, sur `@/components/projets/projet-suivi-panel` qui n'existe pas encore. C'est attendu, la Task 10 le crée.

Si tu veux un typecheck propre à cette étape, commente temporairement l'import et l'usage de `ProjetSuiviPanel`, puis rétablis-les en Task 10.

- [ ] **Step 5: Commit**

```bash
git add components/projets/projet-synthese-cards.tsx "app/(dashboard)/projets/[ref]/page.tsx"
git commit -m "feat(projet): la fiche projet devient une synthese de 5 cartes"
```

---

## Task 6 : Sous-route `/lancement`

**Files:**

- Create: `app/(dashboard)/projets/[ref]/lancement/page.tsx`

- [ ] **Step 1: Écrire la page**

Créer `app/(dashboard)/projets/[ref]/lancement/page.tsx` :

```tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getProjetByRef } from '@/lib/queries/projets';
import { getLancementByProjetId } from '@/lib/queries/projet-lancement';
import { createClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/utils/roles';
import { ProjetLancementSection } from '@/components/projets/projet-lancement-section';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ref: string }>;
}): Promise<Metadata> {
  const { ref } = await params;
  return { title: `Lancement - ${ref} - SOLUVIA` };
}

export default async function ProjetLancementPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const [{ ref }, supabase] = await Promise.all([params, createClient()]);
  const [projet, authUserRes] = await Promise.all([
    getProjetByRef(ref),
    supabase.auth.getUser(),
  ]);
  if (!projet) notFound();

  const authUser = authUserRes.data.user;
  const [currentUserRes, lancement] = await Promise.all([
    authUser
      ? supabase.from('users').select('role').eq('id', authUser.id).single()
      : Promise.resolve({ data: null as { role: string | null } | null }),
    getLancementByProjetId(projet.id),
  ]);

  const userIsAdmin = isAdmin(currentUserRes?.data?.role ?? null);
  const canEdit =
    userIsAdmin ||
    projet.cdp?.id === authUser?.id ||
    projet.backup_cdp?.id === authUser?.id;

  return (
    <ProjetLancementSection
      projetId={projet.id}
      projetRef={ref}
      lancement={lancement}
      canEdit={canEdit}
      userIsAdmin={userIsAdmin}
      currentUserId={authUser?.id ?? null}
    />
  );
}
```

- [ ] **Step 2: Vérifier les types**

Run: `npm run typecheck`
Attendu : aucune erreur nouvelle (hors `projet-suivi-panel` si tu ne l'as pas encore créé).

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/projets/[ref]/lancement/page.tsx"
git commit -m "feat(projet): sous-route /lancement"
```

---

## Task 7 : Sous-route `/contrats`

**Files:**

- Create: `app/(dashboard)/projets/[ref]/contrats/page.tsx`

- [ ] **Step 1: Écrire la page**

Créer `app/(dashboard)/projets/[ref]/contrats/page.tsx` :

```tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getProjetByRef, getContratsByProjetId } from '@/lib/queries/projets';
import { ProjetContratsTable } from '@/components/projets/projet-contrats-table';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ref: string }>;
}): Promise<Metadata> {
  const { ref } = await params;
  return { title: `Contrats - ${ref} - SOLUVIA` };
}

export default async function ProjetContratsPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const projet = await getProjetByRef(ref);
  if (!projet) notFound();

  const contrats = await getContratsByProjetId(projet.id);

  return <ProjetContratsTable contrats={contrats} />;
}
```

- [ ] **Step 2: Vérifier que la route de détail existante n'est pas cassée**

Run: `ls "app/(dashboard)/projets/[ref]/contrats/"`
Attendu : `[id]` et `page.tsx`. Le segment `[id]` reste intact.

- [ ] **Step 3: Vérifier les types**

Run: `npm run typecheck`
Attendu : aucune erreur nouvelle.

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/projets/[ref]/contrats/page.tsx"
git commit -m "feat(projet): sous-route /contrats"
```

---

## Task 8 : Sous-route `/finance`

Reprend le bloc finance de l'ancienne page : finance, temps, et le placeholder d'échéancier. La carte Qualiopi qui y figurait part vers `/qualite` (Task 9).

**Files:**

- Create: `app/(dashboard)/projets/[ref]/finance/page.tsx`

- [ ] **Step 1: Écrire la page**

Créer `app/(dashboard)/projets/[ref]/finance/page.tsx` :

```tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  getProjetByRef,
  getProjetFinance,
  getProjetTempsStats,
} from '@/lib/queries/projets';
import { listEcheancierTemplates } from '@/lib/queries/echeanciers';
import { createClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/utils/roles';
import { ProjetFinanceSection } from '@/components/projets/projet-finance-section';
import { ProjetTempsSection } from '@/components/projets/projet-temps-section';
import { ProjetEcheancierManualPlaceholder } from '@/components/projets/projet-echeancier-section';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ref: string }>;
}): Promise<Metadata> {
  const { ref } = await params;
  return { title: `Finance - ${ref} - SOLUVIA` };
}

export default async function ProjetFinancePage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const [{ ref }, supabase] = await Promise.all([params, createClient()]);
  const [projet, authUserRes] = await Promise.all([
    getProjetByRef(ref),
    supabase.auth.getUser(),
  ]);
  if (!projet) notFound();

  const authUser = authUserRes.data.user;
  const [currentUserRes, finance, temps, echeancierTemplates] =
    await Promise.all([
      authUser
        ? supabase.from('users').select('role').eq('id', authUser.id).single()
        : Promise.resolve({ data: null as { role: string | null } | null }),
      getProjetFinance(projet.id),
      getProjetTempsStats(projet.id),
      listEcheancierTemplates(),
    ]);

  const userIsAdmin = isAdmin(currentUserRes?.data?.role ?? null);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <ProjetFinanceSection
          finance={finance}
          projetId={projet.id}
          canEdit={userIsAdmin}
          modeleFacturation={
            projet.modele_facturation === 'engagement'
              ? 'engagement'
              : 'echeancier'
          }
          echeancierTemplateId={projet.echeancier_template_id}
          echeancierTemplates={echeancierTemplates.map((t) => ({
            id: t.id,
            nom: t.nom,
            is_default: t.is_default,
          }))}
        />
        <ProjetTempsSection temps={temps} />
      </div>
      <ProjetEcheancierManualPlaceholder />
    </div>
  );
}
```

- [ ] **Step 2: Vérifier les types**

Run: `npm run typecheck`
Attendu : aucune erreur nouvelle.

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/projets/[ref]/finance/page.tsx"
git commit -m "feat(projet): sous-route /finance"
```

---

## Task 9 : Sous-routes `/production` et `/qualite`

Deux pages courtes, regroupées en une tâche.

**Files:**

- Create: `app/(dashboard)/projets/[ref]/production/page.tsx`
- Create: `app/(dashboard)/projets/[ref]/qualite/page.tsx`

- [ ] **Step 1: Écrire la page production**

Créer `app/(dashboard)/projets/[ref]/production/page.tsx` :

```tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getProjetByRef, getContratsByProjetId } from '@/lib/queries/projets';
import { getApprenantsByProjetId } from '@/lib/queries/apprenants';
import { getProjetPerformance } from '@/lib/queries/projet-performance';
import { getRdvFormateursByProjetId } from '@/lib/queries/rdv';
import { ProjetPerformanceVolets } from '@/components/projets/projet-performance-volets';
import { ProjetApprenantsTable } from '@/components/projets/projet-apprenants-table';
import { ProjetRdvSection } from '@/components/projets/projet-rdv-section';
import { isContratActif } from '@/lib/utils/contrat-states';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ref: string }>;
}): Promise<Metadata> {
  const { ref } = await params;
  return { title: `Production - ${ref} - SOLUVIA` };
}

export default async function ProjetProductionPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const projet = await getProjetByRef(ref);
  if (!projet) notFound();

  const [contrats, apprenants, performance, rdvs] = await Promise.all([
    getContratsByProjetId(projet.id),
    getApprenantsByProjetId(projet.id),
    getProjetPerformance(projet.id),
    getRdvFormateursByProjetId(projet.id),
  ]);

  return (
    <div className="space-y-6">
      <ProjetPerformanceVolets
        data={performance}
        apprentisActifs={
          contrats.filter((c) => isContratActif(c.contract_state)).length
        }
      />
      <ProjetApprenantsTable apprenants={apprenants} />
      {/* Les suivis formateurs sont un indicateur de production (spec lot 5),
          pas une piece de suivi administratif : ils vivent ici, pas dans Suivi. */}
      <ProjetRdvSection projetId={projet.id} rdvs={rdvs} />
    </div>
  );
}
```

- [ ] **Step 2: Écrire la page qualité**

Créer `app/(dashboard)/projets/[ref]/qualite/page.tsx` :

```tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getProjetByRef } from '@/lib/queries/projets';
import { ProjetQualiteSection } from '@/components/projets/projet-qualite-section';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ref: string }>;
}): Promise<Metadata> {
  const { ref } = await params;
  return { title: `Qualité - ${ref} - SOLUVIA` };
}

// Lot 0 : la page ne fait que porter le renvoi vers le module Qualiopi.
// Le "reste a faire priorise" arrive au lot 4.
export default async function ProjetQualitePage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const projet = await getProjetByRef(ref);
  if (!projet) notFound();

  return (
    <ProjetQualiteSection clientTrigramme={projet.client?.trigramme ?? null} />
  );
}
```

- [ ] **Step 3: Vérifier les types**

Run: `npm run typecheck`
Attendu : aucune erreur nouvelle.

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/projets/[ref]/production/page.tsx" "app/(dashboard)/projets/[ref]/qualite/page.tsx"
git commit -m "feat(projet): sous-routes /production et /qualite"
```

---

## Task 10 : Panneau Suivi

Le bloc Suivi accueille la partie administrative de l'ancienne section « Activité » : documents et tâches Plane. Les RDV formateurs n'y sont pas, ils sont partis dans `/production` (Task 9), conformément à la spec qui en fait un indicateur de production. Le journal des mails arrive au lot 6.

**Files:**

- Create: `components/projets/projet-suivi-panel.tsx`

- [ ] **Step 1: Écrire le composant**

Créer `components/projets/projet-suivi-panel.tsx`. Le composant charge ses données côté serveur puis les passe à un panneau client :

```tsx
import { getDocumentsByProjetId, getProjetByRef } from '@/lib/queries/projets';
import { ProjetDocumentsSection } from '@/components/projets/projet-documents-section';
import { EntiteTachesSection } from '@/components/taches/entite-taches-section';
import { createClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/utils/roles';

/**
 * Bloc "Suivi" de la synthese : la part administrative de l'ancienne section
 * Activite (documents, taches Plane). Les RDV formateurs sont dans
 * /production. Le journal des mails envoyes arrive au lot 6.
 */
export async function ProjetSuiviPanel({
  projetId,
  projetRef,
}: {
  projetId: string;
  projetRef: string;
}) {
  const supabase = await createClient();
  const [projet, authUserRes] = await Promise.all([
    getProjetByRef(projetRef),
    supabase.auth.getUser(),
  ]);

  const authUser = authUserRes.data.user;
  const [currentUserRes, documents] = await Promise.all([
    authUser
      ? supabase.from('users').select('role').eq('id', authUser.id).single()
      : Promise.resolve({ data: null as { role: string | null } | null }),
    getDocumentsByProjetId(projetId),
  ]);

  const userIsAdmin = isAdmin(currentUserRes?.data?.role ?? null);

  return (
    <section className="space-y-6">
      <h2 className="text-sm font-semibold">Suivi</h2>
      {projet?.client && (
        <EntiteTachesSection
          clientId={projet.client.id}
          planeProjectId={projet.client.plane_project_id}
          canEdit={userIsAdmin}
        />
      )}
      <ProjetDocumentsSection
        projetId={projetId}
        projetRef={projetRef}
        documents={documents}
      />
    </section>
  );
}
```

Note : la spec prévoit un panneau latéral. Au lot 0 il est rendu en bas de la synthèse, ce qui garde le contenu accessible sans dépendre du composant Sheet. Le passage en panneau se fera au lot 6, quand le journal des mails lui donnera sa vraie raison d'être.

- [ ] **Step 2: Rétablir l'import dans la synthèse**

Si tu avais commenté `ProjetSuiviPanel` en Task 5, rétablis l'import et l'usage maintenant.

- [ ] **Step 3: Vérifier les types**

Run: `npm run typecheck`
Attendu : **aucune erreur**, y compris sur la page de synthèse.

- [ ] **Step 4: Commit**

```bash
git add components/projets/projet-suivi-panel.tsx "app/(dashboard)/projets/[ref]/page.tsx"
git commit -m "feat(projet): bloc Suivi (documents, taches, RDV)"
```

---

## Task 11 : États de chargement

**Files:**

- Create: `components/projets/projet-sous-page-skeleton.tsx`
- Create: `app/(dashboard)/projets/[ref]/{lancement,production,finance,qualite,contrats}/loading.tsx`
- Modify: `app/(dashboard)/projets/[ref]/loading.tsx`

- [ ] **Step 1: Écrire le squelette partagé**

Créer `components/projets/projet-sous-page-skeleton.tsx` :

```tsx
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Squelette commun aux sous-pages projet. L'en-tete et la sous-nav vivent dans
 * le layout : ils restent affiches pendant le chargement, le squelette ne
 * couvre donc que la zone de contenu.
 */
export function ProjetSousPageSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-24 w-full rounded-lg" />
      <div className="rounded-lg border">
        <div className="space-y-3 p-4">
          <Skeleton className="h-10 w-full" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Créer les cinq fichiers de chargement**

Pour **chacun** des cinq segments (`lancement`, `production`, `finance`, `qualite`, `contrats`), créer `app/(dashboard)/projets/[ref]/<segment>/loading.tsx` avec exactement ce contenu :

```tsx
import { ProjetSousPageSkeleton } from '@/components/projets/projet-sous-page-skeleton';

export default function Loading() {
  return <ProjetSousPageSkeleton />;
}
```

- [ ] **Step 3: Aligner le chargement de la synthèse**

Remplacer **tout** le contenu de `app/(dashboard)/projets/[ref]/loading.tsx` par :

```tsx
import { Skeleton } from '@/components/ui/skeleton';

export default function ProjetSyntheseLoading() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="space-y-3 rounded-lg border p-5">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-4 w-32" />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Vérifier les fichiers créés**

Run: `find "app/(dashboard)/projets/[ref]" -name "loading.tsx" | sort`

Attendu : 6 lignes, une par segment plus celle de la racine.

- [ ] **Step 5: Commit**

```bash
git add components/projets/projet-sous-page-skeleton.tsx "app/(dashboard)/projets/[ref]"
git commit -m "feat(projet): etats de chargement des sous-routes"
```

---

## Task 12 : Vérification complète et nettoyage

- [ ] **Step 1: Vérifier qu'aucun import mort ne subsiste**

Run: `grep -rn "SectionNav" "app/(dashboard)/projets/"`
Attendu : **aucun résultat**. La sous-nav par ancres a été remplacée. Si `SectionNav` apparaît encore, retirer l'import.

Run: `grep -rn "ProjetQualiteSection\|ProjetRdvSection\|ProjetDocumentsSection\|EntiteTachesSection" "app/(dashboard)/projets/[ref]/page.tsx"`
Attendu : **aucun résultat**. Ces composants sont maintenant montés par les sous-routes et le panneau Suivi.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Attendu : aucune erreur.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Attendu : aucune erreur. Les avertissements préexistants sur d'autres fichiers ne sont pas de ton ressort.

- [ ] **Step 4: Tests**

Run: `npm test`
Attendu : suite verte, dont les 14 tests de `projet-synthese.test.ts`.

- [ ] **Step 5: Build de production**

Run: `npm run build`
Attendu : build réussi. Vérifier dans la sortie que les six routes apparaissent bien : `/projets/[ref]`, et les cinq segments.

C'est l'étape qui attrape les erreurs de layout imbriqué que le typecheck laisse passer.

- [ ] **Step 6: Vérification visuelle**

Run: `npm run dev`

Ouvrir un projet réel et contrôler, dans l'ordre :

1. La synthèse affiche **5 cartes**, tient sur un écran sans scroll.
2. Chaque carte mène à sa page ; la sous-nav surligne la bonne entrée.
3. L'en-tête projet (référence, client, CDP) reste affiché sur les 6 routes.
4. « Synthèse » n'est plus surligné quand on est sur une sous-route.
5. Sur `/lancement`, un CDP non-admin peut toujours modifier les statuts d'étape.
6. Le bouton de duplication n'apparaît que pour un admin.
7. **Aucune information de l'ancienne fiche n'a disparu** : parcourir les 6 routes et cocher que finance, temps, échéancier, apprenants, performance, contrats, qualité, documents, tâches et RDV sont tous présents quelque part.

Le point 7 est le critère d'acceptation du lot. Si quelque chose manque, c'est un bug de ce lot, pas un report au lot suivant.

- [ ] **Step 7: Commit final et push**

```bash
git add -A
git commit -m "chore(projet): verification lot 0 socle navigation"
git push -u origin HEAD
```

Le hook de pre-push relance les tests. Ne jamais contourner avec `--no-verify`.

- [ ] **Step 8: Ouvrir la PR**

`main` est protégée : la PR est obligatoire.

```bash
gh pr create --title "feat(projet): lot 0 - socle de navigation synthese + sous-routes" --body "$(cat <<'EOF'
## Objet

Lot 0 de la refonte du module Projet : `/projets/[ref]` passe d'une page unique qui scrolle a une synthese de 5 cartes cliquables plus 5 sous-routes.

Spec : `docs/superpowers/specs/2026-08-06-module-projet-synthese-details-design.md`

## Perimetre

- Aucune donnee metier modifiee, aucune migration.
- Les composants de section existants sont deplaces, pas reecrits.
- `getProjetByRef` memoisee par requete : le layout et la page ne font plus deux allers-retours.
- `buildSyntheseCards` est une fonction pure couverte par 14 tests.

## Verification

- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` : verts.
- Parcours manuel des 6 routes : aucune information de l'ancienne fiche n'a disparu.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Points de vigilance

**Ce lot ne doit rien faire disparaître.** La tentation sera de « nettoyer » au passage un composant qui paraît redondant. Ne pas le faire : les lots 1 à 6 s'appuient dessus.

**`getProjetByRef` mémoïsée est un prérequis, pas une optimisation.** Sans elle, chaque sous-page fait deux requêtes identiques (layout plus page). Si la Task 1 est sautée, les six routes deviennent mesurablement plus lentes que la page unique qu'elles remplacent.

**Les droits d'édition se recalculent sur chaque route.** `canEdit` dépend du CDP et du backup CDP du projet ; il est recalculé dans `/lancement`. Ne pas le remonter dans le layout : les layouts Next ne passent pas de props aux pages, et le dupliquer dans un contexte client exposerait le rôle côté navigateur.

**Sur le panneau Suivi**, la spec décrit un panneau latéral. Le lot 0 le rend en bas de la synthèse, volontairement : le composant Sheet n'apporte rien tant que le contenu se résume à ce qui était déjà affiché en bas de page. Le passage en panneau se fera au lot 6.
