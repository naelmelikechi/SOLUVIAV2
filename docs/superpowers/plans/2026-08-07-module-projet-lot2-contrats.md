# Module Projet - Lot 2 : contrats en 5 catégories et archivage automatique

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Répartir les contrats d'un projet en 5 catégories métier, et sortir automatiquement de la production les contrats restés en brouillon, selon des règles modifiables sans redéploiement.

**Architecture:** Un trigger date chaque changement d'état de contrat, ce qui rend calculable « depuis N jours dans cet état ». Une table de règles éditables pilote un cron quotidien. Le classement en catégories et l'éligibilité à l'archivage sont deux fonctions pures testées.

**Tech Stack:** Next.js 16 App Router, TypeScript, PostgreSQL (Supabase self-hosted), Vitest, cron Vercel.

**Spec de référence:** `docs/superpowers/specs/2026-08-06-module-projet-synthese-details-design.md`, section D.

---

## Contexte pour l'implémenteur

La table `contrats` du projet est aujourd'hui une liste plate, orientée finance. Le brief demande de la répartir en catégories métier, et d'automatiser l'archivage des contrats qui n'iront jamais au bout.

### Les 5 catégories

| Catégorie         | États Eduvia                                 |
| ----------------- | -------------------------------------------- |
| Prévus de rentrer | `NOTSENT`                                    |
| Déposés à l'OPCO  | `TRANSMIS`, `EN_COURS_INSTRUCTION`, `ENGAGE` |
| Ruptures          | `RUPTURE`                                    |
| Annulés           | `ANNULE`                                     |
| Archivés          | `ARCHIVE`, ou `archive = true` en base       |

Rupture et annulation ont chacune leur catégorie, à la demande explicite du commanditaire : **une rupture a produit du chiffre avant de s'arrêter, un archivé n'a rien produit**. Les confondre effacerait cette distinction, qui est précisément ce qu'un CDP a besoin de voir.

Les états internes historiques (`actif`, `suspendu`, `resilie`, `termine`, présents dans `CONTRACT_STATE_LABELS`) doivent aussi trouver une place : voir la Task 2.

### Le problème que ce lot doit résoudre en premier

**Rien en base ne dit depuis quand un contrat est dans son état.** `updated_at` ne peut pas servir : la synchronisation Eduvia tourne toutes les heures de 9h à 18h et touche les lignes, donc `updated_at` vaut presque toujours aujourd'hui. Une règle « NOTSENT depuis plus de 30 jours » ne se déclencherait jamais.

D'où la première brique : une colonne `contract_state_changed_at`, posée par un trigger **uniquement quand l'état change réellement**. C'est ce qui rend toutes les règles de délai calculables, celle d'aujourd'hui comme celles qu'on ajoutera.

### Pièges de ce codebase

- **Migrations en prod** : PostgreSQL n'est pas exposé, `npx supabase db push` est local uniquement. La CI applique sur `main`.
- **Toujours `SET search_path`** sur une fonction PL/pgSQL.
- **Ne jamais supprimer une facture** (numérotation gapless, obligation légale). D'où le garde-fou d'archivage ci-dessous.
- `gen types --local` peut retirer des colonnes présentes en prod : vérifier le diff, ne pas accepter les yeux fermés.
- **Coût Vercel** : les crons ont été réduits de 70 % en 2026-05. Un seul cron quotidien pour ce lot, pas plus.
- `npm test` avant chaque push, jamais `--no-verify`.

---

## Task 1 : Migration

**Files:**

- Create: `supabase/migrations/<timestamp>_contrats_archivage_auto.sql`

- [ ] **Step 1: Choisir l'horodatage**

Run: `ls supabase/migrations/ | tail -3`

Horodatage strictement supérieur au dernier, format `AAAAMMJJHHMMSS`.

- [ ] **Step 2: Écrire la migration**

