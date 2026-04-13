# Facture Creation Flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the facture creation flow — CRON generates echeances, CDP selects and emits factures, avoir dialog creates credit notes.

**Architecture:** Server actions (`lib/actions/factures.ts`) handle facture + avoir creation, a CRON route generates echeances, and existing UI components (`echeance-table.tsx`, `avoir-dialog.tsx`) get wired to these actions. Grouping by project is automatic.

**Tech Stack:** Next.js 16 App Router, Supabase (server client + admin client), Server Actions, TypeScript.

**Spec:** `docs/superpowers/specs/2026-04-13-facture-creation-design.md`

---

### Task 1: Create `createFactures` server action

**Files:**

- Create: `lib/actions/factures.ts`

- [ ] **Step 1: Create the server action file**

```typescript
'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export async function createFactures(
  echeanceIds: string[],
): Promise<{ success: boolean; refs: string[]; error?: string }> {
  if (echeanceIds.length === 0) {
    return { success: false, refs: [], error: 'Aucune échéance sélectionnée' };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, refs: [], error: 'Non authentifié' };

  // 1. Fetch selected echeances with projet + client + contrats
  const { data: echeances, error: fetchError } = await supabase
    .from('echeances')
    .select(
      `
      id, mois_concerne, montant_prevu_ht,
      projet:projets!echeances_projet_id_fkey(
        id, ref, taux_commission,
        client:clients!projets_client_id_fkey(id, trigramme)
      )
    `,
    )
    .in('id', echeanceIds)
    .is('facture_id', null);

  if (fetchError)
    return { success: false, refs: [], error: fetchError.message };
  if (!echeances || echeances.length === 0) {
    return {
      success: false,
      refs: [],
      error: 'Échéances introuvables ou déjà facturées',
    };
  }

  // 2. Group echeances by projet_id
  const groups = new Map<
    string,
    {
      projetId: string;
      clientId: string;
      tauxCommission: number;
      moisConcernes: string[];
      echeanceIds: string[];
    }
  >();

  for (const ech of echeances) {
    const projet = ech.projet;
    if (!projet) continue;
    const projetId = projet.id;
    const existing = groups.get(projetId);
    if (existing) {
      existing.moisConcernes.push(ech.mois_concerne);
      existing.echeanceIds.push(ech.id);
    } else {
      groups.set(projetId, {
        projetId,
        clientId: projet.client?.id ?? '',
        tauxCommission: projet.taux_commission ?? 10,
        moisConcernes: [ech.mois_concerne],
        echeanceIds: [ech.id],
      });
    }
  }

  // 3. For each group, create facture + lignes
  const createdRefs: string[] = [];

  for (const group of groups.values()) {
    // Fetch active contrats for this projet
    const { data: contrats } = await supabase
      .from('contrats')
      .select(
        'id, montant_prise_en_charge, formation_titre, apprenant_prenom, apprenant_nom',
      )
      .eq('projet_id', group.projetId)
      .eq('archive', false);

    if (!contrats || contrats.length === 0) continue;

    // Build mois_concerne label
    const moisLabel =
      group.moisConcernes.length === 1
        ? group.moisConcernes[0]!
        : `${group.moisConcernes[0]} - ${group.moisConcernes[group.moisConcernes.length - 1]}`;

    // Calculate line items
    const lignes = contrats.map((c) => {
      const montantHt =
        Math.round(
          (((c.montant_prise_en_charge ?? 0) * group.tauxCommission) /
            100 /
            12) *
            100,
        ) / 100;
      return {
        contrat_id: c.id,
        description: `Commission ${group.tauxCommission}% — ${c.formation_titre ?? ''} — ${c.apprenant_prenom ?? ''} ${c.apprenant_nom ?? ''} — ${moisLabel}`,
        montant_ht: montantHt,
      };
    });

    const totalHt =
      Math.round(lignes.reduce((s, l) => s + l.montant_ht, 0) * 100) / 100;
    const tauxTva = 20;
    const montantTva = Math.round(totalHt * tauxTva) / 100;
    const montantTtc = Math.round((totalHt + montantTva) * 100) / 100;

    // Date echeance = end of next month
    const today = new Date();
    const dateEcheance = new Date(today.getFullYear(), today.getMonth() + 2, 0);
    const dateEcheanceStr = dateEcheance.toISOString().split('T')[0]!;

    // INSERT facture (trigger generates ref + numero_seq)
    const { data: facture, error: insertError } = await supabase
      .from('factures')
      .insert({
        projet_id: group.projetId,
        client_id: group.clientId,
        date_emission: new Date().toISOString().split('T')[0]!,
        date_echeance: dateEcheanceStr,
        mois_concerne: moisLabel,
        montant_ht: totalHt,
        taux_tva: tauxTva,
        montant_tva: montantTva,
        montant_ttc: montantTtc,
        statut: 'emise',
        est_avoir: false,
        created_by: user.id,
      })
      .select('id, ref')
      .single();

    if (insertError || !facture) continue;

    // INSERT facture_lignes
    await supabase.from('facture_lignes').insert(
      lignes.map((l) => ({
        facture_id: facture.id,
        contrat_id: l.contrat_id,
        description: l.description,
        montant_ht: l.montant_ht,
      })),
    );

    // UPDATE echeances to link
    await supabase
      .from('echeances')
      .update({ facture_id: facture.id, validee: true })
      .in('id', group.echeanceIds);

    createdRefs.push(facture.ref);
  }

  revalidatePath('/facturation');

  if (createdRefs.length === 0) {
    return {
      success: false,
      refs: [],
      error: 'Aucune facture créée — vérifiez les contrats actifs',
    };
  }

  return { success: true, refs: createdRefs };
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors in `lib/actions/factures.ts`

- [ ] **Step 3: Commit**

```bash
git add lib/actions/factures.ts
git commit -m "feat: add createFactures server action"
```

---

### Task 2: Wire `echeance-table.tsx` to `createFactures`

**Files:**

- Modify: `components/facturation/echeance-table.tsx`

- [ ] **Step 1: Add server action import and loading state**

Replace the `handleEmettre` function and add `useTransition`:

```typescript
// At the top, add imports:
import { useTransition } from 'react';
import { createFactures } from '@/lib/actions/factures';

