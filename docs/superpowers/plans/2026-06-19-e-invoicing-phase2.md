# E-invoicing 2026 — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Poser `invoice_edi_format = 'facturx'` sur le partner client Odoo (création + backfill si vide) pour les clients français avec SIRET, afin que les factures poussées par SOLUVIA soient transmissibles en Factur-X via le Peppol d'Odoo.

**Architecture:** Une règle pure et testée (`lib/odoo/invoice-edi-format.ts`) décide du format e-invoice à partir du pays + SIRET du client. Le push (`findOrCreatePartner`) la consomme : pose le format à la création du partner, et en backfill-si-vide sur un partner existant (best-effort, jamais bloquant). Un script one-shot applique la même règle au parc client déjà dans Odoo. Le routage Peppol (EAS/endpoint) est dérivé par Odoo du `company_registry` déjà posé ; SOLUVIA ne le touche pas.

**Tech Stack:** TypeScript, Odoo JSON-RPC (`account_edi_proxy_client` / `account_peppol` côté Odoo 19.2), Vitest, tsx pour les scripts.

**Spec de référence :** `docs/superpowers/specs/2026-06-18-e-invoicing-phase2-design.md`

**Conventions projet :** UI/texte FR, pas d'em-dash, `npm test` doit rester vert (hook pre-push). Branche de travail : `feat/e-invoicing-phase2` (déjà créée, contient le spec + scripts de découverte). Le hook PostToolUse fait un `tsc --noEmit` sur chaque fichier `.ts` édité : écrire le test ET l'implémentation rapprochés pour ne pas rester bloqué sur un import manquant.

---

## File Structure

| Fichier                                     | Responsabilité                                                                                                           |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `lib/odoo/invoice-edi-format.ts`            | Nouveau — règle pure `resolveInvoiceEdiFormat` + constante `EDI_FORMAT_FACTURX`                                          |
| `__tests__/invoice-edi-format.test.ts`      | Nouveau — tests de la règle                                                                                              |
| `lib/odoo/client.ts`                        | `findOrCreatePartner` : pose le format au create + backfill-si-vide ; nouvelle méthode privée `backfillInvoiceEdiFormat` |
| `scripts/backfill-odoo-peppol-format.ts`    | Nouveau — backfill one-shot du parc client existant (dry-run par défaut)                                                 |
| `scripts/verify-odoo-soluvia-einvoicing.ts` | Déjà créé (outillage de vérif), à committer                                                                              |

---

## Task 1: Règle pure de résolution du format e-invoice

**Files:**

- Create: `lib/odoo/invoice-edi-format.ts`
- Test: `__tests__/invoice-edi-format.test.ts`

- [ ] **Step 1: Écrire le test**

```ts
import { describe, it, expect } from 'vitest';
import {
  EDI_FORMAT_FACTURX,
  resolveInvoiceEdiFormat,
} from '@/lib/odoo/invoice-edi-format';

describe('resolveInvoiceEdiFormat', () => {
  it('FR + registry présent -> facturx', () => {
    expect(
      resolveInvoiceEdiFormat({
        countryCode: 'FR',
        companyRegistry: '99424153700012',
      }),
    ).toBe(EDI_FORMAT_FACTURX);
  });

  it('countryCode absent ou null (défaut FR) + registry -> facturx', () => {
    expect(resolveInvoiceEdiFormat({ companyRegistry: '99424153700012' })).toBe(
      EDI_FORMAT_FACTURX,
    );
    expect(
      resolveInvoiceEdiFormat({
        countryCode: null,
        companyRegistry: '99424153700012',
      }),
    ).toBe(EDI_FORMAT_FACTURX);
  });

  it('registry avec espaces accepté', () => {
    expect(
      resolveInvoiceEdiFormat({
        countryCode: 'fr',
        companyRegistry: '994 241 537 00012',
      }),
    ).toBe(EDI_FORMAT_FACTURX);
  });

  it('pays non-FR -> null', () => {
    expect(
      resolveInvoiceEdiFormat({
        countryCode: 'BE',
        companyRegistry: '0123456789',
      }),
    ).toBeNull();
  });

  it('registry vide ou absent -> null', () => {
    expect(
      resolveInvoiceEdiFormat({ countryCode: 'FR', companyRegistry: '' }),
    ).toBeNull();
    expect(resolveInvoiceEdiFormat({ countryCode: 'FR' })).toBeNull();
    expect(
      resolveInvoiceEdiFormat({ countryCode: 'FR', companyRegistry: null }),
    ).toBeNull();
  });

  it('constante = facturx', () => {
    expect(EDI_FORMAT_FACTURX).toBe('facturx');
  });
});
```

- [ ] **Step 2: Lancer le test (échoue)**

