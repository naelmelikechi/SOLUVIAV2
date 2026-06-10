# Runbook facturation - go-live et exploitation

Ce runbook accompagne l'emission de vraies factures clients. A relire avant la premiere emission, puis tous les debuts de mois pendant le rodage.

## 1. Pre-requis production (a verifier avant le go-live)

### 1.1 Variables d'env Vercel (production)

```bash
npx vercel env ls production
```

Doivent etre presentes :

| Variable                    | Source                               | Note                                              |
| --------------------------- | ------------------------------------ | ------------------------------------------------- |
| `ODOO_URL`                  | Tenant Odoo                          | ex : `https://soluvia.odoo.com`                   |
| `ODOO_DB`                   | Odoo                                 | nom de base, ex : `soluvia`                       |
| `ODOO_USERNAME`             | Odoo, compte technique dedie         | pas un user humain                                |
| `ODOO_API_KEY`              | Odoo, generee dans Profil > Securite | rotative tous les 6 mois                          |
| `RESEND_API_KEY`            | resend.com                           | si absent : factures creees mais emails skipped   |
| `CRON_SECRET`               | aleatoire >=16 chars                 | protege les routes `/api/cron/*` et `/api/sync/*` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard                   | requis pour les crons                             |
| `ENCRYPTION_KEY`            | aleatoire >=32 chars                 | chiffre les API keys tenants en DB                |

`EMAIL_OVERRIDE` doit etre **absent** en prod (sinon les emails sortent vers cette adresse de test au lieu des clients).

### 1.2 Test de connexion Odoo

`/admin/parametres` -> section "Odoo" -> bouton **Tester la connexion**. Resultat attendu :

- Toast vert : `Connecte Odoo - UID X - 17.0+e - db: soluvia`
- Si stub : verifier les 4 vars `ODOO_*`
- Si erreur : message renvoye par Odoo (creds, DB, URL)

### 1.3 Donnees clients reelles

Pour chaque client a facturer, verifier en base :

```sql
SELECT id, raison_sociale, siret, tva_intracommunautaire, is_demo
FROM clients
WHERE id = '<client-id>';
```

- `siret` rempli (14 chiffres) : sert a `findOrCreatePartner` cote Odoo
- `tva_intracommunautaire` rempli si client B2B europeen
- `is_demo` = `false` (sinon les factures seront poussees en **draft** Odoo, pas comptabilisees)

### 1.4 Crons actifs

Verifier dans Vercel Dashboard > Cron :

| Path                              | Schedule         | Role                                           |
| --------------------------------- | ---------------- | ---------------------------------------------- |
| `/api/cron/echeances`             | `0 2 1 * *`      | Genere les echeances M+2 a M+12 le 1er du mois |
| `/api/cron/factures-retard`       | `0 9 * * 1-5`    | Passe en `en_retard` les factures depassees    |
| `/api/sync/odoo`                  | `0 8,14 * * 1-5` | Push factures non poussees + pull paiements    |
| `/api/cron/email-factures-retard` | `0 8 * * 1`      | Digest hebdo aux admins                        |
| `/api/cron/email-fenetre-debut`   | `0 8 25 * *`     | Rappel ouverture fenetre facturation           |
| `/api/cron/email-fenetre-fin`     | `0 8 2 * *`      | Rappel fermeture fenetre facturation           |

> **Sync Odoo en horaire** depuis 2026-05-06 (commit 5ee1391) : `0 8-19 * * 1-5`. Latence max 1h en journee semaine.

## 1.5 Modes de facturation par projet (depuis 2026-05-06)

Chaque projet a un champ `billing_mode` :

- **`auto`** (defaut) : echeancier mensuel auto-genere par le cron, l'utilisateur coche dans `/facturation` onglet **Echeances** et clique **Preparer brouillons**
- **`manual`** (cas HEOL ou similaire) : pas d'echeancier auto, le cron skip ce projet. L'utilisateur facture event-based via `/facturation` onglet **Manuel** : selection d'engagements (contrat ENGAGE) ou de reglements OPCO (invoice_state REGLE) du contrat. Regle d'exclusion : un contrat est facturable soit par engagement, soit par steps OPCO, jamais les deux.

Toggle Auto/Manuel : badge cliquable sur `/projets/[ref]` (admin only).

## 1.6 Statut brouillon `a_emettre` + bouton Envoyer (depuis 2026-05-06)

Toutes les factures sont creees en statut **`a_emettre` (brouillon)** :

