# External Integrations Design Spec

## Context

SOLUVIA needs 3 external integrations to complete the data pipeline: Eduvia (read operational data), Odoo (push invoices, pull payments), and Email (send invoice PDFs to clients). All built as "ready-to-connect" abstractions with clear interfaces — real API calls are stubbed until credentials are available.

## 1. Eduvia Sync (Pull)

### Data flow

Eduvia API → SOLUVIA DB. Unidirectional pull. Per-client API keys stored encrypted in `client_api_keys`.

### Files

| File                           | Purpose                                                                                             |
| ------------------------------ | --------------------------------------------------------------------------------------------------- |
| `lib/utils/encryption.ts`      | AES-256-GCM encrypt/decrypt using `ENCRYPTION_KEY` env var                                          |
| `lib/eduvia/client.ts`         | REST client: `fetchResource<T>(apiKey, instanceUrl, resource, params)` with pagination + retry      |
| `lib/eduvia/sync.ts`           | Orchestrator: for each active client API key, sync contrats, apprenants, formations, taches_qualite |
| `app/api/sync/eduvia/route.ts` | CRON route (replace stub), calls sync engine with `createAdminClient()`                             |

### Sync strategy

- UPSERT on `eduvia_id` (natural key from Eduvia)
- Entity missing from API response → set `archive = true` (never hard delete)
- Update `last_synced_at` on each synced entity
- Skip client on error, continue with others
- Log errors per client via `logger.error('eduvia_sync', ...)`

### Eduvia API shape

```
GET {instanceUrl}/api/v1/contracts?page=1&per_page=100
Authorization: Bearer {decrypted_api_key}

Response: { data: [...], meta: { current_page, last_page, total } }
```

Resources to sync:

- `/api/v1/contracts` → `contrats` table
- `/api/v1/employee_learners` → `apprenants` table
- `/api/v1/formations` → `formations` table
- `/api/v1/companies` → `eduvia_companies` table
- Quality tasks derived from contract progressions → `taches_qualite` table

### Field mappings

**Contrats:**

- `eduvia_id` ← contract.id
- `apprenant_nom` ← contract.employee_learner.last_name
- `apprenant_prenom` ← contract.employee_learner.first_name
- `formation_titre` ← contract.formation.title
- `date_debut` ← contract.start_date
- `date_fin` ← contract.end_date
- `contract_state` ← contract.state
- `montant_prise_en_charge` ← contract.funding_amount
- `duree_mois` ← computed from dates

**Apprenants:**

- `eduvia_id` ← learner.id
- `nom` ← learner.last_name
- `prenom` ← learner.first_name
- `email` ← learner.email

## 2. Odoo Sync (Push + Pull)

### Data flow

Push: SOLUVIA factures → Odoo (account.move). Pull: Odoo payments → SOLUVIA paiements.

### Files

| File                                           | Purpose                                                                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `lib/odoo/client.ts`                           | Interface `OdooClient` with `pushInvoice()`, `pushCreditNote()`, `pullPayments()`. Stub implementation logs calls. |
| `lib/odoo/sync.ts`                             | Push engine: find factures without `odoo_id`, push each. Pull engine: fetch payments since last sync, upsert.      |
| `app/api/sync/odoo/route.ts`                   | CRON route (replace stub), runs push then pull                                                                     |
| `supabase/migrations/00035_odoo_sync_logs.sql` | New table for sync logging                                                                                         |

### odoo_sync_logs table

```sql
CREATE TABLE odoo_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  direction TEXT NOT NULL CHECK (direction IN ('push', 'pull')),
  entity_type TEXT NOT NULL,
  entity_id UUID,
  statut TEXT NOT NULL CHECK (statut IN ('success', 'error', 'retry')),
  payload JSONB,
  erreur TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Push invoice flow

1. Query factures WHERE `odoo_id IS NULL` AND `statut IN ('emise', 'en_retard')`
2. For each: call `odooClient.pushInvoice(facture)`
3. On success: UPDATE `factures.odoo_id` = returned ID, log success
4. On failure: log error, increment retry count, create notification after 5 failures

### Pull payments flow

1. Call `odooClient.pullPayments(since: lastSyncTimestamp)`
2. For each payment: UPSERT into `paiements` (match on `odoo_id`)
3. If payment total >= facture total → UPDATE `factures.statut = 'payee'`

### Stub implementation

The `OdooClient` stub logs all calls to `odoo_sync_logs` with `statut = 'success'` and returns mock IDs. When real Odoo credentials arrive, only the client body changes — sync engine and CRON stay identical.

## 3. Email (Resend)

### Data flow

SOLUVIA → Resend API → Client inbox. Triggered on invoice creation + manual resend.

### Files

| File                                               | Purpose                                                     |
| -------------------------------------------------- | ----------------------------------------------------------- |
| `lib/email/client.ts`                              | `sendFactureEmail(to, facture, pdfBuffer)` using Resend SDK |
| `lib/email/templates.ts`                           | `buildFactureEmailHtml(facture)` — inline HTML template     |
| `lib/actions/factures.ts`                          | Wire email send after `createFactures` + `createAvoir`      |
| `components/facturation/facture-detail-client.tsx` | Wire "Renvoyer par email" button                            |

### Email content

- **From:** configurable via `parametres` table (key `email.from_address`, default `facturation@soluvia.fr`)
- **Subject:** `Facture {ref} — SOLUVIA` (or `Avoir {ref} — SOLUVIA`)
- **Body:** HTML with SOLUVIA branding, facture summary (ref, date, montant TTC, date échéance)
- **Attachment:** PDF buffer from `@react-pdf/renderer`

### Config

- `RESEND_API_KEY` added to `lib/env.ts` Zod schema (optional, like CRON_SECRET)
- If not configured, email sending is skipped with a log warning (app stays functional)

### Send flow

1. After facture INSERT succeeds in `createFactures`:
   - Generate PDF via internal fetch to `/api/factures/{ref}/pdf`
   - Find client primary contact email from `client_contacts`
   - Call `sendFactureEmail(email, facture, pdfBuffer)`
   - UPDATE `factures.email_envoye = true`
2. If email fails: log error, facture still created (email_envoye stays false)
3. "Renvoyer par email" button: same flow, callable anytime

## Environment variables (additions)

```
ENCRYPTION_KEY=32-byte-hex-key-for-aes-256
RESEND_API_KEY=re_xxxxx (optional)
```

Both optional — app works without them, features gracefully degrade.

## Verification

1. **Eduvia:** Trigger CRON manually, verify contrats/apprenants upserted with `last_synced_at` updated
2. **Odoo:** Create a facture, verify `odoo_sync_logs` entry created (stub mode)
3. **Email:** Create a facture with `RESEND_API_KEY` configured, verify email sent + `email_envoye = true`
4. **Degraded mode:** Remove env vars, verify app still builds and functions without errors
5. `npm run lint && npm run build` passes
