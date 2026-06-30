# Intégrité DB des `facture_lignes` — immutabilité post-émission + invariant SUM(lignes) = header

Date : 2026-06-30
Statut : **design (non implémenté)**

Deux invariants légaux des factures SOLUVIA sont aujourd'hui gardés **uniquement côté
applicatif**, alors que le HEADER (table `factures`) est déjà bétonné en base
(`freeze_facture_after_emission`, `factures_ttc_coherent_check`). On ferme la faille au niveau DB,
en miroir du couple devis (`recompute_devis_totaux`) / facture (`freeze_facture_after_emission`).

- **Chantier 1 — Immutabilité des lignes après émission (column-scoped).** `facture_lignes` n'a
  aucune garde DB : un admin peut `UPDATE`/`DELETE` les lignes d'une facture émise par
  SQL/PostgREST. Le total figé devient faux, le PDF et Odoo divergent. La subtilité : le push Odoo
  écrit légitimement `analytic_line_odoo_id` (et potentiellement `opco_code`) **après** émission →
  le gel doit être **scopé colonne par colonne**.
- **Chantier 2 — `SUM(facture_lignes.montant_ht) = factures.montant_ht` garanti par la base.**
  Aujourd'hui le recalcul vit dans `recomputeFactureTotaux` (app) qui, en cas d'échec d'`UPDATE`,
  **logge seulement un warning** ; et `sendFacture` ne recalcule pas à l'émission → un header stale
  peut être figé. On déplace l'autorité du recalcul en base.

Les deux chantiers partagent la même fonction de lecture (statut du parent) et se déploient dans la
même migration. Aucun n'altère de ligne existante : les triggers n'agissent que sur les écritures
futures (point clé pour la précondition data, §Précondition).

---

## Problème (preuve fichier:ligne)

### Chantier 1 — lignes mutables post-émission

- `supabase/migrations/00030_rls_policies.sql:109-111` : `facture_lignes_insert/update/delete` sont
  ouverts à `is_admin()` **sans condition de statut**. RLS autorise donc tout admin (ou tout appel
  service-role / PostgREST direct) à muter les lignes d'une facture émise.
- L'immutabilité repose à 100 % sur `assertBrouillon()`
  (`lib/actions/facture-lignes.ts:129-160`, appelée en `:190`, `:293`, `:369`) qui rejette si
  `statut !== 'a_emettre'`. C'est une garde **applicative** : un `UPDATE`/`DELETE` SQL direct la
  contourne intégralement.
- Le HEADER, lui, est gelé : `freeze_facture_after_emission`
  (`supabase/migrations/20260515120000_factures_integrity_guards.sql:55-128`) interdit toute modif
  des champs financiers une fois sorti de `a_emettre`. Les lignes — source de vérité du PDF
  (`lib/odoo/attach-pdf.ts:48`) et du CA analytique (`lib/odoo/sync.ts:235-260`) — ne le sont pas.
  Asymétrie : on peut figer un header correct, puis réécrire les lignes par-dessous.

**Contrainte de column-scoping (sinon on casse le sync).** `lib/odoo/sync.ts:255-260` écrit
`facture_lignes.analytic_line_odoo_id` **après** émission (idempotence du push analytique). Un gel
brut « aucune modif post-émission » casserait ce write. Le gel doit **autoriser**
`analytic_line_odoo_id` et `opco_code`, et **rejeter** tout le reste (`montant_ht`, `contrat_id`,
`description`, `taux_tva_ligne`, `event_type`, `event_source_id`, `mois_relatif`, `quote_part`,
`npec_snapshot`, `taux_commission_snapshot`, `est_avoir`) ainsi que `INSERT`/`DELETE`.

Audit des writes post-émission (grep `from('facture_lignes').update` sur `lib/` + `app/`) :
le **seul** write sur une facture non-brouillon est `analytic_line_odoo_id` (`lib/odoo/sync.ts`).
`lib/eduvia/sync.ts:768-772` ne fait que `SELECT`. `opco_code` n'est écrit qu'à la création
(brouillon) et par le backfill one-shot `20260524120100`. → l'allowlist {`analytic_line_odoo_id`,
`opco_code`} couvre tous les writes légitimes post-émission, sans surface morte.

### Chantier 2 — invariant somme non garanti en base

- `recomputeFactureTotaux` (`lib/actions/facture-lignes.ts:64-104`) recalcule côté app après chaque
  mutation de ligne, puis `UPDATE factures`. En cas d'échec :
  `logger.warn(... 'recompute totaux failed' ...)` (`:100-104`) — **le warning ne propage pas**.
  Les lignes ont changé, le header reste stale, l'utilisateur voit le mauvais montant, et rien
  n'échoue.
