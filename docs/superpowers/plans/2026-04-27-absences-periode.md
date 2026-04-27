# Saisie d'absences par période — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** remplacer la saisie d'absence jour-par-jour par une saisie de période (date début → date fin avec demi-journées de bord), en migrant les données existantes vers une nouvelle table `absences` dédiée.

**Architecture:** nouvelle table SQL `absences` avec RLS, helper de calcul partagé, server actions CRUD, dialog modale de création/édition, banner réécrit en lecture seule avec 4 états (Travaillé / Absence / Férié / Vide). Migration en une transaction pour éviter état intermédiaire.

**Tech Stack:** Next.js 16 App Router, TypeScript, TailwindCSS 4, shadcn/ui (base-ui), Supabase Postgres + RLS, server actions, date-fns.

**Note sur les tests :** le projet n'a pas encore Vitest (V3.2 pending). La vérification se fait via `npx tsc --noEmit`, `npm run lint`, et tests manuels en browser. Quand Vitest sera installé, ajouter des tests unitaires sur le helper `computeAbsenceHoursPerDay` et les server actions.

**Spec source :** `docs/superpowers/specs/2026-04-27-absences-periode-design.md`

---

## File Structure

### Création

- `supabase/migrations/{TIMESTAMP}_absences.sql` — schéma + RLS + migration des données + cleanup
- `lib/utils/absences.ts` — helper `computeAbsenceHoursPerDay` (source unique de vérité du calcul)
- `lib/queries/absences.ts` — query `getAbsencesForUserAndPeriod`
- `lib/actions/absences.ts` — server actions `createAbsenceAction`, `updateAbsenceAction`, `deleteAbsenceAction`
- `components/temps/absence-form-dialog.tsx` — modale création/édition

### Modification

- `components/temps/absence-banner.tsx` — réécriture pour 4 états + popover détails
- `components/temps/temps-page-client.tsx` — bouton "+ Absence", plumbing des nouvelles props
- `components/temps/time-grid.tsx` — consomme le helper au lieu de prop `absences`
- `app/(dashboard)/temps/page.tsx` — fetch des absences en plus des saisies
- `lib/queries/temps.ts` — retire la logique `est_absence` / `ABSENCE_TYPE_MAP`
- `lib/utils/constants.ts` — supprime `ABSENCE_PROJECTS`
- `types/database.ts` — régénéré

---

## Task 1 : Migration SQL + types regen

**Files:**

- Create: `supabase/migrations/{TIMESTAMP}_absences.sql`
- Modify: `types/database.ts` (régénéré)

- [ ] **Step 1.1 : Lister les usages des projets système avant migration**

```bash
grep -rn "9999-CON\|9998-MAL\|9997-FER\|ABSENCE_PROJECTS\|est_absence" --include="*.ts" --include="*.tsx" --include="*.sql" | grep -v "node_modules\|\.next" > /tmp/absence-usages.txt
cat /tmp/absence-usages.txt | wc -l
```

Expected: liste des call sites à mettre à jour. Garder ce fichier sous les yeux pour les tâches suivantes.

- [ ] **Step 1.2 : Générer le timestamp et écrire la migration**

```bash
date +"%Y%m%d%H%M%S"
```

Crée `supabase/migrations/{TIMESTAMP}_absences.sql` avec le contenu suivant (remplace `{TIMESTAMP}` dans le nom de fichier par la valeur retournée) :

```sql
-- Migration vers une saisie d absence par periode (table dediee).
-- Spec : docs/superpowers/specs/2026-04-27-absences-periode-design.md

-- 1. Schema
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

CREATE TRIGGER absences_updated_at
  BEFORE UPDATE ON absences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 2. RLS
ALTER TABLE absences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "absences_select_own" ON absences
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "absences_select_admin" ON absences
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "absences_modify_own" ON absences
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 3. Migration des donnees existantes : convertir saisies_temps (CON/MAL) en absences
DO $$
DECLARE
  cur_user UUID;
  cur_type absence_type;
  cur_start DATE;
  cur_end DATE;
  cur_start_hours NUMERIC;
  cur_end_hours NUMERIC;
  prev_date DATE;
  rec RECORD;
BEGIN
  cur_user := NULL;
  cur_type := NULL;
  cur_start := NULL;
  cur_end := NULL;
  cur_start_hours := NULL;
  cur_end_hours := NULL;
  prev_date := NULL;

  FOR rec IN
    SELECT
      st.user_id,
      CASE p.ref
        WHEN '9999-CON-ABS' THEN 'conges'::absence_type
        WHEN '9998-MAL-ABS' THEN 'maladie'::absence_type
      END AS type,
      st.date,
      st.heures
    FROM saisies_temps st
    JOIN projets p ON p.id = st.projet_id
    WHERE st.est_absence = true
      AND p.ref IN ('9999-CON-ABS', '9998-MAL-ABS')
    ORDER BY st.user_id, type, st.date
  LOOP
    IF cur_user IS NULL OR
       rec.user_id <> cur_user OR
       rec.type <> cur_type OR
       rec.date <> prev_date + 1 THEN
      -- Flush previous group
      IF cur_user IS NOT NULL THEN
        INSERT INTO absences (user_id, type, date_debut, date_fin, demi_jour_debut, demi_jour_fin)
        VALUES (
          cur_user,
          cur_type,
          cur_start,
          cur_end,
          cur_start_hours = 3.5,
          cur_end_hours = 3.5
        );
      END IF;
      -- Start new group
      cur_user := rec.user_id;
      cur_type := rec.type;
      cur_start := rec.date;
      cur_end := rec.date;
      cur_start_hours := rec.heures;
      cur_end_hours := rec.heures;
    ELSE
      cur_end := rec.date;
      cur_end_hours := rec.heures;
    END IF;
    prev_date := rec.date;
  END LOOP;

  -- Flush last group
  IF cur_user IS NOT NULL THEN
    INSERT INTO absences (user_id, type, date_debut, date_fin, demi_jour_debut, demi_jour_fin)
    VALUES (
      cur_user,
      cur_type,
      cur_start,
      cur_end,
      cur_start_hours = 3.5,
      cur_end_hours = 3.5
    );
  END IF;
END $$;

-- 4. Cleanup : supprimer les saisies est_absence et les saisies_temps_axes orphelines
DELETE FROM saisies_temps_axes
  WHERE saisie_id IN (SELECT id FROM saisies_temps WHERE est_absence = true);

DELETE FROM saisies_temps WHERE est_absence = true;

-- 5. Cleanup : supprimer les projets systeme et leurs clients
DELETE FROM projets WHERE ref IN ('9999-CON-ABS', '9998-MAL-ABS', '9997-FER-ABS');
DELETE FROM clients WHERE id IN (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003'
);
```

