# Runbook : Onboarding DIGIVIA dans Soluvia

Ce runbook decrit les etapes pour activer DIGIVIA comme societe emettrice
de devis et factures dans Soluvia, le jour ou la societe sera legalement
creee et inscrite dans Odoo (wisemanh.odoo.com).

Aucun deploiement de code n'est necessaire : tout le socle multi-societe
est en place (cf chantier devis Phases 1-4, mai 2026).

## Prerequis (cote user)

- [ ] SIRET DIGIVIA disponible (extrait Kbis).
- [ ] Numero de TVA intracommunautaire DIGIVIA.
- [ ] Adresse legale, forme juridique (SAS, SARL, etc.), capital social.
- [ ] RIB DIGIVIA (banque, IBAN, BIC) si comptes ouverts.
- [ ] Logo DIGIVIA (PNG si possible, optionnel).
- [ ] Conditions de reglement par defaut (penalites de retard, mentions
      legales footer PDF).
- [ ] Company DIGIVIA creee dans wisemanh.odoo.com avec un `company_id`
      Odoo et un `journal_id` dedie.
- [ ] Decision sur l'email expediteur DIGIVIA :
  - Option simple : reutiliser `contact@mysoluvia.com` avec `reply-to`
    pointant sur l'adresse DIGIVIA (pas de validation Resend supplementaire).
  - Option propre : verifier le domaine `digivia.fr` (ou autre) dans
    Resend pour envoyer depuis `contact@digivia.fr` directement.

## Etapes

### 1. Creer la societe emettrice dans Soluvia

1. Se connecter en tant qu'admin sur `https://app.mysoluvia.com`.
2. Aller dans **Admin > Parametres > Societes emettrices**.
3. Cliquer "Nouvelle societe emettrice".
4. Remplir le formulaire :
   - **Code** : `DIG` (3-8 caracteres alphanumeriques majuscules).
   - **Raison sociale** : `DIGIVIA SAS` (ou forme exacte).
   - **Forme juridique** : `S.A.S.`.
   - **SIRET / TVA intracom** : valeurs Kbis.
   - **Adresse / CP / Ville / Pays** : adresse siege.
   - **Email contact** : `contact@digivia.fr` (utilise comme reply-to).
   - **Banque / IBAN / BIC** : RIB DIGIVIA.
   - **Mentions legales** : footer PDF (typiquement `DIGIVIA SAS - SIRET XXX - TVA intracom YYY`).
   - **Conditions reglement par defaut** : copier celles de SOLUVIA si pertinent.
   - **Validite devis (jours)** : 90 par defaut.
   - **Est par defaut** : laisser DECOCHE (SOLUVIA reste defaut).
   - **Active** : COCHE.
5. Valider.

### 2. Configurer le mapping Odoo (apres creation company DIGIVIA dans wisemanh)

1. Recuperer `company_id` (entier) et eventuellement `journal_id` (entier
   du journal de vente DIGIVIA) depuis l'admin Odoo.
2. Aller dans **Admin > Parametres > Societes emettrices > DIGIVIA**.
3. (Cette etape requiert que les champs `odoo_company_id` et
   `odoo_journal_id` soient editables dans la fiche - sinon, mettre a jour
   via la base directement en SQL :
   ```sql
   UPDATE societes_emettrices
      SET odoo_company_id = <X>, odoo_journal_id = <Y>
    WHERE code = 'DIG';
   ```
4. Tant que `odoo_company_id` est NULL, les factures DIGIVIA sont creees
   localement mais le push Odoo skip (cf logique facture). Une fois rempli,
   les nouvelles factures se synchronisent normalement.

### 3. Format des refs DIGIVIA

- **Factures** : `FAC-DIG-<TRIGRAMME_CLIENT>-NNNN` (ex `FAC-DIG-DUP-0001`).
- **Avoirs** : `AVR-DIG-<TRIGRAMME_CLIENT>-NNNN`.
- **Devis** : `DEV-DIG-NNNN` (deja le format depuis Phase 2).
- La sequence DIGIVIA demarre a 1, independante de SOLUVIA (CGI 289).
- SOLUVIA garde son format historique `FAC-<TRIGRAMME>-NNNN` /
  `AVR-<TRIGRAMME>-NNNN` (flag `societes_emettrices.legacy_ref_format = TRUE`).

### 4. Verification email

Si DIGIVIA garde `contact@mysoluvia.com` comme expediteur :

- Aucune action Resend supplementaire.
- Reply-to sera `contact@digivia.fr` (champ `email_contact` de la fiche).

Si DIGIVIA veut envoyer depuis son propre domaine :

- Verifier le domaine `digivia.fr` dans Resend (DKIM + SPF).
- Modifier la constante `FROM` dans `lib/email/devis-templates.ts` ET
  `lib/email/_send.ts` pour utiliser le bon expediteur conditionnellement
  selon la societe (devis.societe_emettrice.email_contact a parser).

### 5. Test end-to-end

1. Creer un nouveau client test (ex trigramme `TST`).
2. Creer un devis DIGIVIA : selectionner DIGIVIA dans le selecteur societe,
   ajouter quelques lignes, valider.
3. Verifier que la ref devis est `DEV-DIG-0001` (apres envoi).
4. Envoyer le devis a votre email perso, ouvrir le lien public, accepter.
5. Generer une facture acompte depuis le devis accepte.
6. Verifier que la ref facture est `FAC-DIG-TST-0001`.
7. Si Odoo configure : verifier que la facture est poussee dans la company
   DIGIVIA.

## Rollback (en cas de probleme)

Pour archiver DIGIVIA :

```sql
UPDATE societes_emettrices SET actif = FALSE WHERE code = 'DIG';
```

Les nouvelles factures ne pourront plus etre creees sous DIGIVIA. Les
existantes restent inchangees (immuabilite legale post-envoi).

Pour supprimer DIGIVIA completement : nécessite qu'aucune facture ni devis
ne pointe dessus (sinon FK violation). En pratique, prefere `actif = FALSE`.

## References

- Spec : `docs/superpowers/specs/2026-05-22-devis-workflow-design.md`
- Migration trigger numerotation par societe : `supabase/migrations/20260524110000_factures_numerotation_par_societe.sql`
- Test pgTAP : `supabase/tests/12_factures_numerotation_par_societe.sql`