- Pas de `ref` ni `numero_seq` attribues a ce stade (preserve gapless legal si l'utilisateur supprime le brouillon avant envoi)
- Pas d'email envoye, pas de push Odoo
- Editable : ajout/edition/suppression de lignes (boutons sur la page detail)
- Suppression : bouton "Supprimer" sur le brouillon (autorise SEULEMENT en brouillon, pas pour les factures envoyees)

L'envoi (`a_emettre` -> `emise` ou `avoir`) :

- Bouton **Envoyer** sur la fiche brouillon, ou **Tout envoyer** dans l'onglet **Brouillons**
- Trigger SQL `assign_facture_ref_on_send` attribue `ref` (FAC-XXX-NNNN) + `numero_seq` (gapless) dans la transaction
- Email Resend declenche fire-and-forget
- Push Odoo au prochain cron `/api/sync/odoo` (horaire L-V)

## 1.7 Edition de lignes brouillon (depuis 2026-05-06)

Sur la fiche d'un brouillon :

- Bouton **+ Ajouter une ligne** : modal avec select contrat + mois + description + montant. Suggestion auto (`NPEC × commission% / 12 × mois`). Warning jaune non-bloquant si le contrat × mois est deja sur une autre facture envoyee
- Crayon : modifier description + montant
- Poubelle : supprimer la ligne. Si la ligne portait un event Eduvia (engagement/opco_step), il est libere et redevient facturable

## 1.8 Nouvelle facture from-scratch (depuis 2026-05-06)

Bouton **+ Nouvelle facture** sur `/facturation` ouvre un dialog 2 etapes :

1. Choix projet (Auto ou Manuel)
2. Cocher les contrats actifs, ajuster mois + montant + description par contrat, preparer le brouillon

Utile pour cas particuliers (rattrapage, montant ad-hoc, facture mixte hors echeancier standard).

## 1.9 Vue "Reste a facturer" (pilotage) (depuis 2026-06-10)

Onglet **Reste a facturer** dans `/facturation` (visible des qu'au moins un projet a des contrats). Vue de pilotage en lecture seule : combien de commission reste-t-il a facturer, par contrat / par projet / par OPCO / au total. Montants **HT** (reconcilies avec `factures.montant_ht`).

Quatre natures, en cartes de synthese (montants **HT**) :

- **Facturable maintenant** : bordereaux OPCO **payes** (invoice_state REGLE) cote Eduvia, pas encore factures cote SOLUVIA. Actionnable via l'onglet **Manuel**. Chiffre fiable = exactement ce que "Preparer le brouillon" emettrait. **Regle metier HEOL : on ne facture la commission que sur l'argent encaisse** -> un bordereau seulement emis (TRANSMIS) n'est PAS facturable.
- **En attente de paiement** : PEDAGOGIE emise (TRANSMIS) mais pas encore payee par l'OPCO. Quasi-certain (bordereau parti, virement a venir) mais non facturable tant que non encaisse. Devient Facturable des que le step passe en REGLE.
- **Bloque** : events `locked` (IDCC manquant, OPCO non resolu, line_type inconnu, ou exclusion engagement/OPCO). CA recuperable en corrigeant la donnee : badge de raison sur chaque ligne. IDCC manquant -> renseigner cote Eduvia ; OPCO non resolu -> mapper dans `/admin/parametres/opcos`.
- **Previsionnel contractuel** : estimation = potentiel de commission sur le NPEC des contrats actifs, moins TOUT ce qui est deja emis (facturable + en attente + deja facture) = les steps OPCO non encore emis. Borne haute (le NPEC inclut le materiel non commissionne). A affiner a chaque synchro Eduvia.

Bascule **Par contrat** / **Par projet** / **Par OPCO**, focus rapide Tous/Facturable/En attente/Bloque/Previsionnel + filtres projet/OPCO en vue contrat. Aucune requete supplementaire : la vue derive des billable events deja charges par la page.

Source : `lib/utils/reste-a-facturer.ts` (agregation pure, testee) + `components/facturation/reste-a-facturer-tab.tsx`.

## 2. Premier cycle reel (1 client pilote)

Recommandation : choisir **1 seul client** pour le premier mois, valider tout le cycle, puis ouvrir aux autres.

### 2A. Mode auto (cas standard)

1. **J-3** (avant le 25) : verifier echeances generees (`SELECT count(*) FROM echeances WHERE projet_id IN (SELECT id FROM projets WHERE client_id = '...') AND facture_id IS NULL`)
2. **J0** (25-3) : depuis `/facturation` onglet Echeances, cocher les echeances atteintes du client pilote, **Preparer brouillons**
3. **J0+5min** : aller dans onglet **Brouillons**, ouvrir chaque brouillon, verifier les lignes, ajuster si besoin (Add/Edit/Delete), **Envoyer** un par un ou bouton "Tout envoyer"
4. **J0+1h** : prochain cron `/api/sync/odoo` pousse vers Odoo. Verifier dans Odoo : facture en **posted** (non draft, car `is_demo=false`), partner correctement matche par SIRET
5. **J0+jour** : verifier email recu cote client (Resend dashboard)
6. **J+30** : suivre encaissement. Quand client paie via virement, le paiement est cree dans Odoo, le cron suivant `pullPayments` le ramene -> facture passe `payee` automatiquement
7. **J+31 a J+60** : si non paye, le cron `factures-retard` passe le statut, les admins recoivent le digest hebdo

### 2B. Mode manuel (cas HEOL)

1. Ouvrir `/facturation` onglet **Manuel**, selecteur projet
2. Filtres "Engagements" / "Reglements OPCO" / "Inclure factures"
3. Cocher les events disponibles (les locked sont ceux pour lesquels l'autre type a deja ete facture - regle d'exclusion par contrat)
4. **Preparer le brouillon** -> redirige vers onglet Brouillons
5. Memes etapes que 2A a partir du point 3

## 3. Monitoring quotidien

### 3.1 Dashboards a surveiller

- **Vercel Cron Status** : `https://vercel.com/<team>/<project>/crons` - vert sur les 13 crons
- **Sentry** : tag `scope=odoo.sync` ou `scope=odoo.client` filtre les erreurs d'integration. Tag `code=...` pour les `AppError`
- **Supabase `odoo_sync_logs`** : tableau de bord interne via SQL

### 3.2 Requetes de sante

```sql
-- Erreurs Odoo des 7 derniers jours
SELECT direction, statut, erreur, count(*)
FROM odoo_sync_logs
WHERE created_at > now() - interval '7 days' AND statut = 'error'
GROUP BY 1,2,3 ORDER BY 4 DESC;

-- Backlog factures non poussees
SELECT count(*), min(date_emission)
FROM factures
WHERE odoo_id IS NULL
  AND statut IN ('emise', 'en_retard')
  AND est_avoir = false;

-- Factures en retard non relancees
SELECT ref, date_echeance, montant_ttc, client_id
FROM factures
WHERE statut = 'en_retard'
ORDER BY date_echeance ASC;
```

Seuils d'alerte :

- Backlog > 10 factures non poussees pendant > 24h : bug push, lancer manuellement `/admin/parametres` -> Synchroniser
- Erreurs `error` > 5/jour : ouvrir Sentry, identifier le pattern (auth, partner manquant, taxe non trouvee)

## 4. Procedures d'escalade

### 4.1 Push Odoo en double

Symptome : meme `ref` SOLUVIA pousse deux fois -> deux moves dans Odoo.

Cause : cron interrompu apres `pushInvoice` mais avant `UPDATE factures SET odoo_id`. Au prochain run, la facture est repoussee.

Fix manuel :

1. Dans Odoo : annuler la facture dupliquee (etat draft) ou faire un avoir si posted
2. En base SOLUVIA : `UPDATE factures SET odoo_id = '<bon-id-odoo>' WHERE id = '...'`
3. Verifier `odoo_sync_logs` pour confirmer

Prevention : la fenetre est tres courte (< 1s). Pas de protection automatique, on vit avec.

### 4.2 Numerotation interrompue

**Rappel legal** : la numerotation `FAC-XXX-NNNN` est gapless (max+1 avec lock). **Aucune facture ne peut etre supprimee.** Si une facture est creee par erreur :

- ne PAS la supprimer (RLS interdit le DELETE de toute facon)
- creer un avoir (`createAvoir`) qui annule comptablement
- documenter dans `avoir_motif`

Cf. `docs/numerotation-factures.md` pour le detail technique.

### 4.3 Email non recu cote client

1. Verifier `factures.email_envoye = true`
2. Verifier dashboard Resend : delivere ? bouncing ?
3. Verifier `email_send_log` (idempotence) - si une cle `(job, periode_key)` est lockee, le retry est bloque cote app
4. Bouton "Renvoyer par email" sur la page detail facture

### 4.4 Connexion Odoo perdue (auth fail)

Symptome : Sentry rempli d'`OdooRpcError: Authentication failed`. Tous les push echouent.

Causes :

- API key Odoo revoquee ou expiree -> regenerer dans Odoo (Settings > Users > <user> > Account Security > New API Key)
- Mot de passe change cote Odoo
- DB renommee

Fix :

1. `npx vercel env rm ODOO_API_KEY production`
2. `npx vercel env add ODOO_API_KEY production` (coller la nouvelle)
3. Redeployer (ou attendre le prochain deploy)
4. `/admin/parametres` -> Tester la connexion -> vert

Pendant la coupure, les factures sont creees normalement en SOLUVIA (`odoo_id = NULL`). Une fois Odoo reconnecte, le cron rattrape automatiquement le backlog.

## 5. Smoke-test bout-en-bout (a executer avant chaque release majeure)

Voir `docs/facturation-smoke-test.md` (a creer si besoin) ou checklist en 13 etapes du plan `scalable-giggling-blum.md`.

Resume :

1. Tester connexion Odoo (`/admin/parametres`)
2. Generer echeances (`curl -H "Authorization: Bearer $CRON_SECRET" .../api/cron/echeances`)
3. Creer facture sur client demo (`is_demo=true`)
4. Verifier ref, lignes, statut, email
5. Telecharger PDF
6. Push Odoo (cron) -> draft visible dans Odoo
7. Verifier idempotence (relancer le cron)
8. Saisir paiement manuel -> statut `payee`
9. Emettre avoir -> push `out_refund`
10. Forcer une facture en retard -> statut + notif + digest

## 6. Bugs corriges lors du smoke-test 2026-05-04

Trace pour memoire des problemes trouves et fixes pendant la session de validation :

1. **Push avoirs Odoo refuse par action_post** (`lib/odoo/sync.ts`). Cause : `price_unit` envoye negatif sur un `out_refund`, Odoo refuse de valider. Fix : `Math.abs()` sur le price_unit. Side effect : si une tentative anterieure a cree un draft Odoo, il reste orphelin et doit etre supprime manuellement dans Odoo.

2. **4 crons emails filtrent `role='admin'` strict** (`email-factures-retard`, `email-rapport-mensuel`, `email-fenetre-debut`, `email-fenetre-fin`). Aucun superadmin ne recevait le digest. Fix : `.in('role', ['admin', 'superadmin'])` + adapter le calcul `nb` pour traiter superadmin comme admin.

3. **15 contrats Eduvia avaient `montant_prise_en_charge` (legacy) mais pas `npec_amount`** (nouveau). La migration de readers/writers du 28/04 n'avait pas migre la data. Resultat : echeances et factures generees a 0 euros pour ces contrats. Fix one-shot : `UPDATE contrats SET npec_amount = montant_prise_en_charge WHERE npec_amount IS NULL AND montant_prise_en_charge IS NOT NULL`.

4. **Vars Odoo absentes pendant la fenetre 23-27 avril** -> 3 factures avaient des `odoo_id` stub (`ODOO-STUB-...`) au lieu de vrais IDs Odoo. Le cron sync les ignore (filtre `WHERE odoo_id IS NULL`). Fix manuel : reset a NULL + relance sync.

5. **`createFactures` ne rejette pas une facture a montants nuls**. Si tous les contrats du projet ont `npec_amount` null, la facture est creee a 0 € avec 3 lignes a 0. A surveiller cote produit (faut-il bloquer en upstream ?).

## 7. Liens utiles

- Spec produit : `specs/06-facturation.html`
- Numerotation : `docs/numerotation-factures.md`
- Crons : `docs/CRONS.md`
- Code integration Odoo : `lib/odoo/client.ts` + `lib/odoo/sync.ts`
- Action UI synchro : `lib/actions/sync.ts` (`pingOdoo`, `triggerOdooSync`)
- Logs sync : table `odoo_sync_logs`

## 8. Resultat smoke-test 2026-05-04

13 etapes validees en local (db prod, Odoo prod tenant, EMAIL_OVERRIDE actif) :

| #   | Etape                               | Resultat                                          |
| --- | ----------------------------------- | ------------------------------------------------- |
| 1   | Ping Odoo                           | UID 2, db soluvia, version saas~19.1+e            |
| 2   | Liste factures + tabs               | 4 -> 6 factures, statuts varies                   |
| 3   | Detail facture                      | Emetteur/destinataire/3 lignes OK                 |
| 4   | Generation PDF                      | Calcul HT/TVA/TTC correct, design propre          |
| 5   | Creation facture (gapless)          | numero_seq +1, FAC-HEO-0005                       |
| 6   | Email emission                      | Redirige vers EMAIL_OVERRIDE, sujet conforme      |
| 7   | Push Odoo (out_invoice)             | 3 IDs Odoo numeriques                             |
| 8   | Idempotence push                    | 2e sync = 0 push                                  |
| 9   | Avoir (numerotation, lien)          | numero_seq 6, montants negatifs, lien origine     |
| 10  | Push avoir (out_refund)             | OK apres fix Math.abs, ID Odoo 47                 |
| 11  | Cron echeances                      | 587 echeances generees (M+2 a M+12)               |
| 12  | Cron factures-retard                | 1 facture -> en_retard, 1 notif creee             |
| 13  | Cron email digest + Paiement manuel | 2 superadmins emails, paiement 1€ -> statut payee |
