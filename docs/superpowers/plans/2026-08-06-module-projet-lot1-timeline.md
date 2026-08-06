# Module Projet - Lot 1 : timeline de lancement

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner à chaque étape de lancement une date d'objectif saisissable et une date de réalisation automatique, et en déduire deux alertes distinctes : « en retard » (notre retard) et « enlisé » (le dossier dort chez le tiers instructeur).

**Architecture:** Deux colonnes sur `projet_lancement_etapes`. `date_realisation` est posée par un trigger, pas par le code applicatif : elle doit rester vraie quel que soit le chemin d'écriture. Les deux alertes ne sont jamais stockées, elles sont dérivées par une fonction pure testée sur les bornes. Le seuil d'enlisement vit dans `parametres`, modifiable sans redéploiement.

**Tech Stack:** Next.js 16 App Router, TypeScript, PostgreSQL (Supabase self-hosted via pg-meta), Vitest.

**Spec de référence:** `docs/superpowers/specs/2026-08-06-module-projet-synthese-details-design.md`, section C.

---

## Contexte pour l'implémenteur

La timeline de lancement existe déjà : 7 étapes fixes (`lib/lancement/constants.ts`), 4 statuts (`non_commence` / `en_cours` / `depose` / `lance`), des documents et des commentaires par étape. Elle vit maintenant sur sa propre route `/projets/[ref]/lancement` depuis le lot 0.

Ce lot ajoute la dimension temporelle qui manque : aujourd'hui rien ne dit si une étape aurait dû être finie depuis trois semaines.

### Les deux alertes, et pourquoi elles sont distinctes

Elles ne décrivent pas le même problème et ne s'adressent pas à la même personne :

- **En retard** : la date d'objectif est dépassée et l'étape n'est toujours pas partie. Le retard est **de notre côté**, c'est au CDP d'agir.
- **Enlisé** : l'étape est déposée depuis plus de 15 jours sans être terminée. L'objectif est **tenu**, mais le dossier dort chez le tiers instructeur (OPCO, rectorat, France Compétences). Il faut relancer, pas produire.

Les confondre en une seule alerte « en retard » ferait porter au CDP la responsabilité d'un délai qui ne lui appartient pas.

### Décision de spec à respecter

La date de réalisation est posée au passage en **`depose`**, pas au passage en `lance`. Validée explicitement par le commanditaire : ce qui compte pour l'objectif, c'est que le dossier soit parti.

### Pièges de ce codebase

- **Migrations en prod** : PostgreSQL n'est pas exposé. `npx supabase db push` ne marche que sur le local. En prod c'est `npm run db:migrate:dry` puis `npm run db:migrate` (script `scripts/migrate-supavia.ts` via pg-meta), et c'est automatique en CI sur `main`.
- **Toujours `SET search_path` sur une fonction PL/pgSQL** : une fonction sans search_path explicite est une alerte de sécurité Supabase.
- **RLS n'a pas accès à `OLD`** : toute règle qui dépend de l'état précédent passe par un trigger, pas par une policy.
- shadcn/ui est monté sur **base-ui**, pas radix : pas de prop `asChild`.
- `npm test` doit passer avant chaque push (hook pre-push), jamais `--no-verify`.

---

## Structure des fichiers

**À créer :**

| Fichier                                                 | Responsabilité                                   |
| ------------------------------------------------------- | ------------------------------------------------ |
| `supabase/migrations/<ts>_lancement_dates_objectif.sql` | Colonnes, trigger, backfill, paramètre de seuil. |
| `lib/lancement/alertes.ts`                              | Fonction pure `alerteEtape`. Aucune I/O.         |
| `__tests__/lancement-alertes.test.ts`                   | Tests de `alerteEtape`, bornes comprises.        |

**À modifier :**

| Fichier                                            | Changement                                                          |
| -------------------------------------------------- | ------------------------------------------------------------------- |
| `lib/actions/projet-lancement.ts`                  | Corriger 5 `revalidatePath` + nouvelle action de saisie de date.    |
| `lib/actions/rdv.ts`                               | Corriger 3 `revalidatePath`.                                        |
| `lib/lancement/constants.ts`                       | Libellés « À venir » et « Terminé » + seuil par défaut.             |
| `lib/queries/projet-lancement.ts`                  | Sélectionner les deux nouvelles colonnes.                           |
| `lib/queries/parametres.ts`                        | Lecture du seuil d'enlisement.                                      |
| `app/(dashboard)/projets/[ref]/lancement/page.tsx` | Charger le seuil et le passer.                                      |
| `components/projets/projet-lancement-section.tsx`  | Propager seuil et date du jour, libellé du compteur.                |
| `components/projets/lancement-etape-item.tsx`      | Saisie de la date d'objectif, affichage des dates, badges d'alerte. |

---

## Task 1 : Réparer les invalidations de cache cassées par le lot 0