- `sendFacture` (`lib/actions/factures/emission.ts:149-155`) fait `UPDATE { statut }` sans recalcul.
  Si le header était déjà stale (échec silencieux ci-dessus, ou write SQL direct du header sur un
  brouillon), **on fige un header faux** : `freeze_facture_after_emission` le verrouille ensuite tel
  quel.
- `factures_ttc_coherent_check`
  (`supabase/migrations/20260515120000_factures_integrity_guards.sql:32-34`) ne vérifie que
  `montant_ttc = montant_ht + montant_tva` : la cohérence **interne** du header, pas son lien aux
  lignes. Un header `(ht=999, tva=199.8, ttc=1198.8)` passe le check même si `SUM(lignes)=100`.

### Template existant à imiter

`recompute_devis_totaux` (`supabase/migrations/20260523100100_devis_lignes_table.sql:34-76`) est
exactement le pattern voulu, côté devis : `AFTER INSERT/UPDATE/DELETE` sur `devis_lignes`,
récupère le statut parent, **rejette si le devis n'est plus `brouillon`**, sinon recalcule le header
par agrégat. On l'adapte aux factures avec la nuance « uniquement tant que `statut = 'a_emettre'` »,
et on dédouble la responsabilité (immutabilité vs recompute) en deux triggers parce que les timings
diffèrent (`BEFORE` pour rejeter, `AFTER` pour recalculer).

---

## Objectif / Invariants à préserver

**Objectifs :**

1. Une facture sortie de `a_emettre` a ses lignes **immutables en base** — sauf `analytic_line_odoo_id`
   et `opco_code` (sync Odoo). `INSERT`/`DELETE` de lignes interdits post-émission.
2. À l'émission et au-delà, `montant_ht/tva/ttc` du header **égalent** l'agrégat des lignes, garanti
   par la base, plus seulement par l'app.

**Invariants transverses à NE PAS casser :**

- **Gapless** : aucune touche à `assign_facture_ref_on_send` / `numero_seq`.
- **Aucun DELETE de `factures`** : inchangé ; les triggers portent sur `facture_lignes`.
- **Cents entiers** : le recompute préserve la précision `NUMERIC(12,2)` ; parité exacte avec
  `computeFactureTotaux` (cf. §Composants, `round_half_up`).
- **Immutabilité header post-émission** : `freeze_facture_after_emission` reste l'autorité ; le
  recompute ne touche le header que tant que `a_emettre` (chantier 2 trigger ligne) ou pendant la
  transaction d'émission elle-même (chantier 2 filet, où `OLD.statut = 'a_emettre'` → freeze laisse
  passer).
- **`projet_id NOT NULL`** : inchangé.
- **Push Odoo post-émission** (`analytic_line_odoo_id`/`opco_code`) : explicitement autorisé par
  l'allowlist.
- **CASCADE delete des brouillons** (`brouillon-mutations.ts:70` puis delete facture, et policy
  `admin_delete_brouillon_factures`) : le gel doit laisser passer quand le parent a déjà disparu
  (cf. garde `v_statut IS NULL`).
- **Avoirs** (montants ≤ 0) : le recompute somme des lignes négatives → header négatif cohérent avec
  `factures_signe_montants_check`.
- **Migration non contraignante sans précondition vérifiée** (Supavia applique au merge) :
  on choisit _recompute_ (convergence) plutôt que _validation_ (rejet), justement pour ne pas
  transformer une incohérence figée existante en échec de write futur (cf. §Conception et
  §Précondition).

---

## Conception (2 triggers + 1 filet d'émission)

### Composant 1 — gel column-scoped sur `facture_lignes` (`BEFORE INSERT/UPDATE/DELETE`)

**Récupération du statut parent.** Comme `recompute_devis_totaux`, on lit le statut de la facture
parente via `COALESCE(NEW.facture_id, OLD.facture_id)`. Trois branches :

- parent absent (`v_statut IS NULL`) → **laisser passer** (cas du CASCADE : la facture est déjà
  supprimée quand le `BEFORE DELETE` des lignes filles se déclenche ; bloquer ici casserait la
  suppression de brouillon) ;
- `a_emettre` → **tout permis** (CRUD lignes normal du brouillon) ;
- sinon (émise/avoir/payée/en_retard) → `INSERT`/`DELETE` **rejetés** ; `UPDATE` rejeté **sauf** si
  seules `analytic_line_odoo_id`/`opco_code` changent.

**Column-scoping : allowlist par soustraction JSON (choix retenu) vs denylist explicite.**

- _Alternative A — denylist explicite façon `freeze_facture_after_emission`_ : une cascade de
  `IF NEW.col IS DISTINCT FROM OLD.col THEN RAISE`. Lisible et homogène avec le header, mais
  **fragile à l'évolution du schéma** : toute future colonne ajoutée à `facture_lignes` serait
  _mutable par défaut_ (oubli silencieux) sur une table à valeur légale. C'est exactement le risque
  qu'on ferme.
