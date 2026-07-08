# Phase 2 CRM (A2 + pont + suppression prospects) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) ou superpowers:executing-plans pour implémenter tâche par tâche. Étapes en cases à cocher (`- [ ]`).

**Goal :** Faire du CRM `/crm` l'unique pipeline commercial : enrichir ses formulaires des champs négociation/INSEE (A2), câbler le pont « opportunité gagnée → client SOLUVIA + synthèse de passation », puis supprimer entièrement les prospects (DROP).

**Architecture :** 5 lots = 5 PRs séquentielles. A (enrichissement schéma+forms `crm`) → B (pont opportunité→client/passation, source `buildSyntheseSnapshotFromOpportunite`) → [déploiement + vérif prod du pont] → C (préservation passation : FK SET NULL, signature client-based) → D (DROP prospects + repoint consommateurs + nav) → E (vérif). Le DROP n'intervient qu'après vérif prod du pont.

**Tech Stack :** Next 16 (App Router, Server Actions), schéma Postgres `crm` (types manuels `lib/crm/database.types.ts`), zod, react-hook-form, `lib/insee/recherche-entreprises.ts`, Supabase service-role pour l'écriture cross-schéma, vitest.

**Réfs vérifiées :**

- Schéma `crm` : `supabase/migrations/20260707130000_crm_schema.sql` (`cfa` est `text`, comptes sans INSEE).
- INSEE : `lib/insee/recherche-entreprises.ts` → `lookupEntrepriseBySiren(siren) : EntrepriseInsee | null` avec `{ siren, raisonSociale, siret, adresse, formeJuridique, codeNaf, effectifTranche }` (PAS de naf_libelle/nb_implantations/ca → champs manuels).
- Contrat cible : `SyntheseSnapshotV2` (`lib/queries/passation.ts:37`), gabarit `buildSyntheseSnapshotFromProspect` (`:170`).
- Enums applicatifs : `lib/utils/constants.ts` (`TypeProspect='cfa'|'entreprise'`, `CanalOrigine`, `RoleDecisionContact`, `TypeFormation`, `InitiateurContact`, `JalonCalendrierKey`) — réutilisables tels quels côté `crm`.
- Client : gabarit `convertProspectToClient` (`lib/actions/prospects/pipeline.ts:339`) → insert `clients { trigramme:'', raison_sociale, siret, apporteur_commercial_id, apporteur_date }`.
- Hooks statut : `moveOpportuniteStage` (`lib/crm/actions/opportunites.ts:169`), `setOpportuniteStatut` (`:216`).

---

## LOT A — Enrichissement du pipeline CRM (PR #1)

### Task A1 : Migration `crm` — colonnes négociation/INSEE

**Files :** Create `supabase/migrations/<ts>_crm_phase2_enrichissement.sql`

- [ ] **Step 1 — Écrire la migration** (ordre : comptes, contacts, opportunites) :

