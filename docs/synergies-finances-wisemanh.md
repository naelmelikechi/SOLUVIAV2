# Plan synergies SOLUVIA × FINANCES-WISEMANH

> Tenant Odoo partagé : `wisemanh.odoo.com` / DB `wisemanh`.
> Compte technique unique `comptabilite@mysoluvia.com` (choix volontaire).
> Document miroir dans le repo FINANCES-WISEMANH (`docs/synergies-soluvia.md`).

## Matrice d'ownership Odoo (état cible)

| Modèle Odoo                               | SOLUVIA V2                     | FINANCES-WISEMANH                 | Note                                            |
| ----------------------------------------- | ------------------------------ | --------------------------------- | ----------------------------------------------- |
| `account.move` (out_invoice / out_refund) | **Write**                      | Read                              | Source de vérité = SOLUVIA                      |
| `account.payment` (inbound)               | **Write** (wizard) + Read      | Read                              | SOLUVIA déclenche, les deux lisent              |
| `res.partner`                             | **Write** (lookup/create)      | Read                              | SOLUVIA seul écrit                              |
| `account.tax`                             | Read                           | Read                              | Config humaine côté Odoo                        |
| `account.bank.statement.line`             | Read (synergie #2)             | **Read** (Phase A)                | FINANCES déjà brancée                           |
| `account.analytic.line`                   | **Write** (synergie #1) + Read | Read + Write (manuel utilisateur) | SOLUVIA pousse l'auto, FINANCES garde le manuel |
| `account.analytic.account`                | Read                           | **Write** (création N3)           | FINANCES seul écrit                             |
| `ir.attachment`                           | **Write** (synergie #6 : PDF)  | **Write** (justificatifs)         | Co-écriture sur res différents                  |
| `res.company`                             | Read (synergie #3)             | Read (synergie #3)                | Mapping centralisé Supabase                     |

---

## Synergie #1 — Push analytique automatique côté SOLUVIA (PRIORITÉ HAUTE)

### Objectif

À chaque `post` d'une facture par SOLUVIA, créer une `account.analytic.line` côté Odoo qui ventile le CA HT par code analytique (projet, OPCO, sociétés). FINANCES la voit automatiquement via sa Phase B, son réel trésorerie d'émission devient juste sans saisie manuelle par Maria.

### Architecture

```
SOLUVIA factures.post()
  └─ pushInvoice() → account.move (existant)
  └─ NEW: pushAnalytic() → account.analytic.line
       └─ resolve(code_analytique) via lignes_analytiques mapping
       └─ create avec move_line_id du compte de revenu (706000)
```

### Données nécessaires

- Table `projets` SOLUVIA doit avoir un `code_analytique` (ex `41.01` pour SOLUVIA, `42.01` pour Eduvia). À ajouter si absent.
- Mapping côté FINANCES `lignes_analytiques.code` doit être aligné (déjà géré par `resolveAnalyticCode`).
- `account.analytic.line.create` requiert `account_id` (= id Odoo du compte analytique). À résoudre par lookup `account.analytic.account` where `code = X`.

### Tâches SOLUVIA

1. Migration `projets.code_analytique TEXT NULL` + UI admin pour le remplir.
2. `lib/odoo/client.ts`: ajouter `pushAnalyticForMove(moveId, lines: [{code, amount}])`.
3. `lib/odoo/sync.ts pushFactures`: après `pushInvoice`, lookup le compte analytique par code → 1 `account.analytic.line` par ligne de facture (montant HT signé).
4. Idempotence : stocker `analytic_line_odoo_id` sur `facture_lignes` (nouvelle colonne).
5. Test : ajouter un cas dans `__tests__/odoo-sync.test.ts`.

### Tâches FINANCES-WISEMANH

- Aucune. La Phase B existante synchronise déjà ces analytic.lines automatiquement.
- Mettre à jour `docs/odoo-setup.md` pour préciser que les lignes émission ne doivent plus être saisies à la main.

### Risques

- **Doublon avec saisie manuelle** : si Maria saisit aussi côté Odoo. Mitigation : SOLUVIA crée avec un `name` reconnaissable (`[SOLUVIA-AUTO] FAC-XXX`) + doc à Maria.
- **Compte de revenu manquant** : si le journal vente sociétés n'a pas de compte 706 mappé, le create échoue. Pré-vol = preflight Odoo (script existant).
- **Annulation** : déjà couvert par Phase C ajoutée (synergie #3.D).

### Effort

~1 jour SOLUVIA. 0 jour FINANCES.

### Pré-requis

- Synergie #3 mapping company (recommandé mais pas bloquant).

---

## Synergie #2 — Bank-lines → pré-remplissage "marquer payée" SOLUVIA

### Objectif

Lorsqu'un superadmin SOLUVIA clique "marquer payée" sur une facture, suggérer la `bank_line` qui matche (montant + ref FAC-XXX dans payment_ref) plutôt que de saisir la date à la main.

### Architecture

```
SOLUVIA superadmin clique "marquer payée"
  └─ Dialog ouvre, query FINANCES Supabase via vue ou cross-DB function
       └─ SELECT bank_lines WHERE montant = facture.ttc AND
                              (payment_ref ILIKE '%FAC-XXX%' OR date ± 7j)
       └─ Pre-fill date_paiement, montant, communication
  └─ Submit → wizard register Odoo (existant)
```

### Choix techniques (à arbitrer)

**Option A — Vue Supabase cross-projet** : créer une `foreign data wrapper` ou simplement faire 2 projets Supabase parler via API REST. SOLUVIA appelle `https://<finances>.supabase.co/rest/v1/bank_lines?...`.
**Option B — Table partagée** : déplacer `bank_lines` dans un schéma Supabase commun aux 2 projets (gros refactor).
**Option C — Webhook FINANCES → SOLUVIA** : à chaque insert de bank_line, FINANCES POST vers SOLUVIA qui la stocke dans une table `bank_lines_mirror`. Découplé, simple à mettre en place.

**Recommandation : Option C** (mirror), évite tout couplage de schéma.

### Tâches SOLUVIA

1. Migration `bank_lines_mirror` (id, source_external_id, montant, date, payment_ref, societe_id, synced_at).
2. Route POST `/api/internal/bank-lines-sync` protégée par bearer token partagé.
3. Composant `MarquerPayeeDialog` : `useEffect` pour matcher candidats par montant ± 0.01€ + ref ILIKE.
4. UI : afficher 0–N suggestions avec bouton "utiliser cette ligne".

### Tâches FINANCES-WISEMANH

1. Trigger DB `AFTER INSERT ON bank_lines` → `pg_notify` ou direct HTTP via `supabase functions`.
2. Edge function ou cron qui POST vers SOLUVIA.

### Risques

- **Latence** : le webhook peut prendre quelques secondes après le cron Phase A.
- **Sécurité** : token partagé entre les 2 backends, à rotater.
- **Faux positifs match** : 2 factures même montant même jour. Mitigation : score de matching + confirmation utilisateur.

### Effort

~2 jours SOLUVIA + 0.5 jour FINANCES.

### Pré-requis

Aucun (peut démarrer indépendamment).

---

## Synergie #3 — Source unique du mapping sociétés (Supabase shared)

### Objectif

Aujourd'hui :

- SOLUVIA : `societes_emettrices.odoo_company_id` + `odoo_journal_id` (3 sociétés émettrices)
- FINANCES : `connection.companyMapping` (JSONB sur api_connections, 6 sociétés)

Si on ajoute une 7e société Odoo, il faut MAJ 2 endroits avec risque d'incohérence. Une source unique évite ça.

### Architecture

Créer un nouveau projet Supabase mini `shared-config` (ou réutiliser un des deux) contenant :

```sql
CREATE TABLE odoo_companies_registry (
  odoo_company_id INTEGER PRIMARY KEY,
  odoo_company_name TEXT NOT NULL,
  odoo_journal_id_sale INTEGER,
  internal_slug TEXT NOT NULL,        -- 'soluvia', 'eduvia', 'heol', etc.
  raison_sociale TEXT,
  siret TEXT,
  is_billing_entity BOOLEAN DEFAULT false,
  is_treasury_entity BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

Les deux apps consomment via REST en cache local (revalidate 1h).

### Choix d'hébergement (à arbitrer)

**Option A — Nouveau projet Supabase dédié** : propre mais 1 instance de plus à payer/maintenir.
**Option B — SOLUVIA est la source** : SOLUVIA héberge la table, FINANCES la pull à chaque cron en cache. Simple, 0 infra nouvelle.
**Option C — Status quo + script de réconciliation** : un script weekly qui vérifie que les mappings sont cohérents et alerte sur divergence.

**Recommandation : Option B**. SOLUVIA = source, FINANCES la pull au démarrage de chaque cron.

### Tâches SOLUVIA

1. Migration : élargir `societes_emettrices` pour couvrir les sociétés "treasury only" (Wisemanh, KS Campus, etc.) avec un flag `is_billing_entity`.
2. Route GET `/api/public/odoo-companies-registry` (auth bearer ou public read-only).
3. UI admin pour gérer (déjà existe partiellement dans `/admin/parametres/societes-emettrices`).

### Tâches FINANCES-WISEMANH

1. Au démarrage du cron, fetch `SOLUVIA/api/public/odoo-companies-registry` → construire `companyMapping` à la volée.
2. Cache 1h dans la connection.
3. Migration : déprécier `api_connections.company_mapping` (le garder en fallback).

### Risques

- **Couplage** : si SOLUVIA down, FINANCES tombe. Mitigation : cache local persisté + fallback sur `company_mapping` legacy.
- **Périmètre** : Wisemanh n'est pas une société "émettrice de factures" — élargir la table SOLUVIA peut être confusant. Renommer en `odoo_companies` (sans `emettrices`) clarifie.

### Effort

~1.5 jour SOLUVIA + 0.5 jour FINANCES.

### Pré-requis

Aucun. Quick win pour éviter divergence dans 6 mois.

---

## Synergie #4 — Webhook Odoo `account.move.state=cancel` (latence ↘)

### Objectif

Aujourd'hui la détection d'une facture annulée prend jusqu'à 1h côté SOLUVIA (cron horaire) et jusqu'à 14j côté FINANCES (lookback de la Phase C). Un webhook Odoo réduit ça à < 1 seconde.

### Architecture

```
Odoo automation ON account.move.write IF state changed to 'cancel'
  └─ HTTP POST https://soluvia.app/api/webhooks/odoo/move-cancelled
       └─ Verify HMAC signature
       └─ Mark facture localement + notif admin (SOLUVIA)
       └─ Fan-out: POST https://finances-wisemanh.app/api/webhooks/odoo/move-cancelled
            └─ Delete linked odoo_analytic_lines
```

Configuration Odoo : module standard `base_automation` + une action server qui appelle `requests.post(...)` ou utilise le module `webhooks` (Odoo Studio).

### Tâches SOLUVIA

1. Route `/api/webhooks/odoo/move-cancelled` :
   - HMAC verify (header `X-Odoo-Signature`)
   - Lookup facture by `odoo_id`
   - Insert notification admin (réutilise le code Phase 4 actuel)
   - Fan-out vers FINANCES (URL config env)
2. Env vars : `ODOO_WEBHOOK_SECRET`, `FINANCES_WEBHOOK_URL`, `FINANCES_WEBHOOK_TOKEN`.

### Tâches FINANCES-WISEMANH

1. Route `/api/webhooks/odoo/move-cancelled` :
   - Verify bearer
   - Réutilise la logique de `syncOdooCancellations` mais ciblée sur 1 move
2. La Phase C du cron reste un filet de sécurité (catchup si webhook loupé).

### Tâches Odoo (par humain)

1. Activer un compte technique avec droits "Settings → Technical → Automated Actions".
2. Créer une automation rule sur `account.move`, trigger "On Update" + filter `state == cancel`.
3. Action : Python code `requests.post(env['ir.config_parameter'].get_param('webhook.url'), json={...}, headers={'X-Odoo-Signature': hmac(...)})`.

### Risques

- **Doublons** : webhook + cron qui se concurrent. Mitigation : idempotence (déjà OK, l'insert notif est tolérant).
- **Sécurité HMAC** : faire tourner le secret régulièrement.
- **Dépendance Odoo Enterprise** : `base_automation` est dans CE seulement. À vérifier sur le tenant Wisemanh.

### Effort

~2 jours (1 SOLUVIA + 0.5 FINANCES + 0.5 Odoo config).

### Pré-requis

Vérifier que `wisemanh.odoo.com` autorise les webhooks sortants (firewall/whitelist Odoo).

---

## Synergie #5 — Tag automatique réutilisable (reconcile.model par société)

### Objectif

Le pattern `reconcile.model id=7` existe déjà pour HEOL (mémoire `project_odoo_reconcile.md`). Étendre à toutes les sociétés pour que les paiements arrivant sur le compte bancaire HEOL/SOLUVIA/EDUVIA/etc. soient automatiquement taggés avec le bon compte analytique.

### Architecture

Côté Odoo, un `reconcile.model` par société, chacun avec une règle de matching sur le `payment_ref` (ex `^FAC-EDU-.*$` → analytique 42.01).

### Tâches SOLUVIA (script one-shot)

1. Script `scripts/setup-odoo-reconcile-models.ts` :
   - Pour chaque société émettrice, créer un `reconcile.model` via XMLRPC.
   - Pattern de matching basé sur le `legacy_ref_format` de chaque société.
2. À exécuter manuellement après chaque ajout de société.

### Tâches FINANCES-WISEMANH

- Aucune. Les bank.statement.line déjà réconciliées arrivent avec `analytic_account_id` rempli → la Phase B trace mieux.

### Risques

- **Pattern matching faux** : refs nouvelles cassent le regex. Doc claire requise.

### Effort

~0.5 jour (script + run).

### Pré-requis

Synergie #3 (registry) facilite l'itération sur les sociétés.

---

## Synergie #6 — Justificatifs croisés (PDF facture SOLUVIA → Odoo + Wisemanh)

### Objectif

Aujourd'hui le PDF facture SOLUVIA est généré côté SOLUVIA (Resend email) et Odoo génère le sien. FINANCES attache déjà des `ir.attachment` aux analytic.lines. Synergie : SOLUVIA attache le PDF facture à l'`account.move` créé → visible côté Odoo (compta) + côté Wisemanh (suivi).

### Architecture

```
SOLUVIA pushInvoice() → moveId
  └─ NEW: uploadFacturePdf(moveId)
       └─ Genère le PDF (existant)
       └─ executeKw('ir.attachment', 'create', { res_model: 'account.move', res_id: moveId, datas: base64 })
```

### Tâches SOLUVIA

1. `lib/odoo/client.ts` : ajouter `attachInvoicePdf(moveId, pdfBuffer)`.
2. `lib/odoo/sync.ts pushFactures` : après update odoo_id, attacher le PDF.
3. Idempotence : tag l'attachement avec `name = FAC-XXX.pdf` et skip si déjà existant.

### Tâches FINANCES-WISEMANH

- Aucune côté code.
- Cap UI : ajouter un lien "Voir facture Odoo" depuis une analytic.line vers `https://wisemanh.odoo.com/web#id=<moveId>&model=account.move&view_type=form`.

### Risques

- **Taille payload** : PDF lourds (>2 MB) ralentissent la sync. Mitigation : compression PDF côté SOLUVIA (déjà fait normalement).
- **Doublons** : si le sync re-tourne. Mitigation : check `ir.attachment` existant par `name`.

### Effort

~0.5 jour SOLUVIA.

### Pré-requis

Aucun.

---

## Séquencement recommandé

| Sprint             | Synergies                                     | Effort | Pourquoi                                                                   |
| ------------------ | --------------------------------------------- | ------ | -------------------------------------------------------------------------- |
| **S1 (semaine 1)** | #3 (registry mapping) + #5 (reconcile models) | ~2j    | Quick wins, débloquent les autres.                                         |
| **S2 (semaine 2)** | #1 (push analytique) + #6 (PDF)               | ~1.5j  | Réduit la saisie manuelle Maria. Effet immédiat sur le réel FINANCES.      |
| **S3 (semaine 3)** | #4 (webhook cancellations)                    | ~2j    | Polish, latence ↘. Optionnel si Phase C suffit.                            |
| **S4 (au besoin)** | #2 (bank lines mirror)                        | ~2.5j  | Plus lourd (cross-DB), à valider auprès de l'utilisateur superadmin avant. |

**Total optimiste : ~8 jours** pour les 6 synergies.

## Vérifications post-déploiement

Pour chaque synergie en prod :

1. `scripts/preflight-odoo-*` (à étendre si besoin) avant le 1er run.
2. Surveiller `odoo_sync_logs` (SOLUVIA) et la phase output du cron FINANCES.
3. Comparer côté Odoo : nombre d'`account.analytic.line` créées par SOLUVIA vs facturé HT mensuel.
4. Sentry : alertes sur `OdooRpcError`.

## Notes garde-fous

- Toute synergie qui ajoute des écritures Odoo doit respecter la matrice d'ownership ci-dessus.
- Ne JAMAIS faire écrire les 2 apps dans le même record Odoo sans verrou (idempotence + lock distribué).
- Tester systématiquement avec un client `is_demo=true` ou une company de sandbox avant prod.
