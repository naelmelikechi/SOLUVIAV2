# Retour Hervé Pigeault — Analyse approfondie (V2)

> **Source:** mail du 2026-05-18 09:55 (hpigeault@gmx.fr) + investigation code réelle
> **V1:** [retour-herve-2026-05-18.md](retour-herve-2026-05-18.md) (specs à chaud)
> **V2 (ce doc):** chaque point challengé par lecture du code, refs `file:line`

## Méthode

Pour chaque retour, on présente:

1. 📝 **Retour brut** (citation Hervé)
2. 🔎 **Vérification code** (`file:line` réels)
3. ⚖️ **Verdict Hervé** — fondé / partiel / méconnaissance / sarcasme
4. 🔁 **Challenge de la spec V1** — ce que j'avais proposé, et pourquoi c'est à revoir
5. ✅ **Spec V2 révisée** — proposition consolidée
6. ⏱️ **Effort** S/M/L

---

## 1. PROJET

### 1.1 Indicateurs Qualité/Pédago sur liste projets

📝 _"En ligne, manque indicateurs Qualités et Pédago avec liens directs"_

🔎 **Code:**

- `app/(dashboard)/projets/page.tsx:14-57` charge `getProjetsListEnriched()`
- `lib/queries/projets.ts:64-150`: agrégats Finance déjà préchargés (`facturesEnRetard`, `encaissementsEnRetard`, `tempsMois`)
- `components/projets/projet-list-columns.tsx:16-160`: colonnes = Ref, Client, CDP, Statut, Typologie, Commission, Apprentis actifs, **Factures retard**, **Encaissements retard**, **Temps mois**
- ❌ Aucune colonne Qualité ni Pédago

⚖️ **Verdict:** **fondé**. La page est bien orientée finance, le pilotage qualitatif manque.

🔁 **Challenge V1:** ma spec disait "ajouter 2 badges Qualité/Pédago avec seuils chiffrés". Trop léger. **Problème:** le concept "% livrables livrés" suppose qu'il existe une notion de livrables liés à un projet, or `Q1` ci-dessous montre que **la qualité est aujourd'hui agrégée par CFA (client), pas par projet** via Qualiopi/Eduvia. La pédago vient d'Eduvia aussi. Donc:

- L'indicateur "Qualité projet" demande probablement une **agrégation indirecte** (qualité du CFA propriétaire du projet)
- L'indicateur "Pédago projet" demande de récupérer le **% avancement moyen des apprenants du projet** depuis Eduvia

✅ **Spec V2:**

- Ajouter 2 colonnes:
  - **Qualité** = ratio Qualiopi du CFA du projet (déjà calculé dans `lib/queries/indicateurs.ts:386-396`)
  - **Pédago** = moyenne `avancement_pct` des contrats actifs du projet (déjà disponible côté contrat)
- Badge cliquable → ouvre l'onglet correspondant sur la fiche projet
- ⚠️ **Pas de calcul "par chapitre" en colonne** (cf 2.1, le concept chapitre n'existe pas en DB)
- Décider du fallback "pas de données" (CFA pas synchro Qualiopi) → badge gris "N/D"

⏱️ **M** (DB côté queries + UI colonnes + tooltip)

---

### 1.2 Clic Apprentis → Eduvia

📝 _"Sur clic Apprentis, j'ouvrirai Eduvia avec la liste des apprentis ou liste des contrats"_

🔎 **Code:**

- `components/projets/projet-stat-cards.tsx:82-91`: stat card "Apprentis actifs" — **pas d'attribut `href`**
- `types/database.ts` contient `eduvia_id`, `eduvia_formation_id` au niveau **contrat** (pas projet)
- `next.config.ts`: CSP autorise `https://*.eduvia.app` (frame) — donc embed possible
- ❌ **Aucune URL Eduvia n'est définie côté Soluvia** (ni env, ni constante, ni table de mapping projet→URL Eduvia)

⚖️ **Verdict:** **fondé, mais sous-estimé**. Pas juste "ajouter un lien": il faut **construire** l'URL Eduvia.

🔁 **Challenge V1:** ma spec parlait "ouvrir Eduvia avec deep-link". J'ai supposé que ce deep-link existait. **Réalité:** rien de tel n'est mappé aujourd'hui. Trois inconnues:

1. **Format d'URL Eduvia** (à demander à l'équipe Eduvia ou à reconstituer): par formation? par client? par projet?
2. **Identifiant projet côté Eduvia** — on a `eduvia_id` au niveau contrat, mais pas projet. Est-ce qu'un projet Soluvia = 1 formation Eduvia? À vérifier.
3. **Auth** — quand on ouvre Eduvia dans un onglet, l'utilisateur est-il déjà loggé via SSO? Sinon l'expérience casse.

✅ **Spec V2:**

