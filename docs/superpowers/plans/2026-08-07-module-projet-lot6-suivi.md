# Module Projet - Lot 6 : onglet Suivi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Montrer sur la fiche projet les derniers mails échangés avec le client, avec leur sujet, à côté du dépôt de documents existant.

**Architecture:** Deux sources dans un seul fil chronologique. La première, immédiatement utile, journalise les envois de l'application depuis son point d'envoi unique. La seconde collecte les métadonnées Gmail des CDP, strictement filtrées, et reste **inerte** tant que deux prérequis hors code ne sont pas remplis.

**Tech Stack:** Next.js 16, TypeScript, Supabase, `google-auth-library` (déjà installé), Vitest.

**Spec de référence:** `docs/superpowers/specs/2026-08-06-module-projet-synthese-details-design.md`, section H.

---

## Contexte pour l'implémenteur

Le bloc Suivi de la synthèse contient aujourd'hui les tâches Plane et le dépôt de documents. Il lui manque ce que le brief demande : **les derniers mails envoyés, avec le sujet de chaque mail**.

### Deux sources, deux natures

**Source 1 — les mails de l'application.** Tout passe par un point unique, `sendEmail` dans `lib/email/_send.ts` : factures, devis, relances, notifications, alertes. Un seul endroit à instrumenter, tous les envois futurs sont tracés. Limite assumée et à dire : **l'historique démarre à vide le jour du déploiement**.

**Source 2 — les mails Gmail des CDP.** Ce sont les échanges directs avec le client, invisibles de l'application. Techniquement accessibles par délégation à l'échelle du domaine Google Workspace.

### Le périmètre de collecte Gmail n'est pas une précaution de forme

Lire la boîte d'un salarié est un traitement de données personnelles. Deux règles, non négociables :

1. **Seuls les messages dont au moins un participant correspond à un `client_contacts.email` connu** sont remontés. Les boîtes ne sont jamais aspirées intégralement.
2. **Seules les métadonnées** sont stockées : date, expéditeur, destinataires, sujet. **Jamais le corps du message.** L'API Gmail permet de demander explicitement `format=metadata` : utilise-le, ne récupère pas le message complet pour n'en garder qu'une partie.

Un échange avec une adresse inconnue n'est rattaché à rien et **n'est pas stocké du tout**.

### Deux prérequis hors code, à respecter

La collecte Gmail ne doit **pas** pouvoir démarrer avant que :

1. un super-administrateur du Workspace ait autorisé le compte de service dans la console d'administration ;
2. l'équipe ait été **informée par écrit**, avec mention dans la charte informatique. En France, un accès non annoncé aux messageries des salariés est juridiquement attaquable.

D'où l'interrupteur : la fonctionnalité est développée mais **inerte par défaut**. C'est une exigence, pas une commodité de développement.

### Pièges de ce codebase

- `email_send_log` **n'est pas** un journal d'envoi : c'est un verrou d'idempotence pour les crons (clé `job` + `periode_key`). Ne le détourne pas, crée une table dédiée.
- `sendEmail` **ne doit jamais échouer à cause du journal**. Un email qui part est plus important qu'une ligne de log.
- `google-auth-library` est déjà dans les dépendances : n'ajoute pas `googleapis`, l'API Gmail s'appelle très bien en REST avec un jeton.
- **Coût Vercel** : les crons ont été réduits de 70 %. Un seul cron pour ce lot.
- `npm test` avant chaque push, jamais `--no-verify`.

---

## Task 1 : Table du journal

**Files:**

- Create: `supabase/migrations/<timestamp>_emails_envoyes.sql`

- [ ] **Step 1: Écrire la migration**

