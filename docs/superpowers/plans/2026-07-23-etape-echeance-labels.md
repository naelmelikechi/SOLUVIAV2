# Labels "Engagement (étape 1)" / "Échéance n°N" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre visible partout (onglet À l'engagement, lignes/PDF de facture, liste des factures, carte Finance projet) si une commission porte sur la 1ère étape (engagement) ou une échéance OPCO suivante.

**Architecture:** Aucune migration - l'info existe déjà (`facture_lignes.event_type` + `mois_relatif`, `BillableEvent.type` + `step_number`). Un helper central de libellés (`lib/utils/billing-step-label.ts`) est consommé par les 4 surfaces. La liste des factures embarque les lignes (event_type/mois_relatif) via PostgREST ; la carte Finance ajoute une query `facture_lignes` agrégée côté serveur.

**Tech Stack:** Next.js 16 App Router, Supabase (PostgREST embeds), vitest. UI en français, hyphens simples (jamais de tirets cadratins).

**Spec:** `docs/superpowers/specs/2026-07-23-etape-echeance-labels-design.md`

---

### Task 1: Helper central `billingStepLabel` + `factureContenuLabel`

**Files:**
- Create: `lib/utils/billing-step-label.ts`
- Test: `__tests__/billing-step-label.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/billing-step-label.test.ts
import { describe, it, expect } from 'vitest';
import {
  billingStepLabel,
  factureContenuLabel,
} from '@/lib/utils/billing-step-label';

describe('billingStepLabel', () => {
  it('engagement -> Engagement (étape 1)', () => {
    expect(billingStepLabel('engagement', null)).toBe('Engagement (étape 1)');
  });

  it('opco_step avec step -> Échéance n°N', () => {
    expect(billingStepLabel('opco_step', 2)).toBe('Échéance n°2');
    expect(billingStepLabel('opco_step', 3)).toBe('Échéance n°3');
  });

  it('opco_step sans step -> Échéance (fallback)', () => {
    expect(billingStepLabel('opco_step', null)).toBe('Échéance');
  });
});

describe('factureContenuLabel', () => {
  it('null si aucune ligne event', () => {
    expect(factureContenuLabel([])).toBeNull();
    expect(
      factureContenuLabel([{ event_type: null, mois_relatif: null }]),
    ).toBeNull();
  });

  it('Engagement si uniquement des lignes engagement', () => {
    expect(
      factureContenuLabel([
        { event_type: 'engagement', mois_relatif: 0 },
        { event_type: 'engagement', mois_relatif: 0 },
      ]),
    ).toBe('Engagement');
  });

  it('Échéance n°N si un seul step distinct', () => {
    expect(
      factureContenuLabel([
        { event_type: 'opco_step', mois_relatif: 2 },
        { event_type: 'opco_step', mois_relatif: 2 },
      ]),
    ).toBe('Échéance n°2');
  });

  it('Échéances si plusieurs steps distincts', () => {
    expect(
      factureContenuLabel([
        { event_type: 'opco_step', mois_relatif: 2 },
        { event_type: 'opco_step', mois_relatif: 3 },
      ]),
    ).toBe('Échéances');
  });

  it('Mixte si engagement + échéances', () => {
    expect(
      factureContenuLabel([
        { event_type: 'engagement', mois_relatif: 0 },
        { event_type: 'opco_step', mois_relatif: 2 },
      ]),
    ).toBe('Mixte');
  });

  it('ignore les lignes sans event_type (manuelles) melangees a des events', () => {
    expect(
      factureContenuLabel([
        { event_type: null, mois_relatif: null },
        { event_type: 'engagement', mois_relatif: 0 },
      ]),
    ).toBe('Engagement');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/billing-step-label.test.ts`
Expected: FAIL (module `lib/utils/billing-step-label` introuvable)

- [ ] **Step 3: Write minimal implementation**

