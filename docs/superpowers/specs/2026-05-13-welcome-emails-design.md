# Welcome Emails par rôle - Design

**Date:** 2026-05-13
**Statut:** Spec validée, en attente du plan d'implémentation
**Auteur:** Nael Melikechi (brainstorming avec Claude)

## Objectif

Préparer 4 templates d'emails de bienvenue (un par rôle utilisateur) à envoyer:

- maintenant, en broadcast aux users actuellement actifs dans Soluvia,
- automatiquement à chaque création de nouveau compte par un admin.

Chaque email doit présenter rapidement et de façon professionnelle l'outil et les modules pertinents pour le rôle du destinataire. Validation visuelle obligatoire par Nael sur `nmelikechi@mysoluvia.com` avant tout envoi à l'équipe.

## Contexte technique

- **Rôles existants** (`role_utilisateur` enum + migration `00052_role_commercial.sql`):
  - `admin` - admin organisationnel, accès complet
  - `superadmin` - admin technique, équivalent admin + opérations sensibles
  - `cdp` - chef de projet, accès filtré à son portefeuille
  - `commercial` - pipeline prospects et conversion
- **Hub email centralisé:** `lib/email/_send.ts` (Resend, fallback `skipped:true` si pas de clé, `EMAIL_OVERRIDE` pour preview, log via `email_send_log`)
- **Sender:** `SOLUVIA <contact@mysoluvia.com>` (domaine root vérifié)
- **Table users:** `id`, `email`, `nom`, `prenom`, `role`, `actif` (filtrer `actif=true`)
- **Clé Resend dispo en local** (`.env.local`) → permet le test depuis le poste de Nael.

## Architecture

### Fichiers créés/modifiés

| Fichier                                                        | Rôle                                                                                          |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `lib/email/welcome.ts` _(nouveau)_                             | 4 builders HTML + `sendWelcomeEmail(user)` dispatcher par role                                |
| `scripts/send-welcome-test.ts` _(nouveau)_                     | Script local lancé via `npx tsx`, envoie les 4 versions de test à `nmelikechi@mysoluvia.com`  |
| `app/api/admin/welcome-emails/broadcast/route.ts` _(nouveau)_  | Endpoint POST admin, broadcast aux users actifs, `dryRun` par défaut                          |
| `supabase/migrations/000XX_users_welcome_sent.sql` _(nouveau)_ | Ajoute colonne `welcome_email_sent_at TIMESTAMPTZ` à `users`, anti-doublon                    |
| `app/api/admin/users/route.ts` _(modifié)_                     | Hook après INSERT user: appelle `sendWelcomeEmail(newUser)`. Échec n'empêche pas la création. |
| `types/database.ts` _(régen)_                                  | Régénérer après migration                                                                     |

### Flow de validation

```
1. J'écris le code + le script.
2. Je lance `npx tsx scripts/send-welcome-test.ts` depuis le poste local.
3. Nael reçoit 4 mails sur nmelikechi@mysoluvia.com (subjects préfixés [TEST role=admin], etc.).
4. Nael valide ou demande modifs.
5. Si modifs: itération sur templates, relance script.
6. Si OK: appel `POST /api/admin/welcome-emails/broadcast { dryRun: true }` pour lister les destinataires.
7. Validation liste, puis appel avec `dryRun: false` pour broadcast réel.
8. À chaque INSERT users, `sendWelcomeEmail` envoyé automatiquement (et `welcome_email_sent_at` mis à jour).
```

## Contenu des 4 emails

**Format commun:**

- Sender: `SOLUVIA <contact@mysoluvia.com>`
- Reply-to: `contact@mysoluvia.com`
- HTML sobre, palette SOLUVIA (à aligner sur `lib/email/templates.ts`)
- Bouton CTA "Accéder à Soluvia" → `https://app.mysoluvia.com`
- Signature: "L'équipe SOLUVIA"
- Tutoiement
- ~150 mots
- Pas d'em-dashes (preference utilisateur)

### Template 1 - `admin`

**Subject:** `Bienvenue sur Soluvia - votre cockpit de pilotage`

**Intro:** "Bienvenue {prenom}, ton compte administrateur Soluvia est actif."

**Pitch:** "Soluvia centralise le pilotage de l'organisme: projets, contrats, facturation OPCO, qualité et indicateurs."

**Bullets (4):**