```sql
-- Journal des mails rattaches a un projet ou a un client.
--
-- Deux sources dans une seule table, distinguees par `source` :
--   'app'    : envoye par l'application via lib/email/_send.ts
--   'gmail'  : echange direct CDP <-> client, collecte par delegation Workspace
--
-- ATTENTION : cette table ne contient JAMAIS le corps d'un message. Seules les
-- metadonnees sont stockees. Lire la boite d'un salarie est un traitement de
-- donnees personnelles ; le perimetre est volontairement reduit au strict
-- necessaire pour la fonctionnalite demandee (voir la source 'gmail').
--
-- A ne pas confondre avec `email_send_log`, qui est un verrou d'idempotence
-- pour les crons (job + periode_key), pas un journal.

CREATE TABLE IF NOT EXISTS emails_envoyes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source         TEXT NOT NULL CHECK (source IN ('app', 'gmail')),
  envoye_le      TIMESTAMPTZ NOT NULL,
  sujet          TEXT NOT NULL,
  expediteur     TEXT,
  destinataires  TEXT[] NOT NULL DEFAULT '{}',
  -- Type fonctionnel cote app (facture, devis, relance, notification...).
  -- Null pour la source gmail : on ne devine pas la nature d'un echange.
  type           TEXT,
  projet_id      UUID REFERENCES projets(id) ON DELETE CASCADE,
  client_id      UUID REFERENCES clients(id) ON DELETE CASCADE,
  -- Statut renvoye par le fournisseur d'envoi (source app uniquement).
  statut         TEXT,
  -- Identifiant externe, pour l'idempotence de la collecte Gmail.
  external_id    TEXT UNIQUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_emails_envoyes_projet
  ON emails_envoyes (projet_id, envoye_le DESC);
CREATE INDEX IF NOT EXISTS idx_emails_envoyes_client
  ON emails_envoyes (client_id, envoye_le DESC);

ALTER TABLE emails_envoyes ENABLE ROW LEVEL SECURITY;

-- Lecture : admin partout, CDP sur ses projets. Une seule policy permissive
-- par commande, initplan-wrap comme le reste du schema.
CREATE POLICY emails_envoyes_select ON emails_envoyes FOR SELECT USING (
  (SELECT is_admin()) OR EXISTS (
    SELECT 1 FROM projets p
     WHERE p.id = emails_envoyes.projet_id
       AND (p.cdp_id = (SELECT auth.uid()) OR p.backup_cdp_id = (SELECT auth.uid()))
  )
);

-- Ecriture reservee au service role (journalisation applicative et cron de
-- collecte) : aucun utilisateur n'ecrit dans ce journal depuis l'interface.
-- Pas de policy INSERT/UPDATE/DELETE : le service role contourne la RLS,
-- tout le reste est refuse par defaut.
```

- [ ] **Step 2: Appliquer, régénérer les types, vérifier**