Run: `npm test -- invoice-edi-format`
Expected: FAIL (`Cannot find module '@/lib/odoo/invoice-edi-format'`).

- [ ] **Step 3: Écrire l'implémentation**

```ts
// Regle pure : quel format de facture electronique poser sur le partner client
// Odoo. SOLUVIA ne facture que des clients FR B2B en Factur-X. Le SIRET
// (company_registry) est requis cote Odoo pour deriver le routage Peppol ; sans
// lui on ne pose rien. Clients non-FR (intracom) : on laisse Odoo/compta decider.

export const EDI_FORMAT_FACTURX = 'facturx';

export function resolveInvoiceEdiFormat(opts: {
  countryCode?: string | null;
  companyRegistry?: string | null;
}): typeof EDI_FORMAT_FACTURX | null {
  const country = (opts.countryCode ?? 'FR').toUpperCase();
  const registry = opts.companyRegistry?.replace(/\s/g, '') ?? '';
  if (country !== 'FR') return null;
  if (registry.length === 0) return null;
  return EDI_FORMAT_FACTURX;
}
```

- [ ] **Step 4: Lancer le test (passe)**

Run: `npm test -- invoice-edi-format`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/odoo/invoice-edi-format.ts __tests__/invoice-edi-format.test.ts
git commit -m "feat(e-invoicing): regle pure resolveInvoiceEdiFormat (facturx FR)"
```

---

## Task 2: Enrichir le partner au push (create + backfill si vide)

**Files:**

- Modify: `lib/odoo/client.ts` (import en tête ; `findOrCreatePartner` lignes 423-481 ; ajout d'une méthode privée juste après)

Contexte du code existant (`findOrCreatePartner`, pour situer les éditions) :

```ts
  private async findOrCreatePartner(
    siret: string,
    name: string,
    vat: string | null,
    address?: { street?: string | null; zip?: string | null; city?: string | null; countryCode?: string | null; },
  ): Promise<number> {
    const cleanSiret = siret.replace(/\s/g, '');
    const cleanVat = vat?.replace(/\s/g, '') ?? null;
    const domains: Array<unknown[][]> = [];
    if (cleanVat) domains.push([['vat', '=', cleanVat]]);
    if (cleanSiret) {
      domains.push([['vat', '=', cleanSiret]]);
      domains.push([['company_registry', '=', cleanSiret]]);
    }
    for (const domain of domains) {
      const ids = await this.executeKw<number[]>('res.partner', 'search', [domain], { limit: 1 });
      if (ids.length > 0 && ids[0] !== undefined) return ids[0];
    }
    const vals: Record<string, unknown> = { name, vat: cleanVat, company_registry: cleanSiret || false, is_company: true };
    if (address) { /* street/zip/city/country_id */ }
    const created = await this.executeKw<number>('res.partner', 'create', [vals]);
    logger.info(SCOPE, 'Created partner', { id: created, name });
    return created;
  }
