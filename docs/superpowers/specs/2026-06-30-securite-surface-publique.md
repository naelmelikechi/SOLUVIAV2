# Sécurité — Durcissement de la surface publique (action LinkedIn non gardée + PDF devis public cassé)

Date : 2026-06-30
Statut : **design (non implémenté)**

Deux failles indépendantes touchant la surface invocable sans authentification. Elles partagent une
racine : **du pouvoir `service-role` (bypass RLS) exposé sur une surface publique mal cadrée**.

- **Chantier 1** — `ingestLinkedinEvent` est exporté d'un module `'use server'` sans garde et écrit en
  service-role : c'est un endpoint d'action invocable publiquement, le secret du webhook est
  contournable.
- **Chantier 2** — la route PDF du devis public lit la table `devis` avec le client session (RLS
  admin-only) → 404 systématique pour le prospect anonyme. La fonctionnalité est cassée _et_ le correctif
  doit éviter de réintroduire du service-role sur une route publique (cf. chantier 1).

Les deux chantiers peuvent être livrés indépendamment. Le chantier 1 est purement code (aucune
migration). Le chantier 2 ajoute une RPC `SECURITY DEFINER` additive.

---

# Chantier 1 — `ingestLinkedinEvent` hors `'use server'`

## Problème (preuve code)

`lib/actions/linkedin.ts:1` ouvre par `'use server'`. Dans le App Router, **tout export d'un module
`'use server'` est enregistré comme Server Action** : un identifiant d'action est émis dans le manifeste
et le bundle client, et l'action est invocable par un `POST` au endpoint d'action de Next.js, **sans
passer par la route webhook**.

Or `lib/actions/linkedin.ts:205` exporte :

```ts
export async function ingestLinkedinEvent(rawPayload: unknown): Promise<IngestResult> {
  const parsed = PayloadSchema.safeParse(rawPayload);   // :208  (seule validation : la forme du payload)
  ...
  const admin = createAdminClient();                     // :216  service-role, RLS contournée
```

La fonction **n'a aucune garde d'auth** (`requireAuth`/`checkAuth`/secret) et écrit en service-role sur
plusieurs tables :

| Écriture service-role                                   | Ligne                             |
| ------------------------------------------------------- | --------------------------------- |
| `INSERT linkedin_events`                                | `lib/actions/linkedin.ts:231-246` |
| `INSERT prospects` (cas création)                       | `lib/actions/linkedin.ts:347-357` |
| `INSERT prospect_contacts` (`createInterlocuteur`)      | `lib/actions/linkedin.ts:92-101`  |
| `INSERT prospect_communications` (`appendJournal`)      | `lib/actions/linkedin.ts:116-123` |
| `INSERT notifications`                                  | `lib/actions/linkedin.ts:374-384` |
| `UPDATE prospects` (derniere_action / contact / statut) | `:336-339, :364-367, :388-396`    |

La seule protection _voulue_ est dans la route : `app/api/webhooks/linkedin/route.ts:37-50` compare en
temps constant le header `x-linkedin-secret` à `LINKEDIN_WEBHOOK_SECRET`, puis appelle l'action
`route.ts:59`. **Cette protection est court-circuitable** : un attaquant qui POSTe directement sur le
endpoint d'action (l'ID d'action est trouvable dans le bundle) atteint `ingestLinkedinEvent` **sans
fournir le secret** et peut forger en masse des `linkedin_events`, des `prospects`, et surtout des
`notifications` arbitraires adressées à n'importe quel `user_id` — le tout via `service-role`, RLS
contournée. C'est une fuite/altération du CRM et un vecteur de spam de notifications internes.

> La règle est structurelle : **un module `'use server'` ne doit exporter QUE des fonctions gardées,
> destinées à être appelées par l'UI authentifiée.** Une primitive service-role appelée par un webhook
> n'a rien à faire dans ce périmètre.

## Objectif / Invariants à préserver

- `ingestLinkedinEvent` (et ses écritures service-role) ne doit **plus** être une Server Action :
  aucun ID d'action émis, aucune invocation hors de la route webhook.
- Le webhook reste l'unique point d'entrée ; sa garde par secret (`route.ts:37-50`) devient à nouveau
  efficace (plus de chemin parallèle qui la contourne).
