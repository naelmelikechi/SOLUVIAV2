# Retour Hervé Pigeault — 18 mai 2026

> Source: mail "Retour Soluvia" reçu le 2026-05-18 09:55 (hpigeault@gmx.fr).
> Ton général: positif ("Globalement, c'est top, GOOD JOB"). Une première passe rapide, plusieurs points méritent discussion orale.

Ce document trie chaque remarque en 3 catégories:

- ✅ **Explicite** — spec claire, on peut développer sans réunion
- ❓ **À clarifier** — question à poser à Hervé avant de coder
- 🐛 **Bug** — anomalie à reproduire, diagnostiquer et corriger

Le doc se termine par une **synthèse priorisée** + un brouillon de **mail réponse**.

---

## Remarque transverse

> "il manque les informations qualitatives et pédagogiques sur la liste des projets d'entrée, les liens vers les détails pour être plus efficace et ne pas mélanger les projets internes des autres"

**Fil rouge du retour:** la liste des projets doit devenir un vrai cockpit, pas un simple annuaire. On y rattache plusieurs points ci-dessous (PROJET 1, PROJET 3, DASHBOARD 1).

---

## 1. PROJET

### 1.1 ✅ Indicateurs Qualité et Pédago + liens directs sur la liste projets

**Retour brut:** _"En ligne, manque indicateurs Qualités et Pédago avec liens directs"_

**Spec:**

- Ajouter 2 colonnes (ou 2 badges compacts) sur la liste `/projets`:
  - **Qualité** — ex: `% livrables livrés` (agrégé sur tous les chapitres) ou note synthétique
  - **Pédago** — ex: `% avancement moyen apprenants` (depuis Eduvia) ou alerte si retard
- Chaque badge est cliquable et amène **directement à l'onglet correspondant** du projet (`/projets/[ref]?tab=qualite` et `?tab=pedagogie`), pas à la fiche projet générique
- Affichage conditionnel:
  - Vert si OK (seuils à définir, ex: >= 80%)
  - Orange si en cours (50-80%)
  - Rouge si en retard (< 50%)
- Tooltip au hover qui détaille le calcul

**Travail technique:**

- Étendre la query `projets` pour précharger les agrégats qualité + pédago (vue SQL ou colonne calculée pour perf)
- Ajouter colonnes optionnelles dans le `DataTable` projets
- Pas de N+1 — agréger côté DB

**Question annexe à confirmer:** seuils chiffrés des badges (ex: qualité OK = ?, pédago OK = ?). À caler avec Hervé.

---

### 1.2 ❓ Clic "Apprentis" → Eduvia (liste apprenants OU liste contrats ?)

**Retour brut:** _"Sur clic Apprentis, j'ouvrirai Eduvia avec la liste des apprentis (avec les taux avancement par exemple) ou liste des contrats (comme dans Projets) triés par retard d'avancement"_

**Intention claire:** le clic sur le compteur "X apprentis" doit ouvrir Eduvia, **pas** rester dans Soluvia.

**À choisir entre 2 options:**

1. **Vue apprenants** triée par taux d'avancement (ouvre la page Eduvia des apprenants du projet)
2. **Vue contrats** (équivalent de notre `/projets/[ref]/contrats`) triée par retard d'avancement, mais côté Eduvia