// Inside the component, add:
const [isPending, startTransition] = useTransition();

// Replace the handleEmettre function:
const handleEmettre = () => {
  startTransition(async () => {
    const result = await createFactures(Array.from(selectedIds));
    if (result.success) {
      toast.success(
        `${result.refs.length} facture${result.refs.length > 1 ? 's' : ''} émise${result.refs.length > 1 ? 's' : ''} avec succès`,
      );
      setSelectedIds(new Set());
    } else {
      toast.error(result.error ?? 'Erreur lors de la création');
    }
  });
};
```

- [ ] **Step 2: Update the button to show loading state**

Change the Button in the footer:

```tsx
<Button disabled={selectedIds.size === 0 || isPending} onClick={handleEmettre}>
  {isPending ? 'Émission en cours...' : 'Émettre les factures'}
</Button>
```

- [ ] **Step 3: Build check**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add components/facturation/echeance-table.tsx
git commit -m "feat: wire echeance table to createFactures action"
```

---

### Task 3: Add `createAvoir` server action

**Files:**

- Modify: `lib/actions/factures.ts`

- [ ] **Step 1: Add `createAvoir` to the existing server action file**

Append to `lib/actions/factures.ts`:

```typescript
export async function createAvoir(params: {
  factureOrigineId: string;
  motif: string;
  montant: number;
  note?: string;
}): Promise<{ success: boolean; ref?: string; error?: string }> {
  const { factureOrigineId, motif, montant, note } = params;

  if (!motif) return { success: false, error: 'Motif requis' };
  if (montant <= 0) return { success: false, error: 'Montant invalide' };

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Non authentifié' };

  // Fetch origin facture
  const { data: origine, error: origineError } = await supabase
    .from('factures')
    .select(
      'id, ref, projet_id, client_id, mois_concerne, montant_ht, taux_tva, statut, est_avoir',
    )
    .eq('id', factureOrigineId)
    .single();

  if (origineError || !origine) {
    return { success: false, error: 'Facture origine introuvable' };
  }

  if (origine.est_avoir) {
    return {
      success: false,
      error: 'Impossible de créer un avoir sur un avoir',
    };
  }

  if (origine.statut !== 'emise' && origine.statut !== 'en_retard') {
    return { success: false, error: 'La facture doit être émise ou en retard' };
  }

  if (montant > origine.montant_ht) {
    return {
      success: false,
      error:
        "Le montant de l'avoir ne peut pas dépasser le montant de la facture",
    };
  }

  // Check no existing avoir
  const { data: existingAvoir } = await supabase
    .from('factures')
    .select('id')
    .eq('est_avoir', true)
    .eq('facture_origine_id', factureOrigineId)
    .maybeSingle();

  if (existingAvoir) {
    return { success: false, error: 'Un avoir existe déjà sur cette facture' };
  }

  // Calculate amounts (negative)
  const montantHt = -Math.abs(montant);
  const montantTva = Math.round(montantHt * origine.taux_tva) / 100;
  const montantTtc = Math.round((montantHt + montantTva) * 100) / 100;

  const { data: avoir, error: insertError } = await supabase
    .from('factures')
    .insert({
      projet_id: origine.projet_id,
      client_id: origine.client_id,
      date_emission: new Date().toISOString().split('T')[0]!,
      date_echeance: new Date().toISOString().split('T')[0]!,
      mois_concerne: origine.mois_concerne,
      montant_ht: montantHt,
      taux_tva: origine.taux_tva,
      montant_tva: montantTva,
      montant_ttc: montantTtc,
      statut: 'avoir',
      est_avoir: true,
      avoir_motif: note ? `${motif} — ${note}` : motif,
      facture_origine_id: factureOrigineId,
      created_by: user.id,
    })
    .select('id, ref')
    .single();

  if (insertError || !avoir) {
    return {
      success: false,
      error: insertError?.message ?? 'Erreur de création',
    };
  }

  // Insert single ligne for the avoir
  await supabase.from('facture_lignes').insert({
    facture_id: avoir.id,
    description: `Avoir sur ${origine.ref} — ${motif}`,
    montant_ht: montantHt,
  });

  revalidatePath('/facturation');
  revalidatePath(`/facturation/${origine.ref}`);

  return { success: true, ref: avoir.ref };
}
```