```sql
-- Archivage automatique des contrats restes en brouillon.
--
-- Probleme resolu en premier : rien ne disait DEPUIS QUAND un contrat est dans
-- son etat. `updated_at` ne pouvait pas servir, la synchronisation Eduvia
-- tourne toutes les heures et le rafraichit ; une regle "NOTSENT depuis plus
-- de 30 jours" ne se serait jamais declenchee.

-- ---------------------------------------------------------------------------
-- Datation des changements d'etat
-- ---------------------------------------------------------------------------

ALTER TABLE contrats
  ADD COLUMN IF NOT EXISTS contract_state_changed_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION set_contrat_state_changed_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.contract_state_changed_at := COALESCE(NEW.contract_state_changed_at, now());
  ELSIF NEW.contract_state IS DISTINCT FROM OLD.contract_state THEN
    NEW.contract_state_changed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contrat_state_changed_at ON contrats;

CREATE TRIGGER trg_contrat_state_changed_at
  BEFORE INSERT OR UPDATE ON contrats
  FOR EACH ROW EXECUTE FUNCTION set_contrat_state_changed_at();

-- Backfill : created_at est le seul indice disponible pour les lignes
-- existantes. Approximation assumee et documentee - pour un contrat reste en
-- NOTSENT depuis sa creation, c'est meme la valeur exacte.
UPDATE contrats
   SET contract_state_changed_at = created_at
 WHERE contract_state_changed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_contrats_state_changed_at
  ON contrats (contract_state, contract_state_changed_at)
  WHERE archive = false;

-- ---------------------------------------------------------------------------
-- Regles d'archivage, editables sans redeploiement
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS contrats_regles_archivage (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom         TEXT NOT NULL,
  etat_source TEXT NOT NULL,
  delai_jours INTEGER NOT NULL CHECK (delai_jours > 0),
  actif       BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID REFERENCES users(id),
  UNIQUE (etat_source)
);

CREATE TRIGGER trg_regles_archivage_updated_at
  BEFORE UPDATE ON contrats_regles_archivage
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE contrats_regles_archivage ENABLE ROW LEVEL SECURITY;

-- Reservees aux admins : une regle mal reglee sort du chiffre de la
-- production. Une seule policy permissive par commande, initplan-wrap.
CREATE POLICY regles_archivage_select ON contrats_regles_archivage
  FOR SELECT USING ((SELECT is_admin()));
CREATE POLICY regles_archivage_insert ON contrats_regles_archivage
  FOR INSERT WITH CHECK (is_admin());
CREATE POLICY regles_archivage_update ON contrats_regles_archivage
  FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY regles_archivage_delete ON contrats_regles_archivage
  FOR DELETE USING (is_admin());

-- ---------------------------------------------------------------------------
-- Tracabilite de l'archivage automatique
-- ---------------------------------------------------------------------------
-- Sans ces deux colonnes, un contrat archive par le cron serait indiscernable
-- d'un contrat archive a la main : impossible de repondre a "pourquoi celui-la
-- a disparu de ma production ?", ni de desarchiver en connaissance de cause.

ALTER TABLE contrats
  ADD COLUMN IF NOT EXISTS archive_auto_le   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archive_regle_id  UUID REFERENCES contrats_regles_archivage(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contrats_archive_regle_id
  ON contrats (archive_regle_id);

-- ---------------------------------------------------------------------------
-- Regle de depart : celle du brief
-- ---------------------------------------------------------------------------

INSERT INTO contrats_regles_archivage (nom, etat_source, delai_jours, actif)
VALUES (
  'Brouillon jamais transmis',
  'NOTSENT',
  30,
  true
)
ON CONFLICT (etat_source) DO NOTHING;
```

- [ ] **Step 3: Appliquer en local**

Run: `npx supabase db push`

Si l'historique de migrations local est désynchronisé (une session parallèle a appliqué une migration absente de l'arbre), applique directement par `psql` sur `127.0.0.1:54322` puis insère la ligne correspondante dans `supabase_migrations.schema_migrations`. Signale-le.

- [ ] **Step 4: Vérifier le trigger, c'est le point critique**

Le trigger ne doit dater QUE les vrais changements d'état. Un `UPDATE` qui touche autre chose (ce que fait la synchronisation Eduvia toutes les heures) ne doit pas remettre le compteur à zéro.

```bash
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres <<'SQL'
BEGIN;
-- On recule artificiellement la date d'un contrat existant
UPDATE contrats SET contract_state = 'NOTSENT' WHERE id = (SELECT id FROM contrats LIMIT 1);
UPDATE contrats SET contract_state_changed_at = now() - interval '40 days'
 WHERE id = (SELECT id FROM contrats LIMIT 1);
SELECT 'depart' AS etape, contract_state, contract_state_changed_at::date
  FROM contrats WHERE id = (SELECT id FROM contrats LIMIT 1);

-- Un UPDATE qui ne change PAS l'etat (comme le fait le sync) : la date ne doit pas bouger
UPDATE contrats SET last_synced_at = now() WHERE id = (SELECT id FROM contrats LIMIT 1);
SELECT 'apres sync' AS etape, contract_state, contract_state_changed_at::date
  FROM contrats WHERE id = (SELECT id FROM contrats LIMIT 1);

-- Un vrai changement d'etat : la date doit passer a aujourd'hui
UPDATE contrats SET contract_state = 'TRANSMIS' WHERE id = (SELECT id FROM contrats LIMIT 1);
SELECT 'apres changement' AS etape, contract_state, contract_state_changed_at::date
  FROM contrats WHERE id = (SELECT id FROM contrats LIMIT 1);
ROLLBACK;
SQL
```

