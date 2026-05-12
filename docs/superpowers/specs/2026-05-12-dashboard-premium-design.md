# Dashboard premium - refonte hierarchie d'insight

**Date :** 2026-05-12
**Statut :** Design valide, en attente de plan d'implementation
**Scope :** `/dashboard` (route `app/(dashboard)/dashboard/page.tsx` + `components/dashboard/dashboard-page-client.tsx`)

## Probleme

Le dashboard actuel aligne 11 KPIs au meme niveau visuel reparti en 3 sections (Performance financiere, Activite operationnelle, Qualite). Trois consequences :

- Pas de hierarchie de lecture : tous les chiffres ont le meme poids visuel, l'oeil ne sait pas par ou commencer.
- Pas de narration : aucun chiffre ne raconte ce qui se passe ce mois.
- Composantes secondaires (Personal Time Widget pleine largeur, Alerts en pile de 4 lignes) prennent autant de place que les KPIs.

Resultat : sensation "SaaS generique" malgre des donnees riches (sparklines, M-1, alerts).

## Direction retenue

**Hierarchie d'insight**, pattern **Trinity Funnel** sur le mois en cours.

Trois niveaux de lecture :

1. **Hero** : funnel financier Production -> Facture -> Encaisse (mois en cours)
2. **Satellites actionnables** : 3 chips contextuels (En retard, A facturer, Ta semaine)
3. **Contexte** : KPIs operationnels (5) + qualite (3) en mini-cards uniformes

Charts et table M/M-1 existants sont conserves tels quels.

## Layout cible

```
┌─────────────────────────────────────────────────────────────┐
│ Dashboard                Mai 2026 ▼  Personnaliser  Exporter│  Toolbar
├─────────────────────────────────────────────────────────────┤
│ ● 2 En retard   ● 3 Echeances pretes   ● 2 Jours sans saisie│  Alerts strip (1 ligne)
├─────────────────────────────────────────────────────────────┤
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐         │
│ │ PRODUCTION   │ │ FACTURE      │ │ ENCAISSE     │         │
│ │ 42 580 €     │ │ 90% 38 200 € │ │ 73% 31 100 € │         │  Trinity funnel
│ │ ↑ +12% M-1   │ │ 4 380 € rest.│ │ 7 100 € att. │         │
│ │ ▓▓▓▓▓▓▓▓▓▓   │ │ ▓▓▓▓▓▓▓▓▓░   │ │ ▓▓▓▓▓▓▓░░░   │         │
│ └──────────────┘ └──────────────┘ └──────────────┘         │
├─────────────────────────────────────────────────────────────┤
│ [● En retard 4200€ Relancer›] [● A facturer 7800€ Emettre›] │  Chips action
│ [● Ta semaine 18h/35h Saisir›]                              │
├─────────────────────────────────────────────────────────────┤
│ ACTIVITE OPERATIONNELLE                                     │
│ [Projets 6] [Contrats 23] [Apprenants 56] [Form. 7] [Sai 67%]│  Grid 5
├─────────────────────────────────────────────────────────────┤
│ QUALITE & PEDAGOGIE                          Voir Qualiopi ›│
│ [Pedagogie 17%] [Abandons 2] [RQTH 2%]                      │  Grid 3
├─────────────────────────────────────────────────────────────┤
│ Charts (Revenue trend + Invoice status)         [existant]  │
├─────────────────────────────────────────────────────────────┤
│ Evolution M / M-1                                 [existant]│
└─────────────────────────────────────────────────────────────┘
```

## Specifications par bloc

### 1. Toolbar

Nouvelle barre en haut du `DashboardPageClient`. Remplace l'actuelle "Personnalisation toolbar" qui n'a que les boutons Personnaliser/Restaurer.

Contient :

- A gauche : titre "Dashboard" (taille `text-lg` `font-semibold`, deja porte par `PageHeader` actuellement - voir note)
- A droite : selecteur de periode + bouton Personnaliser + bouton Exporter

