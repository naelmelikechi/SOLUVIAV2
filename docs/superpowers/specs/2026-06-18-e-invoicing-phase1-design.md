# E-invoicing 2026 — Phase 1 : Mentions & données

Date : 2026-06-18
Statut : validé (design), prêt pour plan d'implémentation

## Contexte

La réforme française de la facturation électronique impose, à terme, l'émission
de factures au format structuré (Factur-X) transmises via une plateforme
(PDP / PPF). SOLUVIA étant une PME, l'obligation d'**émission** s'applique en
septembre 2027 ; l'obligation de **réception** en septembre 2026.

Décision d'architecture (validée) : la transmission PDP passera par l'abonnement
Odoo existant (wisemanh.odoo.com). SOLUVIA pousse déjà chaque facture dans Odoo
(`account.move` posté + PDF SOLUVIA attaché). C'est donc **Odoo** qui générera le
Factur-X (XML CII embarqué) et assurera la transmission — pas SOLUVIA.

Le chantier complet est découpé en 3 phases, chacune avec son propre cycle
spec → plan → implémentation :

| Phase                                | Contenu                                                                                                                | Dépendance externe   |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | -------------------- |
| **1 — Mentions & données** (ce spec) | Mentions légales obligatoires sur le PDF SOLUVIA + report dans Odoo (narration).                                       | Aucune               |
| 2 — Factur-X via Odoo                | Vérifier/activer la localisation française + module e-invoicing Odoo, garantir la génération Factur-X au post du move. | Config Odoo (compta) |
| 3 — Statut transmission              | Pull du statut EDI/PDP (transmise / acceptée / rejetée) dans l'UI facturation, sur le modèle du pull `payment_state`.  | Phase 2 active       |

Ce document ne couvre que la **Phase 1**.

## Objectif Phase 1

Afficher les mentions obligatoires de la réforme sur le PDF SOLUVIA et les porter
dans Odoo, sans aucune dépendance externe. Les données sont ainsi prêtes pour que
la Phase 2 n'ait qu'à les structurer dans le Factur-X.

## Décisions métier (validées)

1. **Catégorie d'opération** : les factures SOLUVIA sont **toujours des
   prestations de services** (commissions de gestion, apport d'affaires, factures
   libres de prestation). Le premier équipement (PREMIEREQUIPEMENT) est exclu de
   la base de commission et n'est jamais facturé au client par SOLUVIA. La
   mention est donc **fixe**, pas un champ par facture ou par ligne.

2. **Option TVA sur les débits** : statut non confirmé par la compta. La mention
   est donc **pilotée par un paramètre** par société émettrice, **désactivé par
   défaut** (état sûr : aucune mention tant que non confirmé), activable sans
   redéploiement.

3. **SIREN** : déjà couvert. Le SIRET (affiché côté émetteur ET côté client sur
   le PDF) contient le SIREN (9 premiers chiffres) ; la localisation française
   d'Odoo le calcule pour le Factur-X. Aucun champ ni affichage supplémentaire
   (YAGNI).

## Périmètre

### 1. Mention « catégorie d'opération » (fixe)

- Nouveau module `lib/utils/e-invoicing-mentions.ts` exportant les constantes :
  - `CATEGORIE_OPERATION_SERVICES = "Categorie d'operation : Prestations de services"`
  - `TVA_DEBITS_MENTION = "Option pour le paiement de la taxe d'apres les debits"`
  - Pas d'em-dash ni de caractère spécial fragile (cf. NNBSP/Helvetica @react-pdf) ;
    apostrophes droites simples.
- Rendue sur **chaque facture ET chaque avoir**, dans une zone « Mentions
  légales » placée après le bloc des totaux et avant/à côté de la mention
  autoliquidation existante.

### 2. Mention « option TVA sur les débits » (conditionnelle)

- **Migration** : `ALTER TABLE societes_emettrices ADD COLUMN tva_sur_debits
BOOLEAN NOT NULL DEFAULT false;`
  - Niveau société émettrice (et non global) : SOLUVIA, EDUVIA, DIGIVIA peuvent
    avoir opté différemment auprès de l'administration.
- **Type** : ajouter `tva_sur_debits: boolean` à `EmetteurInfo`
  (`lib/queries/parametres.ts`), au mapping `mapSocieteToEmetteur`, à
  `SocieteEmettriceRow`, et à `EMETTEUR_FALLBACK` (= `false`).
- **UI admin** : ajouter un toggle « Option TVA sur les débits » dans le
  formulaire d'édition d'une société émettrice (page paramètres admin).
