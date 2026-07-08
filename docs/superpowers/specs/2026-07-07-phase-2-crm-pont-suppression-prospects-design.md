# Phase 2 — Pont CRM→SOLUVIA (opportunité gagnée → client + passation) + suppression des prospects

Date : 2026-07-07
Statut : **design / à valider**
Base : décision utilisateur **(A)** ; le CRM est une **feature de SOLUVIA dans le même environnement** (une app, une base Supabase, un login ; tables dans le schéma `crm`).

---

## 1. Contexte & décision

- Phase 1 livrée : CRM perf dupliqué sous `/crm/*`, schéma `crm` **dans la même base** que `public`.
- **(A)** : une opportunité **gagnée** dans le CRM doit **créer le client SOLUVIA** (`public.clients`) et **déclencher la passation** (handover CDP). La passation est **load-bearing** (Qualiopi / portefeuille CDP) et **doit survivre** à la suppression des prospects (le code l'anticipe : synthèse ancrée sur `client_id`).
- Tout étant dans une base : le pont = **write cross-schéma transactionnel** (RPC/trigger Postgres, ou server action via client admin), pas d'appel inter-projet.

## 2. Le trou de données passation (mapping vérifié)

`SyntheseSnapshotV2` (`lib/queries/passation.ts:37`) attend des champs que le **prospect** capturait mais que l'**opportunité perf n'a pas** :

| Section           | Champs clés                                                                                                               | Source perf (`crm.*`)                                             | Trou                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `meta`            | referenceDossier, numeroContrat, dateSignature, tunnel                                                                    | tunnel ← `opportunites.cfa`                                       | contrat/signature ✗                                                                                                   |
| `identite`        | raisonSociale, siret, siege, region, siteWeb                                                                              | `comptes.nom/siret/adresse` + `adresses.region/…`, `site_web` ✓   | **formeJuridique, siren, codeNaf, nafLibelle, effectif, nbImplantations, caDernierExercice ✗ (enrichissement INSEE)** |
| `contacts`        | nom, poste, email, tél                                                                                                    | `contacts.prenom+nom/fonction/email/telephone` ✓                  | **role (décision), sensibilites ✗**                                                                                   |
| `historique`      | canal, datePremierContact, rdvs, evolution                                                                                | `source`, `created_at`, `crm.rdv` ~                               | initiateur, evolution ✗                                                                                               |
| **`engagements`** | perimetre, formationsRncp, typeFormation, **tauxNpec, dureeAns, moisDemarrage, volumeAn1-3, volumeGarantiSeuil, leviers** | `formation_visee`~, `nb_alternants`~, `date_demarrage_souhaitee`~ | **quasi tout ✗ (négociation)**                                                                                        |
| `calendrier`      | jalons                                                                                                                    | `date_cible_prochain_rdv`~                                        | ✗                                                                                                                     |

→ **Le cœur de la valeur passation (négociation + INSEE) n'existe pas dans perf.** Un pont naïf produirait une synthèse vide sur ces sections = perte d'intelligence commerciale pour le CDP.

## 3. Décision : où capturer négociation + INSEE ?

- **(A1) Synthèse appauvrie** — sections engagements/INSEE vides. Rapide mais dégrade un process métier réel. ✗ déconseillé.
- **(A2) Enrichir le pipeline CRM** — ajouter NPEC/volumes/leviers/INSEE + rôle contact aux formulaires perf. Fidèle métier mais **écarte « exactement perf »** (formulaires alourdis, saisie tôt/spéculative).
- **(A2′) [RECOMMANDÉ] Capture au handover** — le pipeline CRM reste **exactement perf** ; au passage **gagnée**, un **formulaire d'intake passation** présente une fois les champs négociation/INSEE (repris de l'ancien onglet négociation du prospect) → alimente la synthèse. La donnée est saisie **là où elle est consommée** (au handover), sans polluer le pipeline. C'est aussi le moment métier naturel (le deal est signé, les termes sont connus).

## 4. Le pont (A2′)

Déclencheur : `crm.opportunites.statut → 'gagnee'` (`moveOpportuniteStage` / `setOpportuniteStatut`, `lib/crm/actions/opportunites.ts`).

