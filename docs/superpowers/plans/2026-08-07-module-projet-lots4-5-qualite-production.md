# Module Projet - Lots 4 et 5 : qualité et production

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner à la page Qualité une liste de ce qui manque pour atteindre 100 %, triée par ce que ça rapporte ; et à la page Production le détail par élève et par formateur derrière les indicateurs.

**Architecture:** Deux fonctions pures, une par lot, testées sur les bornes. Aucune nouvelle source de données : tout se dérive de ce qui est déjà synchronisé depuis Eduvia.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase, Vitest.

**Spec de référence:** `docs/superpowers/specs/2026-08-06-module-projet-synthese-details-design.md`, sections F et G.

---

## Contexte commun

Le commanditaire a posé un critère qui prime sur tout le reste dans ce module : _« un truc aéré, on voit vite les infos, pas trop d'infos sur les pages, pour que les CDP ne deviennent pas fous à dire je ne comprends pas »_.

Pour ces deux lots, cela se traduit en une règle simple : **une page de détail montre ce sur quoi on peut agir, pas tout ce qu'on sait**. Dix lignes actionnables valent mieux qu'un référentiel complet ou qu'un tableau de trente apprenants sans hiérarchie.

### Pièges de ce codebase

- **`lib/eduvia/quality-client.ts` n'a ni délai d'expiration ni annulation.** Tout appel au référentiel Qualiopi peut pendre indéfiniment. Il doit rester derrière un `<Suspense>`, comme la carte de synthèse du lot 0.
- Le score Qualiopi est calculé **par CFA et par campus**, jamais par projet. Deux projets d'un même client partagent le même score. C'est accepté, ne cherche pas à le contourner.
- Les contrats archivés sont exclus de tous les indicateurs de production.
- `npm test` avant chaque push, jamais `--no-verify`.

---

# LOT 4 — Qualité

## Task 1 : Fonction pure du reste à faire

**Files:**

- Create: `lib/qualiopi/reste-a-faire.ts`
- Test: `__tests__/qualiopi-reste-a-faire.test.ts`

La page doit répondre à une seule question : **sur quoi bosser pour arriver à 100 %, et qu'est-ce que ça rapporte**. Pas afficher l'arborescence, le module `/qualiopi` le fait déjà très bien.

- [ ] **Step 1: Comprendre la donnée disponible**

Lis `lib/queries/qualiopi.ts` (`getReferentiel`, `getDeliverableStatuses`, `listCampusesForClient`) et `lib/queries/qualiopi-stats.ts` (le calcul de complétion, et surtout **le commentaire qui explique le dénominateur**).

Point clé déjà documenté là-bas : le dénominateur est **nombre de livrables du référentiel × nombre de campus**. On ne compte pas `statuses.length`, parce qu'Eduvia ne crée une ligne de statut qu'à partir de la première preuve déposée : un livrable vierge serait sinon exclu et gonflerait artificiellement le ratio.

- [ ] **Step 2: Écrire les tests**

Créer `__tests__/qualiopi-reste-a-faire.test.ts`. La fonction `resteAFaireQualiopi` prend le référentiel aplati, les statuts, le nombre de campus, et retourne une liste de groupes triés par gain décroissant.

Couvre au minimum :