```typescript
// lib/utils/billing-step-label.ts
// ---------------------------------------------------------------------------
// Vocabulaire unifie de la facturation a l'engagement :
// - step 1 OPCO  = "Engagement (étape 1)"
// - step N > 1   = "Échéance n°N"
// Consomme par : onglet À l'engagement, libelles de lignes de facture (PDF),
// badge Contenu de la liste des factures, carte Finance projet.
// Strings UI : hyphens simples uniquement, pas de tirets cadratins.
// ---------------------------------------------------------------------------

export type BillingEventType = 'engagement' | 'opco_step';

export function billingStepLabel(
  type: BillingEventType,
  stepNumber: number | null,
): string {
  if (type === 'engagement') return 'Engagement (étape 1)';
  return stepNumber != null ? `Échéance n°${stepNumber}` : 'Échéance';
}

/**
 * Badge "Contenu" d'une facture, derive de ses lignes.
 * Retourne null si la facture ne porte aucune ligne event (facture libre ou
 * manuelle) : pas de badge affiche.
 */
export function factureContenuLabel(
  lignes: Array<{ event_type: string | null; mois_relatif: number | null }>,
): string | null {
  const events = lignes.filter(
    (l) => l.event_type === 'engagement' || l.event_type === 'opco_step',
  );
  if (events.length === 0) return null;

  const hasEngagement = events.some((l) => l.event_type === 'engagement');
  const steps = new Set(
    events
      .filter((l) => l.event_type === 'opco_step')
      .map((l) => l.mois_relatif),
  );

  if (hasEngagement && steps.size > 0) return 'Mixte';
  if (hasEngagement) return 'Engagement';
  if (steps.size === 1) {
    const step = [...steps][0];
    return step != null ? `Échéance n°${step}` : 'Échéance';
  }
  return 'Échéances';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/billing-step-label.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/utils/billing-step-label.ts __tests__/billing-step-label.test.ts
git commit -m "feat(facturation): helper central billingStepLabel / factureContenuLabel"
```

---

### Task 2: Badges de l'onglet "À l'engagement"

**Files:**
- Modify: `components/facturation/manuel-tab.tsx:453-457` (stepSuffix) et `:630-652` (badges colonne Type)

- [ ] **Step 1: Importer le helper**

Dans `components/facturation/manuel-tab.tsx`, ajouter aux imports :

```typescript
import { billingStepLabel } from '@/lib/utils/billing-step-label';
```

- [ ] **Step 2: Remplacer les badges de la colonne Type**

Localiser (vers la ligne 630) :

```tsx
{e.type === 'engagement' ? (
  <div className="flex flex-col gap-0.5">
    <StatusBadge label="Engagement" color="green" />
```

et

```tsx
) : (
  <div className="flex flex-col gap-0.5">
    <StatusBadge
      label={`OPCO${stepSuffix}`}
      color="blue"
    />
```

Remplacer par :

```tsx
{e.type === 'engagement' ? (
  <div className="flex flex-col gap-0.5">
    <StatusBadge label={billingStepLabel('engagement', null)} color="green" />
```

et

```tsx
) : (
  <div className="flex flex-col gap-0.5">
    <StatusBadge
      label={billingStepLabel('opco_step', e.step_number)}
      color="blue"
    />
```

Ne PAS toucher `stepSuffix` (ligne ~454) : il reste utilise pour le
`aria-label` de la checkbox et le suffixe du DECA en colonne 2.

- [ ] **Step 3: Verifier lint + tests composant**

