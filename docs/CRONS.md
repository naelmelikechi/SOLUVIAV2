# Jobs cron

11 jobs cron schedulés via [`vercel.json`](../vercel.json). Tous les crons
sont authentifiés par `CRON_SECRET` (bearer token) via
[`lib/utils/cron-auth.ts`](../lib/utils/cron-auth.ts), en
`timingSafeEqual`.

Tous les horaires sont en **UTC** (convention Vercel cron).

## Vue d'ensemble

| Route                             | Schedule (UTC) | Fréquence                  | `maxDuration` |
| --------------------------------- | -------------- | -------------------------- | ------------- |
| `/api/cron/echeances`             | `0 2 1 * *`    | Mensuel, 1er à 02h         | 120s          |
| `/api/cron/snapshot`              | `0 3 1 * *`    | Mensuel, 1er à 03h         | 120s          |
| `/api/cron/factures-retard`       | `0 9 * * 1-5`  | Quotidien, 09h lun-ven     | 60s           |
| `/api/sync/eduvia`                | `0 6 * * 1-5`  | Quotidien, 06h lun-ven     | 300s          |
| `/api/cron/chat-cleanup`          | `0 * * * *`    | Chaque heure               | 30s           |
| `/api/cron/email-temps-non-saisi` | `0 12 * * 5`   | Vendredi 12h               | 60s           |
| `/api/cron/email-factures-retard` | `0 8 * * 1`    | Lundi 08h                  | 60s           |
| `/api/cron/email-fenetre-debut`   | `0 8 25 * *`   | Le 25 de chaque mois, 08h  | 60s           |
| `/api/cron/email-fenetre-fin`     | `0 8 2 * *`    | Le 2 de chaque mois, 08h   | 60s           |
| `/api/cron/email-rapport-mensuel` | `0 9 1 * *`    | Le 1er de chaque mois, 09h | 60s           |
| `/api/cron/progression-snapshot`  | `0 4 * * 1`    | Lundi 04h                  | 60s           |

Odoo (`/api/sync/odoo`) n'est **pas** dans le cron : l'intégration est
désactivée tant que le client Odoo est un stub. La route répond 501.

## Détail par cron

### `echeances` — génération des échéances mensuelles

**Finalité** : pour chaque projet actif avec des contrats actifs, génère
les lignes `echeances` (échéances de facturation prévues M+2 à M+10, puis
M12 consolidant M10-M12).

**Idempotence** : upsert sur `(projet_id, mois_concerne)` avec
`ignoreDuplicates: true`. Rejouable sans effet de bord.

**Observation** : retour `{success, echeances_created: N}`. Chercher
`cron.echeances` dans les logs.

**Symptôme d'échec** : aucune échéance créée en début de mois. Facturation
du mois entier loupée.

---

### `snapshot` — snapshot KPI mensuel

**Finalité** : calcule et persiste les snapshots mensuels (KPI global,
KPI par CDP, KPI par projet). Alimente la page `/indicateurs`.

**Idempotence** : upsert avec `ignoreDuplicates`.

**Symptôme d'échec** : `/indicateurs` affiche des KPI périmés.

---

### `factures-retard` — marque les factures en retard

**Finalité** : parcourt les factures dont `date_echeance < today` et non
payées. Met à jour leur statut à `en_retard`.

**Symptôme d'échec** : les badges "en retard" restent figés. Bruit dans le
dashboard mais pas de perte de données.

---

### `sync/eduvia` — synchronisation Eduvia (la plus critique)

**Finalité** : 3-pass sync pour chaque client actif ayant une clé API
Eduvia configurée.

1. Référentiels (apprenants, formations, companies)
2. Contrats (dénormalisés via lookup maps)
3. Progressions par contrat

**Retry** : exponential backoff avec jitter ±20% (500ms → 1.5s → 4s),
timeout fetch 15s, pre-check `/status` avant les N requêtes.

**Chiffrement** : les clés API sont en AES-256-GCM en base
(`client_api_keys.api_key_encrypted`). Dechiffrement via
[`lib/utils/encryption.ts`](../lib/utils/encryption.ts). Si
`ENCRYPTION_KEY` manque ou si la ligne est stockée en plaintext (héritage
pré-audit), ce client-là est skippé avec un message explicite.