Régression réelle, à corriger avant toute nouvelle fonctionnalité. Le lot 0 a déplacé la timeline vers `/projets/[ref]/lancement` et les RDV vers `/projets/[ref]/production`, mais les actions serveur invalident toujours `/projets/[ref]`. **Aujourd'hui, changer un statut d'étape ne rafraîchit pas l'écran.**

**Files:**

- Modify: `lib/actions/projet-lancement.ts` (5 occurrences)
- Modify: `lib/actions/rdv.ts` (3 occurrences)

- [ ] **Step 1: Constater la casse**

Run: `grep -n "revalidatePath" lib/actions/projet-lancement.ts lib/actions/rdv.ts`

Attendu : 5 lignes `revalidatePath(\`/projets/${parsed.data.projetRef}\`)`dans le premier fichier, 3 lignes`revalidatePath(\`/projets/[ref]\`, 'page')` dans le second.

- [ ] **Step 2: Corriger les actions de lancement**

Dans `lib/actions/projet-lancement.ts`, remplacer **chacune** des 5 occurrences de :

```ts
revalidatePath(`/projets/${parsed.data.projetRef}`);
```

par :

```ts
// La timeline vit sur /lancement depuis le lot 0 ; la synthese affiche le
// compteur d'etapes terminees, donc les deux routes doivent etre invalidees.
revalidatePath(`/projets/${parsed.data.projetRef}/lancement`);
revalidatePath(`/projets/${parsed.data.projetRef}`);
```

Note : mets le commentaire une seule fois, sur la première occurrence. Les quatre autres n'ont besoin que des deux appels.

- [ ] **Step 3: Corriger les actions RDV**

Dans `lib/actions/rdv.ts`, remplacer **chacune** des 3 occurrences de :

```ts
revalidatePath(`/projets/[ref]`, 'page');
```

par :

```ts
// Les RDV formateurs vivent sur /production depuis le lot 0.
revalidatePath(`/projets/[ref]/production`, 'page');
```

Là encore, le commentaire une seule fois.

- [ ] **Step 4: Vérifier qu'aucune autre action ne pointe à côté**

Run: `grep -rn "revalidatePath" lib/actions/*.ts | grep "projets/"`

Passe en revue chaque ligne restante et vérifie que la route citée est bien celle qui monte le composant concerné après le lot 0. Les documents de projet (`lib/actions/documents.ts`) sont dans le bloc Suivi de la synthèse, donc `/projets/${ref}` est correct pour eux : ne les change pas. Signale dans ton rapport toute ligne dont tu doutes.

- [ ] **Step 5: Vérifier**

Run: `npm run typecheck && npm run lint && npm test`
Attendu : tout vert, environ 1432 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/actions/projet-lancement.ts lib/actions/rdv.ts
git commit -m "fix(projet): invalider les sous-routes apres le decoupage du lot 0

La timeline est passee sur /lancement et les RDV sur /production, mais
les actions invalidaient toujours /projets/[ref] : changer un statut
d'etape ou cocher un RDV ne rafraichissait plus l'ecran."
```

---

## Task 2 : Migration

**Files:**

- Create: `supabase/migrations/<timestamp>_lancement_dates_objectif.sql`

- [ ] **Step 1: Choisir l'horodatage**

Run: `ls supabase/migrations/ | tail -3`

Prends un horodatage strictement supérieur au dernier, au format `AAAAMMJJHHMMSS`. Le nom du fichier : `<timestamp>_lancement_dates_objectif.sql`.

- [ ] **Step 2: Écrire la migration**

```sql
-- Timeline de lancement : dimension temporelle.
--
-- date_objectif   : saisie par l'admin ou le CDP, "quand ca devrait etre parti".
-- date_realisation: posee automatiquement au premier passage en depose (ou en
--                   lance si l'etape saute l'etape depose).
--
-- Decision produit validee : l'objectif est REALISE au depot, pas a la fin.
-- Ce qui compte pour tenir un objectif, c'est que le dossier soit parti chez
-- le tiers instructeur ; ce que le tiers en fait ensuite ne nous appartient
-- plus (c'est l'alerte "enlise", derivee cote application).
--
-- Les deux alertes ("en retard", "enlise") ne sont PAS stockees : elles se
-- derivent de ces deux dates et du statut. Une alerte stockee serait fausse
-- des le lendemain sans que rien ne l'ait mise a jour.

ALTER TABLE projet_lancement_etapes
  ADD COLUMN IF NOT EXISTS date_objectif    DATE,
  ADD COLUMN IF NOT EXISTS date_realisation DATE;

-- ---------------------------------------------------------------------------
-- date_realisation posee par trigger, jamais par le code applicatif
-- ---------------------------------------------------------------------------
-- Le trigger garantit la coherence quel que soit le chemin d'ecriture (Server
-- Action, import, correction manuelle en base). RLS n'a pas acces a OLD, donc
-- une policy ne pourrait pas exprimer "seulement si c'etait null".
--
-- Retour en arriere : si une etape repasse sous "depose" (correction d'une
-- erreur de saisie), la date est effacee. Sans cela, l'etape resterait
-- "realisee" tout en etant "en cours", et la regle "en retard" ne pourrait
-- plus jamais la signaler.