```

- [ ] **Step 1: Importer la règle**

En tête de `lib/odoo/client.ts`, après `import { buildOdooNarration } from '@/lib/utils/e-invoicing-mentions';` (ajouté en Phase 1), ajouter :

```ts
import { resolveInvoiceEdiFormat } from '@/lib/odoo/invoice-edi-format';
```

`client.ts` n'a besoin que de la fonction ; son type de retour (`'facturx' | null`) suffit côté appelant, pas besoin d'importer la constante.

- [ ] **Step 2: Calculer le format une fois, en tête de `findOrCreatePartner`**

Juste après la ligne `const cleanVat = vat?.replace(/\s/g, '') ?? null;`, ajouter :

```ts
// Format e-invoice a poser sur le partner (Factur-X pour les clients FR avec
// SIRET). Le routage Peppol (EAS/endpoint) est derive par Odoo du
// company_registry, on ne le touche pas.
const ediFormat = resolveInvoiceEdiFormat({
  countryCode: address?.countryCode,
  companyRegistry: cleanSiret,
});
```

- [ ] **Step 3: Backfill sur partner existant (remplacer le retour anticipé)**

Remplacer, dans la boucle `for (const domain of domains)`, la ligne :

```ts
if (ids.length > 0 && ids[0] !== undefined) return ids[0];
```

par :

```ts
if (ids.length > 0 && ids[0] !== undefined) {
  const existingId = ids[0];
  // Backfill best-effort : pose le format seulement s'il est encore vide.
  if (ediFormat) await this.backfillInvoiceEdiFormat(existingId, ediFormat);
  return existingId;
}
```

- [ ] **Step 4: Poser le format à la création**

Dans la construction de `vals` (création du partner), après la ligne `is_company: true,` (dans l'objet `vals`), ajouter juste après la déclaration de `vals` :

```ts
if (ediFormat) vals.invoice_edi_format = ediFormat;
```

(À placer après `const vals: Record<string, unknown> = { ... };` et avant le bloc `if (address) {`.)

- [ ] **Step 5: Ajouter la méthode privée `backfillInvoiceEdiFormat`**

Juste après la fin de `findOrCreatePartner` (après son `}` de fermeture, avant `resolveCountryId`), ajouter :

```ts
  // Pose invoice_edi_format sur un partner EXISTANT uniquement s'il est encore
  // vide : on n'ecrase jamais une valeur deja posee (compta ou push precedent).
  // Best-effort : un echec ici ne doit jamais casser le push facture.
  private async backfillInvoiceEdiFormat(
    partnerId: number,
    format: string,
  ): Promise<void> {
    try {
      const rows = await this.executeKw<
        Array<{ id: number; invoice_edi_format: string | false }>
      >('res.partner', 'read', [[partnerId]], {
        fields: ['invoice_edi_format'],
      });
      const current = rows[0]?.invoice_edi_format;
      if (current) return; // deja pose -> ne pas ecraser
      await this.executeKw<boolean>('res.partner', 'write', [
        [partnerId],
        { invoice_edi_format: format },
      ]);
      logger.info(SCOPE, 'Backfilled invoice_edi_format', { partnerId, format });
    } catch (err) {
      logger.warn(SCOPE, 'backfillInvoiceEdiFormat failed (non bloquant)', {
        partnerId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
```

- [ ] **Step 6: Typecheck + suite Odoo**

Run: `npx tsc --noEmit && npm test -- odoo`
Expected: aucune erreur de type ; la suite `odoo` reste verte (la signature publique de `pushInvoice`/`pushMove` est inchangée, l'enrichissement est interne et best-effort).

- [ ] **Step 7: Commit**

```bash
git add lib/odoo/client.ts
git commit -m "feat(e-invoicing): pose invoice_edi_format facturx sur le partner (create + backfill)"
```

---

## Task 3: Script one-shot de backfill du parc existant

**Files:**

- Create: `scripts/backfill-odoo-peppol-format.ts`

- [ ] **Step 1: Écrire le script**

```ts
// Backfill one-shot : pose invoice_edi_format='facturx' sur les partners clients
// FR ayant un SIRET (company_registry) et un invoice_edi_format vide. N'ecrase
// jamais une valeur existante. Dry-run par defaut ; ecrit seulement avec --apply.
//
// Run (dry-run) : npx tsx scripts/backfill-odoo-peppol-format.ts
// Run (apply)   : npx tsx scripts/backfill-odoo-peppol-format.ts --apply

import { config } from 'dotenv';
import { resolve } from 'node:path';
import {
  EDI_FORMAT_FACTURX,
  resolveInvoiceEdiFormat,
} from '../lib/odoo/invoice-edi-format';

config({ path: resolve(process.cwd(), '.env.local') });

interface JsonRpcResponse<T> {
  result?: T;
  error?: { message: string; data?: { message?: string; debug?: string } };
}

async function rpc<T>(
  url: string,
  service: string,
  method: string,
  args: unknown[],
): Promise<T> {
  const res = await fetch(`${url}/jsonrpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'call',
      params: { service, method, args },
      id: Date.now(),
    }),
  });
  const json = (await res.json()) as JsonRpcResponse<T>;
  if (json.error)
    throw new Error(json.error.data?.message ?? json.error.message);
  return json.result as T;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const url = process.env.ODOO_URL!;
  const db = process.env.ODOO_DB!;
  const username = process.env.ODOO_USERNAME!;
  const apiKey = process.env.ODOO_API_KEY!;

  const uid = await rpc<number>(url, 'common', 'authenticate', [
    db,
    username,
    apiKey,
    {},
  ]);
  const exec = <T>(
    model: string,
    method: string,
    args: unknown[],
    kwargs: Record<string, unknown> = {},
  ) =>
    rpc<T>(url, 'object', 'execute_kw', [
      db,
      uid,
      apiKey,
      model,
      method,
      args,
      kwargs,
    ]);

  // Partners clients FR avec SIRET et sans format e-invoice.
  type Partner = {
    id: number;
    name: string;
    company_registry: string | false;
    invoice_edi_format: string | false;
  };
  const partners = await exec<Partner[]>(
    'res.partner',
    'search_read',
    [
      [
        ['customer_rank', '>', 0],
        ['country_id.code', '=', 'FR'],
        ['company_registry', '!=', false],
        ['invoice_edi_format', '=', false],
      ],
    ],
    { fields: ['id', 'name', 'company_registry', 'invoice_edi_format'] },
  );

  // Defense en profondeur : on confirme la regle via le helper (source unique).
  const targets = partners.filter(
    (p) =>
      resolveInvoiceEdiFormat({
        countryCode: 'FR',
        companyRegistry:
          typeof p.company_registry === 'string' ? p.company_registry : '',
      }) === EDI_FORMAT_FACTURX,
  );

  console.log(
    `[odoo] ${targets.length} partner(s) client(s) FR sans invoice_edi_format`,
  );
  for (const p of targets) {
    console.log(`  [${p.id}] ${p.name} (registry=${p.company_registry})`);
  }

  if (!apply) {
    console.log(
      '\n[dry-run] aucun changement. Relancer avec --apply pour ecrire.',
    );
    return;
  }

  let written = 0;
  for (const p of targets) {
    // oxlint-disable-next-line react-doctor/async-await-in-loop
    await exec<boolean>('res.partner', 'write', [
      [p.id],
      { invoice_edi_format: EDI_FORMAT_FACTURX },
    ]);
    written++;
  }
  console.log(
    `\n[apply] invoice_edi_format='facturx' pose sur ${written} partner(s).`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Typecheck + dry-run réel**

Run: `npx tsc --noEmit && npx tsx scripts/backfill-odoo-peppol-format.ts`
Expected: typecheck OK ; le dry-run liste les partners FR sans format (d'après la découverte : au moins FORMA QHRC [15] et ICADEMIE [14] qui avaient `edi_format=-`). AUCUNE écriture (`[dry-run] aucun changement`).

- [ ] **Step 3: Commit (script + outillage de vérif déjà créé)**

```bash
git add scripts/backfill-odoo-peppol-format.ts scripts/verify-odoo-soluvia-einvoicing.ts
git commit -m "chore(e-invoicing): script backfill invoice_edi_format + verif config SOLUVIA"
```

---

## Task 4: Vérification finale

**Files:** aucun (vérification)

- [ ] **Step 1: Suite complète + build**

Run: `npm test && npm run build`
Expected: tous les tests verts (suite existante + 6 nouveaux du helper), build de production OK.

- [ ] **Step 2: Revue facturation (garde-fou)**

Lancer l'agent `facturation-model-checker` sur le diff de la branche. Attendu : aucun impact sur la logique de facturation (push enrichi d'un seul champ partner, best-effort ; cycle d'émission, gapless, commission/échéancier inchangés).

- [ ] **Step 3: (Optionnel, sur décision user) appliquer le backfill prod**

Run: `npx tsx scripts/backfill-odoo-peppol-format.ts --apply`
Expected: pose `facturx` sur les partners FR ciblés. À ne lancer qu'avec l'accord explicite de l'utilisateur (écriture sur Odoo prod). Idempotent : re-lancer est sans effet.

- [ ] **Step 4: Mettre à jour la mémoire projet**

Mettre à jour `project_e_invoicing.md` : Phase 2 livrée (enrichissement `invoice_edi_format` au push + script backfill ; routage Peppol auto-dérivé du SIRET ; envoi/gating restent côté Odoo). Reste Phase 3 (pull statut transmission). Noter l'état vérifié : SOLUVIA company `receiver`/prod OK, EDUVIA `not_registered` (action compta), conformité PDP = à confirmer côté Odoo (immatriculation PDP).

---

## Self-Review

**Spec coverage :**

- Helper pur `resolveInvoiceEdiFormat` + constante → Task 1. ✓
- Enrichissement partner create + backfill-si-vide, best-effort, `company_registry` non touché → Task 2. ✓
- Script one-shot backfill (dry-run par défaut) réutilisant le helper → Task 3. ✓
- Tests du helper (FR/non-FR, registry présent/vide, défaut FR) → Task 1. ✓
- Pas de test réseau sur `findOrCreatePartner` (couche RPC non mockée) → assuré par typecheck + suite odoo (Task 2 Step 6) + dry-run réel (Task 3 Step 2). ✓
- Garde-fous (best-effort, pas d'écrasement, non-FR ignoré) → Task 2 (méthode `backfillInvoiceEdiFormat` + condition `if (ediFormat)`). ✓

**Placeholder scan :** aucun TBD/TODO ; tout le code est complet (helper, édition client.ts montrée avec contexte, script entier).

**Cohérence des types :** `resolveInvoiceEdiFormat({ countryCode?, companyRegistry? })` est appelé avec les mêmes noms de propriété en Task 1 (tests), Task 2 (`{ countryCode: address?.countryCode, companyRegistry: cleanSiret }`) et Task 3 (`{ countryCode: 'FR', companyRegistry: ... }`). La constante `EDI_FORMAT_FACTURX = 'facturx'` est la même partout. La méthode `backfillInvoiceEdiFormat(partnerId, format)` a une signature cohérente entre sa définition (Task 2 Step 5) et son appel (Task 2 Step 3).