```sql
-- Phase 2 A2 : champs negociation + INSEE dans le pipeline CRM
-- comptes : enrichissement INSEE
alter table crm.comptes
  add column if not exists forme_juridique text,
  add column if not exists siren text,
  add column if not exists code_naf text,
  add column if not exists naf_libelle text,
  add column if not exists effectif_tranche text,
  add column if not exists nb_implantations int check (nb_implantations is null or nb_implantations >= 0),
  add column if not exists ca_dernier_exercice numeric(14,2) check (ca_dernier_exercice is null or ca_dernier_exercice >= 0),
  add column if not exists insee_verifie boolean not null default false;

-- contacts : role de decision + sensibilites
alter table crm.contacts
  add column if not exists role_decision text
    check (role_decision is null or role_decision in ('decisionnaire','prescripteur','utilisateur','financier','autre')),
  add column if not exists sensibilites text;

-- opportunites : negociation + historique + contrat + calendrier + tunnel
alter table crm.opportunites
  add column if not exists perimetre_missions text,
  add column if not exists formations_rncp text[] not null default '{}',
  add column if not exists type_formation text
    check (type_formation is null or type_formation in ('presentiel','distanciel','hybride')),
  add column if not exists taux_npec numeric(6,2) check (taux_npec is null or taux_npec >= 0),
  add column if not exists duree_contrat_ans numeric(4,2) check (duree_contrat_ans is null or duree_contrat_ans >= 0),
  add column if not exists mois_demarrage int check (mois_demarrage is null or mois_demarrage between 1 and 12),
  add column if not exists volume_an1 int check (volume_an1 is null or volume_an1 >= 0),
  add column if not exists volume_an2 int check (volume_an2 is null or volume_an2 >= 0),
  add column if not exists volume_an3 int check (volume_an3 is null or volume_an3 >= 0),
  add column if not exists volume_garanti_seuil int check (volume_garanti_seuil is null or volume_garanti_seuil >= 0),
  add column if not exists leviers text[] not null default '{}',
  add column if not exists canal_origine text
    check (canal_origine is null or canal_origine in ('linkedin','salon','recommandation','entrant','sortant','partenaire','autre')),
  add column if not exists date_premier_contact date,
  add column if not exists initiateur text check (initiateur is null or initiateur in ('soluvia','prospect')),
  add column if not exists historique_synthese text,
  add column if not exists numero_contrat text,
  add column if not exists type_prospect text check (type_prospect is null or type_prospect in ('cfa','entreprise')),
  add column if not exists calendrier_previsionnel jsonb;
```

> Les valeurs des CHECK doivent correspondre **exactement** aux unions de `lib/utils/constants.ts`. Vérifier `CanalOrigine` et `RoleDecisionContact` (lignes 154/172) et aligner la liste ci-dessus si divergence.

- [ ] **Step 2 — Appliquer en local** : `npm run db:migrate:dry` puis vérifier `\d crm.opportunites` montre les nouvelles colonnes.
- [ ] **Step 3 — Commit** : `feat(crm): schema phase2 — champs negociation/INSEE (comptes/contacts/opportunites)`.

### Task A2 : Types manuels `crm`

**Files :** Modify `lib/crm/database.types.ts`

- [ ] **Step 1 — Vérifier les unions exactes** dans `lib/utils/constants.ts:154-329` (copier les littéraux dans les CHECK ET les types).
- [ ] **Step 2 — Ajouter les colonnes** aux `Row`/`Insert`/`Update` de `comptes`, `contacts`, `opportunites` (types alignés sur A1 : `string | null`, `string[]`, `number | null`, `Json | null` pour `calendrier_previsionnel`, `boolean` pour `insee_verifie`).
- [ ] **Step 3 — `npx tsc --noEmit`** : PASS.
- [ ] **Step 4 — Commit** : `feat(crm): types phase2 columns (manual database.types)`.

### Task A3 : Validators zod négociation/INSEE

**Files :** Modify `lib/crm/validators/opportunite-complete.ts` ; Create `lib/crm/validators/negociation.ts` (+ `.test.ts`)

- [ ] **Step 1 — Test d'abord** (`lib/crm/validators/negociation.test.ts`) :

```ts
import { describe, it, expect } from 'vitest';
import { negociationSchema } from './negociation';

describe('negociationSchema', () => {
  it('accepte vide (tout optionnel)', () => {
    const r = negociationSchema.parse({});
    expect(r.taux_npec).toBeNull();
    expect(r.formations_rncp).toEqual([]);
  });
  it('coerce nombres, vide -> null', () => {
    const r = negociationSchema.parse({
      taux_npec: '8000',
      volume_an1: '',
      mois_demarrage: '9',
    });
    expect(r.taux_npec).toBe(8000);
    expect(r.volume_an1).toBeNull();
    expect(r.mois_demarrage).toBe(9);
  });
  it('rejette mois_demarrage hors 1-12', () => {
    expect(() => negociationSchema.parse({ mois_demarrage: '13' })).toThrow();
  });
  it('rejette type_formation invalide', () => {
    expect(() => negociationSchema.parse({ type_formation: 'x' })).toThrow();
  });
});
```

