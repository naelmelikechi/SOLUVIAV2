# E-invoicing 2026 — Phase 2 : Émission Factur-X via Odoo

Date : 2026-06-18
Statut : validé (design), prêt pour plan d'implémentation

## Contexte

Suite de la Phase 1 ([[2026-06-18-e-invoicing-phase1-design]]). Décision
d'architecture : la transmission de la facture électronique passe par Odoo
(wisemanh.odoo.com), pas par du code SOLUVIA.

### Découverte de l'instance Odoo (read-only, 2026-06-18)

Scripts : `scripts/discover-odoo-einvoicing.ts`,
`scripts/discover-odoo-peppol-state.ts`,
`scripts/discover-odoo-partner-peppol.ts`.

- **Odoo 19.2 Enterprise** (`saas~19.2+e`).
- Modules installés : `l10n_fr`, `l10n_fr_account`, `account_edi_ubl_cii`
  (génération XML UBL/CII = socle Factur-X), `account_peppol`,
  `account_edi_proxy_client` (transmission Peppol).
- **Company SOLUVIA [id 1] déjà active en émission** :
  `account_peppol_proxy_state = receiver`, `peppol_can_send = true`,
  EAS `0009` (SIRET), endpoint `99424153700012`. L'abonnement e-invoicing est
  opérationnel. (EDUVIA [id 2] = `not_registered`, hors scope SOLUVIA.)
- **Le SIRET du partner vit dans le champ `company_registry`** (il n'existe pas
  de champ `siret` sur `res.partner`). Le push SOLUVIA le pose déjà à la création
  (`findOrCreatePartner`, `lib/odoo/client.ts:463`).
- **Odoo auto-dérive `peppol_eas` (0009) et `peppol_endpoint` (= SIRET) à partir
  de `company_registry`.** Vérifié sur 4 partners clients existants : tous ont
  `eas=0009` + `endpoint=<SIRET>` sans configuration manuelle.
- **Seul champ manquant / incohérent : `invoice_edi_format`.** Sur les 4 clients
  observés, 2 ont `facturx` ("France (FacturX)"), 2 sont vides. C'est le champ
  qui dit à Odoo de produire un Factur-X.
- Tous les clients sont `peppol_verification_state = not_verified` (aucun encore
  joignable sur Peppol, cohérent avec le mandat réception sept. 2026).

### Conséquence sur le design

Le travail SOLUVIA se réduit à **poser `invoice_edi_format = 'facturx'`** sur le
partner client (le routage Peppol est dérivé par Odoo du SIRET déjà présent).
Le déclenchement de l'envoi et le gating par client restent **côté Odoo** (config
compta), conformément à la décision validée.

## Décisions (validées)

1. **Déclenchement de l'envoi** : côté Odoo, gaté par client (Odoo n'envoie que
   vers les partners joignables sur Peppol). SOLUVIA ne déclenche PAS l'envoi.
2. **Portée de l'enrichissement du partner** : création + backfill si vide.
   Jamais d'écrasement d'une valeur déjà posée par la compta dans Odoo.

## Périmètre

### 1. Helper pur : résolution du format e-invoice

Nouveau `lib/odoo/invoice-edi-format.ts` :

```
resolveInvoiceEdiFormat({ countryCode, companyRegistry }): 'facturx' | null
```

- Retourne `'facturx'` si le client est français (countryCode `FR`, `null` ou
  `undefined` -> défaut FR) ET possède un `company_registry` non vide (SIRET/SIREN
  nécessaire pour que le routage Peppol se dérive côté Odoo).
- Retourne `null` sinon (client UE intracom, ou sans identifiant). On laisse alors
  Odoo / la compta décider du format ; SOLUVIA ne pose rien.

Constante de format centralisée (`EDI_FORMAT_FACTURX = 'facturx'`). Helper pur,
testé sans appel réseau.

### 2. Enrichissement du partner au push

Dans `findOrCreatePartner` (`lib/odoo/client.ts`) :

- **À la création** : si `resolveInvoiceEdiFormat(...)` renvoie un format,
  l'ajouter aux `vals` du `res.partner/create` (à côté de `company_registry`,
  déjà posé).
