# Commercial → CRM « Perf » (duplication) + simplification de la navigation

Date : 2026-07-06
Statut : **design** — archi **tranchée** (Option 1 : CRM intégré dans l'app SOLUVIA) ; reste à confirmer le sort de LinkedIn/Modèles/CDP.
Base : 3 explorations parallèles (SOLUVIA commercial, IA/sidebar SOLUVIA, CRM `outilcommercialPerf`) + lectures directes.

---

## 1. Décisions actées (utilisateur)

- **« exactement pareil »** = reprendre **tout** le CRM `outilcommercialPerf`
  (`/Users/nael/Developer/outilcommercialPerf`), même logique / même façon de
  faire. **Duplication du code autorisée.** Contrainte dure : **aucune
  dépendance entre les deux apps** (aucun import du repo perf, pas de
  DB/runtime partagé **avec perf**).
- **« supprimer »** = suppression des données CRM SOLUVIA (prospects & co).
- **Emplacement & accès** _(tranché 2026-07-06)_ : le CRM vit **dans l'app
  SOLUVIA** (`app.mysoluvia`), accessible **commerciaux + admins**, **un seul
  login** (auth SOLUVIA). Exigence produit : le rendu **ressemble exactement**
  au CRM perf. ⇒ **Option 1** (§3).
- **Le reste** : trancher ce qui cloche produit — redondances, duplications
  inutiles, incohérences.

Stack identique des deux côtés (Next 16 · React 19 · Supabase SSR · Tailwind v4
· @base-ui/react) → la duplication est réaliste, sans réécriture.

---

## 2. Ce que « perf » apporte (résumé de l'inventaire)

Modèle **opportunité** (compte/société + contacts + adresses + RDV) qui avance
par **étapes** ; tout le reste gravite autour.

| Bloc           | Contenu perf                                                                                                                                                                                                                                                                                                                  |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Routes (8)     | `/dashboard`, `/pipeline`, `/relances`, `/rdv`, `/recap` (admin), `/utilisateurs` (admin), `/compte`, `/login` + cron `/api/cron/recap`                                                                                                                                                                                       |
| Modèle données | ~12 tables : `profiles, etapes, comptes, contacts, adresses, opportunites, activites, relances, rdv (+ rdv_commerciaux M2M), notifications, recaps` ; enums en CHECK ; RPC `create_opportunite_complete` ; triggers `handle_new_user`/`set_updated_at`/anti-escalade                                                          |
| Dashboard      | KPI cards + funnel (recharts) + activité récente + carte régions + risk cards — **une seule** surface de reporting commercial                                                                                                                                                                                                 |
| Domaine pur    | `lib/domain/*` (pipeline, funnel, relances buckets, géo 101 dépts/13 régions, dates Paris) — **testé**                                                                                                                                                                                                                        |
| Intégrations   | Resend (invite/reset/récap), cron Vercel `0 16 * * 1,3,5`, Realtime optionnel, comptes « fantômes » (`HIDDEN_USER_EMAILS`), lookup `geo.api.gouv.fr`                                                                                                                                                                          |
| Déps à ajouter | `react-hook-form`, `@hookform/resolvers`, `@dnd-kit/core`, `react-big-calendar` (+ dev `@types/react-big-calendar`). **Ne PAS** copier `@dnd-kit/sortable` / `@dnd-kit/utilities` (déclarés mais jamais importés). Déjà présents chez SOLUVIA : @tanstack/react-table, recharts, cmdk, sonner, date-fns, @base-ui/react, zod… |

---

## 3. Architecture — **tranché : Option 1 (CRM intégré, login unique)**

Le CRM perf est **déjà** une app autonome avec **sa propre auth** (table
`profiles`, `handle_new_user`, rôle `admin|membre`) et **son propre projet
Supabase**. Deux conséquences imposent un choix :

1. **Collisions de tables** si le CRM partage la base SOLUVIA : au moins
   `rdv_commerciaux` et `notifications` existent des deux côtés (et `contacts`,
   `profiles`/`users`). Cohabitation impossible sans namespacing.
2. **Auth double** : réutiliser la coquille + le login SOLUVIA impose de
   remapper l'auth perf ; garder l'auth perf impose un second login.

**Décision : Option 1.** Le CRM est **monté dans l'app SOLUVIA** (`app/(crm)/`,
`lib/crm/`, `components/crm/`), **réutilise l'auth + le Supabase SOLUVIA**, et
n'est visible que pour **commerciaux + admins**. On duplique le code perf mais
on **remappe sa couche auth** (`profiles`/`admin|membre` → `users`/rôles
SOLUVIA) et on **namespace ses tables** dans un schéma Postgres `crm` (évite les
collisions `rdv_commerciaux`/`notifications`/…). Un seul login, une coquille,
sidebar unifiée. Couplage **interne** CRM↔données SOLUVIA assumé ; **zéro**
couplage au repo perf (duplication de code uniquement).