- [ ] **Step 2 — Run** : `npm test -- lib/crm/validators/negociation` → FAIL (module absent).
- [ ] **Step 3 — Implémenter** `negociationSchema` (réutiliser le pattern `optionalInt`/preprocess de `opportunite-complete.ts`) : champs `perimetre_missions?, formations_rncp:string[]=[], type_formation enum?, taux_npec num?, duree_contrat_ans num?, mois_demarrage int 1-12?, volume_an1..3 int?, volume_garanti_seuil int?, leviers:string[]=[], canal_origine enum?, date_premier_contact?, initiateur enum?, historique_synthese?, numero_contrat?, type_prospect enum?`. Importer les unions depuis `@/lib/utils/constants`.
- [ ] **Step 4 — Étendre `opportunite-complete.ts`** : merge `negociationSchema` dans le schéma de création/édition, et ajouter au `contactSchema` `role_decision` (enum optionnel) + `sensibilites` (string optionnel). Compte : `siren, forme_juridique, code_naf, naf_libelle, effectif_tranche, nb_implantations(int), ca_dernier_exercice(num)`.
- [ ] **Step 5 — Run** : `npm test -- lib/crm/validators` → PASS.
- [ ] **Step 6 — Commit** : `feat(crm): zod validators negociation/INSEE`.

### Task A4 : Actions — persister les nouveaux champs + enrichissement INSEE

**Files :** Modify `lib/crm/actions/opportunites.ts`, `lib/crm/actions/comptes.ts`, `lib/crm/actions/contacts.ts` ; Create `lib/crm/actions/insee.ts`

- [ ] **Step 1 — `lib/crm/actions/insee.ts`** : server action `enrichirCompteParSiren(siren: string)` → `requireCrmUser()` → `lookupEntrepriseBySiren(siren)` → renvoie `{ ok, data? }` (jamais throw ; échec = `{ ok:false }`). Ne persiste pas (le form applique).
- [ ] **Step 2 — `comptes.ts`** : inclure les colonnes INSEE + `insee_verifie` dans create/update.
- [ ] **Step 3 — `opportunites.ts`** : inclure les colonnes négociation dans `createOpportuniteComplete`/`updateOpportuniteFields` (mapper depuis le schéma étendu).
- [ ] **Step 4 — `contacts.ts`** : inclure `role_decision`, `sensibilites`.
- [ ] **Step 5 — `npx tsc --noEmit`** : PASS.
- [ ] **Step 6 — Commit** : `feat(crm): persist negociation/INSEE + enrichir action`.

### Task A5 : Formulaires

**Files :** Modify `components/crm/pipeline/*` (form opportunité), form compte, form contact (localiser via `grep -rl "opportuniteCompleteSchema\|useForm" components/crm`)

- [ ] **Step 1 — Form compte** : bloc « Identité entreprise (INSEE) » avec champ SIREN + bouton « Enrichir » (appelle `enrichirCompteParSiren`, remplit forme_juridique/code_naf/effectif_tranche/siret/adresse, passe `insee_verifie=true`) ; champs manuels naf_libelle/nb_implantations/ca_dernier_exercice.
- [ ] **Step 2 — Form opportunité** : section repliable « Négociation & passation » (périmètre, formations RNCP [multi], type_formation, taux_npec, durée, mois démarrage, volumes an1-3 + seuil garanti, leviers [multi], canal, date 1er contact, initiateur, historique, n° contrat, type_prospect). Le reste du form inchangé.
- [ ] **Step 3 — Form contact** : select `role_decision` (labels `ROLE_DECISION_LABELS`) + textarea `sensibilites`.
- [ ] **Step 4 — Vérif dev** : `npm run dev` → créer/éditer une opportunité avec ces champs → persistés (re-open montre les valeurs).
- [ ] **Step 5 — `npm run build`** : PASS.
- [ ] **Step 6 — Commit** : `feat(crm): forms negociation/INSEE (compte/opportunite/contact)`.

