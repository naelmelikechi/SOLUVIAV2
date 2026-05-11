# Retours testeurs — Mise en prod, Vague 1

Date : 2026-05-11
Statut : approuvé, en cours d'exécution

## Contexte

L'équipe SOLUVIA prépare l'ouverture aux testeurs internes cette semaine avec un canal WhatsApp pour les retours. Nael a remonté un premier lot de feedback sur les pages Projets, Qualité, Production, Facturation et Commercial. Ce spec couvre la **Vague 1** : les corrections rapides qui doivent être livrées avant d'ouvrir aux testeurs, pour éviter le facepalm en démo et débloquer les usages de base.

La **Vague 2** (filtres par colonne, vue consolidée Production, vue Tableau Commercial) est volontairement décalée pour bénéficier des retours utilisateurs réels et ne pas précipiter un refacto majeur du `DataTable`.

## Vague 1 — Items à livrer

### 1. Fix breadcrumb `/admin` → 404

**Bug** : sur toute sous-page admin (`/admin/clients`, `/admin/utilisateurs`, `/admin/audit`, `/admin/intercontrat`, `/admin/parametres`, `/admin/clients/[id]`), le fil d'Ariane généré par `components/layout/topbar.tsx` rend le segment "Administration" comme `Link href="/admin"`, qui n'existe pas et 404.

**Fix** : créer `app/(dashboard)/admin/page.tsx` qui redirige selon le rôle :

- admin / superadmin → `/admin/clients`
- cdp → `/projets` (le CDP n'a pas accès à l'admin de toute façon, route hidden de la sidebar)

Implémenter avec `redirect()` côté Server Component. Pas de UI.

### 2. Rename "CFA configurés" → "CFA en gestion"

**Where** : `app/(dashboard)/qualiopi/page.tsx:45`

**Action** : un seul remplacement de string. Vérifier qu'aucun autre endroit n'utilise "CFA configurés" pour rester cohérent.

### 3. Stat-card CDP cliquable sur fiche projet

**Where** : `components/projets/projet-stat-cards.tsx`

**Bug** : la stat-card "CDP" (Nael Melikechi) ressemble à un lien (texte stylé) mais n'est pas cliquable.

**Fix** : wrapper le nom dans un `<Link href="/admin/utilisateurs">` (cohérent avec ce que fait la cellule CDP dans la table projets). Pareil pour "Backup CDP" si applicable. Ajouter `hover:underline` pour le feedback visuel.

### 4. Indicateur visuel cellules cliquables (audit + uniformisation)

**Périmètre** : audit des tables principales pour identifier les cellules qui sont des liens ou qui ouvrent une sheet/modale au clic, et leur poser une classe cohérente `hover:underline` (déjà partiellement en place sur Client/CDP dans Projets).

**Tables à auditer** :

- `components/projets/projet-list-columns.tsx` — Client ✓, CDP ✓, autres cellules clickables ?
- `components/facturation/facture-list-columns.tsx` — Ref facture (lien fiche), Projet (lien projet), Client
- `components/projets/projet-contrats-table.tsx` — ouvre `contrat-detail-sheet`
- `components/commercial/prospect-row.tsx` — Nom prospect (ouvre sheet)
- Table Utilisateurs (`app/(dashboard)/admin/utilisateurs/page.tsx`)
- Table Clients (`app/(dashboard)/admin/clients/page.tsx`)

**Règle** : si la cellule est un `<Link>` ou son `onClick` déclenche navigation/ouverture, alors `hover:underline` (ou équivalent : changement de couleur si déjà underline désactivé pour des raisons typographiques). Si la cellule est purement informative (chiffre, badge de statut), ne rien ajouter.

**Précaution** : ne PAS rendre cliquable des cellules qui ne le sont pas (ce n'est pas le périmètre de cette vague — voir Vague 2 sur la Commission qui pourrait devenir éditable).

### 5. Delete prospect (admin)

**Where** : `lib/actions/prospects.ts` (nouvelle action) + `components/commercial/prospect-detail-sheet.tsx` (bouton)

**Spec** :

- Server Action `deleteProspect(id: string)` : check `isAdmin` côté serveur, supprime la ligne `prospects` (et FK cascade vers `prospect_notes`, `rdv_commerciaux`). Soft-delete ? Non, le pipeline n'a pas de soft-delete sur prospects à ce jour — utiliser `archive` boolean si dispo, sinon vrai DELETE.
- À vérifier dans la migration : la table `prospects` a-t-elle un `archive` column comme les autres tables du projet (cf. CLAUDE.md "Soft delete : `archive BOOLEAN DEFAULT false`") ?
- UI : bouton corbeille (`Trash2`) en bas de `prospect-detail-sheet.tsx`, visible uniquement si `isAdmin`. `AlertDialog` de confirmation avant action. Toast success/erreur. Ferme la sheet et retire la ligne du board (`setGrouped` filter).

### 6. Point oral workflows facturation

Aucun code à modifier. Documentation orale livrée dans la conversation initiale, à reprendre dans un README court si Nael le souhaite (hors scope code).

## Hors périmètre Vague 1

Repoussés en Vague 2 (à ré-évaluer après retours WhatsApp) :

- Filtres/tris/recherche par en-tête de colonne (refacto majeur `DataTable`)
- Vue Production "côte-à-côte OPCO + Soluvia"
- Filtre par projet sur Production
- Vue Tableau alternative au Kanban (Commercial)

## Plan d'exécution

Commit par item, dans cet ordre :

1. Fix `/admin` 404 (15 min)
2. Rename CFA en gestion (2 min)
3. Stat-card CDP + indicateurs visuels cliquables (1-2h, peut se faire en un commit groupé "uniformisation indicateur visuel cliquable")
4. Delete prospect admin (2h)

Total estimé : ~3-4h de dev + tests manuels en local sur chaque item.

## Critères de "fait"

- [ ] Cliquer sur "Administration" depuis n'importe quelle sous-page admin redirige vers la bonne destination, pas de 404
- [ ] Page Qualité affiche "CFA en gestion"
- [ ] Cliquer sur le nom du CDP dans la stat-card de la fiche projet navigue vers `/admin/utilisateurs`
- [ ] Toutes les cellules cliquables identifiées ont un `hover:underline` (ou équivalent visuel cohérent)
- [ ] Un admin peut supprimer un prospect depuis la sheet détail, avec confirmation
- [ ] `npm run lint` et `npm run build` passent
- [ ] Test manuel rapide sur chaque page modifiée