- [ ] **Step 2: Build check**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add lib/actions/factures.ts
git commit -m "feat: add createAvoir server action"
```

---

### Task 4: Wire `avoir-dialog.tsx` to `createAvoir`

**Files:**

- Modify: `components/facturation/avoir-dialog.tsx`
- Modify: `components/facturation/facture-detail-client.tsx`

- [ ] **Step 1: Update `AvoirDialog` props and wire to server action**

In `avoir-dialog.tsx`:

Add `factureOrigineId` to props and import the server action:

```typescript
import { useTransition } from 'react';
import { createAvoir } from '@/lib/actions/factures';
```

Update the interface:

```typescript
interface AvoirDialogProps {
  factureRef: string;
  factureOrigineId: string;
  montantHtDefault: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}
```

Add `factureOrigineId` to destructuring and add transition:

```typescript
export function AvoirDialog({
  factureRef,
  factureOrigineId,
  montantHtDefault,
  open,
  onOpenChange,
}: AvoirDialogProps) {
  const [motif, setMotif] = useState<string>('');
  const [montantHt, setMontantHt] = useState<string>(montantHtDefault.toString());
  const [note, setNote] = useState<string>('');
  const [isPending, startTransition] = useTransition();
```

Replace `handleConfirm`:

```typescript
function handleConfirm() {
  if (!motif) {
    toast.error('Veuillez sélectionner un motif');
    return;
  }
  const montant = parseFloat(montantHt);
  if (isNaN(montant) || montant <= 0) {
    toast.error('Le montant doit être supérieur à zéro');
    return;
  }
  if (montant > montantHtDefault) {
    toast.error('Le montant ne peut pas dépasser le montant de la facture');
    return;
  }

  startTransition(async () => {
    const result = await createAvoir({
      factureOrigineId,
      motif,
      montant,
      note: note || undefined,
    });
    if (result.success) {
      toast.success(`Avoir ${result.ref} émis avec succès`);
      onOpenChange(false);
      setMotif('');
      setMontantHt(montantHtDefault.toString());
      setNote('');
    } else {
      toast.error(result.error ?? 'Erreur lors de la création');
    }
  });
}
```

Update the confirm button:

```tsx
<Button variant="destructive" onClick={handleConfirm} disabled={isPending}>
  {isPending ? 'Création...' : "Confirmer l'avoir"}
</Button>
```

- [ ] **Step 2: Pass `factureOrigineId` from `facture-detail-client.tsx`**

In `facture-detail-client.tsx`, update the `AvoirDialog` usage (around line 84):

```tsx
<AvoirDialog
  factureRef={facture.ref ?? ''}
  factureOrigineId={facture.id}
  montantHtDefault={facture.montant_ht}
  open={avoirOpen}
  onOpenChange={setAvoirOpen}
/>
```

- [ ] **Step 3: Build check**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add components/facturation/avoir-dialog.tsx components/facturation/facture-detail-client.tsx
git commit -m "feat: wire avoir dialog to createAvoir action"
```

---

### Task 5: Create CRON echeance generation route

**Files:**

- Create: `app/api/cron/echeances/route.ts`

- [ ] **Step 1: Create the CRON route**

```typescript
import { NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/utils/cron-auth';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const supabase = createAdminClient();

  // Fetch active projets with active contrats
  const { data: projets, error: projetsError } = await supabase
    .from('projets')
    .select(
      `
      id, taux_commission,
      contrats(id, montant_prise_en_charge, date_debut, duree_mois)
    `,
    )
    .eq('statut', 'actif')
    .eq('archive', false);

  if (projetsError) {
    return NextResponse.json({ error: projetsError.message }, { status: 500 });
  }

  let created = 0;

  for (const projet of projets ?? []) {
    const contrats = projet.contrats ?? [];
    if (contrats.length === 0) continue;

    const tauxCommission = projet.taux_commission ?? 10;

    for (const contrat of contrats) {
      if (!contrat.date_debut || !contrat.duree_mois) continue;

      const startDate = new Date(contrat.date_debut);
      const dureeMois = contrat.duree_mois;
      const montantMensuel =
        Math.round(
          (((contrat.montant_prise_en_charge ?? 0) * tauxCommission) /
            100 /
            12) *
            100,
        ) / 100;

      // Generate echeances: M+2 through M+10, then M12 (covers M10-M12)
      for (let m = 2; m <= Math.min(dureeMois, 10); m++) {
        const echeanceDate = new Date(
          startDate.getFullYear(),
          startDate.getMonth() + m,
          1,
        );
        const moisStr = echeanceDate.toISOString().split('T')[0]!;

        const montant =
          m === 10 && dureeMois >= 12 ? montantMensuel * 3 : montantMensuel;

        const { error: insertError } = await supabase.from('echeances').upsert(
          {
            projet_id: projet.id,
            mois_concerne: moisStr,
            date_emission_prevue: new Date(
              echeanceDate.getFullYear(),
              echeanceDate.getMonth(),
              25,
            )
              .toISOString()
              .split('T')[0]!,
            montant_prevu_ht: montant,
          },
          { onConflict: 'projet_id,mois_concerne', ignoreDuplicates: true },
        );

        if (!insertError) created++;
      }
    }
  }

  return NextResponse.json({ success: true, echeances_created: created });
}
```

- [ ] **Step 2: Build check**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds, `/api/cron/echeances` appears in routes

- [ ] **Step 3: Commit**

```bash
git add app/api/cron/echeances/route.ts
git commit -m "feat: add CRON route for echeance generation"
```

---

### Task 6: Final integration test and cleanup

**Files:**

- All files from Tasks 1-5

- [ ] **Step 1: Full lint check**

Run: `npm run lint 2>&1`
Expected: 0 errors (warnings acceptable)

- [ ] **Step 2: Full build check**

Run: `npm run build 2>&1`
Expected: Build succeeds with all routes:

- `/api/cron/echeances` (new, dynamic)
- `/facturation` (existing, dynamic)
- `/facturation/[ref]` (existing, dynamic)

- [ ] **Step 3: Verify no mock imports remain related to facturation**

Run: `grep -r "TODO.*facture\|TODO.*avoir" components/facturation/ lib/actions/factures.ts`
Expected: No TODO stubs remain in the wired components

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address lint/build issues in facture creation flow"
```