- Comportement d'ingestion **inchangé** (pipeline, dédoublonnage, round-robin, statuts d'évènement).
- Invariant transverse : **aucune fonction exportée d'un fichier `'use server'` ne fait d'écriture
  service-role sans garde d'auth en amont** (vérifié ci-dessous, §Audit).

## Conception (alternatives + choix)

**Alternative A — Ajouter une garde dans l'action.** Rejetée : il n'existe pas de session utilisateur
côté webhook (appel machine-à-machine). On replaquerait une vérif de secret _dans_ l'action, mais
l'action resterait un endpoint public exposé ; on ne ferait que dupliquer la garde sur une surface qui
ne devrait pas exister. On ne réduit pas la surface d'attaque, on l'épaissit.

**Alternative B — Déplacer la logique dans un module non-action, importé uniquement par la route
(retenu).** On retire `ingestLinkedinEvent` (et ses helpers privés + le schéma de payload) du fichier
`'use server'` vers `lib/linkedin/ingest.ts` (module serveur ordinaire, **sans** directive
`'use server'`). La route webhook importe depuis ce module. `lib/actions/linkedin.ts` ne conserve que
les vraies Server Actions, toutes gardées. Le secret du webhook redevient la seule porte. **Surface
d'attaque réellement supprimée.**

Choix : **B**. C'est le correctif à la racine : on retire le pouvoir service-role du périmètre
« action invocable », au lieu de garder un périmètre qui ne devrait pas l'être.

## Composants (fichiers à créer/modifier)

### 1. Nouveau `lib/linkedin/ingest.ts` (module serveur, **sans** `'use server'`)

Reçoit, déplacés **tels quels** depuis `lib/actions/linkedin.ts` :

- Constantes d'ingestion : `MATCH_THRESHOLD`, `RECENT_WINDOW_DAYS`, `ROUND_ROBIN_WINDOW_DAYS`,
  `DAY_MS`, `POSITIVE_EVENT_TYPES` (`linkedin.ts:26-40`).
- Schéma + types : `PayloadSchema`, `LinkedinEventPayload`, `IngestResult` (`linkedin.ts:46-76`).
- Type `AdminClient` (`linkedin.ts:82`).
- Helpers privés : `createInterlocuteur`, `appendJournal`, `resolveDeveloppeur`
  (`linkedin.ts:84-187`) — déjà non exportés, ils prennent `admin` en paramètre.
- La fonction `ingestLinkedinEvent` (`linkedin.ts:205-425`).

