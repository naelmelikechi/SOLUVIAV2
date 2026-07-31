# Refonte /process : Hub navigable + Fiche-guide — Plan

> **For agentic workers:** implement task-by-task; steps use `- [ ]`. Visual source of truth = the approved mockup `process-redesign.html` (Artifact). Translate its layout/hierarchy/spacing to the app's Tailwind v4 + shadcn/base-ui tokens (do NOT copy its raw CSS vars; map to `--primary`, `--muted`, `--muted-foreground`, `--border`, `--purple`, etc. from `app/globals.css`).

**Goal:** Remplacer la recherche « champ vide » et la fiche « liste de cartes » par (1) un **hub navigable** (recherche + chips + parcours par mission + liste des process) et (2) une **fiche-guide** en timeline numérotée sans la mécanique d'états redondante.

**Architecture:** Aucune évolution DB. Tout se dérive de `process_index` (colonnes `mission_code, mission_nom, fiche_code, titre, source_fiche_id, detail jsonb`). Ajouts : helpers de listing (missions + tous les process), nettoyage markdown du snippet, util date FR. Reconstruction des composants UI.

**Repo:** `~/Desktop/SOLUVIAV2`, branche `feat/process-hub-redesign`. Next 16 (`await params`), shadcn/base-ui, tokens dans `app/globals.css`. Tests plats `__tests__/*.test.ts` (`npx vitest run`). tsconfig `noUncheckedIndexedAccess`. Pas de composant Avatar (→ span initiales). Pas de lib date (→ `Intl.DateTimeFormat('fr-FR')`).

**Réutilise (existant) :** `lib/process/{search,snippet,types,tache-state}.ts`, `createAdminClient()`, `createClient()` (auth). `ProcessSearchResult` a déjà `score` + `snippet`.

---

## Task 1 — Helpers données + nettoyage snippet + util date

**Files:** Create `lib/process/browse.ts`, `lib/process/format.ts` ; Modify `lib/process/snippet.ts`, `lib/process/search.ts`, `lib/process/types.ts` ; Tests `__tests__/process-format.test.ts`, `__tests__/process-snippet.test.ts` (extend).