- un livrable conforme ne figure pas dans le reste à faire ;
- un livrable sans statut compte comme manquant (c'est le piège du dénominateur ci-dessus) ;
- le gain d'un groupe est bien `nb manquants / dénominateur × 100` ;
- le tri est par gain décroissant ;
- à gain égal, l'ordre reste stable et déterministe (sinon la liste danse d'un rafraîchissement à l'autre) ;
- un référentiel vide retourne une liste vide sans planter ;
- zéro campus retourne une liste vide (dénominateur nul, pas de division par zéro) ;
- la liste est plafonnée : on ne retourne que les N premiers groupes.

- [ ] **Step 3: Lancer, voir échouer, implémenter**

Le regroupement se fait **par indicateur** : c'est l'unité à laquelle un CDP agit (« déposer les preuves de l'indicateur 12 »), pas le livrable isolé ni le critère entier.

Chaque entrée porte : le critère, l'indicateur, le nombre de livrables manquants, le gain en points, et un lien vers le livrable dans `/qualiopi`.

Plafonne à **10 groupes**. Au-delà, la page redevient un référentiel et perd sa raison d'être. Expose aussi le nombre total de groupes pour pouvoir écrire « 10 premiers sur 34 » plutôt que de tronquer en silence.

- [ ] **Step 4: Vérifier et committer**

`npm run typecheck && npm run lint && npm test`

```bash
git add lib/qualiopi/reste-a-faire.ts __tests__/qualiopi-reste-a-faire.test.ts
git commit -m "feat(qualiopi): reste a faire priorise par gain

Regroupement par indicateur : c'est l'unite a laquelle un CDP agit.
Plafonne a 10 groupes, avec le total expose pour ne pas tronquer en
silence."
```

## Task 2 : Page qualité

**Files:**

- Modify: `app/(dashboard)/projets/[ref]/qualite/page.tsx`
- Create: `components/projets/projet-qualite-reste.tsx`

- [ ] **Step 1: Écrire la page**

Structure, dans cet ordre :

1. Le **score en grand** (réalisé / total, en pourcentage).
2. La **liste priorisée**, une ligne par indicateur : « Indicateur 12 — 3 pièces manquantes — **+8 points** », avec un lien direct vers le livrable dans `/qualiopi`.
3. Le renvoi existant vers le module Qualiopi du CFA (`ProjetQualiteSection`), en bas.

Rien d'autre. Pas de graphique, pas de répartition par critère.

- [ ] **Step 2: Isoler l'appel Eduvia**

**Impératif** : le chargement du référentiel passe par le client Qualiopi, qui n'a ni délai d'expiration ni annulation. Mets-le dans un composant serveur asynchrone dédié, enveloppé dans un `<Suspense>` avec un squelette. Le score et le renvoi vers `/qualiopi` doivent s'afficher immédiatement, même si Eduvia ne répond pas.

C'est exactement le motif du lot 0 : regarde `components/projets/projet-carte-qualite.tsx` et reproduis-le.

- [ ] **Step 3: Cas où il n'y a rien à afficher**

- Client sans clé API Eduvia, ou référentiel vide : afficher le renvoi vers `/qualiopi` et une phrase honnête (« Référentiel Qualiopi non disponible pour ce CFA »), **pas un zéro trompeur**.
- Tout est conforme : « Rien à faire, le référentiel est complet ». C'est une bonne nouvelle, elle mérite d'être dite.

- [ ] **Step 4: Vérifier et committer**

`npm run typecheck && npm run lint && npm test && npm run build`

```bash
git add "app/(dashboard)/projets/[ref]/qualite/page.tsx" components/projets/projet-qualite-reste.tsx
git commit -m "feat(projet): page qualite avec le reste a faire priorise

L'appel au referentiel Eduvia est sous Suspense : le client n'a ni
delai d'expiration ni annulation, il ne doit pas retenir le score."
```

---

# LOT 5 — Production

## Task 3 : Fonction pure de progression

**Files:**

- Create: `lib/projets/progression.ts`
- Test: `__tests__/projet-progression.test.ts`

- [ ] **Step 1: Écrire les tests**

`progressionApprenant` prend la date de début, la date de fin, la progression réelle en pourcentage et le jour courant. Elle retourne la progression théorique, l'écart en points, et un statut parmi `avance` / `a_jour` / `retard`.

La progression théorique est la part du temps écoulée : `(aujourd'hui - début) / (fin - début) × 100`, bornée entre 0 et 100.

Couvre au minimum :

- à mi-parcours, la théorique vaut 50 ;
- avant le début, la théorique vaut 0 ;
- après la fin, la théorique vaut 100 (jamais plus) ;
- une formation dont début et fin sont le même jour ne divise pas par zéro ;
- progression réelle supérieure à la théorique → `avance` ;
- inférieure → `retard` ;
- **une tolérance** : un écart de quelques points n'est pas un retard. Fixe le seuil à 5 points et teste les deux bords (écart de 5 → `a_jour`, écart de 6 → `retard`) ;
- progression réelle inconnue (`null`) → statut `a_jour` et écart `null`, jamais une alerte. Une donnée absente ne doit pas accuser un apprenant.
- dates manquantes → même traitement.

- [ ] **Step 2: Lancer, voir échouer, implémenter**

Note dans un commentaire pourquoi le seuil de tolérance existe : sans lui, la quasi-totalité des apprenants apparaîtrait en retard en permanence (la progression réelle avance par paliers, la théorique en continu), et l'indicateur ne signalerait plus rien.

- [ ] **Step 3: Vérifier et committer**

```bash
git add lib/projets/progression.ts __tests__/projet-progression.test.ts
git commit -m "feat(projet): progression theorique et ecart par apprenant

Tolerance de 5 points : la progression reelle avance par paliers, la
theorique en continu. Sans tolerance, tout le monde serait en retard
en permanence et l'indicateur ne signalerait plus rien."
```

## Task 4 : Détail de la production

**Files:**

- Modify: `lib/queries/apprenants.ts` (ou nouvelle query dédiée, à toi de voir)
- Modify: `app/(dashboard)/projets/[ref]/production/page.tsx`
- Create: `components/projets/projet-progression-table.tsx`
- Create: `components/projets/projet-suivis-formateurs.tsx`

- [ ] **Step 1: Progression par élève**

Une ligne par apprenant : nom, formation, **progression réelle**, **progression théorique**, **écart** (« +12 pts » / « -8 pts »), statut coloré.

La progression réelle vient de `contrats_progressions.progression_percentage`, déjà synchronisée. Les contrats archivés sont exclus.

Tri par défaut : **les plus en retard en premier**. C'est l'ordre utile ; l'ordre alphabétique n'apprend rien.

- [ ] **Step 2: Suivis formateurs**

Deux chiffres en tête : **RDV réalisés** et **RDV en retard** (date prévue passée, statut toujours `prevu`).

Puis un tableau des RDV en retard uniquement : formateur, date prévue, nombre de jours de retard. Les RDV réalisés n'ont pas besoin d'un tableau, leur compte suffit.

**Ce qu'on ne fait pas, et pourquoi** : le brief demandait aussi « le nombre de suivis à réaliser par chaque formateur » pour dire s'il est en avance ou en retard. **Rien en base ne permet de calculer ce nombre attendu** : les RDV sont créés un par un à la main, il n'existe ni cadence ni volume cible. Le commanditaire creuse la règle métier. On livre sans, plutôt qu'avec un objectif inventé qui rendrait l'indicateur mensonger.

De même, les **absences apprenants** dépendent d'Eduvia V3, non publiée. Aucun écran vide, aucun « 0 » trompeur : la brique n'apparaît pas tant que la donnée n'existe pas.

- [ ] **Step 3: Assembler la page**

La page Production porte déjà la bande de 6 indicateurs (`ProjetPerformanceVolets`), la table des apprenants et les RDV formateurs. Elle devient :

1. la bande d'indicateurs (inchangée) ;
2. la **progression par élève** (remplace ou enrichit la table des apprenants existante — à toi de voir ce qui donne le code le plus simple, mais **aucune colonne existante ne doit disparaître** : nom, formation, n° contrat, début, fin, statut, et l'alerte rouge « formation démarrée, contrat non engagé » qui existe déjà) ;
3. les **suivis formateurs**.

Vérifie l'alerte rouge existante : elle est dans `lib/utils/apprenant-alerte.ts` et couverte par des tests. **Ne la casse pas.**

- [ ] **Step 4: Vérifier et committer**

`npm run typecheck && npm run lint && npm test && npm run build`

```bash
git add lib/queries "app/(dashboard)/projets/[ref]/production/page.tsx" components/projets/projet-progression-table.tsx components/projets/projet-suivis-formateurs.tsx
git commit -m "feat(projet): detail de la production par eleve et par formateur

Tri par les plus en retard : l'ordre alphabetique n'apprend rien.
L'objectif de suivis par formateur et les absences apprenants ne sont
pas affiches, faute de donnee - pas de case vide qui fait douter."
```

---

## Task 5 : Vérification des deux lots

- [ ] **Step 1: Suite complète**

`npm run typecheck && npm run lint && npm test && npm run build`

- [ ] **Step 2: Vérification visuelle**

Protocole dans `.claude/skills/verify/SKILL.md`. Pièges connus : l'hydratation React ne fonctionne pas dans le navigateur headless local (injecter le cookie `sb-127-auth-token` obtenu par `POST $API_URL/auth/v1/token?grant_type=password`, plutôt que de passer par le formulaire), et le binaire Playwright du cache peut être corrompu (pointer `executablePath` sur `chromium_headless_shell-1223`).

Contrôler `/projets/[ref]/production` et `/projets/[ref]/qualite` : les pages s'affichent, restent lisibles, et la page qualité **s'affiche même quand le référentiel Eduvia est indisponible** (c'est le cas en local, aucun client n'a de clé API : c'est donc exactement le bon test du `<Suspense>` et du repli). Capture.

- [ ] **Step 3: Nettoyer**

Supprimer les scripts temporaires, arrêter le serveur de dev s'il a été démarré. `git status --short` avant de committer, jamais `git add -A`.

---

## Points de vigilance

**Une donnée absente n'accuse personne.** Progression inconnue, référentiel indisponible, objectif de suivis non défini : dans les trois cas, on n'affiche pas d'alerte et on ne montre pas de zéro. Un indicateur qui accuse à tort est pire qu'un indicateur absent, parce qu'on arrête de le regarder.

**Le référentiel Qualiopi est un appel réseau sans garde-fou.** Il reste sous `<Suspense>`. Si tu le mets dans le `Promise.all` de la page, tu reproduis exactement le défaut corrigé au lot 0.

**Le plafond de 10 groupes n'est pas de la troncature silencieuse.** Le total est exposé et affiché. Une liste tronquée sans le dire ferait croire au CDP qu'il a tout vu.