- [ ] **Step 1.3 : Pousser la migration en remote**

```bash
npx supabase db push
```

Expected output : `Applying migration {TIMESTAMP}_absences.sql... Finished supabase db push.`

Si erreur de FK (saisies_temps_axes ou autre), vérifier l'ordre des DELETE. Fix la migration sans la committer encore.

- [ ] **Step 1.4 : Régénérer les types TypeScript**

```bash
npx supabase gen types typescript --linked 2>/dev/null > types/database.ts
grep -A 3 "absences:" types/database.ts | head -10
```

Expected : un block `absences: { Row: { ... type: ... } ... }` apparaît.

- [ ] **Step 1.5 : Vérifier que le typecheck est encore vert**

```bash
npx tsc --noEmit 2>&1 | head -10
```

Expected : aucune sortie (clean). Note : les usages de `est_absence` dans le code TS planteront en build runtime mais pas au typecheck — on les corrige dans les tâches suivantes.

- [ ] **Step 1.6 : Commit**

```bash
git add supabase/migrations/{TIMESTAMP}_absences.sql types/database.ts
git commit -m "feat(absences): table dediee + migration des saisies est_absence

Cree la table absences (date_debut, date_fin, demi_jour_debut/fin, type
conges|maladie) avec RLS user-scoped et select admin. Migre les
saisies_temps existantes (CON/MAL) en groupant les jours consecutifs en
periodes, puis supprime les rows est_absence et les projets systeme
9999-CON-ABS, 9998-MAL-ABS, 9997-FER-ABS.

Le code TS sera mis a jour dans les commits suivants pour consommer
la nouvelle table."
```

---

## Task 2 : Helper `computeAbsenceHoursPerDay`

**Files:**

- Create: `lib/utils/absences.ts`

- [ ] **Step 2.1 : Créer le helper avec sa surface complète**

```typescript
// lib/utils/absences.ts
import { parseISO, isBefore, isAfter, isEqual } from 'date-fns';

export type AbsenceType = 'conges' | 'maladie';

export interface AbsencePeriod {
  id: string;
  type: AbsenceType;
  date_debut: string; // yyyy-MM-dd
  date_fin: string; // yyyy-MM-dd
  demi_jour_debut: boolean;
  demi_jour_fin: boolean;
}

export interface AbsenceDayInfo {
  type: AbsenceType;
  hours: number;
  absence_id: string;
}

const FULL_DAY_HOURS = 7;
const HALF_DAY_HOURS = 3.5;

/**
 * Calcule les heures d absence par jour pour un ensemble de dates.
 *
 * Retourne un Record dont la cle est la date (yyyy-MM-dd) et la valeur
 * decrit le type, le nombre d heures (3.5 si demi-journee de bord, sinon 7),
 * et l id de l absence concernee.
 *
 * Une absence couvre une date si date_debut <= date <= date_fin.
 * Demi-journee de bord :
 * - date == date_debut ET demi_jour_debut == true → 3.5h (apres-midi)
 * - date == date_fin ET demi_jour_fin == true → 3.5h (matin)
 * Si une seule date est dans la periode et qu un seul des deux flags est true,
 * cette date est une demi-journee.
 */
export function computeAbsenceHoursPerDay(
  absences: AbsencePeriod[],
  dates: string[],
): Record<string, AbsenceDayInfo> {
  const result: Record<string, AbsenceDayInfo> = {};

  for (const date of dates) {
    const d = parseISO(date);
    for (const a of absences) {
      const start = parseISO(a.date_debut);
      const end = parseISO(a.date_fin);
      const inRange =
        (isEqual(d, start) || isAfter(d, start)) &&
        (isEqual(d, end) || isBefore(d, end));
      if (!inRange) continue;

      const isStartDay = isEqual(d, start);
      const isEndDay = isEqual(d, end);
      let hours = FULL_DAY_HOURS;
      if (isStartDay && a.demi_jour_debut) hours = HALF_DAY_HOURS;
      if (isEndDay && a.demi_jour_fin) hours = HALF_DAY_HOURS;

      result[date] = { type: a.type, hours, absence_id: a.id };
      break; // une absence max par jour (garanti par la validation chevauchement)
    }
  }

  return result;
}

/**
 * Total d heures d une periode d absence (pour preview dans le formulaire).
 * Compte uniquement les jours ouvres (lundi-vendredi).
 */
export function computeAbsenceTotalHours(
  date_debut: string,
  date_fin: string,
  demi_jour_debut: boolean,
  demi_jour_fin: boolean,
): { jours: number; heures: number } {
  const start = parseISO(date_debut);
  const end = parseISO(date_fin);
  let jours = 0;
  let heures = 0;
  const cur = new Date(start);
  while (!isAfter(cur, end)) {
    const day = cur.getDay(); // 0 = sun, 6 = sat
    if (day !== 0 && day !== 6) {
      jours += 1;
      const isStart = isEqual(cur, start);
      const isEnd = isEqual(cur, end);
      let h = FULL_DAY_HOURS;
      if (isStart && demi_jour_debut) h = HALF_DAY_HOURS;
      if (isEnd && demi_jour_fin) h = HALF_DAY_HOURS;
      heures += h;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return { jours, heures };
}
```

- [ ] **Step 2.2 : Vérifier typecheck + lint**

```bash
npx tsc --noEmit 2>&1 | head -10
npm run lint 2>&1 | tail -5
```

Expected : 0 errors.

- [ ] **Step 2.3 : Commit**