- [ ] **Step 1 — `lib/process/format.ts` + test (rouge d'abord)**

`__tests__/process-format.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import {
  stripMarkdown,
  formatEcheance,
  missionInitials,
} from '@/lib/process/format';

describe('stripMarkdown', () => {
  it('retire gras/emphase/titres/liens et compacte', () => {
    expect(stripMarkdown('**MA saturé** et _R6223-22_')).toBe(
      'MA saturé et R6223-22',
    );
    expect(stripMarkdown('## Titre\n\n- point 1\n- point 2')).toBe(
      'Titre point 1 point 2',
    );
    expect(stripMarkdown('voir [le doc](http://x) ici')).toBe(
      'voir le doc ici',
    );
    expect(stripMarkdown('emoji 📄 gardé')).toContain('gardé');
  });
});
describe('formatEcheance', () => {
  it('formate une date ISO en FR long', () => {
    expect(formatEcheance('2026-06-26')).toBe('26 juin 2026');
  });
  it('null → null', () => {
    expect(formatEcheance(null)).toBeNull();
  });
});
describe('missionInitials', () => {
  it('prend 2 initiales', () => {
    expect(missionInitials('Leslie Gangemi')).toBe('LG');
  });
  it('null → tiret', () => {
    expect(missionInitials(null)).toBe('—');
  });
});
```

Run `npx vitest run __tests__/process-format.test.ts` → FAIL.

- [ ] **Step 2 — implémenter `lib/process/format.ts`**

````ts
/** Retire la syntaxe markdown pour un extrait/lecture courte en texte brut. */
export function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ') // blocs code
    .replace(/`([^`]+)`/g, '$1') // code inline
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // liens → texte
    .replace(/^#{1,6}\s+/gm, '') // titres
    .replace(/^\s*[-*+]\s+/gm, '') // puces
    .replace(/^\s*\d+\.\s+/gm, '') // listes ordonnées
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1') // gras/emphase
    .replace(/[*_>#]/g, ' ') // symboles résiduels
    .replace(/\s+/g, ' ')
    .trim();
}

const ECHEANCE_FMT = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
/** 'YYYY-MM-DD' → '26 juin 2026' (null → null). Parse en UTC pour éviter le décalage TZ. */
export function formatEcheance(iso: string | null): string | null {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return ECHEANCE_FMT.format(new Date(Date.UTC(y, m - 1, d)));
}

/** Initiales d'un responsable ('Leslie Gangemi' → 'LG'), null → '—'. */
export function missionInitials(name: string | null): string {
  if (!name) return '—';
  const parts = name.trim().split(/\s+/);
  const a = parts[0]?.[0] ?? '';
  const b = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (a + b).toUpperCase() || '—';
}
````

Run test → PASS.

- [ ] **Step 3 — snippet nettoyé** : dans `lib/process/snippet.ts`, appliquer `stripMarkdown` au contenu AVANT extraction. Au début de `buildSnippet`, remplacer `const clean = contenu.replace(/\s+/g, ' ').trim();` par `const clean = stripMarkdown(contenu);` (import depuis `./format`). Ajouter un test dans `__tests__/process-snippet.test.ts` : `expect(buildSnippet('**gras** ' + 'x'.repeat(300), 'gras', 80)).not.toContain('**');`. Vérifier que les 3 tests existants passent toujours (le contenu court `'court'` reste `'court'`). Run `npx vitest run __tests__/process-snippet.test.ts`.

- [ ] **Step 4 — exposer la pertinence** : dans `lib/process/types.ts`, `ProcessSearchResult` a déjà `score` (0..1). Rien à changer côté type. (Le % d'affichage = `Math.round(score*100)`, fait côté UI.)

- [ ] **Step 5 — `lib/process/browse.ts`** (listing pour le hub, via admin client) :

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FicheDetail } from './types';

export interface MissionSummary {
  code: string;
  nom: string;
  count: number;
}
export interface ProcessListItem {
  source_fiche_id: string;
  fiche_code: string;
  mission_code: string;
  mission_nom: string;
  titre: string;
  steps: number;
  sub: string;
}

interface Row {
  source_fiche_id: string;
  fiche_code: string;
  mission_code: string;
  mission_nom: string;
  titre: string;
  detail: FicheDetail | null;
}

async function fetchRows(admin: SupabaseClient): Promise<Row[]> {
  const { data, error } = await admin
    .from('process_index')
    .select(
      'source_fiche_id, fiche_code, mission_code, mission_nom, titre, detail',
    )
    .order('mission_code');
  if (error) {
    console.error('[process/browse]', error.message);
    return [];
  }
  return (data ?? []) as Row[];
}

/** Missions présentes dans l'index, avec nombre de process finalisés. */
export async function listMissions(
  admin: SupabaseClient,
): Promise<MissionSummary[]> {
  const rows = await fetchRows(admin);
  const by = new Map<string, MissionSummary>();
  for (const r of rows) {
    const cur = by.get(r.mission_code) ?? {
      code: r.mission_code,
      nom: r.mission_nom,
      count: 0,
    };
    cur.count += 1;
    by.set(r.mission_code, cur);
  }
  return [...by.values()].sort((a, b) => a.code.localeCompare(b.code));
}

/** Tous les process finalisés, pour la liste du hub. */
export async function listAllProcess(
  admin: SupabaseClient,
): Promise<ProcessListItem[]> {
  const rows = await fetchRows(admin);
  return rows.map((r) => {
    const taches = r.detail?.taches ?? [];
    const first = taches.find((t) => t.description)?.description ?? '';
    return {
      source_fiche_id: r.source_fiche_id,
      fiche_code: r.fiche_code,
      mission_code: r.mission_code,
      mission_nom: r.mission_nom,
      titre: r.titre,
      steps: taches.length,
      sub: first, // sub nettoyé côté UI via stripMarkdown
    };
  });
}
```

- [ ] **Step 6 — tsc + lint + tests** : `npx vitest run __tests__/process-format.test.ts __tests__/process-snippet.test.ts && npx tsc --noEmit && npm run lint`. Commit : `feat(process): helpers browse + stripMarkdown + formatEcheance`.

