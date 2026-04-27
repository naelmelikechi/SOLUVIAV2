# Saisie d'absences par période

**Date** : 2026-04-27
**Statut** : Design validé, en attente de plan d'implémentation
**Périmètre** : remplacer la saisie d'absence jour-par-jour par une saisie de période (date début → date fin avec demi-journées de bord).

## Contexte

Aujourd'hui, le banner d'absences (`components/temps/absence-banner.tsx`) affiche 5 cards lun→ven et l'utilisateur clique jour par jour pour poser une absence (Congés / Maladie, durée Journée 7h / Matin 3.5h / Après-midi 3.5h). Chaque clic crée une ligne dans `saisies_temps` avec `est_absence = true`, référençant un projet système (`9999-CON-ABS` ou `9998-MAL-ABS`).

Cette UX devient pénible dès que l'utilisateur pose plusieurs jours consécutifs (5 clics pour une semaine de congés) et fragmente l'historique en N lignes sans notion de bloc logique.

## Objectif

Permettre la saisie d'une période d'absence en une seule action, avec :

- Date début / date fin
- Type unique : Congés ou Maladie
- Demi-journée optionnelle sur la borne de début (commence l'après-midi) et/ou la borne de fin (finit le matin)
- Édition / suppression au niveau de la période, pas du jour

Conserver le banner par jour comme visualisation lecture seule, enrichi d'un état "Travaillé" (jours avec heures de projet saisies).

## Périmètre

### Inclus

- Nouvelle table `absences` dédiée (source unique de vérité pour les absences hors féries)
- Migration des `saisies_temps.est_absence = true` existantes vers `absences`, en groupant les jours consécutifs même type/utilisateur en périodes
- Drop des projets système `9999-CON-ABS`, `9998-MAL-ABS`, `9997-FER-ABS` (devenus inutiles ; les féries restent dans `jours_feries`)
- UI sur `/temps` : bouton "+ Absence" ouvrant une dialog de saisie
- Banner réécrit en lecture seule avec 4 états visuels (Travaillé / Absence / Férié / Vide)
- Popover sur une card "Absence" avec détails de la période + Modifier / Supprimer
- Helper `computeAbsenceHoursPerDay` partagé entre banner et time-grid
- Server actions `createAbsenceAction`, `updateAbsenceAction`, `deleteAbsenceAction`
- Validation : pas de chevauchement avec une absence existante du même utilisateur

### Exclus (V1)

- Workflow d'approbation (auto-validé)
- Vue admin "qui est absent quand" sur une période
- Notification équipe quand quelqu'un pose des congés
- Gestion d'un solde de congés ("il te reste 12 jours")
- Saisie d'absences pour un autre utilisateur (admin pose congés au nom d'un CDP)

## Schéma

### Nouvelle table

```sql
CREATE TYPE absence_type AS ENUM ('conges', 'maladie');

CREATE TABLE absences (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type            absence_type NOT NULL,
  date_debut      DATE NOT NULL,
  date_fin        DATE NOT NULL,
  demi_jour_debut BOOLEAN NOT NULL DEFAULT false,
  demi_jour_fin   BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_dates CHECK (date_fin >= date_debut),
  CONSTRAINT chk_demi_jour_meme_jour CHECK (
    NOT (date_debut = date_fin AND demi_jour_debut AND demi_jour_fin)
  )
);

CREATE INDEX idx_absences_user_dates ON absences (user_id, date_debut, date_fin);

-- Trigger updated_at standard du projet
```

Sémantique :

- `demi_jour_debut = true` → la période commence l'après-midi du `date_debut` (3.5h le 1er jour)
- `demi_jour_fin = true` → la période finit le matin du `date_fin` (3.5h le dernier jour)
- Si `date_debut = date_fin` (1 seul jour), ne peut pas être à la fois demi_jour_debut et demi_jour_fin (sinon = 0h, absurde)

### RLS

```sql
ALTER TABLE absences ENABLE ROW LEVEL SECURITY;

-- Un user voit ses propres absences
CREATE POLICY "absences_select_own" ON absences FOR SELECT
  USING (user_id = auth.uid());

-- Un admin voit toutes les absences (pour vue equipe future)
CREATE POLICY "absences_select_admin" ON absences FOR SELECT
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- Un user gère ses propres absences (insert/update/delete)
CREATE POLICY "absences_modify_own" ON absences FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
```

### Migration des données

Étape 1 — convertir les Congés/Maladie en `absences` :

Pour chaque `saisies_temps` row avec `est_absence = true` et `projet_id` pointant vers `9999-CON-ABS` ou `9998-MAL-ABS` :