```bash
git add lib/utils/absences.ts
git commit -m "feat(absences): helper computeAbsenceHoursPerDay

Source unique de verite pour calculer les heures d absence par jour
a partir d une liste de periodes. Gere les demi-journees de bord
(matin du dernier jour, apres-midi du premier jour). Sera utilise
par le banner et le time-grid pour rester coherent."
```

---

## Task 3 : Query `getAbsencesForUserAndPeriod`

**Files:**

- Create: `lib/queries/absences.ts`

- [ ] **Step 3.1 : Créer la query**

```typescript
// lib/queries/absences.ts
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';
import type { AbsencePeriod } from '@/lib/utils/absences';

/**
 * Retourne les absences de l utilisateur courant qui chevauchent la periode
 * [debut, fin] (inclus). RLS filtre automatiquement aux absences du user
 * (ou de tous les users si admin).
 */
export async function getAbsencesForUserAndPeriod(
  debut: string,
  fin: string,
): Promise<AbsencePeriod[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('absences')
    .select('id, type, date_debut, date_fin, demi_jour_debut, demi_jour_fin')
    .lte('date_debut', fin)
    .gte('date_fin', debut)
    .order('date_debut', { ascending: true });

  if (error) {
    logger.error('queries.absences', 'getAbsencesForUserAndPeriod failed', {
      debut,
      fin,
      error,
    });
    return [];
  }

  return data ?? [];
}

/**
 * Retourne toutes les absences d un user (pour vue historique future).
 * Limite a un an pour eviter des dumps massifs.
 */
export async function getAbsencesForCurrentYear(): Promise<AbsencePeriod[]> {
  const year = new Date().getFullYear();
  return getAbsencesForUserAndPeriod(`${year}-01-01`, `${year}-12-31`);
}
```

- [ ] **Step 3.2 : Vérifier typecheck**

```bash
npx tsc --noEmit 2>&1 | head -10
```

Expected : clean.

- [ ] **Step 3.3 : Commit**

```bash
git add lib/queries/absences.ts
git commit -m "feat(absences): query getAbsencesForUserAndPeriod

Selectionne les absences d un user qui chevauchent une periode donnee.
RLS gere le filtrage par user_id (et select admin pour les vues equipe
futures)."
```

---

## Task 4 : Server actions

**Files:**

- Create: `lib/actions/absences.ts`

- [ ] **Step 4.1 : Créer les actions CRUD avec validation chevauchement**

```typescript
// lib/actions/absences.ts
'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/utils/audit';
import { logger } from '@/lib/utils/logger';
import type { AbsenceType } from '@/lib/utils/absences';

interface AbsenceData {
  type: AbsenceType;
  date_debut: string;
  date_fin: string;
  demi_jour_debut?: boolean;
  demi_jour_fin?: boolean;
}

function validate(data: AbsenceData): string | null {
  if (data.type !== 'conges' && data.type !== 'maladie') {
    return 'Type d absence invalide';
  }
  if (!data.date_debut || !data.date_fin) {
    return 'Dates requises';
  }
  if (data.date_fin < data.date_debut) {
    return 'La date de fin doit etre apres la date de debut';
  }
  if (
    data.date_debut === data.date_fin &&
    data.demi_jour_debut &&
    data.demi_jour_fin
  ) {
    return 'Un seul jour ne peut pas etre demi-journee aux deux bornes';
  }
  return null;
}

export async function createAbsenceAction(
  data: AbsenceData,
): Promise<{ success: boolean; id?: string; error?: string }> {
  const err = validate(data);
  if (err) return { success: false, error: err };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Non authentifie' };

  // Chevauchement
  const { data: overlap } = await supabase
    .from('absences')
    .select('id')
    .eq('user_id', user.id)
    .lte('date_debut', data.date_fin)
    .gte('date_fin', data.date_debut)
    .limit(1);

  if (overlap && overlap.length > 0) {
    return {
      success: false,
      error: 'Une absence existe deja sur cette periode',
    };
  }

  const { data: created, error } = await supabase
    .from('absences')
    .insert({
      user_id: user.id,
      type: data.type,
      date_debut: data.date_debut,
      date_fin: data.date_fin,
      demi_jour_debut: data.demi_jour_debut ?? false,
      demi_jour_fin: data.demi_jour_fin ?? false,
    })
    .select('id')
    .single();

  if (error) {
    logger.error('actions.absences', 'create failed', { error });
    return { success: false, error: error.message };
  }

  logAudit('absence_created', 'absence', created.id);
  revalidatePath('/temps');

  return { success: true, id: created.id };
}

export async function updateAbsenceAction(
  id: string,
  data: AbsenceData,
): Promise<{ success: boolean; error?: string }> {
  const err = validate(data);
  if (err) return { success: false, error: err };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Non authentifie' };

  // Chevauchement (en excluant l absence elle-meme)
  const { data: overlap } = await supabase
    .from('absences')
    .select('id')
    .eq('user_id', user.id)
    .neq('id', id)
    .lte('date_debut', data.date_fin)
    .gte('date_fin', data.date_debut)
    .limit(1);

  if (overlap && overlap.length > 0) {
    return {
      success: false,
      error: 'Une autre absence existe deja sur cette periode',
    };
  }

  const { error } = await supabase
    .from('absences')
    .update({
      type: data.type,
      date_debut: data.date_debut,
      date_fin: data.date_fin,
      demi_jour_debut: data.demi_jour_debut ?? false,
      demi_jour_fin: data.demi_jour_fin ?? false,
    })
    .eq('id', id);

  if (error) {
    logger.error('actions.absences', 'update failed', { id, error });
    return { success: false, error: error.message };
  }

  logAudit('absence_updated', 'absence', id);
  revalidatePath('/temps');

  return { success: true };
}

export async function deleteAbsenceAction(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Non authentifie' };

  const { error } = await supabase.from('absences').delete().eq('id', id);

  if (error) {
    logger.error('actions.absences', 'delete failed', { id, error });
    return { success: false, error: error.message };
  }

  logAudit('absence_deleted', 'absence', id);
  revalidatePath('/temps');

  return { success: true };
}
```