CREATE OR REPLACE FUNCTION set_lancement_date_realisation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.statut IN ('depose', 'lance') THEN
    IF NEW.date_realisation IS NULL THEN
      NEW.date_realisation := CURRENT_DATE;
    END IF;
  ELSE
    NEW.date_realisation := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lancement_date_realisation ON projet_lancement_etapes;

CREATE TRIGGER trg_lancement_date_realisation
  BEFORE INSERT OR UPDATE ON projet_lancement_etapes
  FOR EACH ROW EXECUTE FUNCTION set_lancement_date_realisation();

-- ---------------------------------------------------------------------------
-- Backfill des lignes existantes
-- ---------------------------------------------------------------------------
-- Approximation assumee : on ne sait pas quand ces etapes sont passees en
-- depose, seulement quand leur ligne a ete modifiee pour la derniere fois.
-- Pour une etape deja deposee ou lancee, updated_at est le meilleur indice
-- disponible. Sans backfill, toutes les etapes deja parties apparaitraient
-- comme jamais realisees.

UPDATE projet_lancement_etapes
   SET date_realisation = updated_at::date
 WHERE statut IN ('depose', 'lance')
   AND date_realisation IS NULL;

-- ---------------------------------------------------------------------------
-- Seuil d'enlisement, modifiable sans redeploiement
-- ---------------------------------------------------------------------------

INSERT INTO parametres (cle, valeur, categorie, description)
VALUES (
  'lancement.seuil_enlisement_jours',
  '15',
  'lancement',
  'Nombre de jours au-dela duquel une etape deposee et non terminee est signalee comme enlisee chez le tiers instructeur'
)
ON CONFLICT (cle) DO NOTHING;
```

- [ ] **Step 3: Appliquer en local**

Run: `npx supabase db push`
Attendu : la migration s'applique sans erreur.

Si Supabase local n'est pas démarré : `npx supabase start` d'abord.

- [ ] **Step 4: Vérifier le trigger en conditions réelles**

Run:

```bash
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c "
  SELECT p.id INTO TEMP t FROM projets p LIMIT 1;
  INSERT INTO projet_lancement_etapes (projet_id, etape_key, statut)
    SELECT id, 'nda', 'en_cours' FROM t
    ON CONFLICT (projet_id, etape_key) DO UPDATE SET statut = 'en_cours';
  SELECT statut, date_realisation AS apres_en_cours FROM projet_lancement_etapes
    WHERE etape_key = 'nda' AND projet_id = (SELECT id FROM t);
  UPDATE projet_lancement_etapes SET statut = 'depose'
    WHERE etape_key = 'nda' AND projet_id = (SELECT id FROM t);
  SELECT statut, date_realisation AS apres_depose FROM projet_lancement_etapes
    WHERE etape_key = 'nda' AND projet_id = (SELECT id FROM t);
  UPDATE projet_lancement_etapes SET statut = 'en_cours'
    WHERE etape_key = 'nda' AND projet_id = (SELECT id FROM t);
  SELECT statut, date_realisation AS apres_retour_arriere FROM projet_lancement_etapes
    WHERE etape_key = 'nda' AND projet_id = (SELECT id FROM t);
"
```

Attendu, dans l'ordre : `date_realisation` nulle en `en_cours`, égale à aujourd'hui en `depose`, **et de nouveau nulle** après le retour en `en_cours`. Si le troisième cas ne se vide pas, le trigger ne couvre pas la branche `ELSE` : corrige avant de continuer.

- [ ] **Step 5: Régénérer les types**

Run: `npx supabase gen types typescript --local > types/database.ts`

**Attention, piège connu de ce dépôt** : `gen types --local` peut supprimer des colonnes présentes en prod mais absentes en local. Vérifie le diff avant de committer :

Run: `git diff --stat types/database.ts`

Si le diff retire des colonnes sans rapport avec cette migration, **ne committe pas le fichier régénéré** : ajoute les deux colonnes à la main dans le type `projet_lancement_etapes` (Row, Insert, Update) et signale-le.

- [ ] **Step 6: Vérifier**

Run: `npm run typecheck && npm test`
Attendu : tout vert.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations types/database.ts
git commit -m "feat(projet): dates d'objectif et de realisation sur la timeline

date_realisation posee par trigger (BEFORE INSERT OR UPDATE) et non par
le code applicatif : elle doit rester vraie quel que soit le chemin
d'ecriture, et RLS n'a pas acces a OLD. Un retour en arriere sous
'depose' l'efface, sinon l'etape resterait realisee tout en etant en
cours. Seuil d'enlisement seede a 15 jours dans parametres."
```

---

## Task 3 : Fonction pure des alertes

