# E-invoicing 2026 — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Afficher les mentions légales obligatoires de la réforme e-invoicing (catégorie d'opération + option TVA sur les débits) sur le PDF facture SOLUVIA et les reporter dans la `narration` du move Odoo, sans dépendance externe.

**Architecture:** Une source de vérité unique (`lib/utils/e-invoicing-mentions.ts`) calcule la liste des mentions à partir d'un flag `tva_sur_debits` porté par la société émettrice. Le composant PDF et le push Odoo consomment ce helper. Le flag est une nouvelle colonne `societes_emettrices.tva_sur_debits` (BOOLEAN, défaut false), éditable par l'admin.

**Tech Stack:** Next.js 16 / TypeScript, Supabase (migration SQL + types générés), @react-pdf/renderer, Vitest, Zod, shadcn/ui (Checkbox).

**Spec de référence :** `docs/superpowers/specs/2026-06-18-e-invoicing-phase1-design.md`

**Convention projet :** pas d'em-dash (`—`) dans les chaînes UI/PDF, apostrophes droites simples, UI en français. `npm test` doit rester vert (hook pre-push). Travailler sur la branche `feat/e-invoicing-phase1`.

---

## File Structure

| Fichier                                                          | Responsabilité                                                                |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `supabase/migrations/20260618120000_societes_tva_sur_debits.sql` | Ajoute la colonne `tva_sur_debits`                                            |
| `types/database.ts`                                              | Régénéré : expose `tva_sur_debits` sur la Row                                 |
| `lib/utils/e-invoicing-mentions.ts`                              | Constantes + `buildEInvoicingMentions` + `buildOdooNarration` (source unique) |
| `__tests__/e-invoicing-mentions.test.ts`                         | Tests du helper                                                               |
| `lib/queries/parametres.ts`                                      | `EmetteurInfo.tva_sur_debits` + mapping                                       |
| `lib/actions/societes-emettrices.ts`                             | Champ Zod `tva_sur_debits`                                                    |
| `components/admin/societe-emettrice-form.tsx`                    | Toggle admin                                                                  |
| `components/facturation/facture-pdf.tsx`                         | Zone « Mentions légales »                                                     |
| `__tests__/facture-pdf-render.test.ts`                           | Cas de rendu avec `tva_sur_debits`                                            |
| `lib/odoo/client.ts`                                             | `OdooInvoicePayload.tva_sur_debits` + narration au create                     |
| `lib/odoo/sync.ts`                                               | `select` société + passage du flag (factures + avoirs)                        |

---

## Task 1: Migration colonne `tva_sur_debits`

**Files:**

- Create: `supabase/migrations/20260618120000_societes_tva_sur_debits.sql`
- Modify: `types/database.ts` (régénéré)

- [ ] **Step 1: Écrire la migration**

```sql
-- Option pour le paiement de la TVA d'apres les debits (reforme e-invoicing).
-- Par societe emettrice : SOLUVIA / EDUVIA / DIGIVIA peuvent avoir opte
-- differemment aupres de l'administration. Defaut false = etat sur (aucune
-- mention tant que la compta n'a pas confirme).
ALTER TABLE societes_emettrices
  ADD COLUMN tva_sur_debits BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN societes_emettrices.tva_sur_debits IS
  'Si TRUE, la facture porte la mention legale "Option pour le paiement de la taxe d''apres les debits".';
```

- [ ] **Step 2: Appliquer en local**

Run: `npx supabase db push`
Expected: la migration s'applique sans erreur (`Applying migration 20260618120000_societes_tva_sur_debits.sql...`).

- [ ] **Step 3: Régénérer les types**

Run: `npx supabase gen types typescript --local > types/database.ts`
Expected: le diff sur `types/database.ts` ajoute `tva_sur_debits: boolean` dans `societes_emettrices` (Row/Insert/Update). Vérifier qu'AUCUNE autre colonne n'est supprimée (garde-fou anti-drift) :