1. **Créer le client** `public.clients` depuis `crm.comptes` (raison_sociale, siret, adresse, région…). Réutiliser la logique de `convertProspectToClient` (`lib/actions/prospects/pipeline.ts:339-410`) comme gabarit. Back-link via une **nouvelle colonne `crm.opportunites.client_id`** (idempotence : ne recrée pas si déjà lié).
2. **Intake passation** : server action `ouvrirPassationDepuisOpportunite(oppId)` → écran formulaire (négociation/INSEE + rôle contacts) → **nouveau `buildSyntheseSnapshotFromOpportunite`** (compte/contacts/adresses/rdv `crm.*` + saisies intake) produisant un `SyntheseSnapshotV2`.
3. **Insérer `public.document_synthese`** (ancré `client_id`, `prospect_id = NULL`) statut `generee` → **le reste du workflow passation est INCHANGÉ** (échéances cron, affectation CDP, rendu PDF, RLS).
4. **Signature** : rendre `signature_requests` **client-based** (`client_id`, `prospect_id` nullable) — Yousign reste générique (`lib/signature/*`). Le déclencheur passation (`uploadSignedDocument`/webhook) pointe alors le client.

## 5. Suppression des prospects (APRÈS le pont)

Ordre impératif : le pont d'abord (sinon plus de source de passation).

1. **Préserver la passation** : migration — `document_synthese.prospect_id` → **nullable + `ON DELETE SET NULL`** (au lieu de CASCADE) ; idem `signature_requests` (migré client-based). Les synthèses existantes gardent `client_id`.
2. **Repointer / supprimer les consommateurs** : accueil redirect `commercial` → `/crm/dashboard` ; supprimer crons `prospect-alertes` + `kpi-digest` (+ `vercel.json`) ; retirer `linkedin/ingest`+route+action, `indicateurs/commercial` + `CommercialSection`, `commercial-kpis`, `prospect-mail`, l'action `rdv.ts` prospect (remplacée par `crm.rdv`). Purger les ~40 `revalidatePath('/commercial/*')` / liens notifs.
3. **Supprimer l'UI** : `app/(dashboard)/commercial/{prospects,kpis,linkedin}`, `components/commercial/*`.
4. **DROP** (migration destructive, données CRM autorisées à la suppression) : `prospects`, `prospect_notes/contacts/stage_history/communications`, `rdv_commerciaux`, enums prospect, RPC prospects. **Conserver** `public.clients` et `public.document_synthese`.
5. **Nav** : retirer les 5 entrées « Commercial » (garder « CRM ») ; **relocaliser** Modèles + CDP hors `/commercial`.
6. Nettoyer `types/database.ts`.

## 6. Sous-ensemble sûr (exécutable immédiatement, zéro DROP, zéro impact passation)

- Supprimer `/commercial/kpis` + `indicateurs/CommercialSection` (reporting redondant → dashboard CRM).
- Supprimer le cron `prospect-alertes` + LinkedIn (ingest/route/action) _(après check du déclencheur LinkedIn)_.
- Relocaliser **Modèles** et **CDP plan-de-charge** hors `/commercial` (routes + nav).

## 7. Séquencement

1. **(parallèle, maintenant)** sous-ensemble sûr §6.
2. **Pont A2′** §4 (client + intake + `buildSyntheseSnapshotFromOpportunite` + `document_synthese`) — le CRM étant live.
3. **Migration préservation passation** §5.1 (FK SET NULL) + signature client-based.
4. **Suppression pipeline prospects + DROP** §5.2-6.
5. **Vérif** §9.

## 8. Hors périmètre

- Rendu PDF de la synthèse (inchangé, autoporteur).
- Simplification IA/sidebar (phase 3).
- Réplication 1:1 de l'ancien onglet négociation (l'intake reprend les champs utiles à la synthèse, pas plus).

## 9. Vérification

- **Pont** : opportunité gagnée (test) → `public.clients` créé (idempotent) + `document_synthese` `generee` (client-anchored) + workflow passation (échéances cron, affectation CDP) fonctionnel.
- **Préservation** : après `DROP prospects`, les synthèses existantes restent consultables (pas de cascade), les PDF se rendent.
- **Non-régression** : aucun 500 sur crons/indicateurs/accueil ; `grep revalidatePath('/commercial'` → 0 ; deep-links morts supprimés.
- `tsc` + `next build` + tests + smoke (login → gagner une opp → voir le client + la synthèse).