**Question à Hervé:** _quelle vue Eduvia tu préfères en cible du clic ? Apprenants ou Contrats ? (perso je pousserais "Contrats triés par retard" car c'est ton angle de pilotage)_

**Pré-requis technique:**

- Identifier l'URL Eduvia profonde (deep-link) qui accepte un filtre projet + tri
- Ouvrir dans nouvel onglet (`target="_blank"` + `rel="noopener"`)

---

### 1.3 ✅ Projets internes — sortir de la liste Projets + atterrissage liste

**Retour brut:** _"Quel est l'intérêt de la liste des Projets internes dans Projets. Par contre, la liste dans Projets internes avec le libellé du Projet, YES. Actuellement on arrive sur 1 projet..."_

**Deux specs en une:**

**A. Liste `/projets` ne doit plus afficher les projets internes**

- Filtre par défaut sur `projets.type != 'interne'` (ou équivalent `categorie_interne_id IS NULL`)
- Optionnel: toggle "Inclure projets internes" pour cas exceptionnels
- Impact: vérifier toutes les requêtes côté serveur + cohérence des compteurs sidebar

**B. Navigation `/projets/internes` doit ouvrir la LISTE, pas un projet**

- Actuellement, le clic sidebar "Projets internes" tombe sur la fiche d'**un seul** projet (probablement le 1er trouvé)
- Cible: page liste `/projets/internes` avec colonne libellé du projet + ses indicateurs propres
- Le clic sur une ligne ouvre alors `/projets/internes/[ref]`

**Vérification à faire avant code:**

- Reproduire le comportement actuel sur la prod pour confirmer (le code récent a ajouté `categories_internes` + page `/projets/internes`, vérifier la route exacte)

---

## 2. QUALITÉ

### 2.1 ✅ Liste qualité avec chiffres par projet

**Retour brut:** _"Liste avec chiffres qualitatifs par projet (%livrable livrés par Chapitre par exemple)"_

**Spec:**

- Sur `/qualite` (ou onglet Qualité), proposer une **vue liste par projet** (pas seulement chapitre par chapitre détaillé)
- Colonnes:
  - Projet (ref + libellé)
  - % livrables livrés global
  - % par chapitre (mini barre de progression ou expansion au clic)
  - Date dernier livrable reçu
  - Alerte rouge si retard
- Lien direct vers le détail qualité du projet sur clic ligne

**À calibrer avec Hervé:**

- Granularité: chapitre simple ou sous-chapitre ?
- Inclure les livrables internes (audit, COPIL) ou seulement pédagogiques ?

---

## 3. TEMPS

### 3.1 ❓ "Comment ajouter un Projet ?" — UX bouton ajout

**Retour brut:** _"Comment ajouter Projet ?"_

**Interprétation:** le bouton/mécanisme pour ajouter un projet à sa feuille de temps n'est pas évident dans l'UI actuelle.

**Spec proposée:**

- Bouton **explicite et visible** "+ Ajouter un projet" en haut ou en bas de la liste projets de la feuille
- Au clic: ouverture d'une recherche/dropdown avec projets disponibles (filtrés par droits CDP)
- Auto-focus sur le champ recherche
- Indicateur du nombre de projets déjà ajoutés

**Question à Hervé:** _est-ce que tu cherchais le bouton sans le trouver, ou tu le trouvais mais peu intuitif ? Tu préfères un bouton dédié vs ajout inline en bas du tableau ?_

---

### 3.2 ✅ Projets internes — pas par défaut dans la feuille

**Retour brut:** _"Par défaut, pas les projets internes, à ajouter par CDP comme tout autre projet (ou alors tout à la fin)"_

**Deux options possibles, la première est privilégiée:**

**Option A (recommandée):** retirer les projets internes du préchargement par défaut. Le CDP les ajoute manuellement comme tout autre projet via le bouton (cf 3.1).

**Option B (fallback):** garder le préchargement mais les déplacer **en fin de liste**, après tous les projets clients, avec séparateur visuel.

**À demander à Hervé:** _option A propre ou option B pragmatique ? Mon vote: A — cohérent avec son intention de séparer internes/externes (cf 1.3)._

**Travail technique:**

- Modifier la query initiale de la feuille de temps (`saisies_temps` + projets préchargés)
- Ne préselectionner que `type != 'interne'`
- Si option B: ajouter un `ORDER BY (type = 'interne') ASC, ref ASC`

---

### 3.3 ✅ Maintenir 40€ minimum CDP en analytique

**Retour brut:** _"Vu le calcul 37,04€ très bien. Du coup, je maintiendrais bien 40€ mini pour CDP en analytique"_

**Interprétation:** le calcul horaire CDP donne 37,04€ (probablement issu de la masse salariale réelle). Hervé veut maintenir un **plancher à 40€** appliqué en analytique (pour la valorisation des temps en interne, pas pour la paie).

**Spec:**

- Ajouter paramètre `cdp_taux_horaire_analytique_min` (= 40€) dans **Paramètres > Analytique** (ou équivalent)
- Dans le calcul de valorisation des saisies CDP:
  - `valorisation = nb_heures × MAX(taux_calculé, taux_min_param)`
- Conserver la trace du taux brut (37,04€) à côté du taux retenu (40€) pour transparence

**Vérification:**

- Confirmer avec Hervé: ce plancher s'applique-t-il à TOUS les CDP ou peut-il varier par CDP ? (le mettre par défaut global, override par utilisateur si besoin)

---

## 4. PRODUCTION

### 4.1 ❓ Colonne "Production OPCO" peu claire

**Retour brut:** _"Je ne suis pas sûr de bien comprendre la colonne Production OPCO..."_

**Action:**

- Ajouter **tooltip explicatif** sur l'entête de la colonne (formule + source)
- Vérifier la définition métier exacte avec Hervé (probablement: `montant_OPCO_facturable_du_mois` basé sur les lignes pédago émises ?)
- Éventuellement renommer si terme ambigu (ex: "OPCO à facturer", "OPCO produit")

**Question à Hervé:** _quelle formulation te parlerait mieux ? Et veux-tu un détail au clic (ligne par ligne) ou juste un tooltip suffit ?_

---

### 4.2 🐛 Détail Client par mois — "Facturé" ne correspond pas

**Retour brut:** _"Le détail Client par mois ne correspond pas, notamment le Facturé"_

**Suspicion:** divergence entre le total affiché en haut et la somme des lignes du détail Client/mois sur la métrique "Facturé".

**Plan d'investigation:**

1. Reproduire avec un mois où l'écart est visible
2. Vérifier la query de détail vs la query d'agrégat (souvent: filtre statut/date différent, lignes d'avoir comptées 2 fois, ou contrat archivé exclu d'un côté)
3. Comparer avec les factures réelles en DB pour le mois
4. Aligner les deux logiques

**À demander à Hervé:** _quel mois précisément il a vu l'écart ? (permet de cibler la repro)_

---

### 4.3 ✅ Mode consolidé — ouverture symétrique des 2 tableaux

**Retour brut:** _"En mode consolidé, sur clic flèche du mois, il faudrait que le détail s'ouvre de façon symétrique sur les 2 tableaux"_

**Spec:**

- En vue consolidée Production, il y a 2 tableaux côte à côte (ou empilés)
- L'expand d'un mois sur le tableau A doit **automatiquement** expand le même mois sur le tableau B
- Idem au collapse
- Implémentation: lever l'état "mois ouverts" au composant parent partagé, ou bus d'événements simple

**Effort:** faible (refacto d'état local → état partagé).

---

## 5. FACTURATION

### 5.1 😄 Escompte

**Retour brut:** _"Vous maitrisez même l'escompte maintenant ;-)"_

→ Aucun action, juste un compliment. À noter dans le mail réponse pour acknowledger.

---

### 5.2 ✅ Erreur Legacy — manque 1/12 dans Paramètres

**Retour brut:** _"Erreur Legacy, manque 1/12 de facturation dans Paramètres"_

**Interprétation probable:** dans **Admin > Paramètres > Échéanciers/Facturation**, il manque le ratio `1/12` dans la liste des modalités prédéfinies (les autres ratios 1/3, 1/6, etc. sont présents).

**Spec:**

- Ajouter le préset `1/12` dans la liste des templates d'échéancier (`echeanciers_templates_section.tsx`)
- Vérifier que le calcul gère bien `1/12 × montant_total` arrondi cents entiers (cf garde-fous légalité [[project_legal_invoicing]])

**Vérification:** confirmer auprès d'Hervé que c'est bien ce paramètre ou si c'est ailleurs (mot "Legacy" suggère un truc historique).

---

### 5.3 ❓ "Pas pu tester, pas sûr que ce soit super fluide"

**Retour brut:** _"Pas pu tester, mais intuitivement, je ne suis pas sûr que ce soit encore super fluide"_

**Action:**

- Pas de retour actionnable en l'état
- Proposer un **passage en revue ensemble** (démo écran) pour qu'il identifie les frictions précises
- Préparer un parcours guidé: création facture brouillon → édition lignes → ajout TO/CC → envoi mail → validation → suivi paiement

---

### 5.4 ❓ "Mois relatif" peu explicite pour CDP — à supprimer ?

**Retour brut:** _"En nouvelle facture, Mois relatif, peu explicite pour CDP. Certains contrats sont au 4è mois, d'autres au 12è mois, difficile de contrôler la facture pour CDP ou vous, mais peut être pas utile"_

**Interprétation:** le champ "Mois relatif global" dans le dialog `Nouvelle facture - choisir les contrats` est confus. Les contrats ne sont pas tous au même mois de leur cycle, donc une valeur globale (ex: 11) n'a pas la même signification d'un contrat à l'autre.

**Options:**

1. **Supprimer le champ** (Hervé semble pencher pour ça: _"peut être pas utile"_)
2. **Le garder mais le rendre clair** — afficher pour chaque contrat son mois absolu correspondant à ce mois relatif
3. **Le passer en mois absolu unique** (ex: facturer pour "Mai 2026")

**Question à Hervé:** _tu préfères qu'on retire purement le champ, ou qu'on le remplace par un sélecteur de mois absolu (plus naturel) ?_

---

### 5.5 🐛 Bug — entre mois relatif 11 et 12, seul Bazin change

**Retour brut:** _"Pourquoi entre 11 et 12, seul Bazin change ?"_

**Observation depuis screenshots (page 2 du PDF):**

- Mois 11: Bazin = 2 878,87 € HT
- Mois 12: Bazin = 3 140,58 € HT
- Tous les autres contrats: identiques entre mois 11 et 12

**Hypothèses techniques:**

1. Logique "Mois relatif" appliquée seulement aux contrats dont l'échéancier a une ligne ce mois-là
2. Bazin a probablement un échéancier de **12 mois** (donc le mois 12 = solde, montant final différent)
3. Les autres contrats ont des échéanciers plus courts (déjà soldés au mois 11) ou aux montants identiques sur 11 et 12

**Si c'est bien ça**, c'est un comportement attendu (échéanciers asymétriques) → **pas un bug**, mais **un défaut d'UX**: l'utilisateur ne comprend pas pourquoi.

**Action:**

- Investiguer la query `facture-lignes` pour confirmer
- Si comportement normal → **améliorer l'UX**: afficher pour chaque ligne le `mois X / total Y` du contrat ; indiquer "Solde final" pour le dernier mois
- Si c'est un bug → reproduire et corriger

**Lié au 5.4** — supprimer/clarifier le champ rend cette confusion caduque.

---

## 6. DASHBOARD

### 6.1 ✅ Ne pas compter les projets internes comme actifs

**Retour brut:** _"Ne pas compter les projets internes comme des projets actifs"_

**Spec:**

- Sur les compteurs Dashboard ("X projets actifs"), exclure les projets internes
- Cohérent avec 1.3 et 3.2 (séparer internes/externes partout)

**Travail technique:**

- Modifier toutes les queries d'agrégat dashboard
- Vérifier la sidebar également (badge "projets")

---

### 6.2 ❓ Retravailler les liens des chiffres

**Retour brut:** _"Retravailler les liens des chiffres"_

**Demande générique:** chaque KPI doit être cliquable et amener à la **vue filtrée correspondante**.

**Action:**

- Audit complet du dashboard, lister chaque chiffre et sa cible attendue
- Question à Hervé: _peux-tu m'indiquer quels chiffres précis posent problème (mauvaise cible ou pas de lien du tout) ?_

**Liste à valider** (proposition à priori):

- "X projets actifs" → `/projets?statut=actif`
- "X factures en retard" → `/factures?statut=retard`
- "X heures non saisies" → `/temps?statut=manquant`
- "X livrables en retard" → `/qualite?retard=true`
- (etc., à compléter)

---

## 7. ERGO

### 7.1 😄 Signaler Bug / Idées

**Retour brut:** _"Signaler un Bug et Idées, top"_

→ Aucun action, juste un compliment.

---

### 7.2 🐛 18 notifications annoncées, aucune affichée

**Retour brut:** _"18 notifications annoncées, aucune affichées"_

**Bug clair:** le badge sidebar dit 18, mais la dropdown/page notifications est vide.

**Plan d'investigation:**

1. Vérifier le compteur Realtime (probablement un `SELECT COUNT` sur `notifications`)
2. Vérifier la query de la liste (probablement un `SELECT *` mais avec un filtre supplémentaire: RLS, `archive = false`, `user_id`, `read = false`...)
3. Aligner les 2 queries (mêmes filtres)
4. Hypothèse principale: les notifications existent en DB mais sont filtrées par un statut/RLS que le compteur ne prend pas en compte

**Effort:** moyen (debug + alignement).

---

### 7.3 ✅ Mémorisation des largeurs de colonnes

**Retour brut:** _"Memorisation des largeurs de colonnes ?"_

**Spec:**

- Sur les `DataTable` (composant partagé), permettre le resize des colonnes (drag sur la bordure entête)
- Sauvegarder les largeurs par utilisateur + par table:
  - **Option simple:** `localStorage` avec clé `datatable:<id>:widths`
  - **Option robuste:** colonne `user_preferences` (JSON) dans `users`, sync entre devices
- Recommandation: localStorage suffit pour V1, on évoluera si besoin

**Travail technique:**

- Ajouter resize handler au header `DataTable`
- Hook `useColumnWidths(tableId)` pour persister

---

## 8. COMMERCIAL

### 8.1 ❓ Manque fonctionnalités et états de suivi

**Retour brut:** _"Top à développer simplement. Manque quelques fonctionnalités et à minima des états de suivi"_

**Action:**

- Pas assez précis pour coder
- **Lister avec Hervé** les fonctionnalités manquantes par ordre de priorité

**Questions à poser:**

1. Quels états de suivi minimum tu veux voir ? (prospect, RDV pris, devis envoyé, signé, perdu...)
2. Souhaites-tu un kanban ou une liste à statut ?
3. Y a-t-il un lien avec les projets (un prospect devient un projet à la signature) ?
4. Reporting/conversion: tu veux des taux ?

---

## 9. DIVERS

### 9.1 ❓ Wisemanh — v2 ou nouveau lien ?

**Retour brut:** _"Pour Wisemanh, j'utilise encore le v2 pour les tests ou c'est un autre lien ???"_

**Action:**

- Lui confirmer l'URL à utiliser pour ses tests Wisemanh
- Si on a migré vers V3 (Soluvia actuel), lui donner le nouveau lien
- Sinon, confirmer qu'il continue sur V2

---

## Synthèse priorisée (proposition)

### 🔴 P0 — Bugs à traiter cette semaine

1. **5.5** Mois 11→12 seul Bazin change (investiguer, confirmer bug vs UX)
2. **4.2** Détail Client/mois "Facturé" ne correspond pas
3. **7.2** 18 notifications fantômes

### 🟠 P1 — Quick wins UX (semaine prochaine)

4. **1.3** Sortir projets internes de la liste Projets + atterrir sur LISTE projets internes
5. **6.1** Dashboard: exclure projets internes des compteurs
6. **3.2** Temps: pas de projets internes par défaut
7. **4.3** Production: ouverture symétrique des 2 tableaux
8. **5.2** Ajouter 1/12 dans Paramètres échéanciers

### 🟡 P2 — Améliorations à scoper

9. **1.1** Indicateurs Qualité+Pédago sur liste Projets
10. **2.1** Liste Qualité avec chiffres par projet
11. **3.3** Plancher 40€ analytique CDP
12. **6.2** Audit liens cliquables Dashboard
13. **7.3** Mémorisation largeurs colonnes

### 🟢 P3 — Nécessite échange oral d'abord

14. **1.2** Liens Eduvia (choix vue)
15. **3.1** UX bouton "+ ajouter projet" feuille de temps
16. **4.1** Tooltip/clarification Production OPCO
17. **5.4** Sort du champ "Mois relatif"
18. **5.3** Démo facturation pour identifier les frictions
19. **8.1** Roadmap Commercial

---

## Questions ouvertes à poser à Hervé (récap)

À envoyer dans la réponse mail ou en début de visio:

1. **Apprentis → Eduvia** (1.2): vue Apprenants OU vue Contrats triée par retard ?
2. **Projets internes feuille de temps** (3.2): on les retire complètement OU on les met en fin de liste ?
3. **Plancher 40€ CDP** (3.3): global pour tous les CDP ou paramétrable par utilisateur ?
4. **Production OPCO** (4.1): tooltip suffit ou il faut un détail au clic ? Une autre dénomination ?
5. **Détail Facturé qui cloche** (4.2): sur quel mois précis tu as vu l'écart ?
6. **1/12 Paramètres** (5.2): c'est bien le préset d'échéancier, pas un autre paramètre ?
7. **Mois relatif** (5.4): on supprime le champ OU on le remplace par un mois absolu ?
8. **Dashboard liens** (6.2): quels chiffres en particulier posent problème ?
9. **Largeurs colonnes** (7.3): localStorage (par device) suffit ou tu veux que ça sync entre tes machines ?
10. **Commercial** (8.1): peux-tu prioriser les fonctionnalités manquantes ?
11. **Wisemanh** (9.1): tu continues sur V2 ou tu testes la V3 ?

---

## Brouillon mail réponse (à adapter)

```
Coucou Hervé,

Merci pour ce retour rapide et détaillé — ça aide vraiment à
prioriser. Quelques réponses à chaud et quelques questions
pour préparer une visio plus productive.

→ Plusieurs points sont des quick wins UX que je peux attaquer
  dès cette semaine: projets internes mieux séparés (liste,
  dashboard, feuille de temps), 1/12 dans les paramètres,
  ouverture symétrique des tableaux Production.

→ 3 anomalies à investiguer en priorité:
   - le détail Facturé client/mois qui ne correspond pas
     (peux-tu me préciser sur quel mois tu as vu l'écart ?)
   - le mystère Bazin sur les mois 11/12 (je soupçonne un
     échéancier de 12 mois avec un solde final qui décale,
     mais je vérifie)
   - les 18 notifications fantômes (compteur != liste, je
     creuse)

→ Quelques questions pour le reste, listées en fin du
  document partagé. Les principales:
   - Mois relatif: on supprime ou on remplace par un mois
     absolu ?
   - Eduvia: tu veux la vue Apprenants ou Contrats au clic ?
   - Commercial: peux-tu me prioriser les fonctionnalités
     manquantes ?

Pour Wisemanh, je te confirme le bon lien par retour.

Visio quand tu veux, je suis dispo [créneaux].

Naël
```

---

_Document généré le 2026-05-18 à partir du PDF "RetourSoluvia.pdf" reçu d'Hervé Pigeault._