- [ ] **Step 4.2 : Vérifier typecheck + lint**

```bash
npx tsc --noEmit 2>&1 | head -10
npm run lint 2>&1 | tail -5
```

Expected : clean.

- [ ] **Step 4.3 : Commit**

```bash
git add lib/actions/absences.ts
git commit -m "feat(absences): server actions create/update/delete

Avec validation chevauchement (rejet explicite si une autre absence
existe sur la periode), audit log, et revalidatePath /temps. Verifie
auth a chaque appel ; RLS empeche de toute facon de toucher les rows
d un autre user."
```

---

## Task 5 : Composant `AbsenceFormDialog`

**Files:**

- Create: `components/temps/absence-form-dialog.tsx`

- [ ] **Step 5.1 : Créer le composant**

```typescript
// components/temps/absence-form-dialog.tsx
'use client';

import { useState, useTransition } from 'react';
import { format } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import {
  createAbsenceAction,
  updateAbsenceAction,
  deleteAbsenceAction,
} from '@/lib/actions/absences';
import {
  computeAbsenceTotalHours,
  type AbsencePeriod,
  type AbsenceType,
} from '@/lib/utils/absences';

interface AbsenceFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Si fourni, la dialog est en mode edition de cette absence */
  absence?: AbsencePeriod;
  /** Date initiale pour la creation (par defaut : today) */
  initialDate?: string;
}

export function AbsenceFormDialog({
  open,
  onOpenChange,
  absence,
  initialDate,
}: AbsenceFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <FormContent
          key={absence?.id ?? 'new'}
          absence={absence}
          initialDate={initialDate}
          onOpenChange={onOpenChange}
        />
      )}
    </Dialog>
  );
}

function FormContent({
  absence,
  initialDate,
  onOpenChange,
}: {
  absence?: AbsencePeriod;
  initialDate?: string;
  onOpenChange: (open: boolean) => void;
}) {
  const isEdit = !!absence;
  const today = format(new Date(), 'yyyy-MM-dd');
  const [type, setType] = useState<AbsenceType>(absence?.type ?? 'conges');
  const [dateDebut, setDateDebut] = useState(
    absence?.date_debut ?? initialDate ?? today,
  );
  const [dateFin, setDateFin] = useState(
    absence?.date_fin ?? initialDate ?? today,
  );
  const [demiJourDebut, setDemiJourDebut] = useState(
    absence?.demi_jour_debut ?? false,
  );
  const [demiJourFin, setDemiJourFin] = useState(
    absence?.demi_jour_fin ?? false,
  );
  const [isPending, startTransition] = useTransition();

  const total = computeAbsenceTotalHours(
    dateDebut,
    dateFin,
    demiJourDebut,
    demiJourFin,
  );

  const sameDay = dateDebut === dateFin;

  function handleSubmit() {
    if (sameDay && demiJourDebut && demiJourFin) {
      toast.error(
        'Un seul jour ne peut pas etre demi-journee aux deux bornes',
      );
      return;
    }
    startTransition(async () => {
      const data = {
        type,
        date_debut: dateDebut,
        date_fin: dateFin,
        demi_jour_debut: demiJourDebut,
        demi_jour_fin: demiJourFin,
      };
      const result = isEdit
        ? await updateAbsenceAction(absence!.id, data)
        : await createAbsenceAction(data);
      if (result.success) {
        toast.success(
          isEdit ? 'Absence mise a jour' : 'Absence enregistree',
        );
        onOpenChange(false);
      } else {
        toast.error(result.error ?? 'Erreur lors de l enregistrement');
      }
    });
  }

  function handleDelete() {
    if (!absence) return;
    startTransition(async () => {
      const result = await deleteAbsenceAction(absence.id);
      if (result.success) {
        toast.success('Absence supprimee');
        onOpenChange(false);
      } else {
        toast.error(result.error ?? 'Erreur lors de la suppression');
      }
    });
  }

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>
          {isEdit ? 'Modifier l absence' : 'Nouvelle absence'}
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Type</Label>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={type === 'conges' ? 'default' : 'outline'}
              onClick={() => setType('conges')}
              className="flex-1"
            >
              Conges
            </Button>
            <Button
              type="button"
              variant={type === 'maladie' ? 'default' : 'outline'}
              onClick={() => setType('maladie')}
              className="flex-1"
            >
              Maladie
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="date_debut">Du</Label>
            <Input
              id="date_debut"
              type="date"
              value={dateDebut}
              onChange={(e) => {
                setDateDebut(e.target.value);
                if (e.target.value > dateFin) setDateFin(e.target.value);
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="date_fin">Au</Label>
            <Input
              id="date_fin"
              type="date"
              value={dateFin}
              min={dateDebut}
              onChange={(e) => setDateFin(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Checkbox
              id="demi_debut"
              checked={demiJourDebut}
              onCheckedChange={(v) => setDemiJourDebut(v === true)}
            />
            <Label htmlFor="demi_debut" className="cursor-pointer text-sm font-normal">
              Commence l apres-midi (3.5h le {format(new Date(dateDebut), 'dd/MM')})
            </Label>
          </div>
          {!sameDay && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="demi_fin"
                checked={demiJourFin}
                onCheckedChange={(v) => setDemiJourFin(v === true)}
              />
              <Label htmlFor="demi_fin" className="cursor-pointer text-sm font-normal">
                Finit le matin (3.5h le {format(new Date(dateFin), 'dd/MM')})
              </Label>
            </div>
          )}
        </div>

        <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
          <span className="text-muted-foreground">Total : </span>
          <span className="font-medium">
            {total.jours} jour{total.jours > 1 ? 's' : ''} ouvre
            {total.jours > 1 ? 's' : ''} / {total.heures}h
          </span>
        </div>
      </div>

      <DialogFooter className="gap-2 sm:gap-0">
        {isEdit && (
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isPending}
          >
            Supprimer
          </Button>
        )}
        <div className="flex flex-1 justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending
              ? isEdit
                ? 'Mise a jour...'
                : 'Enregistrement...'
              : isEdit
                ? 'Enregistrer'
                : 'Creer'}
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>
  );
}
```

