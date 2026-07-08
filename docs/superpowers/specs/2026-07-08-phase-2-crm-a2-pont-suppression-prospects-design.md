# Phase 2 CRM — Enrichissement A2 + pont opportunité→client/passation + suppression des prospects

Date : 2026-07-08
Statut : **validé (décisions utilisateur verrouillées)**
Supersede : `2026-07-07-phase-2-crm-pont-suppression-prospects-design.md` (qui recommandait A2′ ; l'utilisateur a tranché **A2** + **DROP complet immédiat**).

---

## 1. Contexte & décisions verrouillées

- **Phase 1 livrée** (PRs #41/#42/#43) : CRM « Perf » dupliqué sous `/crm/*`, schéma Postgres `crm` dans la **même base** Supabase que `public`, auth SOLUVIA, isolation totale du repo perf (0 ref `outilcommercialPerf`).
- **Aujourd'hui deux systèmes commerciaux coexistent** : l'ancien `/commercial/prospects` (schéma `public`) **et** le nouveau `/crm` (schéma `crm`). Phase 2 fusionne : le CRM devient l'unique pipeline, les prospects disparaissent.
- **Décision A2** (utilisateur) : les champs négociation + enrichissement INSEE — absents du pipeline perf mais nécessaires à la synthèse de passation — sont **ré-ajoutés dans le pipeline CRM** (formulaires opportunité/compte/contact), pas dans un intake séparé au handover. `buildSyntheseSnapshotFromOpportunite` lit alors tout depuis `crm.*`.
- **Décision DROP complet immédiat** (utilisateur) : la Phase 2 va jusqu'au `DROP` destructif des tables prospects. **Ordre impératif conservé : le pont d'abord, le DROP en dernier**, une fois le pont vérifié en prod (sinon plus de source de passation).
- **Invariant** : le rendu PDF et le workflow passation (échéances cron, affectation CDP, RLS, signature) restent **inchangés**. Le snapshot `SyntheseSnapshotV2` est autoporteur (figé dans `document_synthese.contenu`) : seule la fonction _source_ du snapshot change.

## 2. Existant réutilisé (vérifié en lecture)

- `lib/insee/recherche-entreprises.ts` : enrichissement via `recherche-entreprises.api.gouv.fr` (gratuit, sans clé). Renvoie `{ siren, forme_juridique, code_naf, naf_libelle, effectif_tranche, nb_implantations, ca_dernier_exercice, region, ... }` (aligner sur les champs réellement exposés).
- `convertProspectToClient` (`lib/actions/prospects/pipeline.ts:339-410`) : gabarit de création `public.clients` (raison_sociale, siret, adresse, région…). À adapter en `createClientFromCompte`.
- `SyntheseSnapshotV2` (`lib/queries/passation.ts:37-96`) : contrat de données cible. `buildSyntheseSnapshotFromProspect` (`:170`) : gabarit à répliquer en version opportunité.
- Workflow passation (`lib/passation/core.ts`) : `buildSyntheseSnapshotFromProspect(supabase, prospectId)` est l'unique point de couplage prospect → à doubler d'un chemin opportunité.

## 3. Mapping A2 : champs à ajouter au schéma `crm`

Cible = tout ce que `SyntheseSnapshotV2` attend et que `crm.*` n'a pas encore. Colonnes nommées **à l'identique des prospects** pour minimiser l'écart de portage du builder.

### `crm.comptes` (enrichissement INSEE)

`forme_juridique text`, `siren text`, `code_naf text`, `naf_libelle text`, `effectif_tranche text`, `nb_implantations int`, `ca_dernier_exercice numeric(14,2)`.
(`nom`, `siret`, `site_web`, + adresse/région via `crm.adresses` : déjà présents.)

### `crm.contacts`

`role_decision text` (enum applicatif `RoleDecisionContact`, CHECK), `sensibilites text`.

### `crm.opportunites`

- **Négociation** : `perimetre_missions text`, `formations_rncp text[]`, `type_formation text` (CHECK `TypeFormation`), `taux_npec numeric(6,2)`, `duree_contrat_ans numeric(4,2)`, `mois_demarrage int`, `volume_an1 int`, `volume_an2 int`, `volume_an3 int`, `volume_garanti_seuil int`, `leviers text[]`.
- **Historique** : `canal_origine text` (CHECK `CanalOrigine`), `date_premier_contact date`, `initiateur text` (CHECK `InitiateurContact`), `historique_synthese text`.
- **Contrat / meta** : `numero_contrat text`, `type_prospect text` (CHECK `TypeProspect`, alimente `meta.tunnel` — perf n'a que `cfa boolean`, insuffisant ; ce champ explicite le tunnel APP/POE/… au niveau opportunité).
- **Calendrier** : `calendrier_previsionnel jsonb` (clés `JalonCalendrierKey`).
- **Pont** : `client_id uuid references public.clients(id) on delete set null` (back-link idempotent).

> Les enums applicatifs (`RoleDecisionContact`, `TypeFormation`, `CanalOrigine`, `InitiateurContact`, `JalonCalendrierKey`, `TypeProspect`) restent définis côté TS (`lib/utils/constants` / `lib/crm/domain/enums`) et matérialisés en `CHECK` texte (pas d'`enum` Postgres), cohérent avec le style du schéma `crm` existant. `lib/crm/database.types.ts` étant **écrit à la main**, il est mis à jour à la main à chaque ajout de colonne.

## 4. Lots d'implémentation (5 PRs séquentielles)

### Lot A — Enrichissement du pipeline CRM

1. Migration `crm` : colonnes du §3 (hors `client_id`, qui va au Lot B) + CHECK.
2. Mettre à jour `lib/crm/database.types.ts` (manuel).
3. Validators zod (`lib/crm/validators/*`) + formulaires :
   - Form **compte** : bloc INSEE + bouton « Enrichir via SIREN » (server action appelant `lib/insee`), pré-remplit forme_juridique/naf/effectif/…
   - Form **opportunité** : nouvel onglet/section « Négociation & passation » (les champs du §3 opportunités) ; le reste du form reste identique à perf.
   - Form **contact** : `role_decision` (select) + `sensibilites` (textarea).
4. Actions `crm` correspondantes (`lib/crm/actions/opportunites.ts`, `comptes.ts`, `contacts.ts`) : persister les nouveaux champs.

### Lot B — Le pont (opportunité gagnée → client + passation)

1. Migration : `crm.opportunites.client_id`.
2. `createClientFromCompte(compteId)` (adapté de `convertProspectToClient`) : insère `public.clients`, idempotent.
3. `buildSyntheseSnapshotFromOpportunite(supabase, oppId)` dans `lib/queries/passation.ts` : réplique le mapping de `buildSyntheseSnapshotFromProspect` en lisant `crm.comptes/contacts/opportunites/rdv` (+ signature). Renvoie `{ snapshot, clientId, commercialId, signature }`.
4. Hook sur `statut → 'gagnee'` (`lib/crm/actions/opportunites.ts` : `moveOpportuniteStage`, `setOpportuniteStatut`) : si pas déjà lié → `createClientFromCompte` → set `opportunites.client_id` → chemin passation `document_synthese` (client-ancré, `prospect_id NULL`, statut `generee`). Écriture cross-schéma via **client admin service-role** (`lib/crm/supabase/admin` + `lib/supabase/admin`). Idempotent (skip si `client_id` déjà présent).
5. `lib/passation/core.ts` : accepter une source opportunité (branche `buildSyntheseSnapshotFromOpportunite`) sans changer le reste.

### Lot C — Préservation de la passation (avant DROP)

1. Migration : `document_synthese.prospect_id` → nullable + FK `ON DELETE SET NULL` (remplace CASCADE).
2. `signature_requests` → client-based : ajouter `client_id` (nullable), rendre `prospect_id` nullable + `ON DELETE SET NULL` ; adapter `lib/signature/*` + webhook Yousign (`uploadSignedDocument`) pour pointer le client. Backfill `client_id` depuis `prospect_id`→`prospects.client_id` sur l'existant.

### Lot D — Suppression des prospects (destructif)

1. Repoint des consommateurs :
   - `app/(dashboard)/accueil` : redirect rôle `commercial` → `/crm/dashboard`.
   - Suppr. crons `prospect-alertes` + `kpi-digest` (routes + entrées `vercel.json`).
   - Retrait LinkedIn : `linkedin/ingest` + route + action.
   - Suppr. `lib/queries/indicateurs/commercial.ts` + `CommercialSection` (reporting redondant → dashboard CRM), `commercial-kpis`, `prospect-mail`, l'action `lib/actions/rdv.ts` prospect (remplacée par `crm.rdv`).
   - Purger les `revalidatePath('/commercial/*')` et deep-links notifs morts (~40 sites).
2. Suppr. UI : `app/(dashboard)/commercial/{prospects,kpis,linkedin}`, `components/commercial/*`.
3. Migration **DROP** (destructif, autorisé) : `prospects`, `prospect_notes`, `prospect_contacts`, `prospect_stage_history`, `prospect_communications`, `rdv_commerciaux` (public), enums prospect, RPC prospects. **Conserver** `public.clients` et `public.document_synthese`.
4. Nav (`components/layout/nav-config.tsx`) : retirer les 5 entrées « Commercial » (garder « CRM ») ; **relocaliser Modèles + CDP plan-de-charge** sous une section « Pilotage » (routes déplacées hors `/commercial` ou nav repointée).
5. Nettoyer `types/database.ts` (retrait des tables/relations supprimées).

### Lot E — Vérification de phase

- `npm run typecheck` + `npm run build` + `npm test` verts (aucune régression SOLUVIA).
- Smoke e2e (dev) : login commercial → créer opportunité (avec champs négociation) → la passer `gagnée` → `public.clients` créé (idempotent) + `document_synthese` `generee` client-ancrée + échéances cron/affectation CDP OK.
- Préservation : après DROP, synthèses existantes toujours consultables, PDF rendus (pas de cascade).
- `grep "revalidatePath('/commercial'" ` = 0 ; aucun 500 sur crons/indicateurs/accueil ; deep-links morts supprimés.

## 5. Séquencement & sécurité destructive

Ordre : **A → B → (déploiement + vérif prod du pont) → C → D → E**. Le DROP (D) n'est appliqué qu'après confirmation que le pont (B) produit bien clients + synthèses en prod. Chaque lot = une PR mergée (CI verte) et déployée.

## 6. Hors périmètre

- Rendu PDF de la synthèse (inchangé, autoporteur).
- Phase 3 (simplification IA/sidebar : fusion des vues d'ensemble, projets/internes & temps/équipe en onglets, refactor `sidebar.tsx`).
- Réplication exhaustive de l'ancien onglet négociation : on porte les champs utiles à `SyntheseSnapshotV2`, pas plus (YAGNI).

## 7. Risques & garde-fous

- **Perte de données passation** : mitigée par l'ordre A→E et la migration C (SET NULL) appliquée **avant** le DROP.
- **Écriture cross-schéma** : via service-role admin (RLS `crm` ne couvre pas `public.clients`/`document_synthese`) ; action idempotente pour tolérer les retries.
- **INSEE best-effort** : l'enrichissement ne doit jamais bloquer la sauvegarde d'un compte (échec API → champs laissés vides, log `info`).
- **Types manuels** : `lib/crm/database.types.ts` n'est PAS régénéré (`gen types` l'écraserait) — édition manuelle à chaque migration `crm`.