> **Exigence de fidélité :** l'UI du CRM (dashboard, kanban pipeline, drawer
> opportunité, création unifiée, relances, calendrier RDV) doit **ressembler
> exactement** à perf. On adapte l'auth/DB (invisible pour l'utilisateur), **pas**
> le rendu.

_Écartée — Option 2 (app séparée, projet Supabase dédié, auth perf telle quelle,
lien externe) :_ « aucune dépendance » au sens fort, mais impose un **second
login** — incompatible avec « dispo dans l'app pour commerciaux + admins ».

---

## 4. Ce qui cloche produit — redondances & duplications

### 4.A — Redondances que la migration doit SUPPRIMER (côté commercial)

**4.A.1 — Reporting commercial en 3 exemplaires (bientôt 4).**
Aujourd'hui les mêmes chiffres commerciaux vivent à 3 endroits :
`app/(dashboard)/commercial/kpis` (KpiDashboard : cards + funnel + tunnel +
origine + export CSV), `components/indicateurs/commercial-section.tsx` (RDV
réalisés / contrats signés / apprenants apportés / volume), et des bribes dans
`/dashboard`. Le dashboard perf (cards + funnel + activité + carte régions +
risk) **consolide tout ça**. → à la migration, **supprimer `/commercial/kpis`
et `CommercialSection`** ; le reporting commercial vit dans le seul dashboard
CRM.

**4.A.2 — RDV en double.**
SOLUVIA a **déjà** un module RDV commercial : `lib/actions/rdv.ts` (14,9 Ko),
`components/commercial/fiche/{rdv-form-dialog,fiche-rdv-tab}.tsx`,
`prospect-rdv-section.tsx`, table `rdv_commerciaux`. Perf a **son** module RDV
(calendrier react-big-calendar + listes + formulaires). → ne pas garder les
deux : le RDV perf **remplace** le RDV prospects.

**4.A.3 — `prospects` → `opportunites` : tout le modèle est remplacé.**
`prospects` + 6 tables filles (`prospect_notes/contacts/stage_history/
communications`) + 3 tables « tunnel » (`rdv_commerciaux`, `signature_requests`,
`document_synthese`), enums (`type_prospect`, `stage_prospect` 6 valeurs,
`canal_origine`, `role_decision_contact`), RPC (`get_prospect_time_in_stage_
median`, `find_prospect_duplicates`) → **supprimés**, remplacés par le modèle
opportunité. La suppression simplifie (on ne conserve pas l'enum 6-états).

### 4.B — Redondances IA / navigation (indépendantes du commercial)

C'est le cœur du « simplifier la vue de gauche, trop complexe ». 25 liens / 6
groupes. Problèmes classés :

**4.B.1 — QUATRE surfaces « vue d'ensemble ».** `Accueil` (landing
rôle-adaptative), `Dashboard` (KPI/finance/qualité), `Indicateurs`
(Cdp/Commercial/Tech) **+** `commercial/kpis`. Toutes répondent « comment on va
? » avec des cartes qui se recoupent. Le design `2026-06-22-accueil-pilotage-
cdp` avait **explicitement reporté** le reshuffle — dette à payer maintenant.
→ fusionner en **un hub Pilotage** à onglets rôle-scopés (worklist / finance /
ratios) ; au minimum replier `Indicateurs` dans des onglets de `Dashboard`.

**4.B.2 — TROIS surfaces « personnes » + collision de nom.** `/equipe`
(annuaire + chat), `/temps/equipe` (récap temps équipe, **orphelin**, titré
littéralement « Équipe »), `/admin/utilisateurs` (CRUD users + coûts). Deux
destinations s'appellent « Équipe ». → `/temps/equipe` devient un **onglet de
`/temps`** ; garder `/equipe` (annuaire) et `/admin/utilisateurs` (CRUD) ;
arrêter de nommer 2 choses « Équipe ».

**4.B.3 — CDP éclaté sur 4 destinations.** `/accueil` (worklist CDP),
`/commercial/cdp` (plan de charge), `/a-facturer` (worklist facturation CDP),
`indicateurs/cdp-section` (ratios). Aucun « chez-soi » CDP. _(NB : `/commercial/
cdp` ≠ `/a-facturer` — l'un est capacité, l'autre facturation ; ce ne sont pas
des doublons, mais l'éclatement l'est.)_ → un hub **« Mon plan de charge »**
regroupant charge + à-facturer + worklist.

**4.B.4 — Idées mal rangé et doublé.** `/idees` est sous la section **Équipe**
alors que c'est du feedback produit ; et `Indicateurs` promet aussi un « suivi
des idées produit ». → sortir Idées de « Équipe » (grouper Produit/Feedback) ;
Indicateurs **lie** vers Idées au lieu de le re-surfacer.