Selecteur de periode :

- Affiche le mois courant par defaut (`Mai 2026` formate via `date-fns/format` avec locale fr).
- Dropdown avec options : `Ce mois`, `Mois precedent`, `30 derniers jours`.
- Initialement, dropdown peut etre un simple `Select` shadcn/ui. La valeur selectionnee re-fetch les donnees (cf. section "Donnees").

Note : le `PageHeader` actuel affiche deja "Dashboard" + description "KPIs et alertes operationnelles". On peut soit fusionner la toolbar dans le PageHeader (ajout de `actions` slot), soit garder PageHeader simple et mettre la toolbar comme premier element du client. **Decision : ajouter un slot `actions` au PageHeader** pour rester coherent avec les autres pages.

### 2. Alerts strip compacte

Remplace le bloc Alerts actuel (4 lignes empilees) par une seule ligne horizontale.

- Si aucune alerte : message "Tout est sous controle" centre, dot vert.
- Si alertes : chaque alerte = `<dot count><label>` cliquable vers `href`.
- Aligne les alertes a gauche, dot avec compteur color-code (rouge/orange/bleu).
- Cliquable redirige vers la meme URL qu'avant (`/facturation`, `/temps`, `/projets`).

Composant : nouveau sous-composant `AlertsStrip` qui prend la liste d'alertes existante. Garde la logique de construction des alertes telle quelle.

### 3. Trinity funnel

Trois cards cote a cote dans un container `bg-border` divise (effet "tableau" avec separateurs 1px).

**Card 1 - Production (hero)**

- Label : "Production"
- Valeur : `formatCurrency(totalProduction)`
- Trend : "↑ +N% vs M-1" (vert si positif, base sur `productionTrend` existant)
- Barre 100% noire (reference, point de depart du funnel)
- Subtle background gradient (`bg-gradient-to-b from-card to-muted/30`)

**Card 2 - Facture**

- Label : "Facture"
- Valeur : `<conversion-pct>NN%</conversion-pct> <amount>`
- Pct = round(totalFacture / totalProduction \* 100)
- Sous-texte : "X € restent a facturer" si production > facture, sinon vide
- Barre : largeur = pct, couleur bleue (`#3b82f6`)

**Card 3 - Encaisse**

- Label : "Encaisse"
- Valeur : `<conversion-pct>NN%</conversion-pct> <amount>`
- Pct = round(totalEncaisse / totalProduction \* 100)
- Sous-texte : "X € en attente de paiement" (totalFacture - totalEncaisse)
- Barre : largeur = pct, couleur verte (`#16a34a`)

Composant : nouveau `TrinityFunnel` qui prend `{ production, facture, encaisse, productionTrend }`.

**Note critique - calage temporel des donnees** :

Aujourd'hui dans `lib/queries/dashboard.ts` :

- `totalProduction` = mois courant uniquement (schedule OPCO 40/30/20/10, filtre `e.month === monthKey`)
- `totalFacture` = cumul total toutes annees
- `totalEncaisse` = cumul total toutes annees
- `totalEnRetard` = cumul total

Pour que le funnel ait du sens, les 3 montants doivent etre sur la meme periode. **Decision : tout caler sur le mois en cours** (selectionnable via la toolbar).