### Task A6 : PR Lot A

- [ ] `npm run typecheck && npm test` verts → brancher `feat/crm-phase2-a-enrichissement`, push, PR, CI verte, merge.

---

## LOT B — Le pont opportunité gagnée → client + passation (PR #2)

### Task B1 : Migration `crm.opportunites.client_id`

**Files :** Create `supabase/migrations/<ts>_crm_opportunite_client_link.sql`

- [ ] **Step 1** :

```sql
alter table crm.opportunites
  add column if not exists client_id uuid references public.clients(id) on delete set null;
create index if not exists opportunites_client_idx on crm.opportunites(client_id);
```

- [ ] **Step 2 — types** : ajouter `client_id: string | null` aux Row/Insert/Update `opportunites` dans `lib/crm/database.types.ts`.
- [ ] **Step 3 — Commit** : `feat(crm): opportunites.client_id back-link`.

### Task B2 : `createClientFromCompte`

**Files :** Create `lib/crm/actions/pont.ts` (+ test) — utilise le **client admin service-role** (`lib/supabase/admin` pour `public.clients`, `lib/crm/supabase/admin` pour `crm`).

- [ ] **Step 1 — Test** (`lib/crm/actions/pont.test.ts`) : mock supabase admin ; `createClientFromCompte` insère `clients { trigramme:'', raison_sociale: compte.nom, siret: compte.siret, apporteur_commercial_id: owner_id, apporteur_date: <today> }` et renvoie `clientId`. Idempotence : si `opportunite.client_id` déjà set, renvoie l'existant sans insert.
- [ ] **Step 2 — Run** → FAIL.
- [ ] **Step 3 — Implémenter** `createClientFromCompte(oppId): Promise<string>` (lit opp+compte via admin crm, insère client via admin public, gère l'erreur en log+throw contrôlé). Gabarit = `convertProspectToClient:369-382`.
- [ ] **Step 4 — Run** → PASS. **Commit** : `feat(crm): createClientFromCompte (pont)`.

### Task B3 : `buildSyntheseSnapshotFromOpportunite`

**Files :** Modify `lib/queries/passation.ts` (+ test)

- [ ] **Step 1 — Test** : à partir d'un jeu de données `crm` mocké (compte enrichi + 2 contacts + 1 rdv + opportunité négociée), la fonction produit un `SyntheseSnapshotV2` avec `identite/contacts/historique/engagements/calendrier` correctement mappés (mêmes assertions que le mapping prospect existant `:251-313`).
- [ ] **Step 2 — Run** → FAIL.
- [ ] **Step 3 — Implémenter** `buildSyntheseSnapshotFromOpportunite(supabase, oppId)` : lit `crm.opportunites` (négociation), `crm.comptes` (identité INSEE), `crm.contacts` (role/sensibilites), `crm.rdv` (historique), signature (`signature_requests` par `client_id` — cf. Lot C ; en attendant, signature null). Mappe 1:1 sur `SyntheseSnapshotV2`. `meta.tunnel = opp.type_prospect`. Renvoie `{ snapshot, clientId, commercialId: opp.owner_id, signature }`. Le `supabase` passé est un client typé `crm` OU on lit `crm` via un client dédié — préciser à l'implémentation (le module `passation.ts` est côté `public` : injecter un client admin `crm`).
- [ ] **Step 4 — Run** → PASS. **Commit** : `feat(passation): buildSyntheseSnapshotFromOpportunite`.

### Task B4 : Chemin passation depuis opportunité

**Files :** Modify `lib/passation/core.ts` (accepter une source opportunité)

- [ ] **Step 1 — Lire** `lib/passation/core.ts:1-120` (comprendre `buildSyntheseSnapshotFromProspect` consumer, insert `document_synthese`).
- [ ] **Step 2 — Ajouter** `genererSyntheseDepuisOpportunite(oppId)` : appelle B3, insère `document_synthese { client_id, prospect_id: null, contenu: snapshot, statut: 'generee', ... }`, idempotent (skip si une synthèse `client_id` existe déjà pour cette opp). Réutilise la logique d'insert existante (extraire un helper commun `insertSynthese(snapshot, anchor)` si `core.ts` la duplique).
- [ ] **Step 3 — Test** (mock) : appelle → un insert `document_synthese` client-ancré, `prospect_id null`, statut `generee`. **Commit** : `feat(passation): generer synthese depuis opportunite`.

### Task B5 : Déclencheur « gagnée »

**Files :** Modify `lib/crm/actions/opportunites.ts` (`moveOpportuniteStage:169`, `setOpportuniteStatut:216`)

- [ ] **Step 1 — Extraire** un helper `onOpportuniteGagnee(oppId)` (dans `lib/crm/actions/pont.ts`) : si `opp.client_id` null → `createClientFromCompte` → set `opportunites.client_id` → `genererSyntheseDepuisOpportunite`. Best-effort, non bloquant (échec = log `error`, ne casse pas le déplacement d'étape), idempotent.
- [ ] **Step 2 — Câbler** : dans `moveOpportuniteStage` et `setOpportuniteStatut`, après le passage réussi à `statut='gagnee'`, appeler `onOpportuniteGagnee(id)`.
- [ ] **Step 3 — Test** : passer une opp à `gagnee` → client créé + synthèse générée ; re-passer (idempotent) → pas de doublon.
- [ ] **Step 4 — `npm run build && npm test`** → PASS. **Commit** : `feat(crm): trigger client+passation on opportunite gagnee`.

### Task B6 : PR Lot B + déploiement + vérif prod

- [ ] PR `feat/crm-phase2-b-pont`, CI verte, merge, **déployer**. Smoke prod : gagner une opportunité de test → `public.clients` créé + `document_synthese` `generee` visible. **NE PAS enchaîner sur le DROP avant cette vérif.**

---

## LOT C — Préservation de la passation (PR #3)

### Task C1 : FK `document_synthese.prospect_id` → SET NULL

**Files :** Create `supabase/migrations/<ts>_passation_preserve_fk.sql`

- [ ] **Step 1** : `alter table public.document_synthese alter column prospect_id drop not null;` (si NOT NULL) puis drop+recreate la FK en `on delete set null` (lire la contrainte existante : `\d public.document_synthese`).
- [ ] **Step 2 — Commit** : `feat(passation): document_synthese.prospect_id nullable + SET NULL`.

### Task C2 : `signature_requests` client-based

**Files :** Create migration ; Modify `lib/signature/*`, webhook Yousign (`grep -rl "signature_requests\|uploadSignedDocument" lib app`)

- [ ] **Step 1 — Migration** : `add column client_id uuid references public.clients(id) on delete set null;` ; `alter column prospect_id drop not null` + FK `set null` ; backfill `update signature_requests s set client_id = p.client_id from prospects p where s.prospect_id = p.id and s.client_id is null`.
- [ ] **Step 2 — types** : `types/database.ts` (manuel ou regen ciblée).
- [ ] **Step 3 — Adapter** `lib/signature/*` + webhook pour écrire/lire `client_id` (le déclencheur passation pointe le client). Conserver le chemin prospect tant que Lot D pas fait.
- [ ] **Step 4 — Test + build** → PASS. **Commit** : `feat(signature): client-based signature_requests`. PR Lot C, merge, deploy.

---

## LOT D — Suppression des prospects (PR #4, destructif)

### Task D1 : Repoint des consommateurs (aucun DROP encore)

**Files :** `app/(dashboard)/accueil/*`, `vercel.json`, routes crons, `lib/queries/indicateurs/commercial.ts`, `components/**/CommercialSection*`, `lib/actions/rdv.ts`, LinkedIn.

- [ ] **Step 1 — Inventaire** : `grep -rln "prospects\|/commercial\|prospect_id\|rdv_commerciaux\|linkedin" app lib components` → liste exhaustive des sites.
- [ ] **Step 2 — accueil** : redirect rôle `commercial` → `/crm/dashboard`.
- [ ] **Step 3 — crons** : supprimer routes `app/api/cron/prospect-alertes` + `kpi-digest` + leurs entrées `vercel.json`.
- [ ] **Step 4 — reporting** : supprimer `lib/queries/indicateurs/commercial.ts` + `CommercialSection` + `commercial-kpis` + `prospect-mail` + action `lib/actions/rdv.ts` prospect.
- [ ] **Step 5 — LinkedIn** : supprimer `linkedin/ingest` + route + action.
- [ ] **Step 6 — Purger** tous les `revalidatePath('/commercial/*')` et deep-links notifs morts.
- [ ] **Step 7 — `npm run build`** → PASS (plus aucune ref aux modules supprimés). **Commit** : `refactor(commercial): repoint consumers off prospects`.

### Task D2 : Suppression UI

- [ ] Supprimer `app/(dashboard)/commercial/{prospects,kpis,linkedin}` + `components/commercial/*`. `npm run build` → PASS. **Commit** : `refactor(commercial): remove prospects UI`.

### Task D3 : Nav

**Files :** `components/layout/nav-config.tsx`

- [ ] Retirer les 5 entrées « Commercial » (garder « CRM ») ; relocaliser **Modèles** + **CDP plan-de-charge** sous section « Pilotage » (repointer hrefs, déplacer routes hors `/commercial` si nécessaire). `npm run build` → PASS. **Commit** : `refactor(nav): CRM-only commercial section + relocate Modeles/CDP`.

### Task D4 : DROP destructif

**Files :** Create `supabase/migrations/<ts>_drop_prospects.sql`

- [ ] **Step 1** : `drop table if exists public.prospect_communications, public.prospect_stage_history, public.prospect_contacts, public.prospect_notes, public.rdv_commerciaux, public.prospects cascade;` puis drop enums + RPC prospects (lister via `\dT` / `grep create.*prospect` migrations). **Vérifier** que `document_synthese`/`signature_requests` ne cascade PAS (FK SET NULL du Lot C en place).
- [ ] **Step 2 — types** : nettoyer `types/database.ts`.
- [ ] **Step 3 — `npm run build && npm test`** → PASS. **Commit** : `feat(db): DROP prospects tables (post-pont)`. PR Lot D.

---

## LOT E — Vérification de phase (PR #5 ou intégré)

- [ ] **Step 1 — `npm run typecheck && npm run build && npm test`** verts (aucune régression).
- [ ] **Step 2 — `grep -rn "revalidatePath('/commercial'" app lib components`** → 0.
- [ ] **Step 3 — `grep -rn "from('prospects')\|prospect_id" app lib components`** → 0 (hors migrations/historique).
- [ ] **Step 4 — Smoke e2e** (dev) : login commercial → opportunité négociée → `gagnée` → client + synthèse `generee` → échéances cron/affectation CDP OK.
- [ ] **Step 5 — Préservation** : une synthèse existante (client-ancrée) reste consultable + PDF rendu après DROP.
- [ ] **Step 6 — Commit** : `test(crm): phase 2 verification green`.

---

## Self-review (couverture spec)

- §3 mapping A2 → Task A1/A2/A3/A4/A5 ✓ (INSEE limité aux champs réellement exposés par le module ; naf_libelle/nb_implantations/ca manuels — écart documenté vs spec).
- §4 Lot B pont → B1-B6 ✓ · Lot C → C1-C2 ✓ · Lot D → D1-D4 ✓ · Lot E → E ✓.
- §5 séquencement (pont avant DROP) → ordre des lots + gate B6 ✓.
- §7 garde-fous : idempotence (B2/B5), best-effort INSEE (A4), service-role cross-schéma (B2/B3), types manuels (A2) ✓.
- Écart assumé : `type_prospect` ajouté (perf `cfa text` insuffisant) → A1 + mapping B3.

```

```