Attendu : `depart` à J-40, `apres sync` **toujours J-40**, `apres changement` à aujourd'hui. Si `apres sync` a bougé, le `IS DISTINCT FROM` ne fonctionne pas : corrige avant de continuer. **Colle la sortie brute dans ton rapport.**

- [ ] **Step 5: Régénérer les types**

Run: `npx supabase gen types typescript --local > types/database.ts` puis `git diff --stat types/database.ts`

**Si le diff retire des colonnes sans rapport**, fais `git checkout types/database.ts` et ajoute à la main : `contract_state_changed_at`, `archive_auto_le`, `archive_regle_id` sur `contrats`, plus la table `contrats_regles_archivage` (Row, Insert, Update, Relationships). Signale ce que tu as constaté.

- [ ] **Step 6: Vérifier et committer**

Run: `npm run typecheck && npm test`

```bash
git add supabase/migrations types/database.ts
git commit -m "feat(contrats): datation des changements d'etat et regles d'archivage

contract_state_changed_at pose par trigger UNIQUEMENT quand l'etat
change reellement : la synchronisation Eduvia touche les lignes toutes
les heures, updated_at ne pouvait donc pas servir de base a une regle
de delai. Table de regles editable + tracabilite de l'archivage auto."
```

---

## Task 2 : Fonctions pures

**Files:**

- Create: `lib/contrats/categories.ts`
- Create: `lib/contrats/archivage.ts`
- Test: `__tests__/contrats-categories.test.ts`
- Test: `__tests__/contrats-archivage.test.ts`

- [ ] **Step 1: Écrire les tests des catégories**

Créer `__tests__/contrats-categories.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import {
  categorieContrat,
  CATEGORIES_CONTRAT,
  type CategorieContrat,
} from '@/lib/contrats/categories';

describe('categorieContrat', () => {
  it('classe les brouillons en prevus de rentrer', () => {
    expect(categorieContrat('NOTSENT', false)).toBe('prevus');
  });

  it('classe les trois etats d instruction en deposes', () => {
    expect(categorieContrat('TRANSMIS', false)).toBe('deposes');
    expect(categorieContrat('EN_COURS_INSTRUCTION', false)).toBe('deposes');
    expect(categorieContrat('ENGAGE', false)).toBe('deposes');
  });

  it('donne sa propre categorie a la rupture', () => {
    expect(categorieContrat('RUPTURE', false)).toBe('ruptures');
  });

  it('donne sa propre categorie a l annulation', () => {
    expect(categorieContrat('ANNULE', false)).toBe('annules');
  });

  it('classe l etat ARCHIVE en archives', () => {
    expect(categorieContrat('ARCHIVE', false)).toBe('archives');
  });

  it('le drapeau archive prime sur tous les etats', () => {
    // Un contrat archive a la main ou par le cron sort de la production,
    // quel que soit ce que dit encore Eduvia.
    expect(categorieContrat('ENGAGE', true)).toBe('archives');
    expect(categorieContrat('NOTSENT', true)).toBe('archives');
    expect(categorieContrat('RUPTURE', true)).toBe('archives');
  });

  it('rattache les etats internes historiques a une categorie plausible', () => {
    expect(categorieContrat('actif', false)).toBe('deposes');
    expect(categorieContrat('termine', false)).toBe('deposes');
    expect(categorieContrat('resilie', false)).toBe('ruptures');
    expect(categorieContrat('suspendu', false)).toBe('ruptures');
  });

  it('range un etat inconnu dans deposes plutot que de le faire disparaitre', () => {
    // Un etat non reconnu doit rester visible : le perdre reviendrait a
    // masquer un contrat au CDP sans qu'il le sache.
    expect(categorieContrat('ETAT_INEDIT', false)).toBe('deposes');
    expect(categorieContrat(null, false)).toBe('deposes');
  });

  it('expose les cinq categories dans l ordre d affichage', () => {
    expect(CATEGORIES_CONTRAT.map((c) => c.cle)).toEqual([
      'prevus',
      'deposes',
      'ruptures',
      'annules',
      'archives',
    ]);
  });

  it('donne un libelle a chaque categorie', () => {
    for (const c of CATEGORIES_CONTRAT) {
      expect(c.label.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Lancer, voir échouer**

Run: `npx vitest run __tests__/contrats-categories.test.ts`
Attendu : ÉCHEC sur l'import manquant.

- [ ] **Step 3: Implémenter les catégories**

Créer `lib/contrats/categories.ts` :

```ts
/**
 * Les 5 categories metier d'un contrat sur la fiche projet.
 *
 * Rupture et annulation ont chacune la leur, a la demande explicite du
 * commanditaire : une rupture a produit du chiffre avant de s'arreter, un
 * archive n'a rien produit. Les confondre effacerait la seule distinction qui
 * interesse le CDP.
 */