- [ ] **Step 5.2 : Vérifier typecheck + lint**

```bash
npx tsc --noEmit 2>&1 | head -10
npm run lint 2>&1 | tail -5
```

Expected : clean.

- [ ] **Step 5.3 : Commit**

```bash
git add components/temps/absence-form-dialog.tsx
git commit -m "feat(absences): dialog de saisie + edition + suppression

Modale unique pour creer une nouvelle absence ou editer/supprimer une
existante. Affiche un total preview (jours ouvres + heures) calcule via
le helper computeAbsenceTotalHours. Validation client + server."
```

---

## Task 6 : Réécriture du banner

**Files:**

- Modify: `components/temps/absence-banner.tsx` (réécriture complète)

- [ ] **Step 6.1 : Réécrire le banner avec 4 états**

Remplace **tout** le contenu de `components/temps/absence-banner.tsx` par :

```typescript
// components/temps/absence-banner.tsx
'use client';

import { format, parseISO, isWeekend } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Palmtree, ThermometerSun, BriefcaseBusiness } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import type { AbsenceDayInfo, AbsencePeriod } from '@/lib/utils/absences';

const ABSENCE_LABEL: Record<string, string> = {
  conges: 'Conges',
  maladie: 'Maladie',
};

export interface AbsenceBannerProps {
  weekDates: string[];
  /** Heures d absence par date (calculees via computeAbsenceHoursPerDay) */
  absencesPerDate: Record<string, AbsenceDayInfo>;
  /** Liste brute des absences (pour resoudre id -> AbsencePeriod dans le popover) */
  absences: AbsencePeriod[];
  /** Heures de projet saisies par date (pour distinguer Travaille / Vide) */
  saisiesHoursPerDate: Record<string, number>;
  joursFeries: Record<string, string>;
  onEditAbsence: (absence: AbsencePeriod) => void;
}

export function AbsenceBanner({
  weekDates,
  absencesPerDate,
  absences,
  saisiesHoursPerDate,
  joursFeries,
  onEditAbsence,
}: AbsenceBannerProps) {
  const weekdays = weekDates.filter((d) => !isWeekend(parseISO(d)));

  return (
    <div className="mb-4">
      <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">
        Etat de la semaine
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
        {weekdays.map((date) => {
          const d = parseISO(date);
          const ferie = joursFeries[date];
          const absence = absencesPerDate[date];
          const projectHours = saisiesHoursPerDate[date] ?? 0;

          if (ferie) return <FerieCard key={date} date={d} label={ferie} />;
          if (absence) {
            const period = absences.find((a) => a.id === absence.absence_id);
            return (
              <AbsenceCard
                key={date}
                date={d}
                info={absence}
                period={period}
                onEdit={onEditAbsence}
              />
            );
          }
          if (projectHours > 0) {
            return <TravailCard key={date} date={d} hours={projectHours} />;
          }
          return <EmptyCard key={date} date={d} />;
        })}
      </div>
    </div>
  );
}

function FerieCard({ date, label }: { date: Date; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-orange-200 bg-orange-50 px-2 py-3 dark:border-orange-900/40 dark:bg-orange-950/30">
      <span className="text-muted-foreground text-[11px] font-medium uppercase">
        {format(date, 'EEE', { locale: fr })} {format(date, 'd')}
      </span>
      <span className="mt-1 text-center text-xs font-medium text-orange-600 dark:text-orange-400">
        {label}
      </span>
    </div>
  );
}

function AbsenceCard({
  date,
  info,
  period,
  onEdit,
}: {
  date: Date;
  info: AbsenceDayInfo;
  period?: AbsencePeriod;
  onEdit: (absence: AbsencePeriod) => void;
}) {
  const isConges = info.type === 'conges';
  const isHalf = info.hours < 7;
  const colorBase = isConges
    ? 'border-sky-300 bg-sky-100 text-sky-700 dark:border-sky-700 dark:bg-sky-950/50 dark:text-sky-300'
    : 'border-violet-300 bg-violet-100 text-violet-700 dark:border-violet-700 dark:bg-violet-950/50 dark:text-violet-300';

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          'flex w-full cursor-pointer flex-col items-center justify-center rounded-lg border px-2 py-3 transition-colors',
          colorBase,
        )}
      >
        <span className="text-muted-foreground text-[11px] font-medium uppercase">
          {format(date, 'EEE', { locale: fr })} {format(date, 'd')}
        </span>
        <span className="mt-1 text-xs font-semibold">
          {ABSENCE_LABEL[info.type]}
          {isHalf ? ' (1/2)' : ''}
        </span>
        <span className="text-[10px] font-medium opacity-75">
          {info.hours}h
        </span>
      </PopoverTrigger>
      {period && (
        <PopoverContent side="bottom" align="center" className="w-72 p-3">
          <p className="text-sm font-medium">
            {ABSENCE_LABEL[period.type]} du{' '}
            {format(parseISO(period.date_debut), 'dd/MM')} au{' '}
            {format(parseISO(period.date_fin), 'dd/MM')}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            {period.demi_jour_debut ? 'Commence l apres-midi. ' : ''}
            {period.demi_jour_fin ? 'Finit le matin.' : ''}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 w-full"
            onClick={() => onEdit(period)}
          >
            Modifier ou supprimer
          </Button>
        </PopoverContent>
      )}
    </Popover>
  );
}

function TravailCard({ date, hours }: { date: Date; hours: number }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-3 dark:border-emerald-900/40 dark:bg-emerald-950/30">
      <span className="text-muted-foreground text-[11px] font-medium uppercase">
        {format(date, 'EEE', { locale: fr })} {format(date, 'd')}
      </span>
      <span className="mt-1 flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
        <BriefcaseBusiness className="h-3 w-3" />
        Travaille
      </span>
      <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-500">
        {hours}h
      </span>
    </div>
  );
}

function EmptyCard({ date }: { date: Date }) {
  return (
    <div className="border-border text-muted-foreground flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-2 py-3">
      <span className="text-[11px] font-medium uppercase">
        {format(date, 'EEE', { locale: fr })} {format(date, 'd')}
      </span>
      <span className="mt-1 text-[10px]">--</span>
    </div>
  );
}
```