Run: `npx vitest run __tests__/manuel-tab.test.tsx && npm run lint -- --quiet`
Expected: PASS (si le test snapshot/texte echoue sur "Engagement" -> mettre a jour l'attente vers "Engagement (étape 1)")

- [ ] **Step 4: Commit**

```bash
git add components/facturation/manuel-tab.tsx __tests__/manuel-tab.test.tsx
git commit -m "feat(facturation): badges Engagement (etape 1) / Echeance nN dans l'onglet A l'engagement"
```

---

### Task 3: Libellés des lignes de facture générées (détail + PDF)

**Files:**
- Modify: `lib/actions/factures/brouillon-from-events.ts:305-319`

Les factures deja emises ne sont PAS retouchees (descriptions figees, contrainte legale). Seuls les nouveaux brouillons recoivent le nouveau libelle.

- [ ] **Step 1: Remplacer la construction du typeLabel**

Localiser :

```typescript
const typeLabel =
  e.type === 'engagement'
    ? 'Engagement contrat'
    : `Règlement OPCO #${e.step_number ?? '?'}`;
```

Remplacer par :

```typescript
const typeLabel =
  e.type === 'engagement'
    ? billingStepLabel('engagement', null)
    : `${billingStepLabel('opco_step', e.step_number)} OPCO`;
```

Et ajouter l'import en tete de fichier :

```typescript
import { billingStepLabel } from '@/lib/utils/billing-step-label';
```

Resultat attendu des descriptions :
- `Commission 40% - Engagement (étape 1)`
- `Commission 40% - Échéance n°2 OPCO`

- [ ] **Step 2: Lancer les tests brouillons**

Run: `npx vitest run __tests__/create-brouillon-opco-filter.test.ts __tests__/brouillons-audit-ecart.test.ts __tests__/avoir-multi-contrat.test.ts`
Expected: PASS (aucun de ces tests n'asserte le libelle actuel ; si un test casse sur la description, mettre a jour l'attente vers les nouveaux libelles)

- [ ] **Step 3: Commit**

```bash
git add lib/actions/factures/brouillon-from-events.ts
git commit -m "feat(facturation): libelles de lignes Engagement (etape 1) / Echeance nN OPCO"
```

---

### Task 4: Badge "Contenu" dans la liste des factures

**Files:**
- Modify: `lib/queries/factures.ts:14-54` (FACTURES_LIST_SELECT + FactureListItem)
- Modify: `components/facturation/facture-list-columns.tsx:110-128` (colonne type)
- Test: `__tests__/factures-queries.test.ts` (verifier non-regression)

- [ ] **Step 1: Ajouter l'embed lignes a la projection liste**

Dans `lib/queries/factures.ts`, modifier `FACTURES_LIST_SELECT` :

```typescript
const FACTURES_LIST_SELECT = `
      id, ref, numero_seq, date_emission, date_echeance, mois_concerne,
      montant_ht, taux_tva, montant_tva, montant_ttc,
      statut, est_avoir, avoir_motif, facture_origine_id, peppol_state,
      lignes:facture_lignes(event_type, mois_relatif),
      projet:projets!factures_projet_id_fkey!inner(id, ref),
      client:clients!factures_client_id_fkey!inner(id, trigramme, raison_sociale, is_demo, archive)
    ` as const;
```

Ne PAS toucher `FACTURES_COUNT_SELECT` (le count n'a pas besoin des lignes).

- [ ] **Step 2: Etendre FactureListItem**

Ajouter au type `FactureListItem` (apres `peppol_state`) :

```typescript
  lignes: Array<{ event_type: string | null; mois_relatif: number | null }>;
```

- [ ] **Step 3: Verifier la compilation et les tests queries**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | head -30 && npx vitest run __tests__/factures-queries.test.ts __tests__/factures-cursor.test.ts`
Expected: PASS. Si un consommateur de `FactureListItem` (export CSV, page client) casse sur le champ manquant dans un objet litteral de test/fixture, ajouter `lignes: []` a la fixture.

- [ ] **Step 4: Afficher le badge Contenu dans la colonne type**

Dans `components/facturation/facture-list-columns.tsx`, remplacer la cellule de la colonne `type` (lignes 120-127) :

```tsx
      cell: ({ row }) => {
        const isProjet = row.original.projet !== null;
        const contenu = factureContenuLabel(row.original.lignes ?? []);
        return (
          <div className="flex flex-col items-start gap-1">
            <Badge variant={isProjet ? 'outline' : 'secondary'}>
              {isProjet ? 'Projet' : 'Libre'}
            </Badge>
            {contenu && (
              <span className="text-muted-foreground text-[10px]">
                {contenu}
              </span>
            )}
          </div>
        );
      },
```

Ajouter l'import :

```typescript
import { factureContenuLabel } from '@/lib/utils/billing-step-label';
```

Note : `size: 80` de la colonne peut rester (le texte passe dessous en 10px) ; si visuellement trop serre, passer a `size: 110`.

- [ ] **Step 5: Lint + tests**

Run: `npm run lint -- --quiet && npx vitest run __tests__/factures-queries.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/queries/factures.ts components/facturation/facture-list-columns.tsx __tests__/factures-queries.test.ts
git commit -m "feat(facturation): badge Contenu (Engagement / Echeance nN / Mixte) dans la liste des factures"
```

---

### Task 5: Split engagement / échéances dans la carte Finance projet

**Files:**
- Modify: `lib/queries/projets.ts:292-395` (getProjetFinance)
- Modify: `components/projets/projet-finance-section.tsx:116-138` (section SOLUVIA)
- Test: `__tests__/projet-finance-opco.test.ts` (mock buildSupabase a completer)

- [ ] **Step 1: Etendre getProjetFinance avec le split par event_type**

Dans `lib/queries/projets.ts`, apres le calcul de `facture_soluvia` (ligne ~332), la 2e vague de queries paralleles (`paiementsRes, stepsRes`, ligne ~345) recoit une 3e query :

```typescript
  const [paiementsRes, stepsRes, lignesRes] = await Promise.all([
    factureIds.length > 0
      ? supabase
          .from('paiements')
          .select('montant, facture_id')
          .in('facture_id', factureIds)
      : Promise.resolve({
          data: [] as { montant: number | null; facture_id: string }[],
        }),
    contratIds.length > 0
      ? supabase
          .from('eduvia_invoice_steps')
          .select('total_amount, invoice_state, opco_settled_amount')
          .in('contrat_id', contratIds)
      : Promise.resolve({
          data: [] as {
            total_amount: number | null;
            invoice_state: string | null;
            opco_settled_amount: number | null;
          }[],
        }),
    // Split engagement / echeances du "Facturé" SOLUVIA (memes factures que
    // facture_soluvia : emise/payee/en_retard, avoirs exclus par le statut).
    factureIds.length > 0
      ? supabase
          .from('facture_lignes')
          .select('event_type, montant_ht')
          .in('facture_id', factureIds)
      : Promise.resolve({
          data: [] as { event_type: string | null; montant_ht: number }[],
        }),
  ]);
```

Puis, apres le calcul de `en_retard_soluvia`, ajouter :

```typescript
  // Repartition du facture SOLUVIA par type d'event (facturation a
  // l'engagement) : etape 1 vs echeances OPCO. Les lignes sans event_type
  // (manuelles/libres) ne rentrent dans aucun des deux buckets.
  const lignesEvents = lignesRes.data ?? [];
  const facture_soluvia_engagement = lignesEvents
    .filter((l) => l.event_type === 'engagement')
    .reduce((sum, l) => sum + (l.montant_ht ?? 0), 0);
  const facture_soluvia_echeances = lignesEvents
    .filter((l) => l.event_type === 'opco_step')
    .reduce((sum, l) => sum + (l.montant_ht ?? 0), 0);
```

Et les exposer dans le `return` :

```typescript
  return {
    production_opco,
    facture_opco,
    encaisse_opco,
    facture_soluvia,
    facture_soluvia_engagement,
    facture_soluvia_echeances,
    encaisse_soluvia,
    en_retard_soluvia,
    taux_commission: projet?.taux_commission ?? 0,
  };
```

- [ ] **Step 2: Mettre a jour le mock du test finance**

Run: `npx vitest run __tests__/projet-finance-opco.test.ts`

Si le mock `buildSupabase` ne connait pas la table `facture_lignes` (data undefined -> `lignesRes.data ?? []` couvre deja le cas), le test doit passer tel quel. S'il echoue, ajouter `facture_lignes: { data: [] }` au fixture par defaut du helper `buildSupabase` du test.

Expected: PASS

- [ ] **Step 3: Afficher le split dans la carte Finance**

Dans `components/projets/projet-finance-section.tsx`, sous la grille SOLUVIA (apres la `div.grid` de la section "Côté SOLUVIA", ligne ~137), ajouter :

```tsx
        {(finance.facture_soluvia_engagement > 0 ||
          finance.facture_soluvia_echeances > 0) && (
          <div className="text-muted-foreground mt-2 text-center text-[11px] tabular-nums">
            dont Engagement (étape 1) :{' '}
            {formatCurrency(finance.facture_soluvia_engagement)}
            {' - '}
            Échéances : {formatCurrency(finance.facture_soluvia_echeances)}
          </div>
        )}
```

(Condition d'affichage : au moins une ligne event facturee -> les projets a l'echeancier ou libres n'affichent rien.)

- [ ] **Step 4: Compilation + tests + lint**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | head -30 && npx vitest run __tests__/projet-finance-opco.test.ts && npm run lint -- --quiet`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/queries/projets.ts components/projets/projet-finance-section.tsx __tests__/projet-finance-opco.test.ts
git commit -m "feat(projets): split Engagement (etape 1) / Echeances du Facture SOLUVIA sur la carte Finance"
```

---

### Task 6: Suite complète + vérification agent facturation

- [ ] **Step 1: Suite complete**

Run: `npm test`
Expected: PASS (0 fail). Corriger toute regression avant de continuer.

- [ ] **Step 2: Audit modele de facturation**

Dispatcher l'agent `facturation-model-checker` sur le diff (`git diff main...HEAD` ou la liste des commits de ce chantier) - il verifie la conformite aux 2 modeles de facturation. Aucune logique de calcul n'a change (libelles + agregats d'affichage uniquement) : l'audit doit etre vierge.

- [ ] **Step 3: Verification visuelle (optionnelle mais recommandee)**

Utiliser le skill `verify` (stack locale + Playwright) : onglet Facturation > À l'engagement (badges), liste Factures (badge Contenu), fiche projet HEOL (split Finance).

- [ ] **Step 4: Push + PR**

```bash
git push -u origin HEAD
gh pr create --fill
```