`npx supabase db push` (ou `psql` si l'historique local est désynchronisé, puis insérer la ligne dans `supabase_migrations.schema_migrations`).

`npx supabase gen types typescript --local > types/database.ts` puis vérifier le diff. **Si des colonnes sans rapport disparaissent, refuse le fichier et ajoute le type à la main.**

`npm run typecheck && npm test`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations types/database.ts
git commit -m "feat(suivi): journal des mails rattaches a un projet

Ne contient JAMAIS le corps d'un message, uniquement les metadonnees.
Ecriture reservee au service role, lecture admin ou CDP du projet.
A ne pas confondre avec email_send_log, verrou d'idempotence des crons."
```

---

## Task 2 : Journalisation des envois de l'application

**Files:**

- Create: `lib/email/journal.ts`
- Modify: `lib/email/_send.ts`

- [ ] **Step 1: Lire `sendEmail` en entier**

Run: `cat lib/email/_send.ts`

Comprends son contrat : elle retourne `{ success, error?, skipped? }`, ne lève jamais, et gère un `EMAIL_OVERRIDE` de démonstration.

- [ ] **Step 2: Écrire le journal**

Créer `lib/email/journal.ts` avec `journaliserEmail(params)` :

- écrit une ligne dans `emails_envoyes` avec `source = 'app'`, via le **client service role** (`createAdminClient`) ;
- **ne lève jamais et ne bloque jamais**. En cas d'échec, un `logger.warn` et rien d'autre. Un email qui part vaut plus qu'une ligne de log ;
- rattachement : `projetId` et `clientId` sont passés par l'appelant quand il les connaît. Quand seul le client est connu, `projet_id` reste nul et le mail apparaît sur tous les projets du client — c'est le comportement voulu, documente-le.

- [ ] **Step 3: Brancher dans `sendEmail`**

Étends `EmailParams` avec trois champs **optionnels** : `projetId`, `clientId`, `type`. Après un envoi réussi, appelle `journaliserEmail`.

Trois points de vigilance :

- si `EMAIL_OVERRIDE` est actif, journalise les **destinataires réels**, pas l'adresse de redirection : le journal doit dire ce qui se serait passé en vrai ;
- n'attends pas le journal pour rendre la main si cela ralentit l'envoi — mais **n'avale pas non plus l'erreur en silence** ;
- un envoi `skipped` (service non configuré) ne se journalise pas : aucun mail n'est parti.

Les champs étant optionnels, **aucun appelant existant ne casse**. Ne pars pas modifier les dizaines de sites d'appel : renseigne `projetId`/`clientId` là où c'est évident et gratuit (envoi de facture, de devis), laisse le reste pour plus tard.

- [ ] **Step 4: Tests**

Créer `__tests__/email-journal.test.ts`. Couvre :

- un échec d'écriture ne fait pas échouer l'envoi ;
- avec `EMAIL_OVERRIDE`, ce sont les destinataires réels qui sont journalisés ;
- un envoi `skipped` ne produit aucune ligne.

- [ ] **Step 5: Vérifier et committer**

`npm run typecheck && npm run lint && npm test`

```bash
git add lib/email/journal.ts lib/email/_send.ts __tests__/email-journal.test.ts
git commit -m "feat(suivi): journalisation des mails envoyes par l'application

Un seul point d'instrumentation, tous les envois futurs sont traces.
Le journal ne peut jamais faire echouer un envoi : un email qui part
vaut plus qu'une ligne de log."
```

---

## Task 3 : Affichage dans le bloc Suivi

**Files:**

- Create: `lib/queries/emails-projet.ts`
- Create: `components/projets/projet-emails-liste.tsx`
- Modify: `components/projets/projet-suivi-panel.tsx`

- [ ] **Step 1: Query**

`getEmailsByProjetId(projetId, clientId)` : les 20 derniers mails du projet **ou** de son client (`projet_id = X OR (projet_id IS NULL AND client_id = Y)`), triés du plus récent au plus ancien.

- [ ] **Step 2: Composant**

Une liste sobre, pas un tableau : date, sujet, destinataire principal, et une pastille discrète pour la source (application / échange direct).

**Contrainte de densité** : 5 lignes visibles, le reste replié derrière un « voir plus ». Le bloc Suivi est en bas de la synthèse, il ne doit pas la faire doubler de longueur.

Quand le journal est vide, dis pourquoi honnêtement : « Aucun mail enregistré. Le journal démarre à la mise en service. » Un bloc vide sans explication ferait croire à un bug.

- [ ] **Step 3: Brancher**

Monter le composant dans `projet-suivi-panel.tsx`, **au-dessus** des documents : c'est l'information la plus vivante des deux.

- [ ] **Step 4: Vérifier et committer**

`npm run typecheck && npm run lint && npm test && npm run build`

```bash
git add lib/queries/emails-projet.ts components/projets/projet-emails-liste.tsx components/projets/projet-suivi-panel.tsx
git commit -m "feat(suivi): les derniers mails dans le bloc Suivi"
```

---

## Task 4 : Collecte Gmail, inerte par défaut

**Files:**

- Create: `lib/gmail/client.ts`
- Create: `lib/gmail/collecte.ts`
- Create: `app/api/cron/gmail-collecte/route.ts`
- Test: `__tests__/gmail-collecte.test.ts`
- Modify: `lib/env.ts`, `.env.example`, `vercel.json`

- [ ] **Step 1: Variables d'environnement**

Trois variables, **toutes optionnelles** :

- `GMAIL_COLLECTE_ACTIVE` : `'true'` pour activer. Absente ou différente de `'true'` → la collecte ne fait rien du tout.
- `GMAIL_SERVICE_ACCOUNT_JSON` : la clé du compte de service, en JSON.
- `GMAIL_DOMAINE` : le domaine dont les boîtes sont lisibles (garde-fou : refuser d'usurper une adresse hors de ce domaine).

Ajoute-les à `lib/env.ts` en optionnel et à `.env.example` avec un commentaire expliquant les deux prérequis hors code.

- [ ] **Step 2: Client Gmail**

Créer `lib/gmail/client.ts`. Avec `google-auth-library` (déjà installé), un `JWT` avec `subject` (l'adresse à usurper) et le scope `https://www.googleapis.com/auth/gmail.readonly`.

Deux impératifs :

- **`format=metadata`** sur `messages.get`, avec `metadataHeaders=Subject,From,To,Date`. Le corps ne doit jamais transiter, pas même en mémoire.
- **Refuser toute adresse hors de `GMAIL_DOMAINE`.** Un compte de service délégué peut usurper n'importe qui dans le domaine : le garde-fou doit être explicite dans le code, pas seulement dans la console Google.

Ajoute un délai d'expiration sur les appels HTTP (`AbortSignal.timeout`). C'est le défaut qui a coûté cher au lot 0 avec le client Eduvia : ne le reproduis pas.

- [ ] **Step 3: Logique de collecte, en fonction pure**

Créer `lib/gmail/collecte.ts` avec une fonction **pure** `rattacherMessage(entetes, contactsParEmail)` qui, à partir des en-têtes d'un message et de l'annuaire des contacts clients, retourne soit la ligne à insérer, soit `null`.

C'est là que vit la règle de périmètre, et c'est ce qu'on teste :

- aucun participant connu → `null`, rien n'est stocké ;
- un destinataire connu → ligne rattachée au client de ce contact ;
- un expéditeur connu → même chose ;
- plusieurs contacts de clients différents → rattacher au premier et le signaler, ne pas dupliquer ;
- la comparaison des adresses est **insensible à la casse** et tolère la forme `Nom <adresse@x.fr>` ;
- **aucun champ de corps** n'apparaît dans la ligne produite : assertion explicite dans un test.

- [ ] **Step 4: Cron**

Créer `app/api/cron/gmail-collecte/route.ts`, sur le modèle des crons existants (`verifyCronAuth`, `createAdminClient`, `maxDuration`).

**Première instruction du corps de la route** : si `GMAIL_COLLECTE_ACTIVE !== 'true'`, retourner immédiatement `{ success: true, actif: false, collectes: 0 }`. Aucune lecture, aucun appel réseau.

Ensuite : charger les CDP actifs du domaine, charger l'annuaire `client_contacts.email`, interroger Gmail avec une requête restreinte aux adresses connues, et insérer via `external_id` pour l'idempotence (`ON CONFLICT DO NOTHING`).

Déclarer dans `vercel.json` : `"schedule": "0 5 * * *"`.

- [ ] **Step 5: Documenter la mise en service**

Créer `docs/runbooks/gmail-collecte.md` : les deux prérequis (autorisation super-admin, information écrite de l'équipe), la configuration du compte de service, les scopes exacts, et **comment désactiver**. Quelqu'un qui active cette fonctionnalité dans six mois doit trouver la marche à suivre sans relire le code.

- [ ] **Step 6: Vérifier et committer**

`npm run typecheck && npm run lint && npm test && npm run build`

Vérifie explicitement, et dis-le dans ton rapport : **sans `GMAIL_COLLECTE_ACTIVE`, le cron ne fait rien.** Appelle-le en local avec le `CRON_SECRET` et montre la réponse.

```bash
git add lib/gmail "app/api/cron/gmail-collecte/route.ts" __tests__/gmail-collecte.test.ts lib/env.ts .env.example vercel.json docs/runbooks/gmail-collecte.md
git commit -m "feat(suivi): collecte Gmail des echanges CDP, inerte par defaut

Metadonnees uniquement (format=metadata), et seulement les messages
dont un participant est un contact client connu. Aucun corps de
message ne transite. Reste inerte tant que GMAIL_COLLECTE_ACTIVE n'est
pas pose : l'activation demande une autorisation super-admin Workspace
et une information ecrite de l'equipe (runbook)."
```

---

## Task 5 : Vérification

- [ ] **Step 1: Suite complète**

`npm run typecheck && npm run lint && npm test && npm run build`

- [ ] **Step 2: Journal de bout en bout**

En local, insère quelques lignes dans `emails_envoyes` sur un projet existant, et vérifie qu'elles apparaissent dans le bloc Suivi de la synthèse. Nettoie ensuite.

- [ ] **Step 3: Vérification visuelle**

Protocole dans `.claude/skills/verify/SKILL.md`. Pièges connus : l'hydratation React ne fonctionne pas dans le navigateur headless local (injecter le cookie `sb-127-auth-token`), et le binaire Playwright du cache peut être corrompu (pointer `executablePath` sur `chromium_headless_shell-1223`).

Contrôler que la synthèse **ne devient pas deux fois plus longue** avec le nouveau bloc. Capture.

- [ ] **Step 4: Nettoyer**

Supprimer les scripts temporaires et les données de test, arrêter le serveur de dev. `git status --short` avant de committer, jamais `git add -A`.

---

## Points de vigilance

**Le corps des messages ne doit apparaître nulle part.** Ni en base, ni en mémoire, ni dans un log. `format=metadata` sur l'appel Gmail est ce qui le garantit à la source : récupérer le message complet pour n'en garder qu'une partie serait une collecte excessive, même si rien n'est stocké.

**L'interrupteur n'est pas une commodité de développement.** Activer la collecte sans l'autorisation Workspace et sans avoir informé l'équipe est juridiquement attaquable en France. Le code doit rendre l'activation délibérée et documentée.

**Le journal ne doit jamais empêcher un envoi.** Si `emails_envoyes` est inaccessible, les factures partent quand même. C'est la même logique de dégradation douce que `email_send_log`, qui est explicitement en fail-open dans son commentaire.