Adaptations queries (a faire dans le plan d'implementation) :

- `getDashboardFinancials(periode?: { from: Date; to: Date })` accepte une periode optionnelle
- `totalFacture` filtre par `factures.date_emission` dans la periode
- `totalEncaisse` filtre par `paiements.date_paiement` dans la periode
- `totalEnRetard` reste "cumul a date" (c'est l'encours total en retard, pas une notion periodique)

### 4. Chips actionnables

Sous la trinity, ligne de 3 chips horizontaux. Format pill avec dot + label + value + CTA.

Chip 1 - En retard (warn) :

- Dot rouge, value en rouge
- "Relancer ›" -> `/facturation?statut=en_retard` (ajouter searchParams support cote facturation, voir note)
- Visible uniquement si `totalEnRetard > 0`

Chip 2 - A facturer :

- Dot bleu
- Value = `formatCurrency(totalAFacturer)` (nouveau : somme echeances pretes a emettre)
- "Emettre ›" -> `/facturation` (ancrage section echeances ou search `?onglet=echeances` si existe)
- Visible uniquement si `totalAFacturer > 0`

Chip 3 - Ta semaine :

- Dot orange si <35h, vert si >=35h
- Value = `${weekHours}h / 35h`
- "Saisir ›" -> `/temps`
- Toujours visible (info perso utile chaque jour)

Composant : `ContextChips` qui prend les valeurs et rend la liste de chips non-null.

**Suppression** : la `Personal Time Widget` actuelle (Card pleine largeur avec progress bar) disparait. L'info est portee par le chip "Ta semaine". L'info "X heures cette semaine" reste accessible visuellement.

**Note searchParams `/facturation`** : aujourd'hui `app/(dashboard)/facturation/page.tsx` n'a pas de support `searchParams`. Pour faire fonctionner `?statut=en_retard`, il faut ajouter le filtrage cote serveur OU laisser le user filtrer manuellement. **Decision pour ce spec : ne pas ajouter le filtrage cote facturation**. Le chip pointe vers `/facturation` simple. Filtrage URL `/facturation?statut=en_retard` = chantier separe.

### 5. Activite operationnelle (grid 5)

5 mini-cards alignees sur une ligne (`md:grid-cols-3 lg:grid-cols-5`).

- Projets actifs : 6 / "en cours de suivi" / -> `/projets`
- Contrats : 23 / "tous projets confondus" / -> `/projets`
- Apprenants : 56 / "contrats en cours" / -> `/projets`
- Formations : 7 / "en cours (Eduvia)" / -> `/projets`
- Saisie temps : 67% / "moyenne equipe" (note : etait "Xj non saisi(s) cette semaine" mais cette info migre dans alerts strip) / -> `/temps`

Mini-card design uniforme :

- `border` plus discret (`border-border/60` ou equivalent)
- Padding compact (`p-3` au lieu de `p-5`)
- Label tiny (`text-[10px] uppercase tracking-wider`)
- Valeur `text-lg font-semibold tabular-nums`
- Subtitle `text-[10px] text-muted-foreground`
- Pas d'icone (suppression des icones colorees actuelles)
- Pas de sparkline (deplacement vers la trinity)
- Hover : leger surlignage de bordure

Composant : nouveau `MiniKpiCard` distinct du `KpiCard` actuel.

### 6. Qualite & pedagogie (grid 3)

Meme traitement que operationnelle. 3 mini-cards :

- Progression pedagogie / 17% / "moyenne contrats actifs"
- Abandons / 2 / "resilies / annules"
- Apprenants RQTH / 2% / "1 apprenant en situation de handicap"

Lien "Voir Qualiopi ›" en haut a droite de la section (deja present, conserve).

### 7. Charts (existant)

Garde `RevenueTrendChart` + `InvoiceStatusChart` tels quels. Eventuellement, harmoniser les titres avec le nouveau style typographique (uppercase tracking-wider).

### 8. Evolution M/M-1 (existant)

Garde la table d'evolution telle quelle. Eventuellement raffiner le style typographique pour matcher le reste.

## Raffinements transverses

Appliques a tout le dashboard pour donner le rendu premium :

- **Typographie chiffres** : `font-feature-settings: 'tnum', 'zero'` partout (tabular-nums + slashed-zero). A definir une fois dans `globals.css` via une classe utilitaire `.num` ou directement sur les composants concernes.
- **Letter-spacing** : `tracking-tight` (-0.02em) sur les gros chiffres pour resserrer.
- **Labels uppercase** : 9-10px, `tracking-wider`, color `text-muted-foreground` (deja en place pour la plupart).
- **Dividers** : sections separees par `border-t border-border/60` + padding vertical, pas par gros `space-y-6` (actuel).
- **Hover states** : tres discrets, juste la bordure qui passe a `border-foreground/10`.
- **Mount animation** : stagger des cards au mount (fade-in + translateY 4px), via `framer-motion` ou CSS pure (`@keyframes` + `animation-delay`). Optionnel mais signature "premium".
- **Personnalisation (mode edit)** : conserve le mecanisme existant `useHiddenKpis`. Le mode edit affiche le × sur chaque carte (trinity, chips, mini-cards). Le bouton Personnaliser reste dans la toolbar.

## Donnees - changements requis dans `lib/queries/dashboard.ts`

- `getDashboardFinancials(periode?: { from: Date; to: Date })` accepte une periode (default = mois courant)
- `totalProduction` deja filtre par mois - generaliser au range
- `totalFacture` ajouter filtre `factures.date_emission BETWEEN from AND to`
- `totalEncaisse` ajouter filtre `paiements.date_paiement BETWEEN from AND to`
- `totalEnRetard` reste "cumul a date" (encours total)
- Nouveau : `totalAFacturer` = somme echeances pretes a emettre (factures statut=brouillon prete ou echeance non emise dont la date <= today)
- `getKpiSnapshots` : meme logique de "previous" mais le "previous" devient periode -1 (mois precedent si periode = mois courant)

A confirmer dans le plan : structure exacte de `totalAFacturer` (echeances OPCO vs factures brouillon ?). Cf. specs/projets pour la definition canonique.

## Hors scope (volontairement)

- **Selecteur de periode global multi-options** (trimestre, YTD, 12 mois roulants) : on commence avec 3 options seulement (Ce mois / Mois precedent / 30j roulants). Extension future.
- **Filtres searchParams sur `/facturation`** : chips pointent vers pages simples sans filtre URL. Chantier separe.
- **Refactor charts** : RevenueTrendChart et InvoiceStatusChart restent identiques fonctionnellement.
- **Refactor table M/M-1** : reste identique fonctionnellement.
- **Dette indicateurs metier** : les KPIs derives de la dette identifiee 2026-04-24 (cf. memoire) restent geles. Pas de recalcul dans ce chantier.

## Composants impactes

Fichiers a modifier :

- `components/dashboard/dashboard-page-client.tsx` - refonte structurelle
- `lib/queries/dashboard.ts` - filtre periode sur facture/encaisse, ajout `totalAFacturer`
- `app/(dashboard)/dashboard/page.tsx` - passer la periode aux queries, gerer searchParams `?periode=`
- `components/shared/page-header.tsx` - ajout slot `actions` (probablement deja supporte, a verifier)

Nouveaux composants :

- `components/dashboard/trinity-funnel.tsx`
- `components/dashboard/context-chips.tsx`
- `components/dashboard/alerts-strip.tsx` (compact, remplace l'ancien bloc inline)
- `components/dashboard/mini-kpi-card.tsx`
- `components/dashboard/period-selector.tsx` (Select shadcn/ui pour les 3 options de periode)

A supprimer (apres migration) :

- Personal Time Widget pleine largeur dans `dashboard-page-client.tsx` (logique migre dans `ContextChips`)
- Bloc alerts inline (logique migre dans `AlertsStrip`)
- `KpiCard` actuel (remplace par TrinityFunnel + MiniKpiCard) OU garde et coexiste si d'autres pages l'utilisent (a verifier).

## Validation

Critere de succes : un utilisateur qui ouvre `/dashboard` doit, en 2 secondes, repondre a "ca va bien ce mois ?" sans avoir a parcourir 11 cards. Le funnel + les 3 chips actionables doivent porter 80% de la valeur d'information du dashboard.