**4.B.5 — Projets vs Projets internes = un hack dans la sidebar.**
Deux entrées de nav qui partagent le préfixe `/projets`, forçant un
active-state spécial (`!startsWith('/projets/internes')`). → « internes »
devient un **onglet/scope de `/projets`** ; supprime 1 entrée + le cas
particulier.

**4.B.6 — Notifications : page + cloche + faux « Retour ».** La cloche topbar
mène à `/notifications`, page qui code en dur un « Retour → /dashboard ». →
soit popover sur la cloche, soit garder la page sans le faux retour — pas les
deux entrées + un lien présomptueux.

**4.B.7 — Incohérences admin.** `Référentiel OPCO` est à la fois sous
`Paramètres` **et** item de nav autonome (sa sœur `sociétés-émettrices` n'est
que sous Paramètres) ; `/admin` = pur redirect ; `/admin/audit` = **orphelin**
(aucune nav) ; libellé **mort** `pipeline` dans les breadcrumbs (aucune route).
→ un seul foyer OPCO, surfacer ou retirer `/admin/audit`, supprimer le libellé
mort.

### 4.C — Duplication interne (code)

**4.C.1 — `sidebar.tsx` = 435 LOC, marqué `no-giant-component`.** Le poids
n'est pas les 25 liens (pilotés par config) mais le **rendu dupliqué** :
markup de badge écrit **4×** (replié/déplié × section/admin), active-state
calculé **2×** avec règles différentes, **footer profil dupliqué**
replié-vs-déplié (~130 LOC), 2 boucles de nav divergentes (sections + admin).
→ un seul `<NavItem>` + un seul `<Badge>` + une seule fonction active-state +
footer unique ⇒ ~150 LOC.

**4.C.2 — Deux fiches prospect parallèles.** `prospect-detail-sheet.tsx`
(slide-over du kanban) duplique un sous-ensemble de la fiche complète
`commercial/prospects/[id]` (6 onglets). Même entité, 2 UX. _(Moot après
migration — mais confirme que « tout remplacer » est le bon geste.)_

**4.C.3 — Deux queries de liste quasi identiques.** `getProspectsList` et
`getProspectsGroupedByStage` partagent le même bloc de filtres et tapent
`prospects`, tous deux chargés à chaque rendu. _(Moot après migration.)_

**4.C.4 — Staleness incohérente.** Le kanban (`prospect-row`) calcule la
fraîcheur sur `updated_at`, la table/fiche (`prospect-sante-badge`) sur
`derniere_action_at` → un prospect « stale » en kanban peut être « frais » en
table. _(Moot après migration.)_

**4.C.5 — Flag mort `can_validate_ideas`.** `lib/utils/roles.ts:40` **ignore**
son paramètre (« kept for backwards compatibility… its value is ignored »),
mais le flag est encore trimballé dans `DashboardShellUser` et lu en DB. → à
retirer.

---

## 5. Sidebar — avant / après

**Avant :** 25 liens · 6 groupes (Pilotage/Opérations/Commercial/Facturation/
Équipe + Administration) · 435 LOC · 5 flags de gating · badges sur 5 items.

**Après (proposé) :**

- **Pilotage** : Accueil, Pilotage (ex-Dashboard+Indicateurs à onglets).
- **Opérations** : Projets (avec onglet Internes), Temps (avec onglet Équipe),
  Qualité, Production.
- **Commercial** : **CRM** — section perf repliée à sa nav plate (Dashboard /
  Pipeline / Relances / RDV), gate commerciaux + admins.
- **Facturation** : Devis, Facturation, À facturer.
- **Produit** : Idées.
- **Administration** (admin) : Clients, Utilisateurs, Intercontrat, Bugs,
  Syncs, Paramètres (OPCO + sociétés-émettrices en sous-pages), Historique.

Refactor `sidebar.tsx` en composants unitaires (un rendu, pas 4 copies).

---

## 6. Migration — phases (esquisse, à détailler en plan d'implémentation)

1. **Socle CRM** : dupliquer l'arbre perf sous namespace SOLUVIA (`app/(crm)/`,
   `lib/crm/`, `components/crm/`) ; ajouter les déps ; recréer le schéma
   (migrations perf 0001→0016 + seed 7 étapes) dans un schéma Postgres `crm` ;
   remapper l'auth perf sur `users`/rôles SOLUVIA ; câbler Resend, cron, env.
2. **Suppression prospects** : couper/repointer les conscommateurs externes
   (§7), supprimer routes/queries/actions/composants `commercial/*` prospects +
   `commercial/kpis` + `CommercialSection` ; **DROP** `prospects` & filles
   (garder `clients`) ; nettoyer `types/database.ts`, nav, deep-links.