**Files:**

- Modify: `lib/lancement/constants.ts`
- Create: `lib/lancement/alertes.ts`
- Test: `__tests__/lancement-alertes.test.ts`

- [ ] **Step 1: Renommer les libellés**

Dans `lib/lancement/constants.ts`, modifier **uniquement les libellés** du tableau `LANCEMENT_STATUTS`. Les clés sont figées par une contrainte `CHECK` en base : ne les touche pas.

- `non_commence` : label `'Non commencé'` devient `'À venir'`
- `lance` : label `'Lancé'` devient `'Terminé'`

`en_cours` et `depose` ne bougent pas.

Ajouter à la fin du fichier :

```ts
// Seuil par defaut si le parametre `lancement.seuil_enlisement_jours` est
// absent ou invalide : un parametre mal saisi ne doit jamais faire disparaitre
// l'alerte d'enlisement.
export const DEFAUT_SEUIL_ENLISEMENT_JOURS = 15;
```

- [ ] **Step 2: Écrire le test qui échoue**

Créer `__tests__/lancement-alertes.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { alerteEtape } from '@/lib/lancement/alertes';

const AUJOURD_HUI = '2026-08-06';
const SEUIL = 15;

function alerte(over: Partial<Parameters<typeof alerteEtape>[0]> = {}) {
  return alerteEtape({
    statut: 'en_cours',
    dateObjectif: null,
    dateRealisation: null,
    aujourdHui: AUJOURD_HUI,
    seuilEnlisementJours: SEUIL,
    ...over,
  });
}

describe('alerteEtape - en retard', () => {
  it('signale un retard quand l objectif est passe et rien n est parti', () => {
    expect(alerte({ dateObjectif: '2026-08-05' })).toBe('en_retard');
  });

  it('ne signale rien le jour meme de l objectif', () => {
    expect(alerte({ dateObjectif: AUJOURD_HUI })).toBe(null);
  });

  it('ne signale rien quand l objectif est dans le futur', () => {
    expect(alerte({ dateObjectif: '2026-09-01' })).toBe(null);
  });

  it('ne signale rien sans date d objectif', () => {
    expect(alerte({ dateObjectif: null })).toBe(null);
  });

  it('ne signale plus de retard des que l etape est realisee', () => {
    expect(
      alerte({
        statut: 'depose',
        dateObjectif: '2026-06-01',
        dateRealisation: '2026-08-05',
      }),
    ).toBe(null);
  });
});

describe('alerteEtape - enlise', () => {
  it('signale un enlisement au-dela du seuil', () => {
    expect(alerte({ statut: 'depose', dateRealisation: '2026-07-21' })).toBe(
      'enlise',
    );
  });

  it('ne signale rien pile au seuil', () => {
    // 2026-07-22 -> 2026-08-06 = 15 jours exactement
    expect(alerte({ statut: 'depose', dateRealisation: '2026-07-22' })).toBe(
      null,
    );
  });

  it('ne signale rien juste sous le seuil', () => {
    expect(alerte({ statut: 'depose', dateRealisation: '2026-07-23' })).toBe(
      null,
    );
  });

  it('ne signale pas d enlisement sur une etape terminee', () => {
    expect(alerte({ statut: 'lance', dateRealisation: '2026-01-01' })).toBe(
      null,
    );
  });

  it('ne signale pas d enlisement sur une etape pas encore deposee', () => {
    expect(alerte({ statut: 'en_cours', dateRealisation: '2026-01-01' })).toBe(
      null,
    );
  });

  it('suit le seuil parametre', () => {
    expect(
      alerte({
        statut: 'depose',
        dateRealisation: '2026-08-01',
        seuilEnlisementJours: 3,
      }),
    ).toBe('enlise');
  });

  it('ne plante pas sur une etape deposee sans date de realisation', () => {
    expect(alerte({ statut: 'depose', dateRealisation: null })).toBe(null);
  });
});

describe('alerteEtape - priorite', () => {
  it('une etape deposee en retard sur objectif est enlisee, pas en retard', () => {
    // L'objectif est tenu au depot : le retard n'est plus le notre.
    expect(
      alerte({
        statut: 'depose',
        dateObjectif: '2026-01-01',
        dateRealisation: '2026-07-01',
      }),
    ).toBe('enlise');
  });

  it('une etape a venir sans objectif ne signale rien', () => {
    expect(alerte({ statut: 'non_commence' })).toBe(null);
  });
});
```

- [ ] **Step 3: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run __tests__/lancement-alertes.test.ts`
Attendu : ÉCHEC, `Failed to resolve import "@/lib/lancement/alertes"`.

- [ ] **Step 4: Écrire l'implémentation**

Créer `lib/lancement/alertes.ts` :

```ts
import type { LancementStatut } from './constants';