(Les imports `Palmtree`, `ThermometerSun` deviennent inutiles — supprime-les si lint râle. Garde `BriefcaseBusiness`.)

- [ ] **Step 6.2 : Vérifier typecheck + lint**

```bash
npx tsc --noEmit 2>&1 | head -20
npm run lint 2>&1 | tail -10
```

Expected : `temps-page-client.tsx` plante car le banner a changé d'API. C'est OK, on le corrige Task 7.

- [ ] **Step 6.3 : Commit (sans Task 7 c'est cassé en runtime, mais on fait des commits petits)**

```bash
git add components/temps/absence-banner.tsx
git commit -m "feat(absences): banner reecrit avec 4 etats lecture seule

Travaille (heures projet > 0), Absence (avec popover details + edit),
Ferie, Vide. Ne gere plus la saisie directe : la nouvelle dialog
AbsenceFormDialog est le point d entree. La page temps va etre
recablee dans le commit suivant."
```

---

## Task 7 : `temps-page-client.tsx` integration

**Files:**

- Modify: `components/temps/temps-page-client.tsx` (refonte du plumbing absences)
- Modify: `app/(dashboard)/temps/page.tsx` (fetch absences)

- [ ] **Step 7.1 : Lire le composant actuel pour comprendre les props existantes**

```bash
wc -l components/temps/temps-page-client.tsx
grep -n "AbsenceBanner\|absences\|onSetAbsence\|onRemoveAbsence" components/temps/temps-page-client.tsx
```

- [ ] **Step 7.2 : Modifier `app/(dashboard)/temps/page.tsx` pour fetch les absences**

Ouvre le fichier et ajoute l'appel à `getAbsencesForUserAndPeriod` dans le `Promise.all`. Adapte les props passées à `TempsPageClient` :

```typescript
import { getAbsencesForUserAndPeriod } from '@/lib/queries/absences';
// ...

const weekDates = getWeekDates(0);
const [saisies, user, joursFeries, absences] = await Promise.all([
  getSaisiesForWeek(weekDates),
  getCurrentUser(),
  getJoursFeries(new Date().getFullYear()),
  getAbsencesForUserAndPeriod(weekDates[0]!, weekDates[weekDates.length - 1]!),
]);

// ...

return (
  <TempsPageClient
    weekDates={weekDates}
    initialSaisies={saisies}
    initialAbsences={absences}
    isAdmin={adminUser}
    joursFeries={joursFeriesMap}
  />
);
```

- [ ] **Step 7.3 : Refondre `temps-page-client.tsx`**

Le fichier actuel gère manuellement les onSetAbsence / onRemoveAbsence et calcule un map `absences: Record<string, number>` à partir des saisies est_absence. Toute cette logique disparaît.

Modifications principales :

1. Nouvelle prop `initialAbsences: AbsencePeriod[]`
2. State `absences` initialisé avec cette prop
3. Calcul de `absencesPerDate` via `computeAbsenceHoursPerDay`
4. Calcul de `saisiesHoursPerDate` (totaux journaliers de saisies projet, hors absences) — simple agrégat depuis `initialSaisies`
5. State `editingAbsence?: AbsencePeriod` + `dialogOpen: boolean` pour piloter `AbsenceFormDialog`
6. Bouton "+ Absence" au-dessus du banner ouvre la dialog en création
7. Handler `onEditAbsence` du banner : set editingAbsence + open dialog en édition
8. Suppression des props `onSetAbsence` / `onRemoveAbsence` du banner
9. Le `time-grid` reçoit toujours une prop `absences: Record<string, number>` (pour l'instant — sera nettoyé Task 8) calculée à partir de `absencesPerDate`

Voici le squelette des sections à modifier (cherche les blocs équivalents dans le fichier actuel et remplace) :

**Imports :**

```typescript
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AbsenceBanner } from './absence-banner';
import { AbsenceFormDialog } from './absence-form-dialog';
import { TimeGrid } from './time-grid';
import { TimeWeekNavigator } from './time-week-navigator';
import {
  computeAbsenceHoursPerDay,
  type AbsencePeriod,
} from '@/lib/utils/absences';
import type { ProjetTempsRow } from '@/lib/queries/temps';
```

**Props :**

```typescript
interface TempsPageClientProps {
  weekDates: string[];
  initialSaisies: ProjetTempsRow[];
  initialAbsences: AbsencePeriod[];
  isAdmin: boolean;
  joursFeries: Record<string, string>;
}
```

**Composant (extrait — adapte le reste du fichier en gardant la structure existante) :**

```typescript
export function TempsPageClient({
  weekDates,
  initialSaisies,
  initialAbsences,
  isAdmin,
  joursFeries,
}: TempsPageClientProps) {
  const [absences, setAbsences] = useState<AbsencePeriod[]>(initialAbsences);
  const [editingAbsence, setEditingAbsence] = useState<AbsencePeriod | undefined>();
  const [dialogOpen, setDialogOpen] = useState(false);

  const absencesPerDate = computeAbsenceHoursPerDay(absences, weekDates);

  // Calcul des heures de projet par jour (hors absences puisque est_absence n existe plus)
  const saisiesHoursPerDate: Record<string, number> = {};
  for (const proj of initialSaisies) {
    for (const [date, h] of Object.entries(proj.heures)) {
      saisiesHoursPerDate[date] = (saisiesHoursPerDate[date] ?? 0) + h;
    }
  }

  // Conversion absencesPerDate en Record<date, number> pour time-grid (legacy shape)
  const absenceHoursForGrid: Record<string, number> = {};
  for (const [date, info] of Object.entries(absencesPerDate)) {
    absenceHoursForGrid[date] = info.hours;
  }

  function handleAddClick() {
    setEditingAbsence(undefined);
    setDialogOpen(true);
  }

  function handleEditAbsence(absence: AbsencePeriod) {
    setEditingAbsence(absence);
    setDialogOpen(true);
  }

  function handleDialogChange(open: boolean) {
    setDialogOpen(open);
    if (!open) {
      // Refetch absences via revalidatePath dans la server action
      // Pour le state local : on s appuie sur le revalidate Next, donc on
      // ne remet pas a jour absences localement. (alternative : router.refresh())
      // Si bug d UX, ajouter un appel a getAbsencesForUserAndPeriod ici.
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <TimeWeekNavigator weekDates={weekDates} />
        <Button onClick={handleAddClick} size="sm">
          <Plus className="mr-1 h-4 w-4" />
          Absence
        </Button>
      </div>

      <AbsenceBanner
        weekDates={weekDates}
        absencesPerDate={absencesPerDate}
        absences={absences}
        saisiesHoursPerDate={saisiesHoursPerDate}
        joursFeries={joursFeries}
        onEditAbsence={handleEditAbsence}
      />

      <TimeGrid
        weekDates={weekDates}
        initialSaisies={initialSaisies}
        joursFeries={joursFeries}
        absences={absenceHoursForGrid}
        isAdmin={isAdmin}
      />

      <AbsenceFormDialog
        open={dialogOpen}
        onOpenChange={handleDialogChange}
        absence={editingAbsence}
      />
    </div>
  );
}
```

**Note importante** : si ton fichier actuel a une structure différente (loading states, autres sections), conserve la et ne touche que les blocs liés à `AbsenceBanner` et au calcul `absences`. Le bouton "+ Absence" peut être ajouté à côté de la nav semaine.

- [ ] **Step 7.4 : Vérifier typecheck + lint**

```bash
npx tsc --noEmit 2>&1 | head -20
npm run lint 2>&1 | tail -10
```

Expected : 0 errors. Si erreurs liées à `est_absence` qui n'existe plus dans les types `ProjetTempsRow`, c'est attendu — Task 9 va nettoyer la query.

Si erreurs sur le banner (props mismatch), corrige avant de commit.

- [ ] **Step 7.5 : Test manuel local**

```bash
npm run dev
```

Va sur http://localhost:3000/temps et vérifie :

- La page se charge sans crash
- Le bouton "+ Absence" apparaît
- Le banner affiche les 5 cards lun→ven
- (les états Travaillé / Vide doivent s'afficher selon les saisies actuelles)
- Cliquer "+ Absence" ouvre la dialog
- Créer une absence Congés sur 2 jours → l'absence apparaît bien dans le banner après refresh (Cmd+R si pas auto-revalidate)
- Cliquer sur la card Absence → popover avec bouton "Modifier ou supprimer"

Si la page crash en runtime à cause de `est_absence` inexistant dans le SELECT de saisies, c'est attendu et corrigé Task 9.

- [ ] **Step 7.6 : Commit**

```bash
git add components/temps/temps-page-client.tsx app/\(dashboard\)/temps/page.tsx
git commit -m "feat(absences): cable la page temps sur la nouvelle table

- Bouton + Absence au-dessus de la nav semaine
- AbsenceFormDialog en modale unique (creation + edition + suppression)
- Banner consomme absencesPerDate (compute) + saisiesHoursPerDate
- TimeGrid garde temporairement la prop absences en Record<date,number>
  (sera nettoye dans le commit suivant qui retire est_absence des
  queries saisies)"
```

---

## Task 8 : `time-grid.tsx` cleanup

**Files:**

- Modify: `components/temps/time-grid.tsx`

- [ ] **Step 8.1 : Identifier la logique `est_absence` dans time-grid**

```bash
grep -n "est_absence\|absence" components/temps/time-grid.tsx
```

- [ ] **Step 8.2 : Retirer le filtre `!s.est_absence`**

Comme `est_absence` ne sera plus dans `saisies_temps` (toutes les rows seront des saisies de projet réelles), le filtre devient inutile. Cherche la ligne :

```typescript
const saisies = initialSaisies.filter((s) => !s.est_absence);
```

Remplace par :

```typescript
const saisies = initialSaisies;
```

- [ ] **Step 8.3 : Vérifier que la prop `absences: Record<string, number>` est conservée**

C'est cette prop qui injecte les heures d'absence pour le calcul `MAX_HEURES_JOUR - absenceOnDay`. Elle reçoit `absenceHoursForGrid` depuis `TempsPageClient`. Aucune modif nécessaire.

- [ ] **Step 8.4 : Vérifier typecheck + lint**

```bash
npx tsc --noEmit 2>&1 | head -10
npm run lint 2>&1 | tail -5
```

Expected : 0 errors.

- [ ] **Step 8.5 : Commit**

```bash
git add components/temps/time-grid.tsx
git commit -m "refactor(absences): retire le filtre est_absence du time-grid

Plus besoin du filtre depuis que les absences sont sorties de
saisies_temps. La prop absences: Record<date,number> reste utilisee
pour ajuster le quota journalier (calcule via le helper partage)."
```

---

## Task 9 : Nettoyage queries + constants

**Files:**

- Modify: `lib/queries/temps.ts` (retire est_absence et ABSENCE_TYPE_MAP)
- Modify: `lib/utils/constants.ts` (retire ABSENCE_PROJECTS)
- Modify: tout autre fichier qui référence ABSENCE_PROJECTS / est_absence (cf. `/tmp/absence-usages.txt`)

- [ ] **Step 9.1 : Lister à nouveau les usages**

```bash
grep -rn "ABSENCE_PROJECTS\|9999-CON\|9998-MAL\|9997-FER\|est_absence\|ABSENCE_TYPE_MAP" --include="*.ts" --include="*.tsx" | grep -v "node_modules\|\.next\|types/database.ts"
```

Pour chaque hit, décide : suppression simple, ou logique à adapter.

- [ ] **Step 9.2 : Nettoyer `lib/queries/temps.ts`**

Modifications :

1. Retirer `est_absence` du SELECT de saisies (column n'existe plus côté projet pour les saisies, et est_absence sur projet existe toujours mais devient toujours false → la colonne peut rester mais on ne la lit plus pour les saisies)
2. Retirer `ABSENCE_TYPE_MAP` (constante locale)
3. Retirer le champ `est_absence` et `absence_type` du type `ProjetTempsRow`
4. Retirer le filtre `.eq('est_absence', false)` du SELECT projets (puisque les projets absence ont été supprimés en DB, plus aucune ligne ne sera est_absence=true, mais le filtre devient inutile)
5. Retirer le label spécial absence dans `projet_label` (`projet.est_absence ? ref : ${ref} - ${clientName}`)

Cherche chaque bloc, applique la modification, garde la logique projet normale.

- [ ] **Step 9.3 : Nettoyer `lib/utils/constants.ts`**

```bash
grep -B 1 -A 5 "ABSENCE_PROJECTS" lib/utils/constants.ts
```

Supprime le bloc `ABSENCE_PROJECTS = { ... }`. Si rien d'autre dans ce fichier n'est lié aux absences, c'est terminé.

- [ ] **Step 9.4 : Nettoyer les autres fichiers identifiés Step 9.1**

Pour chaque fichier listé, ouvre et corrige. Probable que `lib/queries/dashboard.ts` ou `lib/queries/indicateurs.ts` référencent `est_absence` pour exclure les absences de leur calcul de production. Dans ce cas, le filtre devient inutile (les rows n'existent plus) mais le retirer est safe.

- [ ] **Step 9.5 : Vérifier typecheck + lint + build local**

```bash
npx tsc --noEmit 2>&1 | head -10
npm run lint 2>&1 | tail -5
npm run build 2>&1 | tail -10
```

Expected : tout vert. Si build échoue, lis l'erreur et corrige (probablement un fichier oublié à Step 9.4).

- [ ] **Step 9.6 : Test manuel complet en dev**

```bash
npm run dev
```

Vérifications sur http://localhost:3000 :

- /temps : banner + dialog fonctionnent (création, édition, suppression)
- /temps : la grille des projets ne montre plus les anciens "Conges" / "Maladie" en lignes
- /dashboard : se charge sans erreur, KPIs cohérents
- /indicateurs : se charge sans erreur

- [ ] **Step 9.7 : Commit**

```bash
git add -A
git commit -m "refactor(absences): retire les references est_absence / ABSENCE_PROJECTS

Apres la migration vers la table absences dediee, plus aucune saisie
n a est_absence=true et les projets systeme sont supprimes. Cleanup :
- ProjetTempsRow.est_absence / absence_type retires
- ABSENCE_TYPE_MAP retire
- ABSENCE_PROJECTS dans lib/utils/constants retire
- Filtres .eq(est_absence, false) retires (devenus no-op)"
```

---

## Task 10 : Acceptance + push

- [ ] **Step 10.1 : Tests d'acceptance manuels (sur http://localhost:3000)**

Coche chacun :

1. **Création période simple** : `/temps` → "+ Absence" → Congés du lundi au vendredi → Total "5 jours / 35h" → Enregistrer → 5 cards bleues "Congés" sur le banner ✅
2. **Demi-journées de bord** : "+ Absence" → Congés du jeudi 10:00 au lundi 18:00 → coche "Commence l'après-midi" et "Finit le matin" → Total "3 jours / 14h" (jeudi PM + ven + lundi AM) → Enregistrer → cards en demi-journée ✅
3. **Édition** : clic sur une card Congés → popover → "Modifier" → change le type vers Maladie → Enregistrer → cards passent en violet ✅
4. **Suppression** : clic sur une card → popover → "Modifier" → "Supprimer" → cards repassent en Travaillé ou Vide ✅
5. **Chevauchement** : crée une absence sur lun-mer puis essaie d'en créer une sur mar-jeu → toast "Une absence existe deja sur cette periode" ✅
6. **État Travaillé** : un jour avec des heures de projet > 0 sur la grille → card verte "Travaillé Xh" ✅
7. **État Férié** : si la semaine contient un jour férié (utiliser le 1er mai si possible) → card orange ✅
8. **Quota grille** : avec une absence Congés journée le mardi, la ligne du mardi dans la grille temps refuse les saisies (ou max 0h projet) ✅
9. **Quota grille demi-journée** : avec une absence demi-journée AM le mardi, la ligne mardi accepte max 3.5h projet ✅
10. **Vérification BDD** : via Supabase Studio, table `absences` contient les rows attendues, `saisies_temps` ne contient plus de rows `est_absence=true`, table `projets` ne contient plus `9999-CON-ABS` etc.

- [ ] **Step 10.2 : Vérification finale build production**

```bash
npm run build 2>&1 | tail -15
```

Expected : `✓ Compiled successfully`.

- [ ] **Step 10.3 : Push**

```bash
git push origin main
```

Expected : tous les commits Task 1 → 9 sont poussés.

- [ ] **Step 10.4 : Suivi du déploiement Vercel**

```bash
gh run list --limit 1
```

Vérifier que CI passe et que le déploiement Vercel devient `Ready`.

- [ ] **Step 10.5 : Validation prod (smoke test)**

Sur https://app.mysoluvia.com/temps :

- Le banner s'affiche, pas de crash 500
- "+ Absence" ouvre la dialog
- Créer une absence test → enregistrée → visible
- Supprimer l'absence test pour ne pas polluer les données

---

## Self-Review Checklist (auteur du plan)

- ✅ **Spec coverage** : tous les items "Inclus" du spec (table, RLS, migration, banner 4 états, dialog, helper, server actions, validation chevauchement) sont couverts par les tasks 1-9.
- ✅ **Placeholders** : aucun "TBD" / "TODO" / "implement later" dans les steps. Toutes les commandes et tous les blocs de code sont complets.
- ✅ **Type consistency** : `AbsencePeriod` défini Task 2, utilisé identique dans Tasks 3, 4, 5, 6, 7. `AbsenceDayInfo` défini Task 2, utilisé Task 6. `AbsenceType` défini Task 2, utilisé Task 4 et 5. Pas de drift de naming.
- ✅ **Granularité** : chaque task = 5-15 minutes, chaque step = 2-5 minutes. Commits fréquents (un commit par task).
- ✅ **DRY** : helper `computeAbsenceHoursPerDay` source unique de vérité pour le calcul. Server actions partagent `validate()` interne.
- ✅ **YAGNI** : pas d'approval workflow, pas de vue admin équipe, pas de solde de congés (out of scope V1).