export type CategorieContrat =
  | 'prevus'
  | 'deposes'
  | 'ruptures'
  | 'annules'
  | 'archives';

export const CATEGORIES_CONTRAT: ReadonlyArray<{
  cle: CategorieContrat;
  label: string;
  /** Phrase affichee quand la categorie est vide. */
  vide: string;
}> = [
  {
    cle: 'prevus',
    label: 'Prévus de rentrer',
    vide: 'Aucun contrat en attente de transmission',
  },
  {
    cle: 'deposes',
    label: "Déposés à l'OPCO",
    vide: 'Aucun contrat déposé',
  },
  { cle: 'ruptures', label: 'Ruptures', vide: 'Aucune rupture' },
  { cle: 'annules', label: 'Annulés', vide: 'Aucun contrat annulé' },
  { cle: 'archives', label: 'Archivés', vide: 'Aucun contrat archivé' },
];

const PREVUS = new Set(['NOTSENT']);
const RUPTURES = new Set(['RUPTURE', 'resilie', 'suspendu']);
const ANNULES = new Set(['ANNULE']);
const ARCHIVES = new Set(['ARCHIVE']);

export function categorieContrat(
  contractState: string | null | undefined,
  archive: boolean,
): CategorieContrat {
  // Le drapeau prime sur l'etat Eduvia : un contrat sorti de la production
  // par un admin ou par le cron ne doit pas reapparaitre ailleurs.
  if (archive) return 'archives';

  const etat = contractState ?? '';
  if (ARCHIVES.has(etat)) return 'archives';
  if (PREVUS.has(etat)) return 'prevus';
  if (RUPTURES.has(etat)) return 'ruptures';
  if (ANNULES.has(etat)) return 'annules';

  // Repli volontaire sur "deposes" : un etat inconnu doit rester VISIBLE.
  // Le ranger dans "archives" le ferait disparaitre de la production sans
  // que personne ne l'ait decide.
  return 'deposes';
}
```

- [ ] **Step 4: Lancer, voir passer**

Run: `npx vitest run __tests__/contrats-categories.test.ts`
Attendu : PASS, 10 tests.

- [ ] **Step 5: Écrire les tests d'archivage**

Créer `__tests__/contrats-archivage.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import {
  contratsAArchiver,
  type ContratArchivable,
  type RegleArchivage,
} from '@/lib/contrats/archivage';

const AUJOURD_HUI = '2026-08-07';

const REGLE_NOTSENT: RegleArchivage = {
  id: 'r1',
  nom: 'Brouillon jamais transmis',
  etat_source: 'NOTSENT',
  delai_jours: 30,
  actif: true,
};

function contrat(over: Partial<ContratArchivable> = {}): ContratArchivable {
  return {
    id: 'c1',
    contract_state: 'NOTSENT',
    archive: false,
    contract_state_changed_at: '2026-06-01T00:00:00Z',
    aDesFacturesEmises: false,
    ...over,
  };
}