/**
 * Deux alertes distinctes, jamais stockees en base (elles dependent du jour
 * courant, une valeur stockee serait fausse des le lendemain) :
 *
 * - `en_retard` : la date d'objectif est passee et l'etape n'est toujours pas
 *   partie. Le retard est de NOTRE cote, c'est au CDP d'agir.
 * - `enlise` : l'etape est deposee depuis plus longtemps que le seuil sans
 *   etre terminee. L'objectif est tenu, mais le dossier dort chez le tiers
 *   instructeur. Il faut relancer, pas produire.
 *
 * Les confondre ferait porter au CDP la responsabilite d'un delai qui ne lui
 * appartient pas.
 */
export type AlerteEtape = 'en_retard' | 'enlise' | null;

export interface AlerteEtapeInput {
  statut: LancementStatut;
  /** Date d'objectif saisie, format ISO court (AAAA-MM-JJ). */
  dateObjectif: string | null;
  /** Posee par le trigger au passage en depose. Format ISO court. */
  dateRealisation: string | null;
  /** Jour courant, format ISO court. Injecte pour rendre la fonction pure. */
  aujourdHui: string;
  seuilEnlisementJours: number;
}

/** Nombre de jours entiers entre deux dates ISO courtes (AAAA-MM-JJ). */
function joursEntre(debut: string, fin: string): number {
  const d = Date.parse(`${debut}T00:00:00Z`);
  const f = Date.parse(`${fin}T00:00:00Z`);
  if (Number.isNaN(d) || Number.isNaN(f)) return 0;
  return Math.floor((f - d) / 86_400_000);
}

export function alerteEtape(input: AlerteEtapeInput): AlerteEtape {
  const {
    statut,
    dateObjectif,
    dateRealisation,
    aujourdHui,
    seuilEnlisementJours,
  } = input;

  // Enlisement d'abord : une etape deposee a tenu son objectif, quoi qu'en
  // dise la date d'objectif. Le seul reproche possible est le temps d'attente.
  if (statut === 'depose' && dateRealisation) {
    if (joursEntre(dateRealisation, aujourdHui) > seuilEnlisementJours) {
      return 'enlise';
    }
    return null;
  }

  // Une etape terminee ne peut plus rien signaler.
  if (statut === 'lance') return null;

  // Retard : l'objectif est passe et rien n'est parti. Comparaison de chaines
  // ISO courtes, valide car le format est de longueur fixe et zero-padde.
  if (dateObjectif && !dateRealisation && dateObjectif < aujourdHui) {
    return 'en_retard';
  }

  return null;
}
```

- [ ] **Step 5: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run __tests__/lancement-alertes.test.ts`
Attendu : PASS, 14 tests.

- [ ] **Step 6: Vérifier la non-régression des libellés**

Run: `npm test`
Attendu : suite verte. Si un test attendait `'Lancé'` ou `'Non commencé'`, mets-le à jour et signale-le.

Run: `npm run typecheck && npm run lint`

- [ ] **Step 7: Commit**

```bash
git add lib/lancement/constants.ts lib/lancement/alertes.ts __tests__/lancement-alertes.test.ts
git commit -m "feat(projet): alertes en retard et enlise sur les etapes

Fonction pure testee sur les bornes (pile au seuil, juste au-dessus,
juste en dessous). Le jour courant est injecte, jamais lu depuis la
fonction : sans cela les tests dependraient de la date d'execution.

Libelles renommes : 'Non commence' devient 'A venir', 'Lance' devient
'Termine'. Les cles restent figees par le CHECK en base."
```

---

## Task 4 : Lecture des données et saisie de la date

**Files:**

- Modify: `lib/queries/projet-lancement.ts`
- Modify: `lib/queries/parametres.ts`
- Modify: `lib/actions/projet-lancement.ts`

- [ ] **Step 1: Sélectionner les nouvelles colonnes**

Dans `lib/queries/projet-lancement.ts`, la requête sur `projet_lancement_etapes` sélectionne `'id, etape_key, statut, updated_at'`. Remplacer par :

```ts
      .select('id, etape_key, statut, updated_at, date_objectif, date_realisation')
```

- [ ] **Step 2: Lire le seuil d'enlisement**

Dans `lib/queries/parametres.ts`, ajouter, en suivant exactement le modèle de `getDelaiEcheanceJours` qui se trouve juste au-dessus :

```ts
/**
 * Seuil d'enlisement de la timeline de lancement, en jours. Lu depuis le
 * parametre `lancement.seuil_enlisement_jours` (modifiable dans
 * /admin/parametres). Fallback sur la constante si le parametre est absent,
 * vide ou invalide : un parametre mal saisi ne doit jamais faire disparaitre
 * l'alerte.
 */
export async function getSeuilEnlisementJours(): Promise<number> {
  const raw = await getParametreValeur('lancement.seuil_enlisement_jours');
  if (raw == null || raw.trim() === '') return DEFAUT_SEUIL_ENLISEMENT_JOURS;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : DEFAUT_SEUIL_ENLISEMENT_JOURS;
}
```