3. **Simplification IA** : fusions §4.B (overview, personnes, projets/onglets,
   idées, OPCO, orphelins, libellé mort) + refactor `sidebar.tsx`.
4. **Vérif & nettoyage** : tests domaine perf portés, e2e smoke, build, purge
   du code mort (flag `can_validate_ideas`, etc.).

---

## 7. Points de rupture (blast radius) — à traiter avant tout DROP

**Cascade FK.** `DELETE/DROP prospects` **cascade-supprime**
`prospect_notes/contacts/stage_history/communications` **et**
`rdv_commerciaux`, `signature_requests`, `document_synthese` (piège : ces 3
dernières ne portent pas le préfixe `prospect_`). `clients`/`users` intacts
(FK `SET NULL`).

**Clients convertis.** `convertProspectToClient` (`lib/actions/prospects/
pipeline.ts`) crée des `clients` ; au wipe, `client_id` passe `SET NULL` → les
clients **restent** (c'est voulu, ce sont de vrais clients). Ne pas les purger.

**Consommateurs hors `commercial/` à repointer/couper** :
`app/api/cron/prospect-alertes`, `app/api/cron/kpi-digest`,
`app/api/webhooks/yousign`, `lib/actions/{passation,signatures,rdv,prospect-
mail}.ts`, `lib/actions/linkedin/ingest.ts`, `lib/queries/{commercial-kpis,
passation,indicateurs/commercial}.ts`, redirect `accueil` (vue `commercial` →
`/commercial/prospects`), **~40** `revalidatePath('/commercial/…')` +
notifications `lien=/commercial/…`. **`indicateurs/commercial.ts`** lit
`rdv_commerciaux` (métrique RDV hebdo) → à re-scoper ou brancher sur le CRM.

**Décisions env perf** : `RECAP_RECIPIENTS` (défaut codé `iladj@mysoluvia.com`),
`NEXT_PUBLIC_SITE_URL` (défaut `perf.mysoluvia.com` → **doit** pointer SOLUVIA
sinon emails cassés), `RESEND_FROM` (rebrand), `HIDDEN_USER_EMAILS`,
`NEXT_PUBLIC_REALTIME`, CSP `connect-src` doit autoriser `geo.api.gouv.fr` +
`*.supabase.co`.

**Intégration (requis).** Fusionner la logique `proxy.ts`/session perf dans le
middleware SOLUVIA (pas de 2ᵉ proxy) ; éviter un double `Toaster`/`ThemeProvider`
au root layout ; l'écran `/utilisateurs` perf est redondant avec
`/admin/utilisateurs` SOLUVIA → **ne pas** le porter ; idem `/compte` perf vs
`parametres-compte` SOLUVIA.

---

## 8. Surface (fichiers principaux)

- **Nouveau (dup. perf)** : `app/(crm)/*`, `lib/crm/*`, `components/crm/*` ;
  `supabase/migrations/` (schéma `crm`) ; +4 déps `package.json`.
- **Supprimé** : `app/(dashboard)/commercial/*`, `components/commercial/*`,
  `lib/queries/{prospects,commercial-kpis,cdp,linkedin,templates,signatures,
passation}.ts` (selon conservation), `lib/actions/prospects/*` +
  `{signatures,passation,prospect-mail,linkedin}.ts`,
  `components/indicateurs/commercial-section.tsx`.
- **Modifié** : `components/layout/{nav-config,sidebar,topbar}.tsx`,
  `hooks/use-badge-counts.ts`, `app/(dashboard)/{accueil,dashboard,
indicateurs,projets,temps}/*`, `lib/queries/indicateurs/commercial.ts`,
  crons + webhook, `types/database.ts`, `lib/utils/roles.ts`.

---

## 9. Hors périmètre

- **LinkedIn** : couplé aux prospects (ingest) → **retiré** avec eux (perf n'en
  a pas). Un futur LinkedIn→opportunités serait un v2.
- **Modèles** (templates) et **CDP plan-de-charge** : indépendants des prospects
  et absents de perf → **conservés comme destinations autonomes hors CRM**
  (sortis de la section Commercial). _À confirmer : conserver ou jeter._
- Refonte visuelle au-delà de la parité perf + dégraissage sidebar.

---

## 10. Vérification (à l'implémentation)

- Tests domaine perf **portés** (pipeline/funnel/relances/geo/dates) verts.
- Build + typecheck + lint ; e2e smoke : login → CRM (pipeline/rdv/relances/
  dashboard), et parcours SOLUVIA inchangés (facturation, projets, temps).
- Probe : après DROP prospects, `indicateurs`, crons, webhook yousign,
  passation ne 500 pas (consommateurs repointés).
- Aucun `revalidatePath('/commercial/…')` ni `lien` mort restant (grep).
- Sidebar : liens < 20, `sidebar.tsx` < ~180 LOC, plus aucun libellé mort.
