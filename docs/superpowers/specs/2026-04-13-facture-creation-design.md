# Facture Creation Flow — Design Spec

## Context

SOLUVIA needs a complete invoice creation flow for French training organizations. Invoices are generated from scheduled billing milestones (echeances), grouped by project, with gapless numbering (French legal requirement). Credit notes (avoirs) correct errors without deleting invoices.

Reference spec: `specs/06-facturation.html`

## Scope

**In scope:**

- CRON-based echeance generation from active contrats
- Facture creation from selected echeances (auto-grouped by projet)
- Automatic line item calculation (commission per contrat)
- Avoir (credit note) creation from facture detail
- UI integration with existing echeance-table and avoir-dialog components

**Out of scope (stubs only):**

- PDF generation (existing `facture-pdf.tsx` stays as-is)
- Email sending to clients
- Odoo accounting sync

## Business Rules

### Echeance Generation (CRON)

- Runs monthly via `/api/cron/echeances` (protected by `CRON_SECRET`)
- For each active projet with active contrats:
  - Generate echeances starting at contrat M+2, monthly through M+10, final at M12
  - Skip if echeance already exists for (projet_id, mois_concerne)
  - `montant_prevu_ht = SUM(contrats.montant_prise_en_charge) * projet.taux_commission / 100 / 12`
  - Final month (M12 covering M10-M12): `* 3 / 12` instead of `/ 12`
  - `date_emission_prevue` = 25th of the billing month

### Facture Creation

- CDP selects N echeances on `/facturation` tab "Echeances"
- System auto-groups by `projet_id` (1 facture = 1 projet x N months)
- For each group:
  1. **INSERT `factures`** — trigger auto-generates `ref` (FAC-TRI-NNNN) and `numero_seq` (gapless via max+1 with row lock)
     - `client_id` from projet
     - `date_emission` = today
     - `date_echeance` = last day of month + 30 days
     - `mois_concerne` = formatted month(s) label (e.g., "Fev 2026" or "Fev-Mar 2026")
     - `statut` = 'emise'
     - `taux_tva` = 20.00 (default)
     - `created_by` = current user
  2. **INSERT `facture_lignes`** — 1 per active non-archived contrat in the projet:
     - `montant_ht = contrat.montant_prise_en_charge * projet.taux_commission / 100 / 12`
     - `description = "Commission {taux}% — {formation_titre} — {apprenant_prenom} {apprenant_nom} — {mois}"`
  3. **Compute totals** on the facture:
     - `montant_ht = SUM(lignes.montant_ht)`
     - `montant_tva = montant_ht * taux_tva / 100`
     - `montant_ttc = montant_ht + montant_tva`
  4. **UPDATE `echeances`** — set `facture_id` to link back, set `validee = true`
- Revalidate `/facturation` page
- Toast: "{N} facture(s) emise(s) avec succes"

### Avoir (Credit Note) Creation

- Triggered from facture detail page via existing `avoir-dialog.tsx`
- Input: `facture_origine_id`, `motif` (required), `montant` (required, <= original), optional note
- Server action:
  1. **INSERT `factures`** with:
     - `est_avoir = true`
     - `facture_origine_id` = origin facture id
     - `avoir_motif` = selected motif
     - `montant_ht` = negative value
     - `montant_tva` = negative (montant_ht \* taux_tva / 100)
     - `montant_ttc` = negative (montant_ht + montant_tva)
     - `statut` = 'avoir'
     - Same `projet_id`, `client_id`, `mois_concerne` as origin
     - Same gapless ref sequence (FAC-TRI-NNNN, next number)
  2. **INSERT `facture_lignes`** — single line: "Avoir sur FAC-XXX — {motif}"
- Validation:
  - Montant avoir <= montant HT facture originale
  - No existing avoir on the same facture (check via `getAvoirForFacture()`)
  - Origin facture must be statut 'emise' or 'en_retard' (not 'a_emettre' or already 'avoir')

## Architecture

### Files to Create

| File                              | Purpose                                                           |
| --------------------------------- | ----------------------------------------------------------------- |
| `lib/actions/factures.ts`         | Server actions: `createFactures(echeanceIds)`, `createAvoir(...)` |
| `app/api/cron/echeances/route.ts` | CRON endpoint for echeance generation                             |

### Files to Modify

| File                                        | Changes                                                             |
| ------------------------------------------- | ------------------------------------------------------------------- |
| `components/facturation/echeance-table.tsx` | Wire `handleEmettre()` to `createFactures` server action            |
| `components/facturation/avoir-dialog.tsx`   | Wire form submit to `createAvoir` server action                     |
| `lib/queries/factures.ts`                   | Add `getEcheancesWithContrats()` if needed for richer echeance data |

### Server Actions (`lib/actions/factures.ts`)

```typescript
'use server'

createFactures(echeanceIds: string[]): Promise<{ success: boolean; refs: string[]; error?: string }>
createAvoir(params: { factureOrigineId: string; motif: string; montant: number; note?: string }): Promise<{ success: boolean; ref?: string; error?: string }>
```

Both actions use `createServerClient()` to respect RLS (CDP can only create for own projects).

### CRON Endpoint (`app/api/cron/echeances/route.ts`)

- Protected by `CRON_SECRET` bearer token (existing pattern in `lib/utils/cron-auth.ts`)
- Uses `createAdminClient()` to bypass RLS (system-level operation)
- Idempotent: skips existing echeances via UNIQUE(projet_id, mois_concerne)
- Returns count of created echeances

### Transaction Safety

- `createFactures`: wraps all INSERTs in a single Supabase RPC or sequential operations within the same request. The `generate_facture_ref()` trigger handles concurrency with row-level locking.
- Echeance updates happen after successful facture insert. If the update fails, the echeance remains unlinked (no orphan factures — facture is valid, echeance can be re-linked).

## Verification Plan

1. Seed or CRON-generate echeances for existing projets
2. On `/facturation`, select echeances, click "Emettre"
3. Verify facture appears in list with correct ref (FAC-TRI-NNNN), montant, statut
4. Open facture detail — verify lignes, totaux, client info
5. Test avoir: open dialog, select motif, enter montant, submit
6. Verify avoir appears with negative montant, badge on original facture
7. Verify can't create double avoir on same facture
8. `npm run lint && npm run build` passes