Imports à rapatrier dans le nouveau module (sous-ensemble de l'en-tête actuel) :

```ts
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/utils/logger';
import { logAudit } from '@/lib/utils/audit';
import { nextRoundRobinDeveloppeur } from '@/lib/utils/round-robin';
import type { Database } from '@/types/database';

type StatutEvenementLinkedin =
  Database['public']['Enums']['statut_evenement_linkedin'];
```

> `revalidatePath`, `requireAuth`/`checkAuth`, et les imports `@/lib/queries/linkedin` **ne** sont
> **pas** utilisés par l'ingestion → ils restent dans `lib/actions/linkedin.ts`.
> Pas de `'use server'` en tête du nouveau fichier : il devient un simple module serveur (il importe
> déjà `@/lib/supabase/admin`, lui-même `server-only` de fait). Aucun composant client ne l'importe.

Signature inchangée :

```ts
export async function ingestLinkedinEvent(
  rawPayload: unknown,
): Promise<IngestResult>;
export type { LinkedinEventPayload, IngestResult };
```

### 2. `lib/actions/linkedin.ts` (reste `'use server'`)

Conserve **uniquement** les Server Actions, toutes gardées :

- `addMappingRule` / `updateMappingRule` / `deleteMappingRule` → `checkAuth()` (admin) avant écriture
  (`linkedin.ts:465-466, :521-522, :559-560`).
- `getLastLinkedinEvent` → `requireAuth()` (`linkedin.ts:592-593`).

Suppressions : la constante `MATCH_THRESHOLD`/`POSITIVE_EVENT_TYPES`/etc., le schéma `PayloadSchema`,
les types `LinkedinEventPayload`/`IngestResult`, les helpers `createInterlocuteur`/`appendJournal`/
`resolveDeveloppeur`, et `ingestLinkedinEvent`. Nettoyer les imports devenus inutiles :
`createAdminClient`, `nextRoundRobinDeveloppeur`, `SupabaseClient`, et `StatutEvenementLinkedin` si
plus référencé. **Vérifier à la compilation qu'il ne reste plus aucune référence à `createAdminClient`
dans ce fichier** (c'est l'invariant clé du chantier).

> `addMappingRule`/`updateMappingRule`/`deleteMappingRule`/`getLastLinkedinEvent` utilisent le client
> **session** (`auth.supabase`), soumis à la RLS `linkedin_mapping_rules` (admin-only en écriture, cf.
> `supabase/tests/19_linkedin_rls.sql`). Aucune écriture service-role ne subsiste dans ce module.

### 3. `app/api/webhooks/linkedin/route.ts`

Une seule ligne change :

```ts
// avant
import { ingestLinkedinEvent } from '@/lib/actions/linkedin';
// après
import { ingestLinkedinEvent } from '@/lib/linkedin/ingest';
```

Le reste (garde secret `:37-50`, gestion 400/200 `:62-76`) est inchangé.

## Audit complémentaire — autres exports `'use server'` faisant du `createAdminClient` sans garde

Recensement de tous les `createAdminClient()` dans `lib/actions/**` (fichiers `'use server'`). **Tous
sauf `ingestLinkedinEvent` sont gardés** — la garde précède l'instanciation du client admin :

| Fichier (action exportée)                                                | Garde en amont                                                                                 | Verdict        |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | -------------- |
| `lib/actions/linkedin.ts:216` (`ingestLinkedinEvent`)                    | **AUCUNE**                                                                                     | ❌ ce chantier |
| `lib/actions/cdp.ts:70` (`applyAffectation`)                             | helper privé ; callers `affectCdp`/`reaffectCdp` → `getCdpAuth()` + `isReferentCdp` (`:59-63`) | ✅             |
| `lib/actions/employee-cost.ts:42,89` (`updateUserCost`/`updateDefaults`) | `checkAuth()` admin (`:38-39`)                                                                 | ✅             |
| `lib/actions/sync.ts:47,75` (`triggerOdooSync`/`triggerEduviaSync`)      | `getUser()`+`isAdmin` (`:42-45, :70-73`)                                                       | ✅             |
| `lib/actions/users/lifecycle.ts:87` (`deleteUser`)                       | `requireSuperAdmin()` (`:47-48`)                                                               | ✅             |
| `lib/actions/users/lifecycle.ts:155,395` (`inviteUser`/reset)            | `checkAuth()` + `canInviteRole` (`:142-151`)                                                   | ✅             |
| `lib/actions/users/profile.ts:270` (toggle actif)                        | garde plus haut dans la fonction (avant l'`UPDATE` `:254`)                                     | ✅             |

> **Hors périmètre (et hors faille) :** les `createAdminClient()` sous `app/api/**` (cron, webauthn,
> bugs, broadcast…) sont des **route handlers**, pas des Server Actions. Ils ne reçoivent pas d'ID
> d'action et portent leur propre garde explicite (`verifyCronAuth`, `checkAuth`, secret webhook,
> challenge webauthn). Le vecteur « export `'use server'` non gardé » ne les concerne pas. Seul
> `ingestLinkedinEvent` cumule les deux propriétés (export `'use server'` **et** écriture
> service-role sans garde).

Conclusion : **`ingestLinkedinEvent` est le seul cas.** Le chantier le résout définitivement.

## Plan d'implémentation (TDD)

1. **Test rouge (régression de surface)** : `__tests__/linkedin-ingest-surface.test.ts`
   - `import * as actions from '@/lib/actions/linkedin'` → `expect(actions.ingestLinkedinEvent).toBeUndefined()`.
   - `import { ingestLinkedinEvent } from '@/lib/linkedin/ingest'` → `expect(typeof ...).toBe('function')`.
   - Garde-fou source : lire le texte de `lib/actions/linkedin.ts` et
     `expect(src).not.toContain('createAdminClient')`. (Échoue tant que le déplacement n'est pas fait.)
2. Créer `lib/linkedin/ingest.ts` ; y déplacer constantes/schéma/types/helpers/`ingestLinkedinEvent`.
3. Élaguer `lib/actions/linkedin.ts` (suppressions + nettoyage imports).
4. Repointer l'import dans `app/api/webhooks/linkedin/route.ts`.
5. Test vert ; `tsc`/lint sur les 3 fichiers.

Ordre de déploiement : **aucune migration**, déploiement standard (code only).

## Tests

- **vitest** `linkedin-ingest-surface.test.ts` (ci-dessus) : prouve que l'action n'existe plus dans le
  module `'use server'` et que la logique vit dans le module non-action. C'est le test qui _bloque la
  régression_ (réintroduire l'export rallumerait la faille).
- **vitest** (optionnel, non régressif) : extraire un mini-test du pipeline `resolveDeveloppeur`/
  round-robin si on veut figer le comportement métier — déjà couvert par `__tests__/round-robin.test.ts`.
- Pas de pgTAP : la RLS `linkedin_events`/`linkedin_mapping_rules` est déjà couverte par
  `supabase/tests/19_linkedin_rls.sql` (INSERT interdit aux non-admins) et reste inchangée.

## Risques / Hors-périmètre

- **Risque résiduel faible** : si quelqu'un réimporte un jour `ingestLinkedinEvent` dans un fichier
  `'use server'`, la faille revient. Le test de surface (§Tests) sert de garde-fou CI.
- Le secret webhook reste lu via `process.env.LINKEDIN_WEBHOOK_SECRET` (hors schéma `lib/env`, par
  choix existant `route.ts:17-20`) — inchangé.
- Hors périmètre : rate-limiting du webhook, rotation du secret, validation fine du mapping payload→outil.

---

# Chantier 2 — PDF du devis public cassé (404 systématique)

## Problème (preuve code)

`app/api/devis/[token]/pdf/route.ts:11` crée un client **session** (`createClient()`), puis interroge
la table `devis` :

```ts
const { data: row, error } = await supabase
  .from('devis')
  .select('id, ref')
  .eq('acceptation_token', token) // :17
  .gt('acceptation_token_expire_at', new Date().toISOString()) // :18
  .maybeSingle();
if (error || !row) {
  return NextResponse.json(
    { error: 'Lien invalide ou expiré' },
    { status: 404 },
  ); // :21-26
}
const devis = await getDevisById(row.id); // :28  encore le client session (RLS)
```

Le prospect qui ouvre le lien public est **anonyme** : la RLS `devis` est admin/périmètre-only, donc
`.maybeSingle()` renvoie `row = null` → **404 systématique**. Et même si la première requête passait,
`getDevisById` (`lib/queries/devis.ts:106`) repasse par le client session → re-bloqué par la RLS.

À l'inverse, la **page** publique fonctionne car elle n'interroge pas la table directement : elle
appelle la RPC `SECURITY DEFINER` `get_devis_public` (`app/devis/public/[token]/page.tsx:20-24`),
définie en `supabase/migrations/20260523100200_devis_public_rpcs.sql:118-173`, qui vérifie token +
expiration + statut côté SQL et ne renvoie qu'une vue restreinte.

→ Le bouton « Télécharger le PDF » de la vue publique pointe sur une route qui renvoie toujours 404.

## Objectif / Invariants à préserver

- Le prospect anonyme muni d'un token valide non expiré obtient son PDF.
- **Ne PAS introduire de `createAdminClient()` (service-role) dans une route publique non
  authentifiée** : ce serait reproduire la racine du chantier 1 (pouvoir service-role sur surface
  publique). Tout bug de vérif de token exposerait alors _toute_ la table `devis`.
- Vérification **token + expiration + statut côté SQL**, prédicat aligné sur `get_devis_public` (source
  de vérité unique de « ce qui rend un devis publiquement visible »).
- **Exposition minimale** : la RPC ne renvoie **que** les champs strictement consommés par le rendu PDF.
  Jamais `notes_internes`, `acceptation_token`, `acceptation_nom/email/ip/user_agent`, ni les ids
  internes.
- Invariants légaux devis intacts (lecture seule ; aucun DELETE, aucune mutation de montants/numéro).

## Conception (alternatives + choix)

**Alternative A — `createAdminClient()` + vérif token/expiration dans le handler.** Rejetée. Place une
clé service-role dans une route publique anonyme ; la sécurité repose entièrement sur du code TS
(facile à régresser), et en cas de faille la RLS n'est plus un filet. C'est l'anti-pattern du
chantier 1. De plus `getDevisById` ramène le devis **entier** (`notes_internes`, tokens, champs
d'acceptation, `factures_liees`) : sur-exposition par défaut.

**Alternative B — RPC `SECURITY DEFINER` `get_devis_pdf_public(p_token)` (retenu).** Calquée sur
`get_devis_public` : token + expiration + statut vérifiés en SQL, `search_path` épinglé, `GRANT`
minimal. Renvoie une **projection taillée pour le PDF** (strictement les champs lus par `DevisPdf`).
La route appelle la RPC via le client session (anon) — aucun service-role en jeu.

Choix : **B**, le plus sûr. Justifications :

- pas de service-role sur la route publique ;
- le filtre de visibilité vit en base, atomique, identique en intention à `get_devis_public` ;
- **minimisation des données** garantie par la base, pas par le code appelant.

### Pourquoi une **nouvelle** RPC plutôt qu'étendre `get_devis_public`

Les deux consommateurs publics n'ont **pas** les mêmes besoins, et étendre l'existant _augmenterait_
l'exposition de la page :

- Le PDF a besoin de champs que la page n'affiche pas et que `get_devis_public` **n'expose pas
  aujourd'hui** : `client.siret`, `client.tva_intracommunautaire`, `societe.capital_social`,
  `societe.forme_juridique`.
- La page reçoit `devis.statut`, `devis.acceptation_token_expire_at`, `societe.code`, `societe.pays`,
  `societe.email_contact` — **inutiles au PDF**.

Étendre `get_devis_public` ferait fuiter le SIRET/TVA du client vers la page publique (qui ne les
affiche pas). Deux RPC, deux projections minimales et intentionnelles : chacune ne renvoie que ce que
son consommateur rend. C'est l'application directe de l'invariant « exposition minimale ».

### Champs strictement nécessaires au PDF (relevé ligne-à-ligne de `components/devis/devis-pdf.tsx`)

| Bloc       | Champs renvoyés par la RPC                                                                                                                                                                         | Champs **exclus** (lus nulle part par le PDF)            |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `devis`    | `ref, objet, date_emission, date_validite, montant_ht, montant_ttc, conditions_reglement`                                                                                                          | `statut, montant_tva, id, notes_internes, acceptation_*` |
| `lignes[]` | `ordre, libelle, description, quantite, prix_unitaire_ht, taux_tva, total_ht, total_tva`                                                                                                           | `id, total_ttc`                                          |
| `societe`  | `raison_sociale, forme_juridique, capital_social, siret, tva_intracom, adresse, code_postal, ville, logo_url, conditions_reglement_default, mentions_legales, banque_nom, banque_iban, banque_bic` | `code, pays, email_contact`                              |
| `client`   | `raison_sociale, adresse, localisation, siret, tva_intracommunautaire`                                                                                                                             | `id, trigramme`                                          |

> Vérifs : `devis.montant_tva` n'est pas lu (les TVA viennent de `tvaGroups` agrégé sur `lignes`,
> `devis-pdf.tsx:194-198`). `ligne.total_ttc` n'est pas lu. `ligne.id` n'est utilisé que comme clé
> React `key={l.id}` (`devis-pdf.tsx:275`) → on bascule la clé sur `key={l.ordre}` pour ne **pas**
> exposer d'id de ligne. `societe.code/pays/email_contact` et `client.id/trigramme` ne sont jamais lus.

## Composants

### 1. Migration additive — `supabase/migrations/20260630140000_devis_pdf_public_rpc.sql`

```sql
-- RPC publique de rendu PDF : token + expiration + statut vérifiés côté SQL.
-- Projection STRICTEMENT limitée aux champs consommés par components/devis/devis-pdf.tsx.
-- Lecture seule (STABLE) : ne loggue PAS de vue (la page get_devis_public l'a déjà fait).
-- Renvoie NULL si introuvable / expiré / statut non consultable (route -> 404, pas de bruit log).
CREATE OR REPLACE FUNCTION get_devis_pdf_public(p_token TEXT)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_devis   RECORD;
  v_lignes  JSON;
  v_societe RECORD;
  v_client  RECORD;
BEGIN
  -- Prédicat de visibilité aligné sur get_devis_public (token + non expiré).
  SELECT d.id, d.ref, d.objet, d.date_emission, d.date_validite,
         d.montant_ht, d.montant_ttc, d.conditions_reglement,
         d.statut, d.societe_emettrice_id, d.client_id
    INTO v_devis
    FROM devis d
   WHERE d.acceptation_token = p_token
     AND d.acceptation_token_expire_at > now();

  -- Statut consultable identique à get_devis_public (brouillon -> route authentifiée dédiée).
  IF v_devis.id IS NULL OR v_devis.statut NOT IN ('envoye', 'accepte', 'refuse') THEN
    RETURN NULL;
  END IF;

  SELECT json_agg(json_build_object(
    'ordre', l.ordre, 'libelle', l.libelle, 'description', l.description,
    'quantite', l.quantite, 'prix_unitaire_ht', l.prix_unitaire_ht,
    'taux_tva', l.taux_tva, 'total_ht', l.total_ht, 'total_tva', l.total_tva
  ) ORDER BY l.ordre) INTO v_lignes
    FROM devis_lignes l WHERE l.devis_id = v_devis.id;

  SELECT raison_sociale, forme_juridique, capital_social, siret, tva_intracom,
         adresse, code_postal, ville, logo_url,
         conditions_reglement_default, mentions_legales,
         banque_nom, banque_iban, banque_bic
    INTO v_societe FROM societes_emettrices WHERE id = v_devis.societe_emettrice_id;

  SELECT raison_sociale, adresse, localisation, siret, tva_intracommunautaire
    INTO v_client FROM clients WHERE id = v_devis.client_id;

  RETURN json_build_object(
    'devis', json_build_object(
      'ref', v_devis.ref, 'objet', v_devis.objet,
      'date_emission', v_devis.date_emission, 'date_validite', v_devis.date_validite,
      'montant_ht', v_devis.montant_ht, 'montant_ttc', v_devis.montant_ttc,
      'conditions_reglement', v_devis.conditions_reglement
    ),
    'lignes', COALESCE(v_lignes, '[]'::JSON),
    'societe', row_to_json(v_societe),
    'client', row_to_json(v_client)
  );
END;
$$;

ALTER FUNCTION get_devis_pdf_public(TEXT) SET search_path = public, pg_temp;

-- GRANT minimal : on retire d'abord l'EXECUTE accordé à PUBLIC par défaut, puis on
-- ouvre uniquement aux rôles PostgREST. (Durcissement vs. les RPC existantes qui
-- s'appuyaient sur le GRANT PUBLIC implicite.)
REVOKE EXECUTE ON FUNCTION get_devis_pdf_public(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_devis_pdf_public(TEXT) TO anon, authenticated;
```

> Notes de conception SQL :
>
> - `STABLE` + aucune écriture : contrairement à `get_devis_public` (qui `INSERT devis_public_views`,
>   donc VOLATILE), le PDF est une **sous-ressource** d'une page déjà loggée → pas de double comptage,
>   pas de privilège d'écriture nécessaire. Si un suivi « téléchargements » devient utile, le faire
>   plus tard avec un type d'évènement distinct (hors périmètre).
> - `RETURN NULL` plutôt que `RAISE` (divergence assumée vs. `get_devis_public`) : la route est un GET
>   public, balayée par des bots avec des tokens aléatoires ; renvoyer NULL évite de polluer les logs
>   Postgres et laisse la route répondre 404 proprement.
> - **N'expose jamais** `acceptation_token`, `notes_internes`, `acceptation_email/nom/ip/user_agent`,
>   ni les ids internes (cf. tableau de projection). C'est un invariant testé en pgTAP.
> - `search_path` épinglé (`public, pg_temp`) comme toutes les fonctions du repo (cf.
>   `20260523100200_devis_public_rpcs.sql:172`).

### 2. `components/devis/devis-pdf.tsx` — resserrer le type de prop

Aujourd'hui `DevisPdf` est typé sur `DevisDetail` (`devis-pdf.tsx:167`), qui impose le devis entier +
`factures_liees` + tous les champs société/client. Pour que la **route publique** (qui ne dispose que
de la projection RPC) puisse alimenter le composant **sans cast `as unknown as`** et sans fabriquer de
faux champs, on introduit un type `DevisPdfData` = exactement ce que le composant lit (le tableau de
projection ci-dessus), et on retype le composant dessus.

```ts
// lib/queries/devis.ts (à côté de DevisDetail)
export interface DevisPdfData {
  ref: string | null;
  objet: string;
  date_emission: string | null;
  date_validite: string | null;
  montant_ht: number;
  montant_ttc: number;
  conditions_reglement: string | null;
  lignes: Array<{
    ordre: number;
    libelle: string;
    description: string | null;
    quantite: number;
    prix_unitaire_ht: number;
    taux_tva: number;
    total_ht: number;
    total_tva: number;
  }>;
  societe_emettrice: {
    raison_sociale: string;
    forme_juridique: string | null;
    capital_social: number | null;
    siret: string;
    tva_intracom: string;
    adresse: string;
    code_postal: string;
    ville: string;
    logo_url: string | null;
    conditions_reglement_default: string | null;
    mentions_legales: string | null;
    banque_nom: string | null;
    banque_iban: string | null;
    banque_bic: string | null;
  } | null;
  client: {
    raison_sociale: string;
    adresse: string | null;
    localisation: string | null;
    siret: string | null;
    tva_intracommunautaire: string | null;
  } | null;
}
```

- `DevisPdf({ devis }: { devis: DevisPdfData })`.
- Changer `key={l.id}` → `key={l.ordre}` (`devis-pdf.tsx:275`) pour ne plus dépendre de `ligne.id`.
- `DevisDetail` reste **structurellement assignable** à `DevisPdfData` (il en est un sur-ensemble) →
  les routes authentifiées (`brouillon/[id]/pdf`, email `devis-templates.ts`) qui passent un
  `DevisDetail` continuent de typer sans changement. `renderDevisPdfBuffer` propage le type via
  `ComponentProps<typeof DevisPdf>['devis']` (`render-devis-pdf.ts:15`) — aucune autre signature à
  toucher.

> Cutover propre : aucun cast ni champ bidon. Le seul élargissement de type est un **resserrement**
> (de `DevisDetail` vers son sous-ensemble réellement utilisé).

### 3. `app/api/devis/[token]/pdf/route.ts` — réécriture du handler

```ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { renderDevisPdfBuffer } from '@/lib/utils/render-devis-pdf';
import { mapDevisPdfPublic } from '@/lib/queries/devis'; // mapping pur (cf. §4)
import { logger } from '@/lib/utils/logger';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const [{ token }, supabase] = await Promise.all([params, createClient()]);

  const { data, error } = await supabase.rpc('get_devis_pdf_public', {
    p_token: token,
  });
  if (error || !data) {
    return NextResponse.json(
      { error: 'Lien invalide ou expiré' },
      { status: 404 },
    );
  }

  const devis = mapDevisPdfPublic(data); // JSON RPC -> DevisPdfData (typé)
  try {
    const buffer = await renderDevisPdfBuffer(devis);
    const filename = devis.ref ? `${devis.ref}.pdf` : 'devis.pdf';
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e) {
    logger.error('api.devis.pdf', 'render failed', { error: e });
    return NextResponse.json(
      { error: 'Erreur génération PDF' },
      { status: 500 },
    );
  }
}
```

- Plus aucun accès direct à la table `devis`, plus de `getDevisById`, **plus de service-role**.
- Le `token` n'est plus loggué (évite d'écrire un secret de partage en clair dans les logs).

### 4. `lib/queries/devis.ts` — mapping pur testable

```ts
export function mapDevisPdfPublic(payload: unknown): DevisPdfData {
  // narrow + map du JSON RPC vers DevisPdfData ; lève si la forme est inattendue.
}
```

Fonction pure (pas d'I/O) → unit-testable sans DB.

## Plan d'implémentation (TDD) + ordre de déploiement

1. **pgTAP rouge** : `supabase/tests/23_devis_pdf_public_rpc.sql` (cas ci-dessous) — échoue tant que la
   fonction n'existe pas.
2. Écrire la migration `20260630140000_devis_pdf_public_rpc.sql` → pgTAP vert.
3. **vitest rouge** : test du mapping `mapDevisPdfPublic` + test de rendu `DevisPdf` sur un
   `DevisPdfData` (fixture issue d'un payload RPC représentatif).
4. Implémenter `DevisPdfData` + retype `DevisPdf` (clé `ordre`) + `mapDevisPdfPublic` → vert.
5. Réécrire le handler `app/api/devis/[token]/pdf/route.ts`.
6. `tsc`/lint ; vérifier que `brouillon/[id]/pdf` et `devis-templates.ts` compilent sans changement.

**Ordre de déploiement (prod = Supavia, migrations auto-appliquées au merge) :** la migration est
**additive et non contraignante** (un `CREATE FUNCTION`, aucun lock de table, aucune contrainte). Elle
s'applique au merge sur `main` **avant** que le nouveau code de la route ne soit servi. Le seul couplage
est l'inverse du cas « migration contraignante » : le nouveau handler **dépend** de l'existence de la
RPC. Livrer migration + code dans **la même PR** garantit que la fonction existe quand la route
nouvelle version devient active. Aucune fenêtre où l'ancien code casserait (l'ancien handler n'utilise
pas la RPC ; le nouveau ne part qu'avec la migration). Pas de rollback risqué : la RPC peut rester en
place même si le code est rollé back.

## Tests

### pgTAP — `supabase/tests/23_devis_pdf_public_rpc.sql`

Setup : une société émettrice, un client, un devis `envoye` avec token + `acceptation_token_expire_at`
futur + 2 lignes ; un second devis `brouillon` ; un token expiré. Cas :

- `anon` **peut** exécuter `get_devis_pdf_public(text)` :
  `has_function_privilege('anon', 'public.get_devis_pdf_public(text)', 'EXECUTE')`.
- `search_path` épinglé : `pg_proc.proconfig LIKE '%search_path%'` (calque
  `supabase/tests/22_security_hardening.sql:24-31`).
- Token valide + statut `envoye` → JSON non-null ; `json_array_length(payload->'lignes') = 2` ;
  `payload->'devis'->>'ref'` = la ref attendue.
- **Exposition minimale (invariant clé)** : `(payload->'devis') ? 'acceptation_token'` = false ;
  `? 'notes_internes'` = false ; `? 'statut'` = false ; `(payload->'societe') ? 'email_contact'` =
  false ; `(payload->'client') ? 'trigramme'` = false. (assert via `NOT (... ? '...')`).
- Token expiré → `RETURN NULL`.
- Token inexistant/garbage → `RETURN NULL`.
- Devis `brouillon` (token valide) → `RETURN NULL` (statut non consultable).

Exécutées sous `SET LOCAL role anon` (le DEFINER bypass la RLS volontairement, le filtre est dans le
WHERE), modèle des helpers de `supabase/tests/19_linkedin_rls.sql:53-64`.

### vitest

- `__tests__/devis-pdf-public-map.test.ts` : `mapDevisPdfPublic(payloadRpc)` → `DevisPdfData` correct ;
  payload tronqué/incohérent → throw ; null → géré côté route (404).
- `__tests__/devis-pdf-render.test.ts` : calque `__tests__/facture-pdf-render.test.ts`
  (`vi.mock('server-only')`, `renderDevisPdfBuffer`, `expectValidPdf` : `%PDF-` … `%%EOF`). Cas :
  fixture `DevisPdfData` complète, `logo_url: null` (pas d'I/O réseau), société sans RIB, client sans
  SIRET/TVA, devis sans `date_validite`. Prouve que le type resserré rend toujours un PDF valide.

## Risques / Hors-périmètre

- **Risque** : un futur champ ajouté au PDF devra être ajouté à la fois à `DevisPdfData` et à la
  projection RPC — sinon `undefined` au rendu. Le test de rendu (fixture complète) le détecte.
- **Risque (mitigé)** : si une migration ultérieure renomme une colonne devis/société/client, la RPC
  doit suivre. Couvert par le pgTAP (cassé si la colonne disparaît).
- **Suivi des téléchargements** : non implémenté (RPC en lecture seule). Hors périmètre ; à faire plus
  tard via un type d'évènement dédié si besoin produit.
- **Rate-limiting** de la route PDF publique : hors périmètre.
- Inchangé : la route brouillon authentifiée (`app/api/devis/brouillon/[id]/pdf/route.ts`) et l'envoi
  email (`lib/email/devis-templates.ts`) continuent d'utiliser `getDevisById` (contexte authentifié /
  service-role légitime) — non concernés par ce chantier.
