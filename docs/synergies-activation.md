# Activation des synergies SOLUVIA × FINANCES-WISEMANH

> Statut au 2026-05-26 : code mergé, **inactif tant que les env vars ne sont pas
> configurées** (zéro régression par défaut). Cette doc liste tout ce qu'un
> humain doit faire pour activer chaque synergie en prod.

## Tableau récap

| #   | Synergie                     | Code livré | Activation prod                                                                        |
| --- | ---------------------------- | ---------- | -------------------------------------------------------------------------------------- |
| 1   | Push analytique auto         | ✅         | Remplir `projets.code_analytique` + créer les comptes analytiques côté Odoo            |
| 2   | Bank lines mirror            | ✅         | Vars env `SOLUVIA_BANK_MIRROR_URL/TOKEN` + `BANK_LINES_MIRROR_TOKEN`                   |
| 3   | Registry sociétés            | ✅         | Vars env `REGISTRY_TOKEN` (SOLUVIA) + `SOLUVIA_REGISTRY_URL/TOKEN` (FINANCES)          |
| 4   | Webhook cancellations        | ✅         | Vars env + automation rule Odoo                                                        |
| 5   | Reconcile.model auto         | ✅         | Configurer `odoo_company_id` puis run `scripts/setup-odoo-reconcile-models.ts --apply` |
| 6   | PDF facture sur account.move | ✅         | Aucune action (actif au prochain push facture)                                         |

---

## Synergie #1 — Push analytique auto

### Étapes

1. **Côté Odoo (humain)** : créer les comptes analytiques pour chaque projet
   facturé (Comptabilité → Configuration → Comptes analytiques). Noter le `code`
   (ex `41.01`).