Run: `git diff types/database.ts | grep -E '^\-' | grep -v tva_sur_debits | grep -v '^---'`
Expected: aucune ligne supprimée (sortie vide).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260618120000_societes_tva_sur_debits.sql types/database.ts
git commit -m "feat(e-invoicing): colonne societes_emettrices.tva_sur_debits"
```

---

## Task 2: Helper de mentions (source unique)

**Files:**

- Create: `lib/utils/e-invoicing-mentions.ts`
- Test: `__tests__/e-invoicing-mentions.test.ts`

- [ ] **Step 1: Écrire le test (échoue)**

```ts
import { describe, it, expect } from 'vitest';
import {
  CATEGORIE_OPERATION_SERVICES,
  TVA_DEBITS_MENTION,
  buildEInvoicingMentions,
  buildOdooNarration,
} from '@/lib/utils/e-invoicing-mentions';

describe('e-invoicing mentions', () => {
  it("catégorie d'opération toujours présente, débits absente par défaut", () => {
    expect(buildEInvoicingMentions({ tvaSurDebits: false })).toEqual([
      CATEGORIE_OPERATION_SERVICES,
    ]);
  });

  it('mention débits ajoutée quand le flag est vrai', () => {
    expect(buildEInvoicingMentions({ tvaSurDebits: true })).toEqual([
      CATEGORIE_OPERATION_SERVICES,
      TVA_DEBITS_MENTION,
    ]);
  });

  it('flag null/undefined traité comme false', () => {
    expect(buildEInvoicingMentions({ tvaSurDebits: null })).toEqual([
      CATEGORIE_OPERATION_SERVICES,
    ]);
    expect(buildEInvoicingMentions({})).toEqual([CATEGORIE_OPERATION_SERVICES]);
  });

  it('narration Odoo = mentions jointes par retour ligne', () => {
    expect(buildOdooNarration({ tvaSurDebits: true })).toBe(
      `${CATEGORIE_OPERATION_SERVICES}\n${TVA_DEBITS_MENTION}`,
    );
  });

  it('constantes sans em-dash', () => {
    expect(CATEGORIE_OPERATION_SERVICES).not.toContain('—');
    expect(TVA_DEBITS_MENTION).not.toContain('—');
  });
});
```

- [ ] **Step 2: Lancer le test (échoue)**

Run: `npm test -- e-invoicing-mentions`
Expected: FAIL (`Cannot find module '@/lib/utils/e-invoicing-mentions'`).

- [ ] **Step 3: Écrire l'implémentation**

```ts
// Mentions legales de la reforme e-invoicing 2026. SOLUVIA ne facture que des
// prestations de services -> categorie d'operation fixe. La mention "debits"
// depend d'une option fiscale par societe emettrice (tva_sur_debits).
// Apostrophes droites + pas d'em-dash : la Helvetica embarquee de @react-pdf
// ne gere pas tous les caracteres speciaux, et c'est une convention projet.

export const CATEGORIE_OPERATION_SERVICES =
  "Categorie d'operation : Prestations de services";

export const TVA_DEBITS_MENTION =
  "Option pour le paiement de la taxe d'apres les debits";

export function buildEInvoicingMentions(opts: {
  tvaSurDebits?: boolean | null;
}): string[] {
  const mentions = [CATEGORIE_OPERATION_SERVICES];
  if (opts.tvaSurDebits) mentions.push(TVA_DEBITS_MENTION);
  return mentions;
}

export function buildOdooNarration(opts: {
  tvaSurDebits?: boolean | null;
}): string {
  return buildEInvoicingMentions(opts).join('\n');
}
```

- [ ] **Step 4: Lancer le test (passe)**

Run: `npm test -- e-invoicing-mentions`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/utils/e-invoicing-mentions.ts __tests__/e-invoicing-mentions.test.ts
git commit -m "feat(e-invoicing): helper mentions (categorie operation + TVA debits)"
```

---

## Task 3: Câbler `tva_sur_debits` dans `EmetteurInfo`

**Files:**

- Modify: `lib/queries/parametres.ts:86-131`

- [ ] **Step 1: Ajouter le champ optionnel à l'interface**

Dans `interface EmetteurInfo`, après `mentions_legales?: string | null;` (ligne 99), ajouter :

```ts
  // Option fiscale "paiement de la TVA d'apres les debits" de la societe
  // emettrice. Pilote l'affichage de la mention legale correspondante.
  tva_sur_debits?: boolean | null;
```

- [ ] **Step 2: Propager dans le mapping**