describe('contratsAArchiver', () => {
  it('retient un contrat au-dela du delai de sa regle', () => {
    const r = contratsAArchiver([contrat()], [REGLE_NOTSENT], AUJOURD_HUI);
    expect(r.map((x) => x.contratId)).toEqual(['c1']);
    expect(r[0]!.regleId).toBe('r1');
  });

  it('ignore un contrat pile au delai', () => {
    // 2026-07-08 -> 2026-08-07 = 30 jours exactement
    expect(
      contratsAArchiver(
        [contrat({ contract_state_changed_at: '2026-07-08T00:00:00Z' })],
        [REGLE_NOTSENT],
        AUJOURD_HUI,
      ),
    ).toEqual([]);
  });

  it('retient un contrat juste au-dela du delai', () => {
    expect(
      contratsAArchiver(
        [contrat({ contract_state_changed_at: '2026-07-07T00:00:00Z' })],
        [REGLE_NOTSENT],
        AUJOURD_HUI,
      ),
    ).toHaveLength(1);
  });

  it('ignore un contrat dans un autre etat', () => {
    expect(
      contratsAArchiver(
        [contrat({ contract_state: 'ENGAGE' })],
        [REGLE_NOTSENT],
        AUJOURD_HUI,
      ),
    ).toEqual([]);
  });

  it('ignore un contrat deja archive', () => {
    expect(
      contratsAArchiver(
        [contrat({ archive: true })],
        [REGLE_NOTSENT],
        AUJOURD_HUI,
      ),
    ).toEqual([]);
  });

  it('ignore une regle desactivee', () => {
    expect(
      contratsAArchiver(
        [contrat()],
        [{ ...REGLE_NOTSENT, actif: false }],
        AUJOURD_HUI,
      ),
    ).toEqual([]);
  });

  it('n archive JAMAIS un contrat portant une facture emise', () => {
    // Garde-fou non negociable : archiver retire de la production. Le faire
    // sur un contrat deja facture creuserait un ecart entre la production
    // affichee et le chiffre reellement facture.
    expect(
      contratsAArchiver(
        [contrat({ aDesFacturesEmises: true })],
        [REGLE_NOTSENT],
        AUJOURD_HUI,
      ),
    ).toEqual([]);
  });

  it('ignore un contrat sans date de changement d etat', () => {
    expect(
      contratsAArchiver(
        [contrat({ contract_state_changed_at: null })],
        [REGLE_NOTSENT],
        AUJOURD_HUI,
      ),
    ).toEqual([]);
  });

  it('ne retient rien quand il n y a aucune regle', () => {
    expect(contratsAArchiver([contrat()], [], AUJOURD_HUI)).toEqual([]);
  });

  it('applique la bonne regle a chaque etat', () => {
    const regles: RegleArchivage[] = [
      REGLE_NOTSENT,
      {
        id: 'r2',
        nom: 'Transmis sans reponse',
        etat_source: 'TRANSMIS',
        delai_jours: 90,
        actif: true,
      },
    ];
    const r = contratsAArchiver(
      [
        contrat({ id: 'a', contract_state: 'NOTSENT' }),
        contrat({
          id: 'b',
          contract_state: 'TRANSMIS',
          contract_state_changed_at: '2026-01-01T00:00:00Z',
        }),
        contrat({
          id: 'c',
          contract_state: 'TRANSMIS',
          contract_state_changed_at: '2026-07-01T00:00:00Z',
        }),
      ],
      regles,
      AUJOURD_HUI,
    );
    expect(r.map((x) => x.contratId).sort()).toEqual(['a', 'b']);
    expect(r.find((x) => x.contratId === 'b')!.regleId).toBe('r2');
  });
});
```

- [ ] **Step 6: Lancer, voir échouer, implémenter**

Run: `npx vitest run __tests__/contrats-archivage.test.ts` (ÉCHEC attendu)

Créer `lib/contrats/archivage.ts` :

```ts
export interface RegleArchivage {
  id: string;
  nom: string;
  etat_source: string;
  delai_jours: number;
  actif: boolean;
}

export interface ContratArchivable {
  id: string;
  contract_state: string | null;
  archive: boolean;
  /** Pose par trigger au vrai changement d'etat. ISO complet ou court. */
  contract_state_changed_at: string | null;
  /** Au moins une facture emise porte ce contrat. Garde-fou. */
  aDesFacturesEmises: boolean;
}

export interface DecisionArchivage {
  contratId: string;
  regleId: string;
  regleNom: string;
  joursDansEtat: number;
}

function joursEntre(debutIso: string, finIso: string): number {
  const d = Date.parse(debutIso);
  const f = Date.parse(`${finIso}T00:00:00Z`);
  if (Number.isNaN(d) || Number.isNaN(f)) return 0;
  return Math.floor((f - d) / 86_400_000);
}

/**
 * Contrats a sortir de la production, selon les regles actives.
 *
 * Garde-fou non negociable : un contrat portant une facture emise n'est
 * JAMAIS archive automatiquement. Archiver retire de la production ; le faire
 * sur un contrat deja facture creuserait un ecart entre la production affichee
 * et le chiffre reellement facture, sur une numerotation qu'on ne peut pas
 * corriger a posteriori (gapless, obligation legale).
 */
export function contratsAArchiver(
  contrats: ContratArchivable[],
  regles: RegleArchivage[],
  aujourdHui: string,
): DecisionArchivage[] {
  const parEtat = new Map<string, RegleArchivage>();
  for (const r of regles) {
    if (r.actif) parEtat.set(r.etat_source, r);
  }
  if (parEtat.size === 0) return [];

  const decisions: DecisionArchivage[] = [];
  for (const c of contrats) {
    if (c.archive) continue;
    if (c.aDesFacturesEmises) continue;
    if (!c.contract_state || !c.contract_state_changed_at) continue;

    const regle = parEtat.get(c.contract_state);
    if (!regle) continue;

    const jours = joursEntre(c.contract_state_changed_at, aujourdHui);
    if (jours > regle.delai_jours) {
      decisions.push({
        contratId: c.id,
        regleId: regle.id,
        regleNom: regle.nom,
        joursDansEtat: jours,
      });
    }
  }
  return decisions;
}
```

- [ ] **Step 7: Vérifier**

Run: `npx vitest run __tests__/contrats-archivage.test.ts` (PASS, 10 tests)
Run: `npm run typecheck && npm run lint && npm test`

- [ ] **Step 8: Commit**

```bash
git add lib/contrats __tests__/contrats-categories.test.ts __tests__/contrats-archivage.test.ts
git commit -m "feat(contrats): classement en 5 categories et eligibilite a l'archivage