- _Alternative B — allowlist par soustraction JSON (retenu)_ :
  `(to_jsonb(NEW) - 'analytic_line_odoo_id' - 'opco_code') IS DISTINCT FROM (to_jsonb(OLD) - ...)`.
  Toute colonne hors allowlist est **gelée par défaut**, y compris les colonnes futures. Comparaison
  insensible à l'ordre des champs, gère `NULL` via `IS DISTINCT FROM`. Coût négligeable (une ligne à
  la fois, write post-émission rarissime).

**Choix : B.** La table porte une valeur légale ; le défaut sûr est « gelé », l'exception est
nommée. On documente l'allowlist en commentaire (pointeur vers `lib/odoo/sync.ts`).

Timing `BEFORE` (et pas `AFTER`) : on veut **rejeter avant** que le write ne touche la table.
Cohabitation avec `trg_facture_lignes_est_avoir` (`BEFORE INSERT`, `:95-98`) : ordre alphabétique
des triggers `e` < `f` → `est_avoir` peuple `NEW.est_avoir` d'abord, puis le gel statue. Sans
impact (sur `a_emettre` le gel laisse passer ; post-émission l'`INSERT` est rejeté de toute façon).

### Composant 2 — invariant SUM(lignes) = header

Deux mécanismes complémentaires, et un choix d'architecture motivé ci-dessous.

**2a. Trigger `AFTER INSERT/UPDATE/DELETE` sur `facture_lignes`** : tant que le parent est
`a_emettre`, recalcule `factures.montant_ht/tva/ttc/taux_tva` depuis l'agrégat des lignes (miroir
exact de `recompute_devis_totaux`, mais conditionné `a_emettre` au lieu de rejeter). Si le parent
n'est pas `a_emettre` (ou absent), **no-op** : on ne touche pas un header gelé, et le seul write
post-émission (`analytic_line_odoo_id`/`opco_code`) ne change aucun montant donc ne doit rien
recalculer.

