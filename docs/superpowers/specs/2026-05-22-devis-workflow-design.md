# Spec - Workflow devis et multi-societe emettrice

- Date : 2026-05-22
- Auteur : Nael Melikechi + brainstorming Claude
- Statut : a valider
- Phasage : 4 phases (cf section 8)

## 1. Contexte et probleme

Soluvia gere aujourd'hui les factures liees aux projets de formation (contrats OPCO, echeances mensuelles). Apparait un nouveau besoin : emettre des prestations commerciales hors cadre projet a des clients existants ou nouveaux, sur le modele Qonto.

Cas concret declencheur : un devis WEETEL (DEV-SOL-0001) genere via le script one-shot `scripts/render-devis-weetel.ts` le 2026-05-21 pour 36 dossiers d'agrement RNCP, 50% acompte / 50% solde. Aucun support en DB, aucun workflow.

Second contexte : une nouvelle societe DIGIVIA est en cours de creation. Elle devra emettre ses propres devis et factures depuis Soluvia, avec sa propre numerotation, sa propre identite legale, son propre push Odoo (la company n'existe pas encore dans wisemanh.odoo.com).

## 2. Objectifs

1. Permettre l'emission de devis depuis Soluvia avec workflow brouillon - envoye - accepte / refuse / expire.
2. Acceptation client en ligne (style Qonto) : lien public unique, bouton Accepter / Refuser, traces (nom, email, IP, timestamp).
3. Transformation manuelle d'un devis accepte en une ou plusieurs factures (acompte, solde, montant libre).
4. Couvrir aussi les factures libres (sans devis, sans projet), besoin parallele identifie le 2026-05-12.
5. Supporter plusieurs societes emettrices (SOLUVIA, DIGIVIA, EDUVIA si besoin) avec series de numerotation, identites legales, RIB et push Odoo distincts.
6. Garder coherence avec les garde-fous legaux existants (factures gapless par serie, snapshot PDF, integrite TVA).

Non-objectifs :

- Signature electronique qualifiee (Yousign, DocuSign).
- Echeancier automatique multi-jalons.
- Catalogue de prestations / templates de devis reutilisables.
- Push des devis vers Odoo comme `sale.order` (seules les factures sont poussees).
- Portail client persistant avec login.
- Generation multi-langues du PDF (FR uniquement).
- Instance Soluvia separee pour DIGIVIA (multi-tenant via env var).

## 3. Vocabulaire

- **Devis** : document commercial avec lignes libres, validite, signature en ligne. Pas comptable.
- **Societe emettrice** : entite juridique qui emet le devis et la facture (SOLUVIA, DIGIVIA, EDUVIA).
- **Facture libre** : facture rattachee a un client, sans projet ni contrat. Optionnellement liee a un devis.
- **Lien public** : URL signee `/devis/public/[token]` accessible sans login.

## 4. Schema de donnees

### 4.1 Nouvelle table `societes_emettrices`

```sql
create table societes_emettrices (
  id                          uuid primary key default gen_random_uuid(),
  code                        text not null unique,
  raison_sociale              text not null,
  forme_juridique             text,
  siret                       text not null,
  tva_intracom                text not null,
  capital_social              numeric(12,2),
  adresse                     text not null,
  code_postal                 text not null,
  ville                       text not null,
  pays                        text not null default 'France',
  email_contact               text not null,
  telephone                   text,
  logo_url                    text,
  banque_nom                  text,
  banque_iban                 text,
  banque_bic                  text,
  mentions_legales            text,
  conditions_reglement_default text,
  validite_devis_jours        integer not null default 90,
  odoo_company_id             integer,
  odoo_journal_id             integer,
  actif                       boolean not null default true,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);
```

Seed initial : SOLUVIA (code `SOL`), donnees depuis `scripts/render-devis-weetel.ts` et `components/facturation/facture-pdf.tsx`. DIGIVIA seedee par UI admin quand la societe existera legalement.

RLS : SELECT pour tous les utilisateurs authentifies (necessaire pour rendre les PDFs / emails cote CDP). WRITE admin et superadmin uniquement.

### 4.2 Nouvelles tables `devis` et `devis_lignes`

```sql
create type statut_devis as enum (
  'brouillon',
  'envoye',
  'accepte',
  'refuse',
  'expire',
  'remplace',
  'annule'
);

create table devis (
  id                              uuid primary key default gen_random_uuid(),
  ref                             text unique,
  numero_seq                      integer,
  societe_emettrice_id            uuid not null references societes_emettrices(id),
  client_id                       uuid not null references clients(id),
  statut                          statut_devis not null default 'brouillon',
  objet                           text not null,
  date_emission                   date,
  date_validite                   date,
  date_envoi                      timestamptz,
  date_acceptation                timestamptz,
  date_refus                      timestamptz,
  montant_ht                      numeric(12,2) not null default 0,
  montant_tva                     numeric(12,2) not null default 0,
  montant_ttc                     numeric(12,2) not null default 0,
  acceptation_token               text unique,
  acceptation_token_expire_at     timestamptz,
  acceptation_nom                 text,
  acceptation_email               text,
  acceptation_ip                  inet,
  acceptation_user_agent          text,
  refus_motif                     text,
  conditions_reglement            text,
  notes_internes                  text,
  devis_parent_id                 uuid references devis(id),
  version                         integer not null default 1,
  relances_actives                boolean not null default true,
  relance_j7_envoyee_at           timestamptz,
  relance_j14_envoyee_at          timestamptz,
  pdf_url                         text,
  pdf_locked                      boolean not null default false,
  created_by                      uuid references users(id),
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now()
);

create table devis_lignes (
  id                uuid primary key default gen_random_uuid(),
  devis_id          uuid not null references devis(id) on delete cascade,
  ordre             integer not null,
  libelle           text not null,
  description       text,
  quantite          numeric(10,2) not null default 1,
  prix_unitaire_ht  numeric(12,2) not null,
  taux_tva          numeric(5,2) not null default 20,
  total_ht          numeric(12,2) not null,
  total_tva         numeric(12,2) not null,
  total_ttc         numeric(12,2) not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table devis_public_views (
  id          uuid primary key default gen_random_uuid(),
  devis_id    uuid not null references devis(id) on delete cascade,
  token       text not null,
  ip          inet,
  user_agent  text,
  viewed_at   timestamptz not null default now()
);
```

Index : `devis(societe_emettrice_id, statut)`, `devis(client_id)`, `devis(acceptation_token)`, `devis(devis_parent_id)`, `devis_lignes(devis_id, ordre)`, `devis_public_views(devis_id)`.

RLS devis / devis_lignes / devis_public_views : `get_user_role() IN ('admin', 'superadmin')` (cf [[feedback_rls_admin_roles]]).

### 4.3 Evolutions tables existantes

`factures` :

- Ajout `societe_emettrice_id uuid not null references societes_emettrices(id)`. Migration backfill : tout l'existant = SOLUVIA.
- Ajout `devis_id uuid references devis(id)` nullable.
- Ajout `est_acompte boolean not null default false`.
- Numerotation : la sequence gapless devient `(societe_emettrice_id, est_avoir, numero_seq)`. Migration de recalcul a executer en transaction avec tests pgTAP avant push prod.

`facture_lignes` : pas de changement structurel. Les lignes d'une facture creee depuis un devis sont initialisees en copiant les `devis_lignes`.

`clients` : aucune migration. Le formulaire UI rend les champs OF (`numero_nda`, `numero_qualiopi`, `numero_uai`) optionnels via deux sections collapsibles Identite et Organisme de formation.

### 4.4 Triggers et contraintes

- Numerotation devis : trigger BEFORE UPDATE sur `devis` qui alloue `numero_seq = max(numero_seq) + 1 WHERE societe_emettrice_id = X` a la premiere transition `brouillon -> envoye`. `ref = 'DEV-' || societe.code || '-' || lpad(numero_seq::text, 4, '0')`. La numerotation devis n'est pas legalement gapless (contrairement aux factures), un brouillon supprime ne cree pas de trou puisque la seq n'est allouee qu'a l'envoi.
- Numerotation factures : extension de la logique existante avec le couple `(societe_emettrice_id, est_avoir)`. Gapless preserve par serie.
- `pdf_locked = true` : trigger qui rejette tout UPDATE sur les lignes, totaux et identite du devis (cf pattern `factures_integrity_guards`).
- Transitions de statut : trigger qui rejette les transitions illegales (ex `accepte -> brouillon`).
- Champs `acceptation_*` : modifiables uniquement via la RPC `accept_devis_public` (security definer). Les UPDATE directs depuis le client authentifie sont rejetes.
- CHECK : `montant_ht >= 0`, `montant_ttc >= montant_ht`, `taux_tva >= 0`, `version >= 1`.

## 5. Workflow et transitions

```
brouillon  --envoyer-->   envoye
brouillon  --annuler-->   annule
envoye     --accepter--> accepte    (RPC publique)
envoye     --refuser-->  refuse     (RPC publique)
envoye     --cron-->     expire     (date_validite < today)
envoye     --reviser-->  remplace   (cree un nouveau devis v2 en brouillon, devis_parent_id pointe sur v1)
```

Etats terminaux : `accepte`, `refuse`, `expire`, `remplace`, `annule`.

Reviser : on cree un nouveau devis v2 en brouillon, `devis_parent_id` pointe sur v1, v1 passe en `remplace`. Nouveau ref alloue (pas de suffixe `-v2`, on trace via `devis_parent_id` et `version`).

Envoi : alloue `numero_seq`, fige `pdf_url`, set `pdf_locked = true`, genere `acceptation_token` = UUID v4, `acceptation_token_expire_at = date_validite + 7 jours`.

## 6. Portail client public

Route `/devis/public/[token]` :

- Pas d'auth, rate-limite par IP (10 req/min) via middleware.
- Charge le devis via RPC `get_devis_public(token text)` security definer qui :
  - Valide token, expiration, statut envoye.
  - Retourne devis + lignes + societe emettrice + client (raison sociale et adresse uniquement, jamais SIRET / TVA / contacts).
  - Loggue l'ouverture dans `devis_public_views`.
  - Ne renvoie jamais `notes_internes`, `acceptation_email`, `acceptation_ip`, `created_by`.
- Page HTML responsive aux couleurs de la societe emettrice (logo).
- Bouton Telecharger PDF (route `/api/devis/[token]/pdf`, meme validation token).
- Bouton Accepter : modale avec nom signataire, email, checkbox certification engagement. Submit -> RPC `accept_devis_public(token, nom, email)` qui :
  - Verifie token + statut + expiration avec `for update` (race-safe).
  - Set `statut = accepte`, `date_acceptation = now()`, `acceptation_nom / email / ip / user_agent`.
  - Insere un audit log.
  - Renvoie ok au client, declenche email de confirmation au signataire + notif admins.
- Bouton Refuser : modale avec textarea motif -> RPC `refuse_devis_public(token, motif text)`.
- Page de confirmation post-acceptation / refus avec recap.

## 7. Transformation devis vers facture(s)

Sur la fiche admin du devis (statut `accepte`), bouton Creer une facture depuis ce devis ouvre un dialog :

- Choix du type :
  - Acompte : pourcentage du total (default 50%) -> facture avec une ligne unique `Acompte X% sur DEV-SOL-NNNN - [objet]`. `est_acompte = true`.
  - Solde : calcule `montant_total_devis - somme(factures liees deja emises)`. Ligne unique `Solde sur DEV-SOL-NNNN - [objet]`.
  - Personnalisee : copie toutes les lignes du devis dans la facture, edition libre ensuite.
- Encart Deja facture : `X EUR HT / Y EUR HT du devis (Z%)`. Warning si depassement, pas de blocage.
- La facture creee herite `client_id`, `societe_emettrice_id`, `devis_id`, `taux_tva`, `conditions_reglement`. Entre en brouillon dans le workflow facture existant.

Factures libres (sans devis) : dialog `new-facture-libre-dialog` existant finalise :

- Selection client (search par raison sociale / SIRET).
- Selection societe emettrice (default SOLUVIA si seule active).
- Saisie lignes libres (composants partages avec `devis_lignes`).
- Genere une facture brouillon sans `projet_id`, `contrat_id`, `devis_id`.
- Badge Libre dans la liste factures, filtre `?type=libre`.

## 8. Mailing et crons

Email envoi devis (bouton admin Envoyer) :

- Template Resend. From : `contact@mysoluvia.com` (seul domaine root verifie, cf [[reference_resend_sender]]). Reply-to : `email_contact` de la societe emettrice.
- Sujet : `[<code_societe>] Devis <ref> - <objet>` (ex `[SOLUVIA] Devis DEV-SOL-0001 - Realisation de 36 dossiers RNCP`).
- Corps : raison sociale, objet, montant TTC, date validite, lien public, PDF en piece jointe.
- Destinataires : contacts du client avec flag `recoit_factures = true` + TO / CC libres saisissables (reutilise pattern existant factures).

Email acceptation : confirmation au signataire + notif admins (in-app + email).
Email refus : notif admins avec motif (pas de confirmation au client).

Cron `/api/cron/devis-expiration` (quotidien) : passe les devis `envoye` dont `date_validite < today` en `expire`. Email recap aux admins. Protege par `CRON_SECRET`.

Cron `/api/cron/devis-relance` (quotidien) :

- J+7 apres `date_envoi` : relance polie, set `relance_j7_envoyee_at`.
- J+14 apres `date_envoi` : relance ferme, set `relance_j14_envoyee_at`.
- Skip si deja accepte / refuse / expire ou si `relances_actives = false`.
- Pas de relance apres J+14.

## 9. PDF et identite

- `components/facturation/facture-pdf.tsx` generalise pour accepter une `societeEmettrice` en prop (logo, raison sociale, SIRET, TVA, adresse, RIB, mentions). Suppression des constantes hardcodees.
- Nouveau composant `components/devis/devis-pdf.tsx` qui factorise le rendu (proche du script `render-devis-weetel.ts`) : header identite + bloc client + objet + tableau lignes + totaux + modalites de paiement + RIB + signature + footer mentions.
- `lib/utils/render-devis-pdf.ts` : pendant de `render-facture-pdf.ts` pour le buffer PDF.
- Le script `scripts/render-devis-weetel.ts` reste comme one-shot historique, non execute en runtime.

PDF locked + RIB qui change : si la societe change de banque demain, les anciens PDFs lockes gardent l'ancien RIB (snapshot). Documenter dans le runbook facturation.

## 10. Multi-societe Odoo

- Mapping `societes_emettrices.odoo_company_id` et `odoo_journal_id`.
- Si la societe emettrice n'a pas de `odoo_company_id` : la facture est creee normalement, mais le job de push Odoo skip et la fiche facture affiche un badge `Odoo non configure`.
- Quand DIGIVIA est ajoutee dans wisemanh.odoo.com, on remplit `odoo_company_id` en UI admin. Un bouton Resynchroniser sur les factures non poussees permet de rejouer.
- `reference_odoo_instance` reste pertinent : meme instance wisemanh, multi-company SOLUVIA + EDUVIA + DIGIVIA (a venir).

## 11. Permissions et securite

- Devis et devis_lignes : RLS admin + superadmin uniquement.
- Societes emettrices : SELECT tous authentifies, WRITE admin + superadmin.
- Rate-limit `/devis/public/*` : 10 req/min par IP via middleware.
- Token : UUID v4 stocke en DB, revocable. Comparaison constant-time dans la RPC. Pas crawlable (pas de listing).
- Liens publics : log des 401 / 404 pour detection d'enumeration.
- RPCs publiques security definer : `get_devis_public`, `accept_devis_public`, `refuse_devis_public`. Toutes verifient token + statut + expiration avec `for update`.
- Acceptation\_\* : champs uniquement modifiables via RPC publique. Triggers rejettent les UPDATE directs.

## 12. UI et navigation

- Sidebar : sous Facturation, nouvel item Devis (tabs Brouillons, Envoyes, Acceptes, Tous).
- Sidebar : sous Admin > Parametres, nouvel item Societes emettrices (CRUD admin only + mapping Odoo).
- Liste devis : `DataTable` partage, colonnes ref, client, societe, objet, statut, total TTC, date envoi, date validite, actions (voir, dupliquer, envoyer, reviser).
- Fiche devis : layout proche fiche facture (header + lignes + totaux + timeline evenements + actions contextuelles selon statut + bloc Factures emises depuis ce devis).
- Liste factures existante : ajout filtre societe emettrice + badge type (Projet / Libre / Devis).

## 13. Roadmap par phases

### Phase 1 : Socle multi-societe + factures libres (1-2 jours)

- Migration `societes_emettrices` + seed SOLUVIA.
- Migration `factures.societe_emettrice_id` + backfill SOL + numerotation par societe.
- Page admin `/admin/parametres/societes-emettrices` (CRUD).
- Refacto `facture-pdf.tsx` pour lire la societe depuis la DB.
- Finalisation `new-facture-libre-dialog` (selection client + societe, lignes libres, brouillon sans projet).
- Tests pgTAP numerotation + Vitest dialog.

Livrable autonome : emettre des factures libres SOLUVIA des le merge.

### Phase 2 : Devis brouillon + envoi + portail public (2-3 jours)

- Migrations `devis` + `devis_lignes` + `devis_public_views` + enum.
- Triggers numerotation, pdf_locked, transitions.
- Pages admin `/devis` (liste) + `/devis/[ref]` (fiche) + dialog creation.
- Composant `devis-pdf.tsx` + `lib/utils/render-devis-pdf.ts`.
- Route publique `/devis/public/[token]` + 3 RPCs (`get_devis_public`, `accept_devis_public`, `refuse_devis_public`).
- Emails envoi + acceptation + refus (templates Resend).
- Tests : RLS, RPCs publiques (rate-limit, expiration, statut), parcours signature.

Livrable autonome : workflow complet brouillon -> envoi -> signature en ligne.

### Phase 3 : Transformation devis vers factures + crons (1-2 jours)

- Dialog Creer facture depuis devis (acompte / solde / personnalisee).
- Lien `factures.devis_id` + UI fiche devis Factures emises depuis ce devis.
- Cron expiration quotidien.
- Cron relances J+7 / J+14.
- Revision (creation v2 + statut `remplace`).
- Tests : transformation, crons, revision.

Livrable autonome : boucle complete devis -> factures avec automatismes.

### Phase 4 : DIGIVIA (0.5 jour, donnees uniquement)

- Insert DIGIVIA dans `societes_emettrices` via UI admin (requiert SIRET, TVA, RIB).
- Configuration `odoo_company_id` DIGIVIA quand wisemanh.odoo.com l'a creee.
- Test d'un devis et d'une facture DIGIVIA bout en bout (le code ne bouge pas, seulement donnees).

Estimation totale : 5 a 7 jours de dev concentre hors imprevus. Phase 4 = configuration.

## 14. Tests

- pgTAP :
  - RLS devis et devis_lignes admin-only.
  - Trigger pdf_locked rejette les UPDATE.
  - Transitions de statut illegales rejetees.
  - Numerotation par societe pour devis et factures.
  - RPCs publiques : token invalide, expire, statut != envoye.
- Vitest :
  - Composant `DevisPdf` snapshot.
  - Helpers calcul totaux (reutilisation de `computeFactureTotauxTtcInclus`).
  - Dialog `new-facture-libre-dialog`.
  - Dialog Creer facture depuis devis (acompte / solde / personnalisee).
- Tests end-to-end manuels (ou Playwright si disponible) :
  - Parcours : creer devis -> envoyer -> ouvrir lien public -> accepter -> generer facture acompte -> push Odoo.
  - Parcours : creer devis -> envoyer -> refus client -> notif admin.
  - Parcours : creer devis DIGIVIA -> facture creee avec badge `Odoo non configure`.

## 15. Risques et points de vigilance

1. **Backfill `factures.societe_emettrice_id`** : 50+ factures existantes, toutes SOL. Migration idempotente, test pgTAP avant push prod, recalcul `numero_seq` en transaction.
2. **PDF locked + RIB change** : snapshot legal correct, documenter dans le runbook.
3. **Lien public abuse** : rate-limit IP + log des 401 / 404. Token UUID v4 non devinable.
4. **DIGIVIA pas dans Odoo** : factures locales avec badge, emails partent quand meme (Resend reste `mysoluvia.com`).
5. **Email reply-to DIGIVIA** : V1 envoi depuis `contact@mysoluvia.com` avec `reply-to:contact@digivia.fr` (en attendant verification domaine DIGIVIA dans Resend).
6. **Conditions de paiement** : penalites 3x taux legal + indemnite 40 EUR stockees dans `conditions_reglement_default` de chaque societe emettrice, pas en dur dans le PDF.
7. **Champs OF optionnels sur clients** : relire les validations Zod du formulaire client pour confirmer qu'aucun champ OF n'est obligatoire.
8. **Numerotation gapless** : factures gapless par serie `(societe_emettrice_id, est_avoir)`. Devis gapless uniquement a partir de l'envoi (brouillons supprimes ne creent pas de trou). Documenter dans `docs/numerotation-factures.md`.

## 16. Memoires liees

- [[project_facture_libre_todo]] : besoin original factures libres, integre dans ce chantier.
- [[project_commission_base]] : facturation projet HEOL, distinct mais meme module.
- [[project_facture_pdf_email]] : conventions PDF, etendues pour multi-societe.
- [[project_legal_invoicing]] : garde-fous legaux, etendus aux series par societe.
- [[reference_odoo_instance]] : instance wisemanh, multi-company.
- [[reference_resend_sender]] : domaine root mysoluvia.com.
- [[feedback_rls_admin_roles]] : `get_user_role() IN ('admin','superadmin')`.
- [[feedback_em_dashes]] : pas de tirets cadratin dans les strings UI / email.