- Vue d'ensemble et indicateurs de l'organisme
- Gestion complète des projets, contrats et clients
- Facturation OPCO (DECA, apprentissage, libres) et suivi des paiements
- Administration: utilisateurs, paramètres, journal d'envoi

CTA + signature.

### Template 2 - `superadmin`

**Subject:** `Bienvenue sur Soluvia - accès superadmin`

**Intro:** "Bienvenue {prenom}, ton compte superadmin est actif - accès technique complet."

**Pitch:** identique admin.

**Bullets (4):** identiques admin sauf le 4e remplacé par:

- Administration avancée: gestion des rôles, paramètres systèmes, journal d'audit complet

**Note discrète en fin de mail:** "Ce rôle donne accès à des opérations sensibles - merci d'en faire un usage avisé."

CTA + signature.

### Template 3 - `cdp`

**Subject:** `Bienvenue sur Soluvia - votre espace chef de projet`

**Intro:** "Bienvenue {prenom}, ton espace chef de projet Soluvia est prêt."

**Pitch:** "Soluvia regroupe tous les outils dont tu as besoin pour piloter tes projets de formation au quotidien."

**Bullets (4):**

- Tes projets et contrats - vue filtrée sur ton portefeuille
- Saisie du temps avec auto-save (2s de debounce)
- Suivi qualité et indicateurs par projet
- Notifications temps réel (factures en retard, saisies manquantes)

CTA + signature.

### Template 4 - `commercial`

**Subject:** `Bienvenue sur Soluvia - votre pipeline commercial`

**Intro:** "Bienvenue {prenom}, ton accès commercial Soluvia est actif."

**Pitch:** "Soluvia te donne une vue claire sur ton pipeline de prospects et l'avancement commercial de l'organisme."

**Bullets (4):**

- Pipeline prospects: création, suivi, conversion en projet
- Vue des projets convertis et de leur statut
- Indicateurs commerciaux et taux de conversion
- Collaboration avec les chefs de projet et l'équipe admin

CTA + signature.

## Endpoints et auth

### `POST /api/admin/welcome-emails/broadcast`

- **Auth:** admin ou superadmin uniquement (via helper existant `isAdmin(role)`)
- **Body:** `{ dryRun?: boolean }` (défaut `true`)
- **Action si dryRun=true:** retourne `{ recipients: [{email, role, prenom}], totalCount }`, n'envoie rien.
- **Action si dryRun=false:** pour chaque `users.actif=true` AVEC `welcome_email_sent_at IS NULL`, appelle `sendWelcomeEmail(user)`, met à jour `welcome_email_sent_at` en cas de succès. Erreur d'envoi sur un user n'interrompt pas la boucle. Retourne `{ sent, failed, skipped }`.
- **Log:** chaque envoi tracé dans `email_send_log` (kind: `welcome`).

### Intégration au create-user

À l'endroit où un user est créé via UI admin (à identifier précisément au moment du plan d'implémentation, probablement `app/api/admin/users/route.ts` ou équivalent), après le `INSERT users` réussi:

- Appel `sendWelcomeEmail(newUser)` (async, non bloquant).
- En cas d'échec d'envoi: log warning, continue. Ne fait PAS échouer la création de user.
- Met à jour `welcome_email_sent_at` au succès.

## Garde-fous

- `RESEND_API_KEY` absent → `sendEmail` retourne `skipped:true` (existant). Le script de test échouera proprement en local sans clé.
- `EMAIL_OVERRIDE` env var: redirige les envois (existant).
- Anti-doublon: colonne `welcome_email_sent_at` empêche le re-spam si broadcast lancé plusieurs fois.
- Log audit: `email_send_log` table existante.
- Rate-limit Resend: broadcast itère séquentiellement avec un petit délai (50ms) si la liste excède 20 users (à confirmer dans le plan).

## Testabilité

- Unit tests sur les builders (`buildWelcomeAdmin`, etc.): subject + présence des bullets attendus + bouton CTA.
- Unit test sur `sendWelcomeEmail` dispatcher: vérifier qu'il route au bon builder selon le rôle.
- Test d'intégration broadcast en mode `dryRun=true` (mock Resend ou skip via `RESEND_API_KEY` absent).

## Hors scope

- Pas de page UI dédiée pour les templates (à ajouter ultérieurement si besoin).
- Pas de templates email pour les sous-rôles ou cas particuliers (uniquement les 4 rôles enum existants).
- Pas de versioning des templates (si refonte plus tard, on remplace).
- Pas d'A/B test ni de tracking d'ouverture (Resend webhooks hors scope).