Ajoute l'import en tête du fichier :

```ts
import { DEFAUT_SEUIL_ENLISEMENT_JOURS } from '@/lib/lancement/constants';
```

- [ ] **Step 3: Ajouter le schéma de validation**

Dans `lib/actions/projet-lancement.ts`, à côté des autres schémas Zod, ajouter :

```ts
const SetDateObjectifSchema = z.object({
  projetId: uuidSchema,
  projetRef: projetRefSchema,
  etapeKey: etapeKeySchema,
  // null efface la date. Format ISO court impose : la colonne est un DATE.
  dateObjectif: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ')
    .nullable(),
});
```

- [ ] **Step 4: Écrire l'action**

Toujours dans `lib/actions/projet-lancement.ts`, juste après `setLancementEtapeStatut`, ajouter :

```ts
/**
 * Saisie (ou effacement) de la date d'objectif d'une etape. Memes droits que
 * le changement de statut : admin, CDP ou backup CDP du projet, applique par
 * RLS. On n'ecrit QUE date_objectif : date_realisation appartient au trigger.
 */
export async function setLancementEtapeDateObjectif(
  projetId: string,
  projetRef: string,
  etapeKey: string,
  dateObjectif: string | null,
): Promise<{ success: boolean; error?: string }> {
  const parsed = SetDateObjectifSchema.safeParse({
    projetId,
    projetRef,
    etapeKey,
    dateObjectif,
  });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }

  const auth = await requireAuth();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const { error } = await supabase.from('projet_lancement_etapes').upsert(
    {
      projet_id: parsed.data.projetId,
      etape_key: parsed.data.etapeKey,
      date_objectif: parsed.data.dateObjectif,
      updated_by: user.id,
    },
    { onConflict: 'projet_id,etape_key' },
  );

  if (error) {
    logger.error(
      'actions.projet-lancement',
      'setLancementEtapeDateObjectif failed',
      { error, projetId: parsed.data.projetId, etapeKey: parsed.data.etapeKey },
    );
    return {
      success: false,
      error: "Erreur lors de l'enregistrement de la date",
    };
  }

  logAudit(
    'lancement_date_objectif_updated',
    'projet_lancement_etape',
    parsed.data.projetId,
    {
      etape_key: parsed.data.etapeKey,
      date_objectif: parsed.data.dateObjectif,
    },
    user.id,
  );

  revalidatePath(`/projets/${parsed.data.projetRef}/lancement`);
  revalidatePath(`/projets/${parsed.data.projetRef}`);

  return { success: true };
}
```

**Point de vigilance** : l'upsert n'envoie pas `statut`. Sur une insertion (étape jamais touchée), la valeur par défaut `non_commence` de la colonne s'applique — c'est le comportement voulu. Vérifie-le à l'étape suivante plutôt que de le supposer.

- [ ] **Step 5: Vérifier l'upsert sans statut**

Run: `npm run typecheck`

Puis, en base locale, confirme qu'insérer une ligne sans `statut` donne bien `non_commence` :

```bash
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c "
  SELECT column_default FROM information_schema.columns
   WHERE table_name = 'projet_lancement_etapes' AND column_name = 'statut';"
```

Attendu : `'non_commence'::text`. Si la colonne n'a pas de défaut, l'upsert échouerait sur une étape neuve : signale-le, il faudra passer `statut` explicitement.

- [ ] **Step 6: Vérifier**

Run: `npm run typecheck && npm run lint && npm test`

- [ ] **Step 7: Commit**

```bash
git add lib/queries/projet-lancement.ts lib/queries/parametres.ts lib/actions/projet-lancement.ts
git commit -m "feat(projet): saisie de la date d'objectif et lecture du seuil

L'action n'ecrit que date_objectif : date_realisation appartient au
trigger, le code applicatif n'a pas a la connaitre."
```

---

## Task 5 : Interface

**Files:**

- Modify: `app/(dashboard)/projets/[ref]/lancement/page.tsx`
- Modify: `components/projets/projet-lancement-section.tsx`
- Modify: `components/projets/lancement-etape-item.tsx`

- [ ] **Step 1: Charger le seuil dans la page**

Dans `app/(dashboard)/projets/[ref]/lancement/page.tsx` :

- importer `getSeuilEnlisementJours` depuis `@/lib/queries/parametres` ;
- l'ajouter au `Promise.all` existant ;
- passer `seuilEnlisementJours` et `aujourdHui` à `ProjetLancementSection`.

`aujourdHui` se calcule côté serveur pour que toutes les étapes partagent la même date de référence :

```tsx
const aujourdHui = new Date().toISOString().slice(0, 10);
```

- [ ] **Step 2: Propager dans la section**

Dans `components/projets/projet-lancement-section.tsx` :

- ajouter `seuilEnlisementJours: number` et `aujourdHui: string` aux props ;
- construire une map des lignes complètes plutôt que du seul statut, pour disposer des deux dates :

