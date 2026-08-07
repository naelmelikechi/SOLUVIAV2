# Runbook - Collecte Gmail des échanges CDP

Statut par défaut : **inerte**. Ce document explique comment (et surtout : à
quelles conditions) l'activer, et comment la désactiver immédiatement si
besoin.

## Ce que fait cette fonctionnalité

Un cron quotidien (`GET /api/cron/gmail-collecte`) lit les métadonnées
(date, expéditeur, destinataires, sujet - **jamais le corps du message**)
des boîtes Gmail des chefs de projet, et journalise dans `emails_envoyes`
(source `gmail`) les seuls messages dont un participant correspond à un
`client_contacts.email` connu. Le résultat est visible dans le bloc Suivi
de la fiche projet, à côté des mails envoyés par l'application.

Un échange avec une adresse inconnue de l'annuaire clients n'est rattaché à
rien et **n'est pas stocké du tout**.

## Pourquoi c'est inerte par défaut

Lire la boîte mail d'un salarié est un traitement de données personnelles
au sens RGPD. Deux prérequis doivent être remplis **avant** toute
activation, et aucun des deux n'est technique :

1. **Autorisation du super-administrateur du Google Workspace.** Le compte
   de service doit être explicitement autorisé dans la console d'admin
   Google (délégation à l'échelle du domaine - _domain-wide delegation_),
   avec le scope `https://www.googleapis.com/auth/gmail.readonly` UNIQUEMENT.
   Sans cette autorisation, les appels échouent (403) - ce n'est pas un
   filet technique, c'est un contrôle organisationnel qui doit être posé en
   premier.
2. **Information écrite de l'équipe**, avec mention explicite dans la
   charte informatique de l'entreprise. En France, un accès non annoncé aux
   messageries des salariés est juridiquement attaquable, même quand
   l'employeur en est propriétaire. Cette information doit précéder
   l'activation, pas la suivre.

Tant que ces deux conditions ne sont pas remplies, **ne pas activer**, même
en environnement de test contre de vraies boîtes du domaine.

## Comment activer (une fois les deux prérequis remplis)

1. Créer le compte de service dans la console Google Cloud du Workspace,
   avec délégation à l'échelle du domaine, scope
   `https://www.googleapis.com/auth/gmail.readonly` (lecture seule, aucun
   autre scope).
2. Récupérer la clé JSON du compte de service et la poser dans la variable
   d'environnement `GMAIL_SERVICE_ACCOUNT_JSON` (Vercel, scope Production).
3. Poser `GMAIL_DOMAINE` au domaine Workspace exact (ex: `mysoluvia.com`).
   Le code refuse explicitement toute adresse hors de ce domaine
   (`lib/gmail/client.ts::assertAdresseDansDomaine`) - un compte de service
   délégué peut techniquement usurper n'importe quelle boîte du domaine,
   ce garde-fou empêche une dérive de configuration de l'exploiter.
4. Poser `GMAIL_COLLECTE_ACTIVE=true`. C'est la SEULE variable qui active
   la collecte ; toute autre valeur (ou son absence) laisse le cron inerte.
5. Vérifier le premier run (logs `cron.gmail-collecte`) : `collectes` doit
   correspondre à un nombre plausible de messages rattachés, `ambigus`
   signale les messages avec plusieurs clients connus parmi les
   participants (rattachés au premier, jamais dupliqués).

## Comment désactiver immédiatement

Repasser `GMAIL_COLLECTE_ACTIVE` à une valeur différente de `'true'` (ou la
supprimer). Le cron redevient inerte au run suivant, sans lecture ni appel
réseau - c'est la toute première instruction de la route
(`app/api/cron/gmail-collecte/route.ts`). Aucune autre action n'est requise
pour couper l'accès applicatif ; pour révoquer complètement l'accès Gmail,
retirer aussi l'autorisation du compte de service dans la console
d'administration Google.

## Ce qui n'est jamais collecté

- Le corps d'un message, sous aucune forme. L'appel Gmail utilise
  `format=metadata` avec `metadataHeaders=Subject,From,To,Date`
  (`lib/gmail/client.ts::getMessageMetadata`) : le corps n'est jamais
  renvoyé par l'API, donc jamais présent en mémoire côté SOLUVIA.
- Les échanges avec une adresse absente de `client_contacts.email`.
- Les boîtes en dehors de `GMAIL_DOMAINE`.

## Fichiers concernés

- `lib/gmail/client.ts` - appels REST Gmail (JWT, garde-fou domaine, timeout).
- `lib/gmail/collecte.ts` - `rattacherMessage`, fonction pure qui décide du
  rattachement (ou du rejet) d'un message.
- `app/api/cron/gmail-collecte/route.ts` - le cron, avec l'interrupteur en
  première instruction.
- `lib/env.ts` - `GMAIL_COLLECTE_ACTIVE`, `GMAIL_SERVICE_ACCOUNT_JSON`,
  `GMAIL_DOMAINE`.