1. Récupérer `user_id`, `date`, `heures`, et le type via `projet.ref` (`9999-CON-ABS` → `conges`, `9998-MAL-ABS` → `maladie`)
2. Grouper par `(user_id, type, dates calendaires consécutives)` → identifier les périodes. Note : weekend non saisi = pas de continuité, donc une absence Lun-Ven puis lundi suivant = 2 périodes distinctes (séparées par le weekend où il n'y a pas de saisie).
3. Pour chaque groupe :
   - `date_debut` = min(date), `date_fin` = max(date)
   - `demi_jour_debut` = true si `heures` du `date_debut` = 3.5
   - `demi_jour_fin` = true si `heures` du `date_fin` = 3.5
4. INSERT dans `absences`

Étape 2 — nettoyage :

5. DELETE de toutes les `saisies_temps` avec `est_absence = true` (incluant les rows pointant vers `9997-FER-ABS` si elles existent — les féries sont déjà gérées par `jours_feries`)
6. DROP des projets système `9999-CON-ABS`, `9998-MAL-ABS`, `9997-FER-ABS`
7. DROP des clients système `Conges (systeme)`, `Maladie (systeme)`, `Feries (systeme)` (uniquement si plus aucun projet ne les référence)
8. La constante `ABSENCE_PROJECTS` dans `lib/utils/constants.ts` est supprimée

L'ensemble est exécuté dans une seule transaction pour éviter un état intermédiaire incohérent.

Migration faite en SQL pur (DO block ou plpgsql), exécutée dans la même transaction que la création de la table.

## UI

### Composants modifiés / créés

- `components/temps/absence-form-dialog.tsx` (NOUVEAU) : dialog de création/édition d'absence
- `components/temps/absence-banner.tsx` (RÉÉCRIT) : 4 états visuels lecture seule + popover détails
- `components/temps/temps-page-client.tsx` (MODIFIÉ) : ajoute bouton "+ Absence", retire la logique d'édition jour-par-jour
- `components/temps/time-grid.tsx` (MODIFIÉ MINIMAL) : utilise le nouveau helper `computeAbsenceHoursPerDay` au lieu de la prop `absences` calculée à partir de saisies

### Dialog "Ajouter une absence"

```
┌──────────────────────────────────────┐
│ Nouvelle absence                  [X]│
├──────────────────────────────────────┤
│ Type                                 │
│ ( ) Congés       ( ) Maladie         │
│                                      │
│ Du : [📅 27/04/2026]                 │
│ Au : [📅 02/05/2026]                 │
│                                      │
│ ☐ Commence l'après-midi              │
│ ☐ Finit le matin                     │
│                                      │
│ ─────────────────────────────────    │
│ Total : 4 jours / 28h                │
│                                      │
│         [Annuler]  [Enregistrer]     │
└──────────────────────────────────────┘
```

Validations client :

- Type sélectionné, dates valides, date_fin >= date_debut
- Si même jour, refuse demi_jour_debut + demi_jour_fin simultanés

Validations server (en plus des contraintes DB) :

- Pas de chevauchement avec une absence existante de ce user
- Erreur explicite renvoyée si chevauchement (toast côté client)

### Banner réécrit

Pour chaque jour Mon-Fri :

| État          | Conditions                                                   | Style                                            |
| ------------- | ------------------------------------------------------------ | ------------------------------------------------ |
| **Férié**     | présent dans `joursFeries[date]`                             | bg neutre, label férié orange                    |
| **Absence**   | présent dans `absencesPerDate[date]` (helper, voir plus bas) | bg sky (Congés) ou violet (Maladie), avec heures |
| **Travaillé** | `saisiesPerDate[date].total > 0`                             | bg vert clair, "Xh travaillées"                  |
| **Vide**      | aucune des 3 ci-dessus                                       | dashed border, "--"                              |

Clic sur card "Absence" :

- Popover affiche : "Congés du 15 au 19 avril (35h)" + boutons **Modifier** et **Supprimer**
- Modifier → rouvre `AbsenceFormDialog` en mode édition (id pré-rempli, données pré-remplies)
- Supprimer → confirm dialog → server action `deleteAbsenceAction(id)`

Clic sur card "Travaillé" / "Férié" / "Vide" : aucune action (lecture seule).

### Helper `computeAbsenceHoursPerDay`

Localisation : `lib/utils/absences.ts`.

```typescript
export function computeAbsenceHoursPerDay(
  absences: Array<{
    date_debut: string;
    date_fin: string;
    demi_jour_debut: boolean;
    demi_jour_fin: boolean;
    type: 'conges' | 'maladie';
  }>,
  dates: string[],
): Record<string, { type: 'conges' | 'maladie'; hours: number }> {
  // Pour chaque date :
  // - Trouve l'absence qui couvre cette date (au plus une, pas de chevauchement par contrainte)
  // - Si date == date_debut et demi_jour_debut → 3.5h
  // - Si date == date_fin et demi_jour_fin → 3.5h
  // - Sinon → 7h
}
```

Utilisé par :

- Le banner : pour décorer les cards "Absence"
- Le time-grid : pour calculer le quota journalier (`MAX_HEURES_JOUR - absenceOnDay`)
- Les queries de totaux mensuels / annuels (dashboard, indicateurs) si nécessaire

## Flux de données

### Création d'une absence

```
User clique "+ Absence"
  → AbsenceFormDialog s'ouvre
  → Remplit formulaire, submit
    → createAbsenceAction({ type, date_debut, date_fin, demi_jour_debut, demi_jour_fin })
      → Vérifie auth, RLS handle ownership
      → Vérifie chevauchement (SELECT WHERE user_id = me AND tsrange overlap)
      → INSERT INTO absences
      → revalidatePath('/temps')
    ← { success: true }
  ← Toast "Absence enregistrée"
  ← Dialog ferme
```

### Affichage du banner

```
Page /temps server component fetch :
  - getSaisiesForWeek(weekDates) → saisies de projet (sans est_absence, qui n'existe plus)
  - getAbsencesForUserAndPeriod(weekDates[0], weekDates[4]) → absences chevauchant la semaine
  - getJoursFeries(year)

  passe au TempsPageClient :
    - absencesPerDate = computeAbsenceHoursPerDay(absences, weekDates)
    - banner reçoit absencesPerDate, joursFeries, dailyTotalHours
```

## Server actions

Localisation : `lib/actions/absences.ts` (NOUVEAU)

```typescript
type AbsenceData = {
  type: 'conges' | 'maladie';
  date_debut: string;
  date_fin: string;
  demi_jour_debut?: boolean;
  demi_jour_fin?: boolean;
};

createAbsenceAction(data: AbsenceData): Promise<{ success: boolean; id?: string; error?: string }>
updateAbsenceAction(id: string, data: AbsenceData): Promise<{ success: boolean; error?: string }>
deleteAbsenceAction(id: string): Promise<{ success: boolean; error?: string }>
```

Toutes les actions :

- Vérifient l'auth via `auth.getUser()`
- L'INSERT/UPDATE force `user_id = auth.uid()` (RLS bloquerait sinon, mais double protection)
- Validation chevauchement faite avant l'INSERT/UPDATE :
  ```sql
  SELECT 1 FROM absences
   WHERE user_id = $1
     AND id <> COALESCE($2, '00000000-0000-0000-0000-000000000000'::uuid)
     AND daterange(date_debut, date_fin, '[]') && daterange($3, $4, '[]')
  ```
- `revalidatePath('/temps')` en succès

## Tests manuels (acceptance)

1. Créer une absence Congés du lundi au vendredi → 5 jours × 7h = 35h, tous visibles en bleu sur le banner
2. Créer Congés du vendredi PM au lundi AM (avec demi-journées) → ven 3.5h + lun 3.5h, weekend ignoré
3. Modifier l'absence pour décaler d'un jour → banner se met à jour
4. Supprimer l'absence → banner repasse en "Travaillé" ou "Vide" selon les saisies
5. Tenter de créer une absence qui chevauche → toast d'erreur explicite
6. Vérifier que la migration a bien converti les anciens saisies_temps absences en rows `absences` (compter avant/après)
7. Vérifier que les anciens projets système CON/MAL/FER sont supprimés
8. Vérifier que le quota journalier dans la grille temps est bien réduit pour les jours d'absence (ex: lundi 3.5h d'absence → max 3.5h projet)

## Risques / points d'attention

- **Migration des données** : si des saisies_temps sont mal formées (heures NaN, projet inexistant), il faut les ignorer / logger plutôt que casser. Tester sur une copie de la prod avant de pousser.
- **Drop des projets système** : si une autre query (rare) référence `9999-CON-ABS` directement, elle plantera. Recherche `grep -r "9999-CON\|9998-MAL\|9997-FER"` à faire avant le drop.
- **Cache server components** : `/temps` a `revalidate = 120`. La création d'absence appelle `revalidatePath` mais l'invalidation peut être lente perçue. À vérifier en local.
- **Constante `ABSENCE_PROJECTS`** dans `lib/utils/constants.ts` : à supprimer après migration.

## Hors scope (futurs chantiers possibles)

- Vue admin équipe : page `/admin/absences` qui liste qui est absent quand sur un calendrier
- Solde de congés annuel par utilisateur (ajouter table `soldes_conges` avec quota et report)
- Notifications Slack/email quand un membre d'équipe pose des congés sur ta période
- Export iCal des absences pour intégrer un calendrier externe
- Type "RTT" en plus de Congés/Maladie