Deux fonctions pures. Un etat inconnu se range dans 'deposes' et non
dans 'archives' : il doit rester visible, le perdre reviendrait a
masquer un contrat sans que personne l'ait decide.

Garde-fou teste : un contrat portant une facture emise n'est jamais
archive automatiquement."
```

---

## Task 3 : Cron d'archivage

**Files:**

- Create: `app/api/cron/contrats-archivage/route.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Lire un cron existant comme modèle**

Run: `cat "app/api/cron/echeancier-retard/route.ts"`

Reprends sa structure : `verifyCronAuth`, `createAdminClient`, `logger`, `maxDuration`, réponse JSON.

- [ ] **Step 2: Écrire la route**

Créer `app/api/cron/contrats-archivage/route.ts` :

```ts
import { NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/utils/cron-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/utils/logger';
import {
  contratsAArchiver,
  type ContratArchivable,
  type RegleArchivage,
} from '@/lib/contrats/archivage';

export const maxDuration = 60;

const SCOPE = 'cron.contrats-archivage';

/**
 * CRON quotidien : sort de la production les contrats restes trop longtemps
 * dans un etat sans issue, selon les regles de `contrats_regles_archivage`
 * (editables dans /admin/parametres, donc ajustables sans redeploiement).
 *
 * Chaque contrat archive garde la trace de la regle qui l'a sorti
 * (archive_regle_id, archive_auto_le) : sans cela il serait indiscernable d'un
 * archivage manuel, et personne ne pourrait repondre a "pourquoi celui-la a
 * disparu de ma production ?".
 */
export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const supabase = createAdminClient();

  try {
    const [reglesRes, contratsRes, facturesRes] = await Promise.all([
      supabase
        .from('contrats_regles_archivage')
        .select('id, nom, etat_source, delai_jours, actif')
        .eq('actif', true),
      supabase
        .from('contrats')
        .select('id, contract_state, archive, contract_state_changed_at')
        .eq('archive', false),
      // Garde-fou : tout contrat porte par une ligne de facture emise est
      // hors de portee du cron. Les brouillons (a_emettre) ne comptent pas,
      // ils ne sont pas encore des recettes.
      supabase
        .from('facture_lignes')
        .select('contrat_id, facture:factures!inner(statut)')
        .neq('facture.statut', 'a_emettre'),
    ]);

    const regles = (reglesRes.data ?? []) as RegleArchivage[];
    if (regles.length === 0) {
      return NextResponse.json({
        success: true,
        archives: 0,
        message: 'Aucune regle active',
      });
    }

    const contratsFactures = new Set(
      (facturesRes.data ?? [])
        .map((l) => (l as { contrat_id: string | null }).contrat_id)
        .filter((id): id is string => id != null),
    );

    const contrats: ContratArchivable[] = (contratsRes.data ?? []).map((c) => {
      const row = c as {
        id: string;
        contract_state: string | null;
        archive: boolean;
        contract_state_changed_at: string | null;
      };
      return {
        id: row.id,
        contract_state: row.contract_state,
        archive: row.archive,
        contract_state_changed_at: row.contract_state_changed_at,
        aDesFacturesEmises: contratsFactures.has(row.id),
      };
    });

    const aujourdHui = new Date().toISOString().slice(0, 10);
    const decisions = contratsAArchiver(contrats, regles, aujourdHui);

    if (decisions.length === 0) {
      return NextResponse.json({
        success: true,
        archives: 0,
        message: 'Aucun contrat a archiver',
      });
    }

    // Une mise a jour par regle : les contrats d'une meme regle partagent
    // archive_regle_id, on evite un aller-retour par contrat.
    let archives = 0;
    const parRegle = new Map<string, string[]>();
    for (const d of decisions) {
      const liste = parRegle.get(d.regleId) ?? [];
      liste.push(d.contratId);
      parRegle.set(d.regleId, liste);
    }

    for (const [regleId, ids] of parRegle) {
      const { error } = await supabase
        .from('contrats')
        .update({
          archive: true,
          archive_auto_le: new Date().toISOString(),
          archive_regle_id: regleId,
        })
        .in('id', ids);

      if (error) {
        logger.error(SCOPE, 'archivage failed', { regleId, error });
        continue;
      }
      archives += ids.length;
    }

    logger.info(SCOPE, 'contrats archives', {
      archives,
      decisions: decisions.length,
    });

    return NextResponse.json({
      success: true,
      archives,
      detail: decisions.map((d) => ({
        contratId: d.contratId,
        regle: d.regleNom,
        joursDansEtat: d.joursDansEtat,
      })),
    });
  } catch (err) {
    logger.error(SCOPE, 'cron failed', { error: err });
    return NextResponse.json(
      { success: false, error: 'Erreur lors de archivage' },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 3: Vérifier le nom de la colonne de jointure**

L'accès aux factures suppose que `facture_lignes` porte une colonne `contrat_id`. **Vérifie-le, ne le suppose pas** :

Run: `grep -rn "contrat_id" supabase/migrations/*facture_lignes*.sql | head -5`

Si le nom diffère, adapte la requête et signale-le. Si `facture_lignes` n'a aucun lien vers `contrats`, trouve le chemin réel (peut-être via `eduvia_invoice_steps`) et documente-le en commentaire.

- [ ] **Step 4: Déclarer le cron**

Dans `vercel.json`, ajouter au tableau `crons` :

```json
{
  "path": "/api/cron/contrats-archivage",
  "schedule": "30 4 * * *"
}
```

4h30 du matin : hors de la fenêtre de synchronisation Eduvia (9h-18h), pour que les états soient stables au moment où le cron décide.

- [ ] **Step 5: Vérifier**

Run: `npm run typecheck && npm run lint && npm test && npm run build`

- [ ] **Step 6: Commit**

```bash
git add "app/api/cron/contrats-archivage/route.ts" vercel.json
git commit -m "feat(contrats): cron quotidien d'archivage automatique

4h30, hors de la fenetre de synchronisation Eduvia (9h-18h) : les etats
doivent etre stables au moment ou le cron decide. Chaque contrat garde
la trace de la regle qui l'a sorti."
```

---

## Task 4 : Écran d'administration des règles

**Files:**

- Create: `lib/queries/contrats-regles.ts`
- Create: `lib/actions/contrats-regles.ts`
- Create: `app/(dashboard)/admin/parametres/archivage-contrats/page.tsx`
- Create: `components/admin/regles-archivage-table.tsx`

- [ ] **Step 1: Lire un écran d'administration existant comme modèle**

Run: `cat "app/(dashboard)/admin/parametres/opcos/page.tsx"`

Reprends sa structure : page serveur, garde admin, `DataTable` partagé, actions serveur.

- [ ] **Step 2: Query**

Créer `lib/queries/contrats-regles.ts` avec `listReglesArchivage()` qui retourne toutes les règles ordonnées par `etat_source`, en s'appuyant sur `createClient()` (RLS admin-only fait le reste).

- [ ] **Step 3: Actions**

Créer `lib/actions/contrats-regles.ts` avec `upsertRegleArchivage` et `deleteRegleArchivage`, validées par Zod (`delai_jours` entier strictement positif, `etat_source` non vide), protégées par `requireAuth` **et** un contrôle explicite du rôle admin, avec `logAudit` et `revalidatePath('/admin/parametres/archivage-contrats')`.

`etat_source` doit être choisi dans la liste des états connus : réutilise les clés de `CONTRACT_STATE_LABELS` (`lib/utils/contrat-states.ts`) plutôt qu'une saisie libre, pour qu'une faute de frappe ne crée pas une règle inerte.

- [ ] **Step 4: Écran**

Une page sobre : un tableau des règles (état, délai, active, actions), un formulaire d'ajout. Chaque ligne indique **combien de contrats la règle a déjà archivés** — c'est ce qui permet de repérer une règle trop agressive avant qu'elle ne fasse des dégâts.

Ajoute un lien vers cette page depuis `app/(dashboard)/admin/parametres/page.tsx`, en suivant la façon dont les autres sous-pages y sont référencées.

- [ ] **Step 5: Vérifier et committer**

Run: `npm run typecheck && npm run lint && npm test && npm run build`

```bash
git add lib/queries/contrats-regles.ts lib/actions/contrats-regles.ts "app/(dashboard)/admin/parametres" components/admin/regles-archivage-table.tsx
git commit -m "feat(contrats): ecran d'administration des regles d'archivage"
```

---

## Task 5 : Page contrats en 5 catégories

**Files:**

- Modify: `app/(dashboard)/projets/[ref]/contrats/page.tsx`
- Create: `components/projets/projet-contrats-categories.tsx`

- [ ] **Step 1: Charger la production avant rupture**

La catégorie Ruptures doit afficher **ce qui a été produit avant l'arrêt** : c'est ce qui la distingue d'un archivé. Ce calcul existe déjà, ne le réécris pas.

Run: `grep -rn "computeContractSchedule" lib/ --include=*.ts | head -5`

Lis la fonction et réutilise-la. Si elle n'est pas appelable simplement depuis la page, expose une petite query dédiée plutôt que de dupliquer la formule. Signale ce que tu as choisi.

- [ ] **Step 2: Composant à 5 sections**

Créer `components/projets/projet-contrats-categories.tsx`. Il reçoit les contrats déjà classés et rend **une section par catégorie non vide**, chacune avec son titre, son compte, et le `DataTable` partagé.

**Contrainte de densité** : une catégorie vide n'affiche pas un tableau vide, elle n'affiche rien du tout — sauf les deux premières (Prévus, Déposés), qui gardent leur phrase « Aucun contrat… » parce que leur absence est en soi une information.

La catégorie Archivés indique, pour chaque contrat archivé automatiquement, **quelle règle l'a sorti et quand** (colonnes `archive_regle_id`, `archive_auto_le`). Sans cela le CDP ne peut pas comprendre une disparition.

- [ ] **Step 3: Page**

Modifier `app/(dashboard)/projets/[ref]/contrats/page.tsx` pour classer les contrats via `categorieContrat` et monter le nouveau composant. `ProjetContratsTable` reste utilisé à l'intérieur, ou est remplacé section par section : à toi de voir ce qui donne le code le plus simple. **Ne supprime pas `ProjetContratsTable`** sans avoir vérifié qu'il n'est plus utilisé nulle part.

- [ ] **Step 4: Vérifier et committer**

Run: `npm run typecheck && npm run lint && npm test && npm run build`

```bash
git add "app/(dashboard)/projets/[ref]/contrats/page.tsx" components/projets/projet-contrats-categories.tsx
git commit -m "feat(projet): contrats repartis en 5 categories

Rupture et annulation ont chacune la leur : une rupture a produit du
chiffre avant de s'arreter, un archive n'a rien produit."
```

---

## Task 6 : Vérification

- [ ] **Step 1: Suite complète**

Run: `npm run typecheck && npm run lint && npm test && npm run build`

- [ ] **Step 2: Vérifier le cron sans attendre demain**

Le cron est protégé par `CRON_SECRET`. En local, appelle-le directement avec le secret de `.env.local`, sur le serveur de dev branché au Supabase local :

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  http://127.0.0.1:3002/api/cron/contrats-archivage | head -40
```

Avant l'appel, prépare en base un contrat `NOTSENT` daté de plus de 30 jours **et** un autre identique mais porteur d'une facture émise. Attendu : le premier est archivé, **le second ne l'est pas**. C'est le garde-fou le plus important du lot, vérifie-le en vrai et colle la sortie.

- [ ] **Step 3: Vérification visuelle**

Protocole dans `.claude/skills/verify/SKILL.md`. Rappel des pièges rencontrés : l'hydratation React ne marche pas dans le navigateur headless local (injecter le cookie `sb-127-auth-token` plutôt que de passer par le formulaire), et le binaire Playwright du cache peut être corrompu (pointer `executablePath` sur `chromium_headless_shell-1223`).

Contrôler `/projets/[ref]/contrats` : les catégories non vides s'affichent, une catégorie vide ne laisse pas de tableau fantôme, la page ne devient pas un mur. Capture.

- [ ] **Step 4: Nettoyer, pousser**

Supprimer tout script temporaire, arrêter le serveur de dev. `git status --short` avant de committer, jamais `git add -A`.

---

## Points de vigilance

**Le garde-fou de facturation n'est pas négociable.** Archiver retire de la production. Sur un contrat déjà facturé, cela creuserait un écart entre la production affichée et le chiffre facturé, sur une numérotation qu'on ne peut pas corriger après coup. Le test existe, il ne doit jamais être assoupli.

**Un état inconnu ne disparaît pas.** Le repli de `categorieContrat` envoie vers « Déposés », pas vers « Archivés ». Si Eduvia introduit un état demain, le contrat reste visible et quelqu'un s'en apercevra. Rangé dans « Archivés », il sortirait silencieusement de la production.

**Le trigger ne doit dater que les vrais changements.** `IS DISTINCT FROM` est ce qui empêche la synchronisation horaire de remettre tous les compteurs à zéro. C'est le point à vérifier en priorité si les règles ne se déclenchent jamais en prod.