```tsx
const etapeByKey = new Map(lancement.etapes.map((e) => [e.etape_key, e]));
```

Adapter `nbLancees` en conséquence (`etapeByKey.get(e.key)?.statut === 'lance'`).

- remplacer le libellé du compteur `{nbLancees}/{LANCEMENT_ETAPES.length} lancées` par `terminées` (cohérence avec le renommage du statut) ;
- passer à chaque `LancementEtapeItem` : `dateObjectif`, `dateRealisation`, `seuilEnlisementJours`, `aujourdHui`.

- [ ] **Step 3: Afficher dans l'étape**

Dans `components/projets/lancement-etape-item.tsx` :

**a)** Ajouter les 4 props à `LancementEtapeItemProps` :

```tsx
dateObjectif: string | null;
dateRealisation: string | null;
seuilEnlisementJours: number;
aujourdHui: string;
```

et à la déstructuration des paramètres du composant.

**b)** Ajouter les imports :

```tsx
import { setLancementEtapeDateObjectif } from '@/lib/actions/projet-lancement';
import { alerteEtape } from '@/lib/lancement/alertes';
```

(`setLancementEtapeStatut` est déjà importé depuis le même module : ajoute simplement le nom dans l'accolade existante.)

**c)** Juste après `const statutMeta = getLancementStatutMeta(statut);`, ajouter :

```tsx
const [savingDate, setSavingDate] = useState(false);
const alerte = alerteEtape({
  statut,
  dateObjectif,
  dateRealisation,
  aujourdHui,
  seuilEnlisementJours,
});
const joursDepuisDepot = dateRealisation
  ? Math.floor(
      (Date.parse(`${aujourdHui}T00:00:00Z`) -
        Date.parse(`${dateRealisation}T00:00:00Z`)) /
        86_400_000,
    )
  : 0;

async function handleDateObjectif(valeur: string) {
  setSavingDate(true);
  try {
    const result = await setLancementEtapeDateObjectif(
      projetId,
      projetRef,
      etapeKey,
      valeur === '' ? null : valeur,
    );
    if (result.success) {
      toast.success(
        valeur === ''
          ? 'Date d objectif effacée'
          : "Date d'objectif enregistrée",
      );
    } else {
      toast.error(result.error || "Erreur lors de l'enregistrement");
    }
  } catch {
    toast.error('Erreur inattendue');
  } finally {
    setSavingDate(false);
  }
}
```

**d)** Sur la ligne repliée, dans le `<button>`, juste après `<StatusBadge label={statutMeta.label} color={statutMeta.color} />`, insérer le badge d'alerte. Les deux couleurs sont valides pour `BadgeColor` (vérifié dans `components/shared/status-badge.tsx`) :

```tsx
{
  alerte === 'en_retard' && <StatusBadge label="En retard" color="red" />;
}
{
  alerte === 'enlise' && (
    <StatusBadge label={`Déposé depuis ${joursDepuisDepot} j`} color="orange" />
  );
}
```

**e)** Toujours sur la ligne repliée, dans le `<span className="text-muted-foreground ml-auto ...">`, **avant** le compteur de documents, insérer les dates. On n'affiche que ce qui existe, jamais un tiret de remplissage :

```tsx
{
  dateRealisation ? (
    <span className="hidden sm:inline">
      Déposé le {formatDate(dateRealisation)}
    </span>
  ) : (
    dateObjectif && (
      <span className="hidden sm:inline">
        Objectif {formatDate(dateObjectif)}
      </span>
    )
  );
}
```

Une seule des deux dates à la fois : une fois l'étape partie, l'objectif n'a plus d'intérêt au parcours, il reste consultable en dépliant.

**f)** Dans la zone dépliée, à l'intérieur du bloc `{canEdit && (...)}` qui contient les boutons de statut, ajouter la saisie sous les boutons. Un `<input type="date">` natif : pas de dépendance de calendrier, accessible au clavier.

```tsx
<label className="text-muted-foreground mt-2 flex w-full items-center gap-2 text-xs">
  Date d&apos;objectif
  <input
    type="date"
    defaultValue={dateObjectif ?? ''}
    disabled={savingDate}
    onChange={(e) => handleDateObjectif(e.target.value)}
    className="border-input bg-background rounded-md border px-2 py-1 text-xs"
  />
  {savingDate && <Loader2 className="size-3 animate-spin" />}
  {dateRealisation && <span>Déposé le {formatDate(dateRealisation)}</span>}
</label>
```

Note : le bloc `{canEdit && ...}` enveloppe aujourd'hui une `div` en `flex flex-wrap items-center gap-1.5`. Le `w-full` du label le fait passer à la ligne sous les boutons de statut.

**Contrainte de sobriété** : ce composant fait déjà 467 lignes et la fiche doit rester lisible. Les dates et l'alerte vont sur la **ligne repliée** de l'étape (celle toujours visible), la **saisie** va dans la zone dépliée, avec les documents et commentaires. Le CDP qui parcourt la timeline voit l'essentiel sans rien ouvrir.