- **Pré-requis** (avant d'écrire la moindre ligne): valider avec Hervé/Eduvia
  - Format des URLs Eduvia (deep-link apprenants? deep-link contrats?)
  - Mapping projet Soluvia ↔ entité Eduvia
  - SSO ou login séparé
- Une fois validé:
  - Ajouter une fonction utilitaire `buildEduviaUrl(projet, vue)` dans `lib/utils/`
  - Rendre la stat card Apprentis cliquable
  - Ouvrir dans nouvel onglet (`target="_blank" rel="noopener"`)

⏱️ **M** côté Soluvia, **mais L global** si pré-requis Eduvia à instruire.

**Question Hervé:** _Apprenants OU contrats?_ Et: _as-tu un exemple d'URL Eduvia profonde qui te conviendrait?_

---

### 1.3 Projets internes — sortir de `/projets` + LISTE sur `/projets/internes`

📝 _"Quel est l'intérêt de la liste des Projets internes dans Projets. Par contre, la liste dans Projets internes avec le libellé du Projet, YES. Actuellement on arrive sur 1 projet..."_

🔎 **Code:**

- Table `projets` a un champ `est_interne` (`lib/queries/projets.ts:19`)
- `getProjetsList()` **n'exclut pas** les projets internes → ils apparaissent dans `/projets`
- `app/(dashboard)/projets/internes/page.tsx` existe et **affiche des tabs Stats + Config**, **pas une liste de projets internes** (`lib/queries/projets-internes.ts` expose `getStatsInternes`, `getCategoriesInternes`, et `getProjetsInternesList` — mais l'UI semble afficher les agrégats, pas la liste)

⚖️ **Verdict:** **double-fondé** + 1 ambiguïté à lever.

- Inclusion internes dans `/projets`: **fondé** ✓
- "On arrive sur 1 projet": **fondé** ✓ — la page existe mais ne sert pas de liste

🔁 **Challenge V1:** j'avais raison sur les 2 specs, mais j'avais sous-estimé l'écart entre `getProjetsInternesList` (qui existe) et l'UI qui n'en fait rien. Le helper de query est déjà là, c'est l'UI qui n'expose pas la liste.

✅ **Spec V2:**

- **A. Exclusion par défaut sur `/projets`:**
  - `getProjetsList()`: ajouter `.eq('est_interne', false)`
  - Garder un toggle URL `?includeInternes=1` pour cas exceptionnels (admin debug)
- **B. `/projets/internes` devient une LISTE:**
  - Vérifier que `getProjetsInternesList` (existant) retourne bien tous les projets internes avec libellé + catégorie + heures cumulées
  - Ajouter dans `app/(dashboard)/projets/internes/page.tsx` un onglet "Projets" en plus de Stats/Config
  - Format identique à `/projets` (DataTable shared) avec colonnes: Ref, Libellé, Catégorie, Heures saisies, CDP référent
  - Clic ligne → fiche projet interne

⏱️ **S** (exclusion) + **M** (vue liste)

---

## 2. QUALITÉ

### 2.1 Liste qualitatifs par projet, % livrables par chapitre

📝 _"Liste avec chiffres qualitatifs par projet (%livrable livrés par Chapitre par exemple)"_

🔎 **Code:**

- Une page `/indicateurs` existe (`app/(dashboard)/indicateurs/page.tsx`) avec une section CDP qui affiche **un ratio Qualité par CFA** (`computeQualiopiCompletionForClients` dans `lib/queries/indicateurs.ts:386-396`)
- **Pas de table** `livrables_chapitres` ni équivalent dans `types/database.ts`
- La qualité provient d'un snapshot Qualiopi via Eduvia — granularité = **par CFA**, pas par projet et **encore moins par chapitre**

⚖️ **Verdict:** **partiellement méconnaissance + ambition au-delà du DB actuel**. Une vue existe (`/indicateurs`), mais la granularité "chapitre" n'existe pas dans nos données. Le mot "Chapitre par exemple" suggère un exemple, pas un must.

🔁 **Challenge V1:** ma spec disait "% par chapitre avec mini barre de progression". **Pas faisable en l'état**. On peut faire:

- Niveau 1 (facile): % livrables Qualiopi conformes par projet (en agrégeant via le CFA du projet)
- Niveau 2 (moyen): si Eduvia expose un breakdown par "module" ou "section" de formation, on peut s'en servir
- Niveau 3 (lourd): modéliser nous-mêmes une notion de chapitre dans Soluvia → **gros chantier**, à ne pas démarrer sans cadrage

✅ **Spec V2 (en 2 temps):**

- **Phase 1** (S-M): page `/qualite` ou tab dans `/projets` avec liste **tous projets** + colonne "% Qualiopi" + lien fiche détail. Réutilise le calcul existant agrégé par CFA.
- **Phase 2** (à scoper): granularité chapitre/module nécessite:
  - soit synchro plus fine côté Eduvia
  - soit modélisation Soluvia (table `livrables` par projet avec catégorie/chapitre)

**Question Hervé:** _Le "Chapitre" était un exemple ou tu veux vraiment cette granularité? Si oui, donne-moi un exemple concret de ce que tu veux voir (Module 1: 80%, Module 2: 50%)?_

⏱️ **M** (phase 1), **L** (phase 2 si retenue)

---

## 3. TEMPS

### 3.1 "Comment ajouter Projet?"

📝 _"Feuille de Temps sympa, mais: Comment ajouter Projet ?"_

🔎 **Code:**

- `components/temps/time-grid.tsx:50`: affiche les projets venant de `initialSaisies` (passés en prop)
- `lib/queries/temps.ts:114-122`: la requête sélectionne les projets `OR(cdp_id=user, backup_cdp_id=user, est_interne=true)`
- **Aucun bouton "Ajouter un projet"** dans `time-grid.tsx` ni `temps-page-client.tsx`

⚖️ **Verdict:** **fondé, mais différemment de ce qu'on imaginait**. Ce n'est pas un bug "le bouton est caché"; c'est qu'**il n'y a rien à ajouter dans la feuille**: un projet apparaît dès qu'on est CDP titulaire ou backup. Donc:

- Si Hervé veut "saisir du temps sur un projet où il n'est pas CDP", **ce n'est pas prévu** (par design RLS)
- Si Hervé veut juste qu'un nouveau projet apparaisse → il faut passer par `/projets > Nouveau projet` puis assigner

🔁 **Challenge V1:** ma spec disait "ajouter un bouton + dropdown recherche". **Faux problème probablement.** Le vrai sujet c'est: la feuille de temps ne dit pas à l'utilisateur **pourquoi** un projet n'apparaît pas. C'est un défaut d'onboarding/contexte, pas un manque de bouton.

✅ **Spec V2:**

- **Aucune fonctionnalité d'ajout libre** (cohérent avec la sécurité CDP + RLS)
- **Améliorer la pédagogie de la page:**
  - Si l'utilisateur n'a aucun projet: message "Tu n'as pas encore de projet assigné. Demande à l'admin de t'assigner comme CDP/backup."
  - Si l'utilisateur cherche un projet qui n'y est pas: petit lien "Un projet manquant? → Voir comment ajouter" qui pointe vers `/projets` ou une mini-FAQ
- Si Hervé veut vraiment pouvoir saisir hors-CDP → c'est une **règle RLS à changer**, gros impact sécurité, à discuter

**Question Hervé:** _quand tu disais "comment ajouter projet", tu voulais ajouter à TA feuille un projet où tu n'es pas CDP, ou tu cherchais juste où ajouter un projet en général?_

⏱️ **S** (UX/onboarding) ; **L** si change RLS

---

### 3.2 Projets internes pas par défaut / en fin

📝 _"Par défaut, pas les projets internes, à ajouter par CDP comme tout autre projet (ou alors tout à la fin)"_

🔎 **Code:**

- `lib/queries/temps.ts:120`: la query inclut bien `est_interne=true`
- **`lib/queries/temps.ts:244`: `.sort((a, b) => a.est_interne ? 1 : -1)`** → **les internes sont DÉJÀ triés en fin de liste**
- `components/temps/time-grid.tsx:268`: visuel distinctif (fond ambre + badge "Interne")

⚖️ **Verdict:** **partiellement déjà fait**. Hervé propose 2 options ("retirer par défaut" OU "en fin"); l'option B est déjà implémentée. Il ne l'a peut-être pas remarqué (ou veut vraiment l'option A).

🔁 **Challenge V1:** ma spec recommandait option A. **Sans vérifier que B était déjà là.** Avant de coder, on doit demander si:

- B (actuel) lui suffit avec un petit accent visuel pour distinguer
- A serait mieux (= projets internes masqués par défaut, toggle "afficher les internes")

✅ **Spec V2:**

- **Avant de toucher au code:** confirmer avec Hervé si l'état actuel (fin de liste + fond ambre) lui suffit
- Si non, implémenter un **toggle local "Afficher projets internes"** (préf utilisateur en localStorage), désactivé par défaut

⏱️ **S** (toggle si retenu)

---

### 3.3 Plancher 40€ CDP analytique

📝 _"Vu le calcul 37,04€ très bien. Du coup, je maintiendrais bien 40€ mini pour CDP en analytique"_

🔎 **Code:**

- `lib/utils/employee-cost.ts:95`: `coutHoraire = coutTotalAnnuel / heuresEffectives`
- Test `__tests__/employee-cost.test.ts:63-64`: confirme ~37,04€/h avec defaults (40k brut, 35h/sem, 25 CP)
- `lib/queries/parametres.ts`: infrastructure de paramètres admin existe
- ❌ Aucun plancher/floor codé pour la valorisation analytique

⚖️ **Verdict:** **fondé**, et infrastructure prête.

🔁 **Challenge V1:** ma spec V1 était correcte. Une précision à ajouter:

- ⚠️ Le plancher est pour la **valorisation analytique** (pilotage rentabilité projet), **pas la paie**. C'est important: si on confond, on risque d'augmenter artificiellement les "coûts" qui remontent dans les marges.
- Distinguer **clairement** dans l'UI: "Coût réel: 37,04€/h | Coût analytique min: 40€/h"

✅ **Spec V2:**

- Ajouter paramètre `cdp_taux_horaire_analytique_min` dans la table `parametres`
- Dans `getProjetPerformance()` (~line 286 selon V1), appliquer `Math.max(coutReel, plancher)` **uniquement** sur les agrégats analytiques de marge
- **Conserver le coût réel** dans les fiches paie/employés
- Afficher les 2 valeurs dans le tooltip pour transparence

**Question Hervé:** _plancher global pour tous CDP ou par CDP (certains plus expérimentés à 50€)?_

⏱️ **S**

---

## 4. PRODUCTION

### 4.1 Colonne "Production OPCO"

📝 _"Je ne suis pas sûr de bien comprendre la colonne Production OPCO..."_

🔎 **Code:**

- `components/production/views/monthly-view.tsx:257-264`: colonnes = `Production` | `Facturé` | `Encaissé`
- **Le nom exact "Production OPCO" n'existe pas en tant que colonne**. C'est la colonne "Production" en perspective OPCO (radio en haut: OPCO / SOLUVIA / Consolidé)
- `lib/queries/production.ts:186-190`: calcul OPCO théorique mensuel via `computeContractSchedule`

⚖️ **Verdict:** **méconnaissance partielle**. Hervé voit "Production OPCO" parce qu'il est en perspective OPCO, mais le label est juste "Production". Aucun tooltip ne précise "production théorique mensuelle OPCO selon le calendrier NPEC".

🔁 **Challenge V1:** ma spec disait "tooltip + éventuellement renommer". OK pour le tooltip. Pour le renommage, **attention** à ne pas casser l'élégance du switch de perspective (en perspective SOLUVIA, "Production OPCO" n'aurait pas de sens).

✅ **Spec V2:**

- **Ne pas renommer** la colonne (garder "Production")
- Ajouter un **tooltip détaillé** sur l'entête:
  - Perspective OPCO: "Montant OPCO théorique du mois (NPEC × ratio mensuel selon calendrier contractuel)"
  - Perspective SOLUVIA: "Quote-part SOLUVIA selon répartition contractuelle"
- Éventuellement: ajouter un petit `(i)` à côté du libellé de la perspective pour rappeler ce qu'on voit

⏱️ **S**

---

### 4.2 🐛 Détail Client par mois — "Facturé" ne correspond pas

📝 _"Le détail Client par mois ne correspond pas, notamment le Facturé"_

🔎 **Code:**

- `lib/actions/production.ts:84-150` (`fetchProductionByClient`)
- Filtre statut: `.neq('statut', 'avoir')` — **tous les statuts SAUF avoir** sont agrégés ensemble (`brouillon`, `envoyee`, `payee`, `partiellement_payee`)
- Scaling: `facture *= productionSoluvia / productionOpco` (proportionnel à la quote-part)

⚖️ **Verdict:** **fondé**, et le diagnostic est probablement:

- **Soit** l'agrégat global filtre par "envoyée+payée uniquement" alors que le détail inclut les brouillons (ou vice-versa) — il faut comparer les 2 queries côte à côte
- **Soit** le scaling SOLUVIA/OPCO est appliqué d'un côté et pas de l'autre
- **Soit** le filtre date utilise `mois_concerne` à un endroit et `date_emission` à un autre

🔁 **Challenge V1:** ma spec V1 disait "comparer query détail vs agrégat" — pas faux mais trop vague. Maintenant on a 2 pistes concrètes à explorer.

✅ **Spec V2:**

- **Diagnostic prioritaire** (à faire avant de proposer un fix):
  1. Identifier la query "agrégat haut de page" (probablement dans `lib/queries/dashboard.ts` ou un `lib/queries/production.ts` plus haut)
  2. Comparer ligne à ligne avec `fetchProductionByClient` (statuts, dates, scaling)
  3. Reproduire sur 1 mois précis avec données réelles
- **Hypothèse principale à tester:** différence sur l'inclusion des brouillons
- **Fix probable:** unifier en une seule fonction `getProductionMetrics(scope, range)` réutilisée par les 2 vues

⏱️ **M**

**Question Hervé:** _quel mois précis tu as vu l'écart? Quelle valeur tu voyais en haut vs en bas?_

---

### 4.3 Mode consolidé — ouverture symétrique

📝 _"En mode consolidé, sur clic flèche du mois, il faudrait que le détail s'ouvre de façon symétrique sur les 2 tableaux"_

🔎 **Code:**

- `components/production/production-page-client.tsx:248-271`: 2 composants `MonthlyView` indépendants en consolidé
- `components/production/views/monthly-view.tsx:54-58`: `const [expandedMois, setExpandedMois] = useState<Set<string>>(new Set())` — **état local à chaque tableau**

⚖️ **Verdict:** **fondé** ✓

🔁 **Challenge V1:** spec V1 OK. Précision technique: l'état doit être lifté au parent `ProductionPageClient` uniquement en mode consolidé (en mono-vue, garder l'état local pour éviter pollution).

✅ **Spec V2:**

- Dans `ProductionPageClient`, garder un état `expandedMois` partagé si `mode === 'consolide'`
- Le passer en prop contrôlée à chaque `MonthlyView`
- Sinon, comportement actuel (état interne)

⏱️ **S-M**

---

## 5. FACTURATION

### 5.1 Escompte 😄 ⚠️

📝 _"Vous maitrisez même l'escompte maintenant ;-)"_

🔎 **Code:** **L'escompte n'est PAS implémenté.** Les seules occurrences du mot dans le repo sont des mentions PDF/HTML type "Pas d'escompte pour paiement anticipé."

⚖️ **Verdict:** ⚠️ **Probable sarcasme / ironie** ⚠️ — j'avais lu ça en V1 comme un compliment. Le smiley `;-)` + "même" + le fait que l'escompte n'existe pas = Hervé taquine.

🔁 **Challenge V1:** **gros loupé en V1** où j'avais marqué "aucun action, compliment". À retraiter:

- Soit l'escompte est attendu mais pas livré → c'est un **manque fonctionnel**
- Soit c'est juste une vanne (et alors RAS)

✅ **Spec V2:**

- **Confirmer** avec Hervé: vanne ou attente réelle?
- Si attente: spécifier
  - Champ `escompte_pct` sur la facture (ou paramétré par contrat)
  - Calcul: `montant_escompte = montant_HT × pct si paiement avant date_X`
  - Mention obligatoire facture: "Escompte pour paiement anticipé: X% si réglé avant le DD/MM/YYYY" (mention légale)
  - Comptabilisation séparée (compte 765/665 Odoo)

**Question Hervé:** _l'escompte, ça reste une vanne ou tu attends qu'on le code? Si oui, sur quelle base contractuelle (% fixe, conditions de délai)?_

⏱️ **L** si à coder

---

### 5.2 Manque "1/12" dans Paramètres

📝 _"Erreur Legacy, manque 1/12 de facturation dans Paramètres"_

🔎 **Code:**

- `components/admin/echeanciers-templates-section.tsx:39`: la fonction `formatJalon()` sait afficher "1/12" si on lui donne 1/12
- ❌ **Pas de preset pré-créé** `1/12` dans les templates par défaut
- Les templates sont créés manuellement par admin via "Nouveau template"

⚖️ **Verdict:** **fondé** mais nuancé. Le système supporte 1/12, juste qu'il n'y a pas de raccourci.

🔁 **Challenge V1:** ma spec V1 disait "ajouter le préset 1/12". OK. À préciser:

- Soit ajouter un **bouton raccourci "Créer template 1/12"** dans l'UI admin
- Soit ajouter un **template global pré-créé** au seed initial (mais alors il faut une migration pour les bases existantes)

✅ **Spec V2:**

- Ajouter dans `echeanciers-templates-section.tsx` une **liste de presets** (1/3, 1/6, 1/12, mensuel sur durée contrat) — cliquer le preset pré-remplit le formulaire de création
- Ne pas auto-seeder (évite pollution des bases qui n'en veulent pas)
- Vérifier que le calcul cents/arrondi tient bien sur 12 échéances (cf `project_legal_invoicing`)

**Question Hervé:** _"Erreur Legacy" → tu te souviens d'où vient cette dénomination? V1 Soluvia avait ce paramètre par défaut?_

⏱️ **S**

---

### 5.3 Création facture pas fluide

📝 _"Pas pu tester, mais intuitivement, je ne suis pas sûr que ce soit encore super fluide"_

🔎 **Code:** flow constaté: choisir projet → cocher contrats → ajuster Mois relatif → éditer lignes éventuellement → préparer brouillon (5-7 clics minimum)

⚖️ **Verdict:** intuition d'Hervé probablement **fondée** sur un volume élevé (10+ contrats). Mais pas de retour précis.

🔁 **Challenge V1:** V1 disait "demo écran ensemble". C'est ce qu'il faut.

✅ **Spec V2:**

- Démo guidée avec Hervé sur un projet réel
- Préparer 3 axes d'amélioration potentielle si frictions confirmées:
  1. **Batch:** "Préparer toutes mes factures du mois en 1 clic" (génère brouillons pour tous les projets éligibles)
  2. **Templates:** mémoriser les préférences du CDP (mois courant par défaut, modalités, etc.)
  3. **Validation visuelle:** récap avant brouillon avec total HT/TTC pour relire d'un coup d'œil

⏱️ Indéfini sans démo

---

### 5.4 "Mois relatif global" peu explicite

📝 _"Mois relatif, peu explicite pour CDP. Certains contrats sont au 4è mois, d'autres au 12è mois, difficile de contrôler"_

🔎 **Code:**

- `components/facturation/new-facture-dialog.tsx:445-463`: champ existe
- Logique: applique `moisGlobal` à toutes les lignes sauf celles éditées manuellement (`moisEdited`)
- Pas de tooltip explicatif

⚖️ **Verdict:** **fondé**. Le champ existe et fonctionne, mais la sémantique "mois relatif" demande un contexte que les CDP n'ont pas forcément (mois X depuis le début du contrat? mois calendaire?).

🔁 **Challenge V1:** V1 hésitait entre supprimer ou clarifier. Maintenant qu'on voit le code, **3 options:**

1. **Supprimer** (Hervé pense que c'est "peut-être pas utile") — risqué, casse des workflows existants
2. **Renommer + tooltip** — "Mois du contrat (X/durée)" avec sous-titre par ligne "Bazin: 11/12 = solde final"
3. **Remplacer par sélecteur de mois calendaire** — "Pour quel mois facturer?" → calcul auto du mois relatif par contrat selon date de début

✅ **Spec V2:**

- Option 2 recommandée à court terme (renommer + tooltip)
- Option 3 à étudier pour V2 du dialog
- Ajouter sous chaque ligne le rappel `Mois X / Y mois total` pour résoudre la confusion

**Question Hervé:** _option 2 (clarifier + tooltips) suffirait, ou tu veux qu'on retire le champ direct?_

⏱️ **S** (option 2) - **M** (option 3)

---

### 5.5 🐛 Bazin mois 11→12 — investigation approfondie

📝 _"Pourquoi entre 11 et 12, seul Bazin change ?"_

🔎 **Code:**

- `components/facturation/new-facture-dialog.tsx:61-76`: calcul cumulatif plafonné
  ```ts
  const monthly = (npec * ratio) / safeDuree;
  const raw = monthly * Math.max(0, mois);
  const cap = npec * ratio;
  return Math.round(Math.min(raw, cap) * 100) / 100;
  ```
- **MAIS** les montants observés sur les screenshots (Bazin 2 878,87 → 3 140,58) ne matchent pas un simple `monthly × 11` ni `monthly × 12` avec NPEC=7 851,45 et ratio=40%

⚖️ **Verdict:** **bug confirmé** mais **mécanisme à éclaircir**. L'investigation montre que:

- Soit `safeDuree` varie par contrat (durée individuelle), et seul Bazin a un échéancier `duree_mois >= 12` (les autres saturent au plafond avant)
- Soit il y a 2 systèmes de facturation: l'agent a noté que **les montants observés suggèrent un calcul via jalons** (`processBrouillonGroup`), pas via la formule linéaire du dialog. Deux systèmes coexistent peut-être.

🔁 **Challenge V1:** V1 disait "soit bug soit UX". Maintenant on sait qu'il y a un **vrai problème de calcul ET un possible problème de cohérence entre 2 systèmes de facturation**.

✅ **Spec V2:**

- **Étape 1 — Reproduire en DB:** pour le projet HEOL APPRENTISSAGE (0016-HEO-APP), lister la `duree_mois` et l'échéancier réel de chaque contrat affiché
- **Étape 2 — Diagnostiquer:**
  - Si tous les contrats sauf Bazin ont `duree_mois < 11` → comportement normal (plafond atteint) → **bug UX uniquement**: afficher visuellement les lignes "plafonnées" en grisé avec mention "Solde final atteint"
  - Si les durées sont équivalentes mais le calcul diffère → **vrai bug** à corriger
- **Étape 3 — Vérifier la cohérence:**
  - Le dialog "Nouvelle facture" calcule-t-il le montant correctement par rapport au calendrier réel d'échéances du contrat (table `echeanciers` / `factures`)?
  - Si l'échéancier est défini, **prioriser** le montant de l'échéance plutôt que le recalcul à la volée

⏱️ **M** (diagnostic + fix UX), **L** si unification 2 systèmes

---

## 6. DASHBOARD

### 6.1 Ne pas compter projets internes comme actifs

📝 _"Ne pas compter les projets internes comme des projets actifs"_

🔎 **Code:**

- `lib/queries/dashboard.ts:28-36`: query "projets actifs" filtre `.eq('statut', 'actif')` **sans exclure** `est_interne`
- Tous les KPI `projetsActifs`, `contratsActifs`, `facturesEmises`, `apprentisActifs` incluent potentiellement des entités liées aux projets internes

⚖️ **Verdict:** **fondé** ✓

🔁 **Challenge V1:** V1 OK.

✅ **Spec V2:**

- Audit complet de toutes les queries de `lib/queries/dashboard.ts`
- Ajouter `.eq('est_interne', false)` (ou jointure équivalente côté contrats/factures)
- ⚠️ **Exception possible:** la métrique "temps saisi" devrait peut-être garder les internes (pour vraiment refléter le total travaillé) — à confirmer

**Question Hervé:** _les heures saisies sur projets internes doivent-elles compter dans le KPI "temps saisi"?_

⏱️ **M**

---

### 6.2 Retravailler les liens des chiffres

📝 _"Retravailler les liens des chiffres"_

🔎 **Code:**

- `components/dashboard/dashboard-page-client.tsx:315-380`: certains MiniKpiCard ont des href (`/projets`, `/facturation`, `/temps`)
- Pas tous les chiffres ne sont liés (financials inline pas tous cliquables)

⚖️ **Verdict:** **fondé mais générique** — Hervé ne précise pas quels chiffres.

🔁 **Challenge V1:** V1 proposait une liste à priori. À reconfirmer.

✅ **Spec V2:**

- Audit visuel avec Hervé (capture d'écran annotée) de quel chiffre va où
- Convention: tout KPI doit être cliquable et amener à la vue filtrée correspondante

**Question Hervé:** _peux-tu m'annoter une capture du dashboard avec les chiffres qui manquent de lien ou qui pointent mal?_

⏱️ **M**

---

## 7. ERGO

### 7.1 Bug / Idées

📝 _"Signaler un Bug et Idées, top"_

🔎 **Code:**

- `components/bug-report/bug-report-launcher.tsx`: bouton flottant, capture écran auto, POST `/api/bugs`
- `app/(dashboard)/idees/page.tsx`: page complète + kanban (proposé, validé, en cours, livré, archivé)

⚖️ **Verdict:** **fonctionnel et apprécié** → rien à faire.

---

### 7.2 🐛 18 notifications fantômes — diagnostic confirmé

📝 _"18 notifications annoncées, aucune affichées"_

🔎 **Code — diagnostic précis:**

- **Compteur** (`hooks/use-badge-counts.ts:68-74`): `SELECT COUNT(*) FROM notifications WHERE read_at IS NULL`
  → **ne filtre pas par `user_id`** → compte les notifications de tous les utilisateurs
- **Liste** (`lib/queries/notifications.ts:15-20`): `SELECT ... WHERE user_id = user.id ORDER BY created_at DESC LIMIT 50`
  → filtre par `user_id`

⚖️ **Verdict:** **bug confirmé** — divergence des 2 queries.

🔁 **Challenge V1:** V1 hésitait sur l'hypothèse. Maintenant **on a le coupable exact.**

✅ **Spec V2:**

- **Fix:** ajouter `.eq('user_id', user.id)` à la query du compteur
- **Vérifier RLS** sur `notifications`: la RLS devrait normalement empêcher de compter celles des autres, donc soit la RLS manque, soit elle est en bypass (service role). Confirmer.
- **Tester** que le badge à 0 quand on est admin (pour ne pas voir le compteur de quelqu'un d'autre par erreur)

⏱️ **S** (30 min)

---

### 7.3 Mémorisation largeurs colonnes

📝 _"Memorisation des largeurs de colonnes ?"_

🔎 **Code:**

- `components/shared/data-table/data-table.tsx:70-113`: TanStack Table avec `enableColumnResizing: true` + `columnResizeMode: 'onChange'`
- ✅ Resize **possible** (le séparateur drag fonctionne ligne 151-162)
- ❌ Aucun localStorage/sessionStorage — perdu au refresh

⚖️ **Verdict:** **méconnaissance partielle**. Hervé pense que ça ne marche pas; en fait ça marche au runtime mais ce n'est pas persisté.

🔁 **Challenge V1:** V1 disait "ajouter resize". **Pas nécessaire**, déjà actif. **Reformuler:** ajouter persistance.

✅ **Spec V2:**

- Hook `useColumnSizing(tableId)`:
  - Lit `localStorage[`datatable:${tableId}:sizing`]` au mount
  - Écrit à chaque changement (avec debounce 500ms)
- Passer `columnSizing` + `onColumnSizingChange` au DataTable
- TableId stable par page (ex: `projets-list`, `factures-list`)

⏱️ **M** (2-3h)

---

## 8. COMMERCIAL

### 8.1 Fonctionnalités et états de suivi

📝 _"Top à développer simplement. Manque quelques fonctionnalités et à minima des états de suivi"_

🔎 **Code:**

- `app/(dashboard)/commercial/pipeline/page.tsx`: kanban + table
- DB: `00053_prospects.sql` avec enum `stage_prospect` (`non_contacte`, `r1`, `r2`, `signe`)
- Composants: `PipelineBoard` + `PipelineTable`
- `bulkUpdateProspects` existe en action mais peu exploité côté UI
- `rdv_commerciaux` (table) existe — intégration UI?

⚖️ **Verdict:** **partiellement fondé**. Le module existe avec kanban 4 stages, mais manques probables sur:

- États intermédiaires (devis envoyé, en négo, perdu)
- Suivi RDV intégré dans la fiche prospect
- Métriques (taux conversion, durée moyenne par stage)

🔁 **Challenge V1:** V1 disait "demander à Hervé". OK, mais ajouter maintenant la liste précise des composants existants à mettre sur la table de discussion.

✅ **Spec V2:**

- Lister à Hervé ce qui existe déjà:
  - ✅ Kanban 4 stages
  - ✅ Liste tabulaire
  - ✅ `rdv_commerciaux` en DB
  - ✅ Bulk actions back-end
- Lui demander de prioriser parmi:
  - Stage "perdu" / "devis envoyé"?
  - Vue RDV calendaire intégrée?
  - Métriques (taux signature, temps moyen par stage)?
  - Notifications automatiques (relances)?
  - Export CSV?

**Question Hervé:** _priorité 1, 2, 3 parmi: nouveaux statuts, intégration RDV, métriques, relances auto?_

⏱️ **L** selon ambition

---

## 9. DIVERS

### 9.1 Wisemanh V2 ou V3?

📝 _"Pour Wisemanh, j'utilise encore le v2 pour les tests ou c'est un autre lien ???"_

⚖️ **Verdict:** simple question de routing.

✅ **Action:** lui confirmer l'URL active pour ses tests (probablement `soluvia.vercel.app` si on a basculé en V3, sinon V2).

---

## 🎯 Synthèse priorisée révisée

### 🔴 P0 — Bugs à fix cette semaine

1. **7.2** Compteur notifications (manque `user_id` filter) — **S**
2. **5.5** Bazin mois 11→12 (investigation + UX plafond ou fix calcul) — **M**
3. **4.2** Détail Client/mois "Facturé" écart — **M**

### 🟠 P1 — Quick wins UX

4. **1.3A** Exclure `est_interne` de `getProjetsList()` — **S**
5. **6.1** Exclure internes du dashboard — **M**
6. **5.2** Presets templates échéanciers (1/12 etc.) — **S**
7. **4.3** Symétrie expansion mode consolidé — **S-M**
8. **4.1** Tooltip Production OPCO — **S**
9. **5.4** Tooltip + sous-titre Mois relatif — **S**
10. **3.3** Plancher 40€ analytique — **S**

### 🟡 P2 — Specs à valider puis dev

11. **1.3B** Vue liste `/projets/internes` — **M**
12. **1.1** Indicateurs Qualité+Pédago liste projets — **M**
13. **7.3** Persistance largeurs colonnes (resize déjà OK) — **M**
14. **2.1** Phase 1 liste qualité par projet — **M**

### 🟢 P3 — Échange oral indispensable avant code

15. **5.1** ESCOMPTE (vanne ou attente?) — **L si demandé**
16. **1.2** Eduvia deep-link (URL Eduvia inconnue) — **L global**
17. **3.1** Sens réel de "ajouter projet" temps — **S à L**
18. **3.2** Confirmer fin de liste suffit ou toggle — **S**
19. **8.1** Roadmap Commercial — **L selon scope**
20. **6.2** Audit liens dashboard avec capture annotée — **M**

---

## ❓ Questions consolidées à poser à Hervé

1. **Escompte** (5.1): **vanne ou attente fonctionnelle?**
2. **Apprentis Eduvia** (1.2): apprenants ou contrats? URL exemple?
3. **Qualité par chapitre** (2.1): "Chapitre" = exemple ou must? Exemple concret?
4. **Ajouter projet temps** (3.1): saisir hors-CDP ou autre besoin?
5. **Projets internes feuille** (3.2): fin de liste actuelle suffit ou toggle?
6. **Plancher analytique** (3.3): global ou par CDP?
7. **Production écart** (4.2): quel mois précis?
8. **Mois relatif** (5.4): clarifier ou supprimer?
9. **Dashboard internes temps** (6.1): heures internes dans KPI temps?
10. **Dashboard liens** (6.2): capture annotée?
11. **Commercial** (8.1): top 3 priorités?
12. **Wisemanh** (9.1): URL à utiliser?

---

## ✉️ Brouillon mail réponse révisé

```
Coucou Hervé,

Merci pour ce retour, j'ai pris le temps de croiser chacun
de tes points avec le code pour préparer un échange efficace.

3 anomalies confirmées que j'attaque cette semaine:
 - Le compteur notifications: bug identifié (filtre user_id
   absent côté compteur, alors qu'il est présent côté liste)
 - L'écart "Facturé" client/mois: 2 queries divergent
   probablement sur les statuts/dates inclus — peux-tu me
   préciser sur quel mois tu as vu l'écart ?
 - Bazin mois 11/12: investigation en cours, hypothèse
   d'échéanciers de durées différentes (les autres contrats
   ont peut-être atteint leur solde plafond avant 11)

Quelques points où j'ai besoin de toi avant d'avancer:
 - L'escompte: était-ce une vanne ou tu attends qu'on
   l'implémente ? (aujourd'hui on dit même "Pas d'escompte"
   sur le PDF, donc je suspecte la vanne, mais autant
   confirmer)
 - Apprentis vers Eduvia: as-tu un exemple de l'URL Eduvia
   que tu voudrais voir ouverte ? Apprenants ou Contrats ?
 - Qualité par chapitre: dans nos données on a la qualité
   au niveau CFA (Qualiopi), pas au niveau projet et encore
   moins par chapitre. C'est un exemple ou tu vises vraiment
   cette granularité ?

Bonne nouvelle:
 - Les projets internes sont déjà triés en fin de la
   feuille de temps (avec un fond ambre + badge), donc une
   partie de ton retour est déjà OK — confirme-moi si ça te
   suffit ou si tu veux un toggle pour les masquer.
 - Le resize des colonnes existe déjà (drag sur l'entête),
   c'est juste la persistance entre sessions qui manque.

Tu veux qu'on cale une visio 30 min cette semaine pour les
points qui méritent l'oral ? Je proposerais mardi ou
mercredi matin.

Naël
```

---

_Document V2 généré le 2026-05-18 — chaque point vérifié dans le code avec refs `file:line`._