- **Sur un partner existant** (backfill si vide) : avant de retourner l'id trouvé,
  lire `invoice_edi_format` ; s'il est vide/`false` ET que le helper renvoie un
  format, faire un `write` ciblé de ce seul champ. Best-effort : un échec
  d'enrichissement est loggé (warn) mais ne casse jamais le push facture (le
  partner id est quand même retourné).
- `company_registry` reste posé comme aujourd'hui (création uniquement). On ne le
  modifie pas en backfill (le routage Peppol en dépend ; le toucher est du
  ressort compta).

### 3. Script one-shot de backfill du parc existant

`scripts/backfill-odoo-peppol-format.ts` (miroir des scripts one-shot existants,
ex. `scripts/inspect-odoo-invoices.ts`) :

- Parcourt les partners clients Odoo (`customer_rank > 0`) français avec
  `company_registry` non vide et `invoice_edi_format` vide.
- Pose `invoice_edi_format = 'facturx'` sur ceux-là uniquement (jamais
  d'écrasement). Mode `--dry-run` par défaut qui liste les partners ciblés sans
  écrire ; écriture seulement avec `--apply`.
- Réutilise le helper `resolveInvoiceEdiFormat` (source unique de la règle).

### 4. Tests

- **Helper** : `resolveInvoiceEdiFormat` -> `facturx` pour FR + registry présent
  (countryCode `FR`, `null`, `undefined`) ; `null` pour pays non-FR, registry
  vide, ou les deux. Constante sans typo.
- Pas de test réseau sur `findOrCreatePartner` (couche RPC non mockée dans la
  suite actuelle) ; la logique métier testable est isolée dans le helper.

## Composants touchés

| Fichier                                  | Changement                                                  |
| ---------------------------------------- | ----------------------------------------------------------- |
| `lib/odoo/invoice-edi-format.ts`         | Nouveau — helper + constante                                |
| `__tests__/invoice-edi-format.test.ts`   | Nouveau — tests du helper                                   |
| `lib/odoo/client.ts`                     | `findOrCreatePartner` : pose/backfill `invoice_edi_format`  |
| `scripts/backfill-odoo-peppol-format.ts` | Nouveau — backfill one-shot du parc existant                |
| `scripts/discover-odoo-*.ts`             | Déjà créés (outillage de découverte, commités avec ce spec) |

## Garde-fous / invariants préservés

- Aucun changement du cycle d'émission SOLUVIA, de la numérotation gapless, ni de
  la logique de facturation (push inchangé hors enrichissement partner).
- `company_registry` jamais écrasé en update (le routage Peppol en dépend).
- Enrichissement best-effort : ne bloque jamais le push facture.
- Pas d'écrasement d'un `invoice_edi_format` déjà posé par la compta.
- Clients non-FR / intracom : SOLUVIA ne pose rien (cohérent avec
  l'autoliquidation déjà gérée en Phase 1).

## Hors périmètre (→ Phase 3)

- Pull du `peppol_move_state` (Queued / Pending / Done / Rejected / Error) et du
  `peppol_verification_state` dans l'UI facturation SOLUVIA (visibilité « qui est
  joignable / transmise / rejetée »).
- Déclenchement de l'envoi depuis SOLUVIA (resté côté Odoo).
- Activation Peppol de la company EDUVIA.

## Risques / points de vigilance

- **Auto-dérivation Peppol** : confirmée pour les partners FR avec SIRET dans
  `company_registry`. Si un client n'a qu'un numéro de TVA sans SIRET, le routage
  ne se dérive pas et le helper renvoie `null` (on ne pose pas de format) — comportement voulu.
- **Config Odoo côté compta (externe, non bloquant pour ce lot)** : décider du
  mode d'envoi (automatique gaté vs "Send & Print" manuel). SOLUVIA garantit la
  donnée ; l'activation de l'envoi est un réglage Odoo.
- **Idempotence** : le backfill ne pose le format que s'il est vide -> ré-exécuter
  le push ou le script one-shot est sans effet sur un partner déjà configuré.