---

## Task 2 — Hub navigable (page + composants)

**Files:** Modify `app/(dashboard)/process/page.tsx`, `app/(dashboard)/process/actions.ts` ; Rewrite `components/process/process-search.tsx` → `components/process/process-hub.tsx` (+ garder l'export attendu) ; Create `components/process/process-highlight.tsx` (util surlignage).

Référence visuelle : section **HUB** de la maquette (hero + searchbar + chips + `Parcourir par mission` (tuiles) + `Process finalisés récents` (lignes) + état résultats avec surlignage + barre de pertinence + carte entière cliquable).

- [ ] **Step 1 — actions** : dans `actions.ts`, garder `searchProcessAction`. Ajouter côté page les données de parcours via server component (pas d'action nécessaire).

- [ ] **Step 2 — page server** `app/(dashboard)/process/page.tsx` : auth-gate, puis en parallèle `listMissions(admin)` + `listAllProcess(admin)`, passe-les à `<ProcessHub missions={...} all={...} />`. Nettoyer les `sub` avec `stripMarkdown` ici (server) et tronquer (~120 c). `metadata.title = 'Process · SOLUVIA'`.

- [ ] **Step 3 — `components/process/process-hub.tsx`** (`'use client'`) : reconstruit la maquille :
  - **Hero** : eyebrow, h1, paragraphe, **searchbar** (Input arrondi + bouton « Chercher »), **chips** d'exemples (cliquables → lancent la recherche).
  - **Browse** (visible tant qu'aucune recherche) : grille de **tuiles mission** (`missions`, code mono + nom + `N process`), et **liste** des process (`all`) via un composant ligne `ProcessRow` (code mono, titre, sous-titre 1 ligne, `steps` étapes, flèche) — **toute la ligne est un `<Link href={/process/fiches/${id}}>`**.
  - **Résultats** (après submit) : masque browse, affiche `searchProcessAction(q)` → liste de `ProcessRow` avec **surlignage** des termes (via `process-highlight`), **barre de pertinence** (`Math.round(score*100)%`), compteur « N process pertinents », bouton « Effacer ».
  - États : `useState`/`useTransition` ; loading = skeletons simples (`animate-pulse` cartes) ; vide = « Aucun process ne correspond ». Tuiles mission cliquables → filtrent la liste par mission (ou lancent une recherche sur le nom) — au choix, simple : au clic mission, scroll vers la liste filtrée par `mission_code` (filtre client sur `all`).
  - Accessibilité : input `aria-label`, chips = `<button>`, focus visibles.
  - Style : Tailwind + tokens app (`bg-card border-border`, `text-muted-foreground`, accent `text-primary`/`bg-primary`, mono via `font-mono`). Reproduire hiérarchie/espacements de la maquette.

- [ ] **Step 4 — `components/process/process-highlight.tsx`** : `highlight(text, query)` → renvoie des fragments React avec `<mark>` (fond `bg-primary/15 text-primary` arrondi) sur les termes ≥3 lettres (échapper la regex). Pur, testable ; ajouter `__tests__/process-highlight.test.tsx` (ou test unitaire de la fonction de découpage si extraite en util pur `splitHighlight(text, terms)`).

- [ ] **Step 5 — build + lint** : `npx tsc --noEmit && npm run lint && npm run build`. Vérifier route `/process`. Commit : `feat(process): hub navigable (recherche + parcours + résultats enrichis)`.

---

## Task 3 — Fiche-guide (timeline)

**Files:** Rewrite `app/(dashboard)/process/fiches/[id]/page.tsx` ; Create `components/process/process-step.tsx`, `components/process/process-type-badge.tsx` ; delete usage of `ProcessProgress`/`ProcessLegend`/`ProcessStateBadge` on this page (garder les fichiers ou les supprimer s'ils deviennent inutilisés partout — vérifier par grep).

Référence visuelle : section **FICHE** de la maquette (fbar retour + en-tête avec `mchip` mission, `prio`, titre, lead, 3 stats ; puis **timeline** `steps` : node numéroté + rail vertical + scard {titre + type badge, meta responsable/échéance, description markdown, livrables}).

- [ ] **Step 1 — page** : `await params`, auth-gate, lit `process_index` (`titre, mission_nom, detail`) par `source_fiche_id`, `notFound()` si absent, message si `detail` null (inchangé). Puis :
  - `metadata` dynamique via `generateMetadata` → `titre` de la fiche (lit la même row). (Voir `node_modules/next/dist/docs` si besoin sur `generateMetadata`.)
  - Calculer : `steps = detail.taches.length`, `docs = taches.filter(type==='document').length`, `feats = taches.filter(type==='feature').length`, `pilote` = responsable le plus fréquent (`missionInitials` pour l'avatar). **Ne PAS** calculer/afficher progression ni états (fiche finalisée = tout validé).
  - **En-tête** : `Badge` mission `mission.code · mission.nom`, `prio` (si présent), `h1` titre, lead = `detail.fiche.description` rendue en markdown (ProcessMarkdown, typographie généreuse), rangée de 3 stats (`steps` étapes · `docs`·`feats` · pilote).
  - **Timeline** : `<ol>` de `<ProcessStep index={i+1} tache={t} />`.
  - Retirer `<ProcessProgress/>`, `<ProcessLegend/>`, `<ProcessStateBadge/>` de cette page.

- [ ] **Step 2 — `components/process/process-type-badge.tsx`** : mappe `type` (`document|feature|formation|validation|null`) → { label FR, icône lucide (`FileText`, `Blocks`/`Code`, `GraduationCap`, `CheckCircle2`), classes couleur token }. Libellés : Document / Fonctionnalité / Formation / Validation. Couleurs : réutiliser les familles (doc→bleu, feature→`--purple`, formation→ambre, validation→`--primary`).

- [ ] **Step 3 — `components/process/process-step.tsx`** : node numéroté (mono, `('0'+n).slice(-2)`), rail vertical (masqué sur le dernier via `last:` ou index), `scard` : titre + `<ProcessTypeBadge/>`, meta (avatar initiales responsable + nom | icône calendrier + `formatEcheance(echeance)`), description via `ProcessMarkdown`, livrables : `tache.liens` en chips-liens (`<a target="_blank" rel="noreferrer">` libellé + icône ext). Largeur lecture ~64ch sur la description.

- [ ] **Step 4 — build + lint** : `npx tsc --noEmit && npm run lint && npm run build`. Grep pour usages restants de ProcessProgress/Legend/StateBadge ; si plus utilisés nulle part, les supprimer + leur test (`process-tache-state.test.ts` reste si `getTacheState` encore utilisé ailleurs ; sinon garder le module, il est inoffensif). Commit : `feat(process): fiche-guide en timeline (suppression états redondants)`.

---

## Task 4 — Déploiement + e2e

- [ ] PR `feat/process-hub-redesign` → CI verte → merge (branche protégée).
- [ ] Déploiement prod ; ouvrir `/process` : hub (parcours + recherche + surlignage), ouvrir la fiche B-S3 → timeline lisible, dates FR, livrables. Zéro redirection externe (hors liens Drive).
- [ ] Vérifier thème clair/sombre + responsive mobile.

---

## Auto-revue (couverture)

| Élément maquette                                 | Task |
| ------------------------------------------------ | ---- |
| Snippet nettoyé + surlignage + pertinence        | 1, 2 |
| Parcours par mission (tuiles + counts)           | 1, 2 |
| Liste des process + carte cliquable              | 1, 2 |
| Hero + chips d'exemples                          | 2    |
| Fiche timeline numérotée                         | 3    |
| Type → icône+libellé, avatar, date FR, livrables | 1, 3 |
| Suppression progression/légende/états            | 3    |
| Déploiement + thèmes + responsive                | 4    |

**Vigilance :** (1) mapper les couleurs de la maquette aux **tokens réels** de `app/globals.css` (ne pas coller les CSS vars de la maquette). (2) Tailwind v4 : pas de `tailwind.config`, classes arbitraires `bg-[var(--purple)]` OK. (3) `generateMetadata` = fetch dupliqué de la row — acceptable, ou factoriser une fonction `getFiche(id)`.