Dans `mapSocieteToEmetteur` (retour de l'objet, après `mentions_legales: s.mentions_legales,` ligne 129), ajouter :

```ts
    tva_sur_debits: s.tva_sur_debits,
```

- [ ] **Step 3: Vérifier le typecheck**

Run: `npx tsc --noEmit`
Expected: aucune erreur (la Row régénérée en Task 1 expose bien `s.tva_sur_debits`). `EMETTEUR_FALLBACK` reste valide car le champ est optionnel (absent => traité comme false en aval).

- [ ] **Step 4: Commit**

```bash
git add lib/queries/parametres.ts
git commit -m "feat(e-invoicing): expose tva_sur_debits dans EmetteurInfo"
```

---

## Task 4: Zone « Mentions légales » sur le PDF

**Files:**

- Modify: `components/facturation/facture-pdf.tsx`
- Test: `__tests__/facture-pdf-render.test.ts`

- [ ] **Step 1: Écrire les tests de rendu (échouent)**

Dans `__tests__/facture-pdf-render.test.ts`, ajouter ces deux cas à l'intérieur du `describe('renderFacturePdfBuffer', ...)` (après le cas `emetteur custom`, vers la ligne 204) :

```ts
it('emetteur avec tva_sur_debits=true -> PDF valide', async () => {
  const emetteur: EmetteurInfo = {
    raison_sociale: 'S.A.S. SOLUVIA',
    adresse: '27 Rue Jacqueline Cochran, 79000 Niort',
    siret: '994 241 537 00012',
    tva: 'FR37994241537',
    iban: null,
    bic: null,
    banque: null,
    titulaire_compte: null,
    tva_sur_debits: true,
  };
  const buf = await renderPdf(factureFixture(), { emetteur });
  expectValidPdf(buf);
});

it('avoir avec tva_sur_debits=false -> PDF valide', async () => {
  const emetteur: EmetteurInfo = {
    raison_sociale: 'S.A.S. SOLUVIA',
    adresse: '27 Rue Jacqueline Cochran, 79000 Niort',
    siret: '994 241 537 00012',
    tva: 'FR37994241537',
    iban: null,
    bic: null,
    banque: null,
    titulaire_compte: null,
    tva_sur_debits: false,
  };
  const buf = await renderPdf(
    factureFixture({ est_avoir: true, avoir_motif: 'Rupture' }),
    { emetteur, origineRef: 'FAC-DUP-0041' },
  );
  expectValidPdf(buf);
});
```

- [ ] **Step 2: Lancer les tests (échouent au typecheck du test, pas au runtime)**

Run: `npm test -- facture-pdf-render`
Expected: les nouveaux cas passent déjà au runtime (le champ optionnel est ignoré tant que le rendu ne l'utilise pas). Ils servent de filet de non-régression. Si déjà verts, continuer ; le vrai changement de rendu est à l'étape suivante.

- [ ] **Step 3: Importer le helper dans le composant PDF**

Dans `components/facturation/facture-pdf.tsx`, après l'import `formatClientAddressLines` (ligne 18), ajouter :

```ts
import { buildEInvoicingMentions } from '@/lib/utils/e-invoicing-mentions';
```

- [ ] **Step 4: Ajouter un style pour la zone mentions**

Dans `StyleSheet.create({...})`, après le bloc `avoirText` (vers la ligne 184), ajouter :

```ts
  legalMentions: {
    marginTop: 12,
    fontSize: 8,
    color: '#4b5563',
    lineHeight: 1.4,
  },
```

- [ ] **Step 5: Rendre les mentions après les totaux**

Dans le JSX, juste après le bloc `{/* Mention autoliquidation TVA ... */}` (le `View` conditionnel `isAutoliquidation`, fin vers ligne 515) et avant `{/* Modalites de paiement / RIB */}`, insérer :

```tsx
{
  /* Mentions e-invoicing 2026 : categorie d'operation (toujours) +
            option TVA sur les debits (si la societe a opte). */
}
<View style={styles.legalMentions}>
  {buildEInvoicingMentions({
    tvaSurDebits: EMETTEUR.tva_sur_debits,
  }).map((m) => (
    <Text key={m}>{m}</Text>
  ))}
</View>;
```

- [ ] **Step 6: Lancer les tests (passent)**

Run: `npm test -- facture-pdf-render`
Expected: PASS (cas existants + 2 nouveaux). Le buffer reste un PDF valide (`%PDF-` ... `%%EOF`).

- [ ] **Step 7: Commit**

```bash
git add components/facturation/facture-pdf.tsx __tests__/facture-pdf-render.test.ts
git commit -m "feat(e-invoicing): mentions legales sur le PDF facture"
```

---

## Task 5: Report dans la narration Odoo

**Files:**

- Modify: `lib/odoo/client.ts` (interface `OdooInvoicePayload` ~ligne 8-39, `pushMove` ~ligne 605-630)
- Modify: `lib/odoo/sync.ts` (`pushFactures` ~ligne 61-142, `pushAvoirs` ~ligne 295-371)
- Test: `__tests__/e-invoicing-mentions.test.ts` (déjà couvre `buildOdooNarration`)

- [ ] **Step 1: Ajouter le champ au payload Odoo**

Dans `lib/odoo/client.ts`, dans `interface OdooInvoicePayload`, après `odoo_journal_id?: number | null;` (ligne 38), ajouter :

```ts
  // Option TVA sur les debits de la societe emettrice. Pilote la mention legale
  // reportee dans la narration du move (carrier e-invoicing, cf. Phase 1).
  tva_sur_debits?: boolean | null;
```

- [ ] **Step 2: Importer le builder de narration**

En tête de `lib/odoo/client.ts`, après l'import `buildClientReconcileModelVals` (ligne 2), ajouter :

```ts
import { buildOdooNarration } from '@/lib/utils/e-invoicing-mentions';
```

- [ ] **Step 3: Poser la narration à la création du move**

Dans `pushMove`, dans la branche `else` (création), au sein de l'objet `moveVals` (après `invoice_line_ids: lineIds,`, ligne 623), ajouter :

```ts
        narration: buildOdooNarration({ tvaSurDebits: payload.tva_sur_debits }),
```

(La narration n'est posée qu'à la création, jamais sur un move réutilisé, cohérent avec le reste du push. Noter la clé `tvaSurDebits` camelCase attendue par le helper.)

- [ ] **Step 4: Renseigner le flag dans `pushFactures`**

Dans `lib/odoo/sync.ts` :

1. Dans le `select` de `pushFactures` (ligne 68), étendre la jointure société :

```ts
      societe:societes_emettrices!factures_societe_emettrice_id_fkey(odoo_company_id, odoo_journal_id, tva_sur_debits),
```

2. Élargir le type local `societe` (ligne 98-101) :

```ts
const societe = f.societe as unknown as {
  odoo_company_id: number | null;
  odoo_journal_id: number | null;
  tva_sur_debits: boolean | null;
} | null;
```

3. Dans le `payload` (après `odoo_journal_id: societe?.odoo_journal_id ?? null,`, ligne 141), ajouter :

```ts
        tva_sur_debits: societe?.tva_sur_debits ?? false,
```

- [ ] **Step 5: Renseigner le flag dans `pushAvoirs`**

Dans `lib/odoo/sync.ts`, appliquer les 3 mêmes modifications à `pushAvoirs` :

1. `select` (ligne 302) :

```ts
      societe:societes_emettrices!factures_societe_emettrice_id_fkey(odoo_company_id, odoo_journal_id, tva_sur_debits),
```

2. type local `societe` (ligne 330-333) :

```ts
const societe = a.societe as unknown as {
  odoo_company_id: number | null;
  odoo_journal_id: number | null;
  tva_sur_debits: boolean | null;
} | null;
```

3. `payload` (après `odoo_journal_id: societe?.odoo_journal_id ?? null,`, ligne 370) :

```ts
        tva_sur_debits: societe?.tva_sur_debits ?? false,
```

- [ ] **Step 6: Vérifier typecheck + tests**

Run: `npx tsc --noEmit && npm test -- e-invoicing-mentions`
Expected: aucune erreur de type ; tests du helper verts (couvrent déjà `buildOdooNarration`).

- [ ] **Step 7: Commit**

```bash
git add lib/odoo/client.ts lib/odoo/sync.ts
git commit -m "feat(e-invoicing): report des mentions dans la narration Odoo"
```

---

## Task 6: Toggle admin `tva_sur_debits`

**Files:**

- Modify: `lib/actions/societes-emettrices.ts:39` (schéma Zod)
- Modify: `components/admin/societe-emettrice-form.tsx`

- [ ] **Step 1: Ajouter le champ au schéma Zod**

Dans `lib/actions/societes-emettrices.ts`, dans `SocieteEmettriceSchema`, après `est_defaut: z.boolean().default(false),` (ligne 39), ajouter :

```ts
  tva_sur_debits: z.boolean().default(false),
```

(Le champ circule automatiquement vers insert/update via `...parsed.data`.)

- [ ] **Step 2: Ajouter le champ à l'état du formulaire**

Dans `components/admin/societe-emettrice-form.tsx`, dans l'initialisation `useState` (après `est_defaut: societe?.est_defaut ?? false,`, ligne 47), ajouter :

```ts
    tva_sur_debits: societe?.tva_sur_debits ?? false,
```

- [ ] **Step 3: Ajouter le toggle dans le fieldset « PDF / devis »**

Dans le même fichier, dans le `fieldset` « PDF / devis », juste après le bloc Checkbox `se-defaut` (fin vers ligne 269), ajouter :

```tsx
<div className="flex items-center gap-2">
  <Checkbox
    id="se-tva-debits"
    checked={form.tva_sur_debits ?? false}
    onCheckedChange={(c) => set('tva_sur_debits', c === true)}
  />
  <Label htmlFor="se-tva-debits">
    Option TVA sur les débits (mention légale e-invoicing)
  </Label>
</div>
```

- [ ] **Step 4: Vérifier typecheck, lint, build**

Run: `npx tsc --noEmit && npm run lint`
Expected: aucune erreur (`set('tva_sur_debits', ...)` est typé via `SocieteEmettriceInput` qui contient désormais le champ).

- [ ] **Step 5: Commit**

```bash
git add lib/actions/societes-emettrices.ts components/admin/societe-emettrice-form.tsx
git commit -m "feat(e-invoicing): toggle admin option TVA sur les debits"
```

---

## Task 7: Vérification finale

**Files:** aucun (vérification)

- [ ] **Step 1: Suite complète + build**

Run: `npm test && npm run build`
Expected: tous les tests verts (suite existante + nouveaux helper/PDF), build de production OK.

- [ ] **Step 2: Revue facturation (garde-fou métier)**

Lancer l'agent `facturation-model-checker` sur le diff de la branche. Aucune régression attendue : aucun changement du cycle d'émission, de la numérotation gapless, ni de la logique de commission/échéancier (ajout d'affichage + colonne booléenne uniquement).

- [ ] **Step 3: Revue légale factures**

Invoquer le skill `facture-legal-check`. Vérifier que les invariants (gapless, no DELETE, TVA intracom, conventions PDF) restent satisfaits, et que les nouvelles mentions cohabitent avec la mention autoliquidation.

- [ ] **Step 4: Mettre à jour la mémoire projet**

Mettre à jour le snapshot e-invoicing dans la mémoire : Phase 1 livrée (mentions PDF + narration Odoo + flag `tva_sur_debits`), reste Phase 2 (Factur-X via Odoo, dépend découverte capacité Odoo) et Phase 3 (statut transmission). Noter l'action externe : confirmation compta de l'option TVA débits.

---

## Self-Review

**Spec coverage :**

- Mention catégorie d'opération (fixe) → Task 2 (constante) + Task 4 (rendu PDF) + Task 5 (narration). ✓
- Mention TVA débits (conditionnelle via flag par société) → Task 1 (colonne) + Task 3 (EmetteurInfo) + Task 4 (PDF) + Task 5 (Odoo) + Task 6 (toggle admin). ✓
- SIREN déjà couvert → aucun travail (documenté dans le spec). ✓
- Report Odoo via `narration` au create uniquement → Task 5. ✓
- Tests (PDF, mapping, narration) → Task 2 + Task 4. ✓
- Garde-fous légaux/facturation → Task 7. ✓

**Cohérence des types :** `buildEInvoicingMentions` / `buildOdooNarration` prennent `{ tvaSurDebits?: boolean | null }` (camelCase, paramètre) ; le champ DB/colonne/payload est `tva_sur_debits` (snake_case) — la conversion se fait au point d'appel (`{ tvaSurDebits: EMETTEUR.tva_sur_debits }`, `{ tva_sur_debits: payload.tva_sur_debits }`). Cohérent partout.

**Note mapping :** `buildOdooNarration` prend `{ tvaSurDebits }` (camelCase). Au point d'appel dans `pushMove` (Task 5 Step 3), on passe `{ tvaSurDebits: payload.tva_sur_debits }`. Correction vérifiée dans le Step 3.