**2b. Filet d'émission `BEFORE UPDATE OF statut` sur `factures`** : au passage
`a_emettre → emise/avoir`, re-dérive `NEW.montant_ht/tva/ttc/taux_tva` depuis les lignes **dans la
transaction d'émission elle-même**. C'est le verrou qui ferme le trou « header stale figé » :
`sendFacture` ne recalcule pas, et un `UPDATE factures.montant_ht` direct sur un brouillon (qui ne
déclenche pas 2a, car il ne touche pas de ligne) pourrait désynchroniser le header avant émission.
2b garantit que **le header figé == SUM(lignes) au moment précis du gel**. Comme `OLD.statut =
'a_emettre'`, `freeze_facture_after_emission` laisse passer (il ne contrôle qu'`OLD.statut !=
'a_emettre'`), quel que soit l'ordre des triggers.

#### DEFERRABLE CONSTRAINT vs trigger AFTER — choix motivé

On veut « SUM(lignes) = header ». Pourquoi **trigger de recompute (convergence)** et **pas une
contrainte de validation (rejet)**, fût-elle `DEFERRABLE` :

1. **Un `CHECK` ne peut pas agréger une autre table.** `CHECK (montant_ht = SUM(facture_lignes...))`
   est impossible (un CHECK ne voit que la ligne courante). Il faudrait un **`CONSTRAINT TRIGGER`
   `DEFERRABLE INITIALLY DEFERRED`** qui fait l'agrégat à la fin de transaction et `RAISE` si écart.
2. **Le flow applicatif insère header et lignes dans des transactions SÉPARÉES.** PostgREST exécute
   chaque appel dans sa propre transaction : `createBrouillon` insère la `facture` (1 round-trip)
   puis les `lignes` (round-trip suivant) — cf. `brouillon-libre.ts:151-153`,
   `brouillon-from-events.ts:331-333`, `brouillon-echeancier.ts:195`. Un `DEFERRABLE` ne diffère
   **qu'à la fin de SA transaction**. La transaction du `INSERT factures` committe avec 0 ligne et
   `header != 0` → **violation immédiate**, alors que l'état est légitime. Rendre la contrainte
   viable imposerait de tout réécrire en une seule RPC transactionnelle (refonte lourde de la
   couche `factures/brouillon-*`). Hors scope, et fragilisant.
3. **Une validation casserait des writes futurs sur des données figées incohérentes.** S'il existe
   en prod des factures émises où `SUM(lignes) != montant_ht` (cf. §Précondition), une contrainte de
   validation transformerait le **prochain** `UPDATE analytic_line_odoo_id` du sync Odoo sur ces
   factures en échec dur. Un trigger de recompute, lui, **ne touche jamais une facture non
   `a_emettre`** → zéro régression sur l'existant.

→ **Choix : trigger `AFTER` de recompute (2a) + filet `BEFORE` d'émission (2b).** Pour ce schéma et
ce flow, c'est **strictement plus fort** qu'une contrainte : la convergence se fait dans la même
transaction que le write de ligne (atomique : si l'`UPDATE factures` échoue, tout le write de ligne
rollback), et aucune ligne existante n'est jamais réévaluée. On n'introduit **pas** de
`DEFERRABLE CONSTRAINT`.

#### Le trigger remplace-t-il ou double-t-il `recomputeFactureTotaux` (app) ?

**Il le remplace** (autorité unique en base), pour deux raisons :

- **Robustesse** : 2a tourne dans la transaction du write de ligne et **abort atomique** en cas
  d'échec ; l'app ne fait qu'un round-trip séparé qui **warn-only** sur échec
  (`facture-lignes.ts:100-104`) — le bug actif. Deux sources de vérité = risque de dérive de
  formule.
- **Simplicité** : une fois 2a en place, l'`UPDATE factures` de `recomputeFactureTotaux` devient
  redondant et la voie warn-only disparaît.

Plan de retrait (ordonné après la migration, cf. §Déploiement) : supprimer dans
`recomputeFactureTotaux` l'`UPDATE factures { montant_ht, montant_tva, montant_ttc, taux_tva }`
(`facture-lignes.ts:88-104`). On **conserve** l'observabilité d'écart facture↔échéances
(`:106-126`), qui est une logique métier orthogonale (et ne touche pas le header). Les appels
`addLigne/updateLigne/removeLigne` n'ont alors plus besoin de déclencher le recompute pour le
header. Tant que ce retrait n'est pas fait, app + trigger **co-existent sans conflit** (le trigger
écrit la même valeur, l'app la réécrit à l'identique) — le doublon est inoffensif, juste transitoire.

---

## Composants (SQL exact)

Migration cible (à créer par le contrôleur, **non** dans cette spec) :
`supabase/migrations/20260630140000_facture_lignes_integrite_db.sql`.

### 1. Gel column-scoped des lignes

```sql
-- Immutabilite des lignes apres emission, column-scoped.
-- Gele post-emission : montant_ht, contrat_id, description, taux_tva_ligne,
--   event_type, event_source_id, mois_relatif, quote_part, npec_snapshot,
--   taux_commission_snapshot, est_avoir, facture_id, created_at, id.
-- AUTORISE post-emission : analytic_line_odoo_id, opco_code (push Odoo,
--   cf. lib/odoo/sync.ts:255-260). Allowlist par soustraction JSON : toute
--   future colonne est gelee par defaut (defaut sur pour une table legale).
CREATE OR REPLACE FUNCTION freeze_facture_lignes_after_emission()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_facture_id UUID;
  v_statut     statut_facture;
  v_ref        TEXT;
BEGIN
  v_facture_id := COALESCE(NEW.facture_id, OLD.facture_id);
  SELECT statut, ref INTO v_statut, v_ref FROM factures WHERE id = v_facture_id;

  -- Parent absent (CASCADE delete du brouillon : la facture parente est deja
  -- supprimee quand le BEFORE DELETE des lignes filles se declenche).
  IF v_statut IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Brouillon : CRUD lignes libre.
  IF v_statut = 'a_emettre' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Facture emise/avoir/payee/en_retard : immuable.
  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION
      'Facture %: ajout de ligne interdit apres emission (statut=%). Emettez un avoir.',
      v_ref, v_statut;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'Facture %: suppression de ligne interdite apres emission (statut=%). Emettez un avoir.',
      v_ref, v_statut;
  END IF;

  -- UPDATE : seules analytic_line_odoo_id et opco_code sont modifiables.
  IF (to_jsonb(NEW) - 'analytic_line_odoo_id' - 'opco_code')
       IS DISTINCT FROM
     (to_jsonb(OLD) - 'analytic_line_odoo_id' - 'opco_code') THEN
    RAISE EXCEPTION
      'Facture %: lignes immutables apres emission (statut=%). Seuls analytic_line_odoo_id et opco_code (sync Odoo) sont modifiables.',
      v_ref, v_statut;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION freeze_facture_lignes_after_emission() SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_facture_lignes_freeze_after_emission ON facture_lignes;
CREATE TRIGGER trg_facture_lignes_freeze_after_emission
BEFORE INSERT OR UPDATE OR DELETE ON facture_lignes
FOR EACH ROW EXECUTE FUNCTION freeze_facture_lignes_after_emission();
```

### 2a. Recompute du header depuis les lignes (tant que brouillon)

```sql
-- Recalcule le header facture depuis l'agregat des lignes, TANT QUE
-- statut='a_emettre'. Parite EXACTE avec computeFactureTotaux
-- (lib/utils/facture-totaux.ts) : round_half_up(x) = floor(x + 0.5) reproduit
-- Math.round (JS, demi vers +inf), y compris pour les avoirs (montants < 0).
-- TVA par ligne : round_half_up(montant_ht * taux_ligne) / 100, taux_ligne =
-- COALESCE(taux_tva_ligne, header.taux_tva, 20). Cumul puis round2.
CREATE OR REPLACE FUNCTION recompute_facture_totaux()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_facture_id  UUID;
  v_statut      statut_facture;
  v_taux_header NUMERIC(5,2);
  v_ht          NUMERIC(12,2);
  v_tva         NUMERIC(12,2);
BEGIN
  v_facture_id := COALESCE(NEW.facture_id, OLD.facture_id);
  SELECT statut, COALESCE(taux_tva, 20) INTO v_statut, v_taux_header
  FROM factures WHERE id = v_facture_id;

  -- Parent absent (cascade) ou deja emis : pas de recalcul (header gele ;
  -- le seul write post-emission ne touche aucun montant).
  IF v_statut IS DISTINCT FROM 'a_emettre' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT
    COALESCE(floor(SUM(montant_ht) * 100 + 0.5) / 100, 0),
    COALESCE(SUM(floor(montant_ht * COALESCE(taux_tva_ligne, v_taux_header) + 0.5) / 100), 0)
  INTO v_ht, v_tva
  FROM facture_lignes
  WHERE facture_id = v_facture_id;

  v_tva := floor(v_tva * 100 + 0.5) / 100;  -- round2 du cumul TVA

  UPDATE factures
     SET montant_ht  = v_ht,
         montant_tva = v_tva,
         montant_ttc = floor((v_ht + v_tva) * 100 + 0.5) / 100,
         taux_tva    = CASE WHEN v_ht <> 0
                            THEN floor((v_tva / v_ht) * 100 * 100 + 0.5) / 100
                            ELSE v_taux_header END
   WHERE id = v_facture_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

ALTER FUNCTION recompute_facture_totaux() SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_facture_lignes_recompute ON facture_lignes;
CREATE TRIGGER trg_facture_lignes_recompute
AFTER INSERT OR UPDATE OR DELETE ON facture_lignes
FOR EACH ROW EXECUTE FUNCTION recompute_facture_totaux();
```

> **Pas de récursion** : l'`UPDATE factures` ne touche ni `statut` ni `est_avoir`, donc ne déclenche
> ni `assign_facture_ref_on_send` (`BEFORE UPDATE OF statut`) ni `factures_propagate_est_avoir`
> (`AFTER UPDATE OF est_avoir`), et n'écrit aucune `facture_lignes`. `freeze_facture_after_emission`
> voit `OLD.statut='a_emettre'` et passe.

### 2b. Filet d'émission sur `factures`

```sql
-- Re-derive le header depuis les lignes au moment EXACT de l'emission
-- (a_emettre -> emise/avoir), pour ne jamais figer un header stale.
-- BEFORE UPDATE OF statut : freeze_facture_after_emission (OLD.statut=a_emettre)
-- laisse passer quel que soit l'ordre des triggers.
CREATE OR REPLACE FUNCTION recompute_facture_totaux_on_emission()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_taux_header NUMERIC(5,2) := COALESCE(NEW.taux_tva, 20);
  v_ht          NUMERIC(12,2);
  v_tva         NUMERIC(12,2);
BEGIN
  IF OLD.statut <> 'a_emettre' OR NEW.statut = 'a_emettre' THEN
    RETURN NEW;
  END IF;

  SELECT
    COALESCE(floor(SUM(montant_ht) * 100 + 0.5) / 100, 0),
    COALESCE(SUM(floor(montant_ht * COALESCE(taux_tva_ligne, v_taux_header) + 0.5) / 100), 0)
  INTO v_ht, v_tva
  FROM facture_lignes WHERE facture_id = NEW.id;

  v_tva := floor(v_tva * 100 + 0.5) / 100;

  NEW.montant_ht  := v_ht;
  NEW.montant_tva := v_tva;
  NEW.montant_ttc := floor((v_ht + v_tva) * 100 + 0.5) / 100;
  NEW.taux_tva    := CASE WHEN v_ht <> 0
                          THEN floor((v_tva / v_ht) * 100 * 100 + 0.5) / 100
                          ELSE v_taux_header END;
  RETURN NEW;
END;
$$;

ALTER FUNCTION recompute_facture_totaux_on_emission() SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_factures_recompute_on_emission ON factures;
CREATE TRIGGER trg_factures_recompute_on_emission
BEFORE UPDATE OF statut ON factures
FOR EACH ROW EXECUTE FUNCTION recompute_facture_totaux_on_emission();
```

> **Ordre des triggers `BEFORE UPDATE` sur `factures`** (alphabétique) :
> `trg_factures_assign_ref_on_send` < `trg_factures_freeze_after_emission` <
> `trg_factures_recompute_on_emission` < `trg_factures_updated`. Sans conflit : `assign_ref` pose
> `ref/numero_seq`, `freeze` passe (OLD=`a_emettre`), `recompute_on_emission` pose les montants,
> `updated` pose `updated_at`. Tous écrivent des colonnes disjointes.

---

## Plan TDD + ordre de déploiement

**TDD (red → green) :**

1. Écrire `supabase/tests/25_facture_lignes_integrite_db.sql` (cf. §Tests) **avant** la migration ;
   `supabase test db` doit **échouer** (triggers absents).
2. Écrire la migration `20260630140000_facture_lignes_integrite_db.sql` (les 3 blocs ci-dessus).
3. `supabase test db` doit **passer** ; `supabase db reset` rejoue toute la chaîne sans erreur.

**Ordre de déploiement (gating Supavia au merge) :**

1. **Vérifier les préconditions PROD** (§Précondition) — bloquant. Les triggers étant
   _recompute_-not-_validate_, ils ne rendent la migration contraignante sur **aucune** ligne
   existante ; les requêtes servent à mesurer l'exposition légale et à planifier les avoirs
   correctifs, pas à débloquer le merge.
2. **Merge migration** (3 triggers). Additive : ne réécrit aucune donnée existante (aucun
   `UPDATE`/backfill dans la migration). Sûre au sens Supavia.
3. **Après** que la migration est en prod : retrait du recompute applicatif
   (`recomputeFactureTotaux` → supprimer l'`UPDATE factures`, garder l'observabilité échéances).
   Cet ordre garantit qu'à aucun instant le header n'est sans autorité : tant que l'app écrit, le
   trigger écrit la même valeur ; quand l'app cesse, le trigger a déjà l'autorité.

---

## Tests pgTAP concrets

Fichier `supabase/tests/25_facture_lignes_integrite_db.sql`, calqué sur
`supabase/tests/21_factures_projet_libre.sql` (mêmes helpers `_ctx`, `societes_emettrices code='SOL'`,
`get_or_create_projet_libre`, lignes à `contrat_id NULL`).

```sql
-- ===========================================================================
-- Test : integrite DB facture_lignes (20260630140000)
--   * immutabilite column-scoped post-emission
--   * SUM(lignes) = header (recompute brouillon + filet emission)
-- ===========================================================================
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(11);

CREATE TEMP TABLE _ctx (admin_id UUID, client_id UUID, libre_id UUID, fac_id UUID, ligne_id UUID);
INSERT INTO _ctx (admin_id, client_id) VALUES (gen_random_uuid(), gen_random_uuid());
INSERT INTO auth.users (id, email) SELECT admin_id, 'admin-fl@test.local' FROM _ctx;
INSERT INTO public.users (id, email, prenom, nom, role)
  SELECT admin_id, 'admin-fl@test.local', 'Admin', 'FL', 'admin'::role_utilisateur FROM _ctx;
INSERT INTO clients (id, raison_sociale, trigramme, is_demo, archive)
  SELECT client_id, 'Test FL Integrite', 'TFI', false, false FROM _ctx;
UPDATE _ctx SET libre_id = get_or_create_projet_libre((SELECT client_id FROM _ctx));

-- Brouillon avec header volontairement FAUX (montant_ht=999) pour prouver le recompute.
INSERT INTO factures (projet_id, client_id, date_emission, date_echeance, mois_concerne,
                      montant_ht, taux_tva, montant_tva, montant_ttc, statut, est_avoir,
                      societe_emettrice_id)
SELECT libre_id, client_id, '2026-06-01', '2026-07-31', '2026-06',
       999, 20, 199.80, 1198.80, 'a_emettre', false,
       (SELECT id FROM societes_emettrices WHERE code='SOL') FROM _ctx
RETURNING id INTO STRICT (SELECT 1); -- placeholder
```

> Note d'implémentation : pgTAP n'a pas de `RETURNING INTO` hors fonction ; on capte les ids via
> `UPDATE _ctx SET ... = (SELECT ...)` après chaque INSERT, exactement comme le fait le test 21
> pour `libre_id`. Forme concrète des assertions :

```sql
-- ----- A1 : INSERT de ligne autorise sur brouillon -----
SELECT lives_ok($$
  INSERT INTO facture_lignes (facture_id, contrat_id, description, montant_ht, taux_tva_ligne)
  SELECT fac_id, NULL, 'Ligne A', 100, 20 FROM _ctx
$$, 'INSERT ligne autorise tant que a_emettre');

-- ----- A2 : recompute brouillon -> header aligne sur SUM(lignes) malgre le header faux -----
SELECT is((SELECT montant_ht  FROM factures WHERE id=(SELECT fac_id FROM _ctx)), 100::numeric(12,2),
          'recompute (a_emettre): montant_ht = SUM(lignes) (header faux ecrase)');
SELECT is((SELECT montant_tva FROM factures WHERE id=(SELECT fac_id FROM _ctx)), 20::numeric(12,2),
          'recompute (a_emettre): montant_tva = round_half_up(100*20)/100');
SELECT is((SELECT montant_ttc FROM factures WHERE id=(SELECT fac_id FROM _ctx)), 120::numeric(12,2),
          'recompute (a_emettre): montant_ttc = ht + tva');

-- ----- A3 : 2e ligne, recompute cumulatif -----
SELECT lives_ok($$
  INSERT INTO facture_lignes (facture_id, contrat_id, description, montant_ht, taux_tva_ligne)
  SELECT fac_id, NULL, 'Ligne B', 50, 20 FROM _ctx
$$, 'INSERT 2e ligne autorise');
SELECT is((SELECT montant_ht FROM factures WHERE id=(SELECT fac_id FROM _ctx)), 150::numeric(12,2),
          'recompute cumulatif: montant_ht = 150');

-- ----- A4 : filet d'emission. On desynchronise le header A LA MAIN puis on emet. -----
-- (UPDATE direct du header sur brouillon : autorise, ne declenche pas le trigger ligne.)
UPDATE factures SET montant_ht=1, montant_tva=0, montant_ttc=1 WHERE id=(SELECT fac_id FROM _ctx);
UPDATE factures SET statut='emise' WHERE id=(SELECT fac_id FROM _ctx);  -- emission
SELECT is((SELECT montant_ht FROM factures WHERE id=(SELECT fac_id FROM _ctx)), 150::numeric(12,2),
          'filet emission: header re-derive depuis lignes (150), header stale corrige');
SELECT isnt((SELECT ref FROM factures WHERE id=(SELECT fac_id FROM _ctx)), NULL,
          'emission: ref gapless attribue (assign_ref_on_send intact)');

-- capture une ligne pour les tests post-emission
UPDATE _ctx SET ligne_id =
  (SELECT id FROM facture_lignes WHERE facture_id=(SELECT fac_id FROM _ctx) AND description='Ligne A');

-- ----- A5 : UPDATE montant_ht d'une ligne post-emission -> REJETE -----
SELECT throws_ok($$
  UPDATE facture_lignes SET montant_ht=999 WHERE id=(SELECT ligne_id FROM _ctx)
$$, 'P0001', NULL, 'UPDATE montant_ht ligne post-emission rejete (immutabilite)');

-- ----- A6 : DELETE ligne post-emission -> REJETE -----
SELECT throws_ok($$
  DELETE FROM facture_lignes WHERE id=(SELECT ligne_id FROM _ctx)
$$, 'P0001', NULL, 'DELETE ligne post-emission rejete (immutabilite)');

-- ----- A7 : INSERT ligne post-emission -> REJETE -----
SELECT throws_ok($$
  INSERT INTO facture_lignes (facture_id, contrat_id, description, montant_ht, taux_tva_ligne)
  SELECT fac_id, NULL, 'Ligne illegale', 10, 20 FROM _ctx
$$, 'P0001', NULL, 'INSERT ligne post-emission rejete (immutabilite)');

-- ----- A8 : UPDATE analytic_line_odoo_id post-emission -> AUTORISE (sync Odoo) -----
SELECT lives_ok($$
  UPDATE facture_lignes SET analytic_line_odoo_id='AL-123' WHERE id=(SELECT ligne_id FROM _ctx)
$$, 'UPDATE analytic_line_odoo_id autorise post-emission (push Odoo)');

-- ----- A9 : ce write ne reactive PAS le recompute (header inchange) -----
SELECT is((SELECT montant_ht FROM factures WHERE id=(SELECT fac_id FROM _ctx)), 150::numeric(12,2),
          'write analytic post-emission ne recalcule pas le header (no-op recompute)');

SELECT * FROM finish();
ROLLBACK;
```

> Couverture : immutabilité lignes post-émission rejetée (A5/A6/A7) ; `analytic_line_odoo_id`
> autorisé post-émission (A8) sans réveiller le recompute (A9) ; `SUM != header` corrigé tant que
> `a_emettre` (A2/A3) ; filet d'émission qui re-dérive un header stale (A4). Un test jumeau
> `opco_code` (lives_ok) double A8 pour la 2e colonne de l'allowlist. Les codes `P0001` = `RAISE
EXCEPTION` PL/pgSQL.

---

## Précondition data à vérifier en PROD avant la pose

Les triggers sont **recompute-not-validate** : ils n'agissent que sur les writes futurs et ne
réévaluent **aucune** ligne déjà émise → la pose ne casse mécaniquement rien. Les requêtes ci-dessous
servent à (1) mesurer l'exposition légale existante, (2) confirmer que le choix recompute était le
bon, (3) anticiper les headers de brouillons qui vont bouger.

**P1 — Factures NON-brouillon déjà incohérentes `SUM(lignes) != montant_ht`** (exposition légale :
PDF/Odoo potentiellement divergents ; à corriger par AVOIR, jamais par UPDATE — header gelé) :

```sql
SELECT f.id, f.ref, f.statut, f.montant_ht AS header_ht,
       COALESCE(SUM(fl.montant_ht), 0) AS lignes_ht,
       f.montant_ht - COALESCE(SUM(fl.montant_ht), 0) AS ecart
FROM factures f
LEFT JOIN facture_lignes fl ON fl.facture_id = f.id
WHERE f.statut <> 'a_emettre'
GROUP BY f.id, f.ref, f.statut, f.montant_ht
HAVING f.montant_ht <> COALESCE(SUM(fl.montant_ht), 0)
ORDER BY ABS(f.montant_ht - COALESCE(SUM(fl.montant_ht), 0)) DESC;
```

> Si > 0 ligne : **ne bloque pas la migration**, mais aurait fait échouer une contrainte de
> validation sur le prochain `UPDATE analytic_line_odoo_id` du sync → justifie a posteriori le choix
> recompute. Traiter ces factures par avoir.

**P2 — Factures émises sans aucune ligne mais `montant_ht <> 0`** (anomalie ; le filet 2b ne les
retouche pas car déjà émises) :

```sql
SELECT f.id, f.ref, f.statut, f.montant_ht
FROM factures f
WHERE f.statut <> 'a_emettre'
  AND f.montant_ht <> 0
  AND NOT EXISTS (SELECT 1 FROM facture_lignes fl WHERE fl.facture_id = f.id);
```

**P3 — Brouillons (`a_emettre`) incohérents** (seront silencieusement recalculés au prochain edit de
ligne **ou** à l'émission — compter pour anticiper le shift de header affiché) :

```sql
SELECT count(*) FROM (
  SELECT f.id
  FROM factures f
  LEFT JOIN facture_lignes fl ON fl.facture_id = f.id
  WHERE f.statut = 'a_emettre'
  GROUP BY f.id, f.montant_ht
  HAVING f.montant_ht <> COALESCE(SUM(fl.montant_ht), 0)
) t;
```

**P4 — Lignes orphelines** (la FK `facture_lignes.facture_id` devrait l'empêcher ; vérif défensive,
attendu = 0) :

```sql
SELECT fl.id
FROM facture_lignes fl
LEFT JOIN factures f ON f.id = fl.facture_id
WHERE f.id IS NULL;
```

**P5 — Audit code (déjà fait dans cette spec, à reconfirmer au merge)** : `grep`
`from('facture_lignes').update` sur `lib/` + `app/` → l'unique write sur facture non-brouillon doit
rester `analytic_line_odoo_id` (`lib/odoo/sync.ts:255-260`). Tout autre write post-émission
découvert exigerait d'élargir l'allowlist (sinon régression).

---

## Risques

- **Parité de formule app↔trigger.** Tant que `recomputeFactureTotaux` (app) n'est pas retiré
  (déploiement étape 3), app et trigger co-écrivent le header. Risque nul si la formule est
  identique → `round_half_up = floor(x+0.5)` est calé **exactement** sur `Math.round`
  (`facture-totaux.ts:21,37-47`), y compris demi-négatifs (avoirs). Toute divergence ferait osciller
  le header entre deux writes : couvert par les tests de parité (A2/A3).
- **Performance.** Triggers `FOR EACH ROW` : un édit de N lignes = N recomputes
  (`SUM` sur les lignes de la facture). En pratique N petit (quelques lignes/facture) ; coût
  négligeable. Si un import massif insérait des centaines de lignes d'un coup, envisager un
  `AFTER ... FOR EACH STATEMENT` (hors scope ; le flow actuel insère ligne à ligne ou par petits
  lots).
- **Ordre des triggers à l'émission.** Documenté et garanti par nommage alphabétique
  (`assign_ref` < `freeze` < `recompute_on_emission` < `updated`). Un futur trigger `BEFORE UPDATE`
  sur `factures` dont le nom trierait _avant_ `recompute_on_emission` et écraserait les montants
  casserait le filet → convention : tout nouveau trigger de montants doit trier après. À noter dans
  le header de la migration.
- **CASCADE delete.** La garde `v_statut IS NULL` autorise la suppression des lignes filles quand la
  facture parente a déjà disparu. Régression possible si un refactor changeait l'ordre de
  suppression de `deleteBrouillon` ; couvert indirectement (un `db reset` rejoue la chaîne).
- **`search_path` épinglé** sur les 3 fonctions (`SET search_path = public, pg_temp`) — parité avec
  l'hygiène existante (`freeze_facture_after_emission`, lint 0011).
- **Retrait du recompute app oublié.** Si l'étape 3 n'est jamais faite, le doublon persiste : pas de
  bug, mais le bug warn-only d'origine survit dans une voie morte. À tracer comme follow-up explicite.

```

```
