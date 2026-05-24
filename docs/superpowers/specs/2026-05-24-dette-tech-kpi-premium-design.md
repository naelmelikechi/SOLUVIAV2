# Dette tech mineure + KPI premium - Design

> **Date** : 2026-05-24
> **Statut** : approuvé, prêt pour plan d'exécution
> **Decoupage** : 3 PRs séquentielles (mergeables indépendamment)

## Contexte

Apres la livraison du chantier devis multi-societe (PR #6/7/8/9) et OPCO (PR #10), il reste deux poches connues :

1. **Dette tech mineure** issue de Phase 3-4 devis + audit historique
2. **Dette gelee** sur le dashboard et les indicateurs (cf [[project-metrics-debt]]), volontairement mise de cote depuis 2026-04-24. Le gel est leve par cette decision.

L'objectif est de fournir des KPIs "premium" : sparklines 12 mois, section qualite/pedagogie complete, breakdown par type de contrat (APP/PDC/POE), snapshot mensuel multi-scope.

## Decisions metier prises

- **Source Qualiopi** : 100% Eduvia, pas de saisie SOLUVIAL ajoutee.
- **Indicateurs sans donnee** (Reussite, Rentabilite, Satisfaction si demande, Placement) : cards visibles avec valeur "N/D" + tooltip explicatif. Pas de masquage, pas de saisie alternative.

## Approche retenue

Sequentiel chantier par chantier en 3 PRs distinctes :

1. **PR 1 - Tech debt mineure** : pure plomberie, isole les refactors risques
2. **PR 2 - KPI snapshot etendu** : DB + CRON, prepare le terrain pour les sparklines
3. **PR 3 - Dashboard premium** : UI, consomme les snapshots de PR 2

Justification : permet de merger PR 1 et 2 sans bloquer sur les decisions UX de PR 3, et chaque PR reste reviewable.

---

## PR 1 - Tech debt mineure

### Items

| Item                                               | Action precise                                                                                                                                                                                            | Effort |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `odoo_company_id` / `odoo_journal_id` editables UI | Ajout 2 inputs `<Input type="number">` dans le form `/admin/parametres/societes-emettrices/[id]` + server action existante a etendre (validation int positif)                                             | S      |
| shadcn `radio-group` manquant                      | `npx shadcn add radio-group`, remplace `Select` par `RadioGroup` dans `components/devis/create-facture-from-devis-dialog.tsx` (3 modes acompte/solde/personnalisee)                                       | S      |
| `facture_lignes` colonnes redondantes nullable     | Migration `DROP COLUMN libelle, quantite, prix_unitaire_ht, taux_tva` (les valeurs vivent deja dans `description` + `montant_ht` + `tva_taux`). Adapter `createFactureFromDevis` pour ne pas les remplir. | S      |
| `dashboard-page-client.tsx` 655L                   | Split en 3 fichiers : `dashboard-kpi-grid.tsx` (cards financiers/operationnels), `dashboard-alerts.tsx` (section alertes), helpers purs `lib/utils/build-dashboard-data.ts`                               | M      |
| `indicateurs.ts` 710L                              | Split par domaine : `lib/queries/indicateurs/finance.ts`, `indicateurs/pedagogie.ts`, `indicateurs/qualite.ts`, `indicateurs/temps.ts` + barrel `index.ts` re-exportant pour compat retro                 | M      |

### Garde-fous

- Aucun changement fonctionnel sur dashboard / indicateurs (pure refacto). Les tests existants doivent passer sans modification.
- Migration DROP COLUMN guidee par `IF EXISTS` + verifie en local avant push (donnees actuelles utilisent les colonnes existantes `description/montant_ht`).
- Le re-export barrel preserve les imports actuels `from '@/lib/queries/indicateurs'`.

### Tests

- Vitest : couverture existante (538 tests) doit passer apres refacto. Pas de nouveau test attendu sauf si un helper extrait est testable de maniere isolee.
- Manuel : ouvrir `/admin/parametres/societes-emettrices/[id]`, modifier odoo fields, verifier persistance.
- Manuel : creer facture depuis devis avec radio-group (3 modes).

---

## PR 2 - KPI snapshot etendu

### Migration

`supabase/migrations/20260525100000_kpi_snapshots_extend.sql`

```sql
-- Documenter (commentaire SQL) les nouveaux type_kpi acceptes :
-- taux_qualiopi, pedagogie_avancement, taux_financement,
-- taux_abandon, taux_rupture, contrats_app, contrats_pdc, contrats_poe
-- Pas de CHECK constraint (type_kpi reste TEXT libre pour evolution).

-- Index compose pour requetes sparklines 12 mois sur scope+type
CREATE INDEX IF NOT EXISTS kpi_snapshots_scope_type_mois_idx
  ON kpi_snapshots (scope, scope_id, type_kpi, mois DESC);
```

### Refonte CRON `app/api/cron/snapshot/route.ts`

Structure :

```ts
// 1. Calculer tous les KPIs globaux (existant + nouveaux)
const globalKpis = await computeGlobalKpis(supabase);

// 2. Boucle projets actifs
const projets = await supabase.from('projets').select('id').eq('statut', 'actif')...
for (const projet of projets.data) {
  const projetKpis = await computeProjetKpis(supabase, projet.id);
  // upsert scope='projet', scope_id=projet.id
}

// 3. Boucle CDPs actifs
const cdps = await supabase.from('users').select('id').eq('role', 'cdp')...
for (const cdp of cdps.data) {
  const cdpKpis = await computeCdpKpis(supabase, cdp.id);
  // upsert scope='cdp', scope_id=cdp.id
}
```

Nouveaux KPIs (calcules pour les 3 scopes) :

| type_kpi               | Formule                                                                                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `taux_qualiopi`        | `SUM(taches_conformes) / SUM(taches_total)` sur Qualiopi du CFA scope (deja calcule par client dans `indicateurs.ts:386-396`, a etendre global) |
| `pedagogie_avancement` | `AVG(contrats_progressions.progression_percentage)` sur contrats actifs du scope                                                                |
| `taux_financement`     | `SUM(facturé_ht) / SUM(npec_amount)` sur contrats actifs du scope                                                                               |
| `taux_abandon`         | `count(contract_state IN ('resilie','ANNULE')) / count(total signed)` sur 12 mois glissants                                                     |
| `taux_rupture`         | Meme calcul que taux_abandon (Eduvia ne differencie pas), conserve comme alias pour future evolution                                            |
| `contrats_app`         | `count(contract_type = 'APP')` actifs                                                                                                           |
| `contrats_pdc`         | `count(contract_type = 'PDC')` actifs                                                                                                           |
| `contrats_poe`         | `count(contract_type = 'POE')` actifs                                                                                                           |

Idempotence : upsert `onConflict: 'mois,type_kpi,scope,scope_id'`, `ignoreDuplicates: true` (deja en place).

### Performance

- Boucle scope projet/cdp parallelisee via `Promise.all` chunks de 10 pour eviter explosion connexions Supabase
- `maxDuration = 300` (Fluid Compute default)
- Logger : count par scope a la fin (`{ global: N, projet: M, cdp: X }`)

### Tests

- pgTAP : index cree, ecriture scope=projet OK avec scope_id valide, RLS admin only
- Vitest : helpers purs `computeGlobalKpis`, `computeProjetKpis`, `computeCdpKpis` testes avec fixtures (au moins 1 test par formule)
- Manuel : trigger CRON localement (`curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/snapshot`), verifier `SELECT scope, count(*) FROM kpi_snapshots WHERE mois = '2026-05-01' GROUP BY scope`

### Backfill

Optionnel : script `scripts/backfill-kpi-snapshots.ts` qui rejoue le CRON pour les 12 derniers mois afin d'avoir des sparklines immediates en PR 3. A executer une fois en prod via `tsx scripts/backfill-kpi-snapshots.ts` (besoin SUPABASE_SERVICE_ROLE_KEY local). Si on saute le backfill, les sparklines se construisent naturellement mois apres mois.

---

## PR 3 - Dashboard premium

### Composant Sparkline

`components/shared/sparkline.tsx` (Server Component) :

```tsx
type Props = {
  kpiType: string; // 'projets_actifs', 'taux_qualiopi', ...
  scope: 'global' | 'projet' | 'cdp';
  scopeId?: string; // requis si scope != 'global'
  width?: number; // default 100
  height?: number; // default 30
  color?: 'green' | 'red' | 'blue'; // semantique : positif/negatif/neutre
};
```

Comportement :

- Server-side fetch : 12 derniers snapshots (`mois DESC LIMIT 12`) puis reverse pour chrono
- SVG inline polyline (pas de chart lib, garde le bundle leger)
- Dernier point en surbrillance (circle plus gros)
- Si < 2 points : affiche `--` discret
- Couleur : passee par caller, semantique inversee gerable cote consommateur (retards = rouge meilleure quand baisse)

### Section §5 KPIs Qualite & Pedagogie

Nouvelle section sur `/dashboard` apres KPIs operationnels. 6 cards en grid 3 colonnes (responsive 2 / 1 sur mobile) :

| Card             | Source                                            | Affichage si dispo                                                                                  | Si N/D                                                        |
| ---------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Qualite Qualiopi | `kpi_snapshots` type=`taux_qualiopi` scope=global | `XX%` + sparkline 12m + tooltip "Taches conformes Qualiopi sur tous les CFA"                        | -                                                             |
| Pedagogie        | `kpi_snapshots` type=`pedagogie_avancement`       | `XX%` + sparkline + "Avancement moyen apprenants actifs"                                            | -                                                             |
| Reussite         | -                                                 | -                                                                                                   | `N/D` + tooltip "Donnees examens non disponibles cote Eduvia" |
| Financement      | `kpi_snapshots` type=`taux_financement`           | `XX%` + sparkline + "Part facturee vs NPEC total contrats actifs"                                   | -                                                             |
| Abandons         | `kpi_snapshots` type=`taux_abandon`               | `XX%` + sparkline (semantique inversee : rouge si hausse) + "Contrats resilies/annules sur 12 mois" | -                                                             |
| Rentabilite      | -                                                 | -                                                                                                   | `N/D` + tooltip "Couts directs non traces, formule a definir" |

Code N/D : composant partage `<KpiCardPlaceholder title tooltip />` pour reutilisation.

### Breakdown APP/PDC/POE

Sur la card "Contrats actifs" existante (section §4 KPIs operationnels) :

- Recupere `kpi_snapshots` du mois en cours pour `contrats_app`, `contrats_pdc`, `contrats_poe`
- Affiche sous-texte : `dont N APP · M PDC · X POE` (separateur · pour densite visuelle)
- Fallback si snapshot du mois pas encore ecrit : count en live via `SELECT contract_type, count(*) FROM contrats WHERE archive=false AND contract_state IN (...) GROUP BY contract_type`

### Sparklines sur cards existantes

Section §3 KPIs financiers et §4 operationnels : ajout `<Sparkline>` sous chaque valeur pour les KPIs suivants (deja snapshote) :

- `projets_actifs`, `factures_emises`, `factures_en_retard`, `total_facture_ht`, `total_encaisse`, `contrats_actifs`

Pas de toggle masquable en V1 (mentionne dans spec 08 §3 mais YAGNI - tous visibles par defaut).

### Scope CDP

- Quand `role = 'cdp'`, les cards lisent `scope='cdp'` `scope_id=auth.uid()`
- Quand `role = 'admin'`, lit `scope='global'`
- Coherent avec RLS existante et spec 08 §1.4

### Tests

- Vitest : composant Sparkline (render avec 0, 1, 12 points), helpers `formatKpiValue`
- Vitest : helpers calculs reutilises par snapshot (already covered PR 2)
- Manuel : ouvrir `/dashboard` admin, verifier sparklines + section §5, switch CDP, verifier scope-filter

---

## Architecture decisions cles

1. **Source unique pour sparklines** : `kpi_snapshots` (deja en place, juste a etendre). Pas de re-calcul a la volee, pas de cache custom. La verite vit dans cette table.
2. **N/D explicite** : pas de hide, pas de fake data. Tooltip explicatif pour transparence operationnelle.
3. **Refacto cosmetique avant features** : PR 1 prepare le terrain (split fichiers) pour que PR 3 modifie un dashboard-page-client lisible.
4. **Pas de framework chart** : SVG inline pour sparklines, garde le bundle leger (deja zero chart lib dans le projet).
5. **Backfill optionnel** : sparklines fonctionnent meme avec 1 mois de donnees, le backfill est confort.

## Risques et mitigations

| Risque                                                        | Mitigation                                                                        |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| DROP COLUMN sur `facture_lignes` casse une feature non testee | Verifier en local + grep usage avant push, migration reversible                   |
| Split `indicateurs.ts` casse imports                          | Barrel `index.ts` preserve compat, typecheck full apres                           |
| CRON snapshot scope projet/cdp explose en temps execution     | Chunks de 10 + maxDuration 300, alerter si > 60s en logs                          |
| Sparkline sur card sans 12 mois historique = vide             | Affiche `--` discret, ne casse pas le layout                                      |
| Calcul `taux_qualiopi` global different de la moyenne par CFA | Documenter dans code : c'est `SUM(conformes)/SUM(total)`, pas `AVG(taux_par_cfa)` |

## Liens

- [[project-metrics-debt]] - dette historique levee par ce chantier
- [[project-progress]] - snapshot 2026-05-12 mentionne les chantiers gelees
- Spec source : `specs/08-dashboard.html` §5 (lignes 355-407)
- Existant : `app/api/cron/snapshot/route.ts`, `lib/queries/dashboard.ts`, `lib/queries/indicateurs.ts`