- [ ] **Step 4: Vérifier**

Run: `npm run typecheck && npm run lint && npm test`
Attendu : tout vert.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/projets/[ref]/lancement/page.tsx" components/projets/projet-lancement-section.tsx components/projets/lancement-etape-item.tsx
git commit -m "feat(projet): dates et alertes visibles sur la timeline

Dates et badge d'alerte sur la ligne repliee (visibles au parcours),
saisie de l'objectif dans la zone depliee (action deliberee)."
```

---

## Task 6 : Vérification complète

- [ ] **Step 1: Suite complète**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Attendu : tout vert, les 6 routes projet toujours générées.

- [ ] **Step 2: Vérification en conditions réelles**

Le protocole est décrit dans `.claude/skills/verify/SKILL.md`. En résumé :

```bash
npx supabase status   # demarrer avec `npx supabase start` si besoin
eval "$(npx supabase status -o env | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=')"
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
  -v ON_ERROR_STOP=1 -f e2e/fixtures.sql
E2E_ADMIN_EMAIL=ci-admin@e2e.test E2E_ADMIN_PASSWORD='E2e-ci-Pass-2026!' \
  NEXT_PUBLIC_SUPABASE_URL=$API_URL SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY \
  npx tsx scripts/e2e-bootstrap.ts
PORT=3002 NEXT_PUBLIC_SUPABASE_URL=$API_URL NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY \
  SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY npx next dev -p 3002
```

**Piège rencontré au lot 0** : l'hydratation React échoue dans le headless shell, donc le formulaire de connexion part en GET. Contournement qui fonctionne : récupérer une session par `POST $API_URL/auth/v1/token?grant_type=password` puis injecter le cookie `sb-127-auth-token` valant `base64-` + base64 du JSON de session. Le binaire du cache Playwright peut aussi être corrompu : pointer `executablePath` sur `chromium_headless_shell-1223`.

Poser en base, sur le projet `0001-HEO-APP`, un jeu d'étapes qui couvre les trois cas, puis contrôler l'affichage :

```sql
-- etape en retard : objectif passe, rien de parti
UPDATE projet_lancement_etapes SET statut='en_cours', date_objectif='2026-07-01'
 WHERE etape_key='nda' AND projet_id=(SELECT id FROM projets WHERE ref='0001-HEO-APP');
-- etape enlisee : deposee il y a plus de 15 jours
UPDATE projet_lancement_etapes SET statut='depose', date_objectif='2026-07-01'
 WHERE etape_key='uai' AND projet_id=(SELECT id FROM projets WHERE ref='0001-HEO-APP');
UPDATE projet_lancement_etapes SET date_realisation='2026-07-01'
 WHERE etape_key='uai' AND projet_id=(SELECT id FROM projets WHERE ref='0001-HEO-APP');
```

Attendu à l'écran : NDA porte « En retard » en rouge, UAI porte « Déposé depuis 36 j » en orange, les autres étapes ne portent aucune alerte. Fais une capture.

Note : le trigger étant `BEFORE UPDATE`, forcer `date_realisation` demande une seconde requête après le passage en `depose` (la première la remet à la date du jour). C'est le comportement attendu, pas un bug.

- [ ] **Step 3: Nettoyer**

Supprimer tout script temporaire, arrêter le serveur du port 3002. Le Supabase local peut rester démarré.

- [ ] **Step 4: Commit, push et PR**

N'utilise **jamais** `git add -A` : une session parallèle travaille sur le dépôt.

```bash
git status --short
git push -u origin HEAD
```

Ouvre la PR en indiquant qu'elle s'empile sur le lot 0 (PR #140) et **qu'elle contient une migration à appliquer** : `npm run db:migrate:dry` puis `npm run db:migrate`, automatique en CI sur `main`.

---

## Points de vigilance

**La date de réalisation appartient au trigger.** Aucun code applicatif ne doit l'écrire. Si tu te retrouves à passer `date_realisation` dans un upsert, tu as pris le mauvais chemin : le trigger l'écrasera de toute façon, et la logique vivrait à deux endroits.

**Les alertes ne se stockent pas.** Elles dépendent du jour courant : une colonne `en_retard` serait fausse dès le lendemain sans que rien ne l'ait mise à jour. C'est pour ça que la fonction prend `aujourdHui` en paramètre plutôt que d'appeler `new Date()` elle-même, ce qui la rend aussi testable sur les bornes.

**Le renommage des libellés ne touche pas les clés.** `non_commence` et `lance` restent les valeurs en base, figées par un `CHECK`. Renommer une clé demanderait une migration de données et casserait l'historique d'audit.

**Le compteur de la synthèse continue de ne compter que `lance`.** Une étape déposée n'est pas terminée. Ne cède pas à la tentation de compter `depose` comme un demi-point.