**Symptôme d'échec** :

- Un seul client en erreur : ligne `eduvia_sync Sync partielle pour client XXX`.
  Action : regarder `clientResult.errors`, souvent une clé API invalide
  ou un path 404. Si "Cle API non dechiffrable", l'admin doit re-saisir
  la clé depuis `/admin/clients/[id]`.
- Tous les clients en erreur : probablement `ENCRYPTION_KEY` manquante
  ou Eduvia API down globalement.

**Coût** : jusqu'à 300s, peut dominer le budget Vercel Functions si le
nombre de clients croît.

---

### `chat-cleanup` — purge des messages team_chat > 48h

**Finalité** : supprime les messages de chat de plus de 48h pour
contenir la taille de la table.

**Pagination** : limite `BATCH_LIMIT = 1000` par run. Si le backlog est
plus gros, un log WARN est émis et le prochain tick horaire reprendra.

**Symptôme d'échec** : `team_messages` grossit indéfiniment.

---

### `email-temps-non-saisi` — relance hebdo temps non saisi (vendredi)

**Finalité** : envoie un récap aux CDP qui n'ont pas saisi leur temps
pour la semaine.

**Idempotence** : lock via `email_send_log` sur clé ISO week
(`2026-W17`). Unique constraint en DB bloque les doubles envois.

**Symptôme d'échec** : pas d'email reçu le vendredi à 12h. Chercher
`cron.email-temps-non-saisi` dans les logs.

---

### `email-factures-retard` — rappel hebdo factures en retard (lundi)

**Finalité** : envoie aux admins la liste des factures en retard.

**Idempotence** : lock via `email_send_log` sur clé semaine.

---

### `email-fenetre-debut` — ouverture fenêtre facturation (25 du mois)

**Finalité** : prévient admins + CDPs que la fenêtre de facturation du
mois prochain s'ouvre. Contient le nombre d'échéances en attente par
destinataire.

**Idempotence** : lock via `email_send_log` sur la clé
`yyyy-MM` de la **date de fin de fenêtre** (pas de `today`). Un rejeu
tardif ne déclenchera pas un double envoi.

---

### `email-fenetre-fin` — fermeture fenêtre facturation (2 du mois)

**Finalité** : prévient admins + CDPs que la fenêtre se referme le
lendemain (3).

**Idempotence** : lock sur `yyyy-MM` du `today`.

---

### `email-rapport-mensuel` — rapport mensuel aux admins (1er du mois)

**Finalité** : digest mensuel KPI pour les admins.

---

### `progression-snapshot` — snapshot hebdo des progressions

**Finalité** : prend un instantané hebdo des progressions Eduvia pour
l'affichage de tendance sur `/indicateurs`.

## Checklist d'incident cron

1. Identifier le cron concerné via l'alert (Sentry ou manuel)
2. `vercel logs <deployment-url>` et filtrer par le scope logger (ex.
   `cron.email-fenetre-debut`)
3. Vérifier le `CRON_SECRET` côté Vercel (`vercel env ls production`)
4. Si sync Eduvia : vérifier `ENCRYPTION_KEY` et le format des
   `client_api_keys.api_key_encrypted` (doit être `iv:tag:ciphertext`)
5. Si email : vérifier `RESEND_API_KEY`, le statut Resend, et la table
   `email_send_log` (une ligne par `(job, periode_key)`)
6. Relancer manuellement si besoin :
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" \
     https://soluvia.vercel.app/api/cron/<route>
   ```
   (Toutes les routes cron sont idempotentes — rejeu safe.)

## Ajouter un nouveau cron

1. Créer `app/api/cron/mon-cron/route.ts` avec :
   - `verifyCronAuth(request)` en tête
   - `export const maxDuration = 60` (ou plus selon besoin)
   - Gestion d'erreur propre avec `logger.error(...)`
   - Idempotence via `email_send_log` ou upsert si applicable
2. Ajouter l'entrée dans `vercel.json` sous `crons`
3. Documenter ici (schedule, finalité, idempotence, symptômes d'échec)
4. Tester en local avec `curl` + `CRON_SECRET`