- **Rendu PDF** : si `EMETTEUR.tva_sur_debits === true`, afficher
  `TVA_DEBITS_MENTION` dans la zone Mentions légales. Sinon : rien.

### 3. Report dans Odoo (carrier)

- `pushMove` (`lib/odoo/client.ts`) ajoute les mentions applicables au champ
  standard `narration` de l'`account.move` à la création.
  - `narration` est un champ HTML/texte présent dans toutes les versions Odoo,
    donc aucune dépendance à la localisation française ou à un module
    e-invoicing → compatible Phase 1.
  - Contenu : toujours `CATEGORIE_OPERATION_SERVICES` ; plus `TVA_DEBITS_MENTION`
    si la société émettrice a `tva_sur_debits = true`.
- Pour transmettre l'info jusqu'à Odoo, ajouter un champ au payload :
  `OdooInvoicePayload.tva_sur_debits?: boolean`. Renseigné dans
  `lib/odoo/sync.ts` (`pushFactures` et `pushAvoirs`) à partir de la société
  émettrice de la facture (jointure `societe` déjà présente — ajouter
  `tva_sur_debits` au `select`).
- Idempotence : `narration` n'est posé qu'à la **création** du move (branche
  `else` de `pushMove`), jamais en update sur un move réutilisé, cohérent avec le
  reste du push (adresse partner posée à la création uniquement).

## Composants touchés

| Fichier                                                | Changement                                                                 |
| ------------------------------------------------------ | -------------------------------------------------------------------------- |
| `supabase/migrations/<ts>_societes_tva_sur_debits.sql` | Nouvelle colonne `tva_sur_debits`                                          |
| `lib/utils/e-invoicing-mentions.ts`                    | Nouveau — constantes de mentions                                           |
| `lib/queries/parametres.ts`                            | `EmetteurInfo.tva_sur_debits`, mapping, fallback                           |
| `components/facturation/facture-pdf.tsx`               | Zone « Mentions légales » (catégorie + débits conditionnelle)              |
| Formulaire société émettrice (admin)                   | Toggle `tva_sur_debits`                                                    |
| `lib/odoo/client.ts`                                   | `OdooInvoicePayload.tva_sur_debits`, narration au create                   |
| `lib/odoo/sync.ts`                                     | `select` société + passage `tva_sur_debits` au payload (factures + avoirs) |
| `types/database.ts`                                    | Régénéré après migration                                                   |

## Tests

- **PDF** : le rendu d'une facture contient toujours
  `CATEGORIE_OPERATION_SERVICES`.
- **PDF** : mention débits **présente** quand `emetteur.tva_sur_debits = true`,
  **absente** quand `false`. Couvrir facture et avoir.
- **Mapping** : `mapSocieteToEmetteur` propage `tva_sur_debits` ; fallback = `false`.
- **Odoo** : la narration construite contient la catégorie d'opération, et la
  mention débits seulement quand le flag est vrai (test unitaire sur le helper de
  construction de narration, sans appel réseau — stub Odoo).
- Non-régression : suite existante (factures, PDF, totaux) verte.

## Garde-fous / invariants préservés

- Numérotation gapless et interdiction de DELETE factures : non impactés (aucune
  modification du cycle d'émission).
- TVA intracommunautaire / autoliquidation : la nouvelle zone Mentions légales
  cohabite avec la mention autoliquidation existante sans la remplacer.
- Multi-société : le paramètre est par société émettrice ; le fallback couvre les
  factures sans société rattachée (`tva_sur_debits = false`).
- Pas d'em-dash dans les chaînes UI/PDF (convention projet).

## Hors périmètre (Phase 2 / 3)

- Génération du PDF au format Factur-X (PDF/A-3 + XML CII embarqué).
- Champs structurés CII / EN16931, identifiants de routage avancés.
- Activation et configuration des modules e-invoicing côté Odoo.
- Pull du statut de transmission PDP dans l'UI SOLUVIA.
- Adresse de livraison des biens (sans objet : prestations de services).
- Catégorie d'opération par ligne (sans objet : toujours services).

## Risques / points de vigilance

- **Confirmation compta TVA débits** : le flag reste `false` jusqu'à confirmation.
  Action externe (compta), non bloquante pour livrer la Phase 1.
- **Capacité e-invoicing d'Odoo non vérifiée** : la version d'Odoo et la présence
  des modules de localisation française / e-invoicing sur wisemanh.odoo.com ne
  sont pas confirmées. C'est une dépendance de la **Phase 2**, pas de la Phase 1
  (qui n'utilise que le champ `narration`, universel). À traiter comme première
  tâche de découverte de la Phase 2.