2. **Côté SOLUVIA** :
   - Ouvrir `/admin/projets/<id>` pour chaque projet actif.
   - Remplir le champ `code_analytique` (à exposer dans l'UI si pas déjà fait).
3. Au prochain push facture, une `account.analytic.line` sera créée par ligne.

### Vérif

- `odoo_sync_logs` ne doit pas montrer d'erreur "code_analytique introuvable".
- `facture_lignes.analytic_line_odoo_id` rempli pour les lignes poussées.
- FINANCES-WISEMANH : le réel d'émission monte automatiquement (Phase B du cron sync-odoo).

---

## Synergie #2 — Bank lines mirror

### Env vars

**FINANCES-WISEMANH** :

```
SOLUVIA_BANK_MIRROR_URL=https://soluvia.app/api/webhooks/finances/bank-lines-sync
SOLUVIA_BANK_MIRROR_TOKEN=<token-aléatoire-64-chars>
```

**SOLUVIA V2** :

```
BANK_LINES_MIRROR_TOKEN=<même valeur que SOLUVIA_BANK_MIRROR_TOKEN>
```

Générer le token : `openssl rand -hex 32`.

### Activation

1. Configurer les vars sur Vercel (les 2 projets) pour `Production` + `Preview`.
2. Migration SOLUVIA : `20260526120200_bank_lines_mirror.sql` (auto via supabase db push).
3. Le cron FINANCES `/api/cron/mirror-bank-to-soluvia` tourne à H+15min après la
   sync Odoo (Phase A doit finir avant pour avoir les nouvelles bank_lines).
4. Côté SOLUVIA, l'UI consomme déjà
   `GET /api/factures/<ref>/bank-line-suggestions` via `FacturePaiements`
   (composant intégré au détail facture). Le form "Marquer comme payée"
   affiche les lignes bancaires correspondantes ; un clic pré-remplit
   date + montant.

### Vérif

```bash
# Sur FINANCES Vercel logs :
# {"success":true,"pushed":12,"upserted":12}
```

---

## Synergie #3 — Registry sociétés

### Env vars

**SOLUVIA V2** :

```
REGISTRY_TOKEN=<token-aléatoire-64-chars>
```

**FINANCES-WISEMANH** :

```
SOLUVIA_REGISTRY_URL=https://soluvia.app/api/public/odoo-companies-registry
SOLUVIA_REGISTRY_TOKEN=<même valeur que REGISTRY_TOKEN>
```

### Activation

1. Vars env Vercel (les 2 projets).
2. Remplir `odoo_company_id` + `odoo_journal_id` pour chaque société active dans
   `/admin/parametres/societes-emettrices`.
3. À chaque run du cron FINANCES sync-odoo, le registry est consulté et les drifts
   sont logués (warning console) sans modifier le mapping local.

### Vérif

```bash
# Réponse du cron FINANCES :
# "registry": { "source": "live", "entries_count": 3, "drift_warnings": [] }
```

---

## Synergie #4 — Webhook move-cancelled

### Env vars

**SOLUVIA V2** :

```
ODOO_WEBHOOK_SECRET=<secret-aléatoire-32-chars>
FINANCES_WEBHOOK_URL=https://finances.app/api/webhooks/odoo/move-cancelled
FINANCES_WEBHOOK_TOKEN=<token-aléatoire-64-chars>
```

**FINANCES-WISEMANH** :

```
FINANCES_WEBHOOK_TOKEN=<même valeur>
```

### Activation Odoo (action humaine)

1. Activer le mode développeur Odoo : `?debug=1`.
2. **Paramètres → Technique → Automatisation → Règles automatiques** → Créer.
3. Modèle : `Écriture comptable (account.move)`.
4. Déclencheur : `On Update` + Filtre Avant MAJ `state != 'cancel'`, Après MAJ `state == 'cancel'`.
5. Action → Server Action → Type "Exécuter du code Python" :

   ```python
   import requests
   import hmac
   import hashlib
   import json
   from datetime import datetime

   url = env['ir.config_parameter'].sudo().get_param('soluvia.webhook.url')
   secret = env['ir.config_parameter'].sudo().get_param('soluvia.webhook.secret')

   for rec in records:
       if rec.move_type not in ('out_invoice', 'out_refund'):
           continue
       payload = json.dumps({
           'odoo_id': rec.id,
           'ref': rec.ref or rec.name,
           'write_date': rec.write_date.isoformat(),
       })
       sig = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
       try:
           requests.post(url, data=payload, headers={
               'Content-Type': 'application/json',
               'X-Odoo-Signature': sig,
           }, timeout=10)
       except Exception:
           pass
   ```

6. Configurer les paramètres système :
   - `soluvia.webhook.url` = `https://soluvia.app/api/webhooks/odoo/move-cancelled`
   - `soluvia.webhook.secret` = même valeur que `ODOO_WEBHOOK_SECRET`

### Vérif

Annuler une facture de test côté Odoo → consulter notifications admin SOLUVIA + logs FINANCES.

Filet : la Phase 4 du cron `/api/sync/odoo` (SOLUVIA) et Phase C de
`/api/cron/sync-odoo` (FINANCES) rattrapent dans l'heure si le webhook se perd.

---

## Synergie #5 — Reconcile models

### Activation

1. Remplir `odoo_company_id` pour chaque société (idem #3).
2. Run :
   ```bash
   # Dry-run d'abord pour voir ce qui sera créé :
   npx tsx scripts/setup-odoo-reconcile-models.ts
   # Puis appliquer :
   npx tsx scripts/setup-odoo-reconcile-models.ts --apply
   ```
3. À refaire après ajout/modification d'une société.

### Vérif

Côté Odoo : Comptabilité → Configuration → Modèles de réconciliation → "Soluvia auto-match XXX".

---

## Synergie #6 — PDF facture sur account.move

### Activation

**Aucune.** Actif au prochain push facture. Best-effort : un échec d'attache
ne bloque pas le push facture.

### Vérif

Côté Odoo, ouvrir une facture poussée par SOLUVIA → onglet "Pièces jointes"
doit contenir `FAC-XXX.pdf`.

---

## Ordre recommandé d'activation

1. **#6** : zéro action humaine, déploy immédiat. ✓
2. **#3** : configurer les env vars + remplir `odoo_company_id` dans
   `/admin/parametres/societes-emettrices`. Foundation pour #1 et #5.
3. **#5** : run le script en dry-run, puis `--apply`.
4. **#1** : remplir `projets.code_analytique` après création des comptes analytiques Odoo.
5. **#2** : env vars (UI déjà branchée sur `FacturePaiements`).
6. **#4** : env vars + automation rule Odoo (action la plus délicate).
