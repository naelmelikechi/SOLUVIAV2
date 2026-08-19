# Numérotation des factures SOLUVIA - Memo comptable

**Destinataires** : comptable, auditeur, interlocuteur France Compétences / URSSAF
**Date du memo** : 2026-04-21
**Dernière mise à jour** : 2026-08-17
**Auteur** : équipe technique SOLUVIA

---

## Résumé exécutif

Le système SOLUVIA respecte les exigences légales françaises de numérotation des factures (article 242 nonies A de l'annexe II au CGI, article L123-22 du Code de commerce) :

- **Séquence continue sans rupture** - numéro attribué par la base de données via verrou transactionnel, impossible d'avoir un trou ou un doublon.
- **Chronologique** - chaque nouvelle facture reçoit un numéro strictement supérieur au précédent.
- **Continue sur l'ensemble des exercices** - pas de remise à zéro annuelle.
- **Aucune suppression d'une facture émise** - une fois le numéro attribué, la ligne ne peut plus être supprimée, y compris par un administrateur et y compris par un accès technique privilégié.

**Deux séries distinctes.** Depuis le 2026-05-15, les factures et les avoirs sont numérotés dans **deux séries indépendantes**, chacune continue et repartant de 1 :

| Série    | Préfixe de référence | Colonne `est_avoir` |
| -------- | -------------------- | ------------------- |
| Factures | `FAC-SOL-NNNN`       | `false`             |
| Avoirs   | `AVR-SOL-NNNN`       | `true`              |

Le numéro légal est donc le **couple** (`est_avoir`, `numero_seq`), et non `numero_seq` seul. Des séries distinctes par nature de pièce sont admises par l'article 242 nonies A de l'annexe II au CGI, dès lors que chacune est continue. Ce point est essentiel pour interpréter les requêtes de contrôle données plus bas : `numero_seq = 1` existe deux fois en base, une fois par série, et ce n'est **pas** une anomalie.

Le numéro légal est porté par la colonne interne `numero_seq` (entier). La référence affichée dans l'UI et sur les PDF suit le format `{FAC|AVR}-SOL-{NUMERO}`, ex. `FAC-SOL-0042`. Le segment `SOL` désigne la société émettrice (SOLUVIA) et non le client : la référence ne contient pas de trigramme client, et n'est **pas** une séquence par client.

---

## Détail technique

### Qui génère le numéro ?

Le numéro n'est **pas** attribué à la création : un brouillon est créé sans `ref` ni `numero_seq`. Le numéro est attribué au moment de l'**émission**, par le trigger `assign_facture_ref_on_send` (`BEFORE UPDATE` sur `factures`). Le trigger jumeau `generate_facture_ref` (`BEFORE INSERT`) couvre les insertions directes.

Définition faisant foi : `supabase/migrations/20260723120000_factures_guards_serie_et_delete.sql`. Le bloc SQL reproduit ci-dessous est la version d'origine (`supabase/migrations/00020_functions.sql`), conservée pour illustrer le principe du `max+1` sous verrou ; la fonction a été redéfinie cinq fois depuis, notamment pour séparer les deux séries et pour n'attribuer le numéro qu'à l'émission.

```sql
CREATE OR REPLACE FUNCTION generate_facture_ref()
RETURNS TRIGGER AS $$
DECLARE
  v_trigramme TEXT;
  v_num INTEGER;
BEGIN
  IF NEW.ref IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT c.trigramme INTO v_trigramme FROM clients c WHERE c.id = NEW.client_id;

  -- Gapless: use max+1 with row lock instead of sequence
  LOCK TABLE factures IN SHARE ROW EXCLUSIVE MODE;
  SELECT COALESCE(MAX(numero_seq), 0) + 1 INTO v_num FROM factures;

  NEW.numero_seq := v_num;
  NEW.ref := 'FAC-' || v_trigramme || '-' || lpad(v_num::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### Pourquoi pas un `SEQUENCE` PostgreSQL classique ?

Une séquence standard PostgreSQL peut créer des **trous** : si une transaction fait `nextval()` puis échoue (`ROLLBACK`), le numéro consommé n'est pas réutilisé. Ce comportement est incompatible avec l'exigence légale française de numérotation continue.

SOLUVIA utilise donc le pattern `MAX + 1` sous verrou `SHARE ROW EXCLUSIVE` :

- Le verrou bloque toute autre transaction qui tenterait d'insérer dans `factures` jusqu'à la fin de la transaction courante.
- Le calcul `MAX(numero_seq) + 1` est effectué à l'intérieur du verrou - aucune concurrence possible.
- Si la transaction échoue (`ROLLBACK`), le numéro n'a jamais été consommé (aucune ligne insérée), donc la prochaine insertion reprend au même numéro.

**Conséquence** : séquence strictement continue, sans trou, même en cas d'erreur d'insertion.

### Garanties d'unicité

Deux garanties en base :

- `factures.ref UNIQUE` - la référence affichée est unique (contrainte de colonne, `supabase/migrations/00010_factures.sql`).
- Deux **index uniques partiels** sur `(societe_emettrice_id, numero_seq)`, l'un pour `est_avoir = FALSE`, l'autre pour `est_avoir = TRUE`, tous deux restreints à `numero_seq IS NOT NULL` (`supabase/migrations/20260524110000_factures_numerotation_par_societe.sql`). Ils garantissent l'unicité du numéro **au sein de chaque série**, ce qui est la garantie recherchée.

Il n'existe volontairement **pas** de contrainte `UNIQUE` sur `numero_seq` seul : elle serait incompatible avec les deux séries. Les brouillons, dont `numero_seq` vaut `NULL`, sont exclus des index par la clause partielle.

Double verrouillage : même si une hypothétique faille laissait passer deux transactions concurrentes, l'index unique ferait échouer la seconde écriture au niveau base.

### Interdiction de suppression

La Row-Level Security de Supabase définit les policies suivantes sur la table `factures` (fichier `supabase/migrations/00030_rls_policies.sql` lignes 48-51) :

```sql
CREATE POLICY admin_select_factures ON factures FOR SELECT USING (is_admin());
CREATE POLICY admin_insert_factures ON factures FOR INSERT WITH CHECK (is_admin());
CREATE POLICY admin_update_factures ON factures FOR UPDATE USING (is_admin());
-- NO DELETE policy on factures (French legal requirement)
```

Le schéma initial ne comportait aucune policy `DELETE`. Depuis, la protection a été **renforcée et précisée**, et il faut distinguer deux cas :

- **Facture émise (numéro attribué) : suppression impossible.** Le trigger `forbid_facture_emise_delete` (`supabase/migrations/20260723120000_factures_guards_serie_et_delete.sql`) lève une exception dès que `ref` ou `numero_seq` est renseigné. Ce trigger s'applique **y compris aux accès techniques privilégiés** (`service_role`, scripts de maintenance), qui contournent la Row-Level Security. C'est cette garantie-là qui protège la continuité de la série.
- **Brouillon (aucun numéro attribué) : suppression possible par un administrateur.** La policy `admin_delete_brouillon_factures` (`supabase/migrations/20260507114004_factures_delete_brouillon_policy.sql`) autorise le `DELETE` sous la double condition `statut = 'a_emettre' AND is_admin()`. Un brouillon n'ayant ni `ref` ni `numero_seq`, sa suppression ne peut pas créer de trou dans la numérotation.

Ces deux règles sont verrouillées par les tests automatisés `supabase/tests/02_rls_facture_delete.sql` et `supabase/tests/29_facture_guards.sql`.

Côté code applicatif, les seules suppressions exposées portent sur des brouillons (`deleteBrouillon`, `lib/actions/factures/brouillon-mutations.ts`, qui vérifie le statut avant d'agir).

### Corrections : avoirs (notes de crédit)

En cas d'erreur ou d'annulation, on **n'efface pas** la facture originelle. On émet un **avoir** qui :

- Est enregistré dans la même table `factures` avec `est_avoir = true`.
- Porte des montants **négatifs** (par exemple `montant_ht = -320.83`).
- Récupère son propre numéro via le même trigger, dans la **série des avoirs** (`AVR-SOL-NNNN`), qui est continue et indépendante de celle des factures.
- Référence la facture annulée via `facture_origine_id`.

Aucun paiement ne peut être enregistré sur un avoir (vérification dans `lib/actions/factures/payments.ts`).

### Composition de la référence affichée

La colonne `factures.ref` suit le format `{FAC|AVR}-SOL-{NUMERO_PADDED}` :

- Exemple 1 : `FAC-SOL-0042` - 42ème facture émise.
- Exemple 2 : `AVR-SOL-0003` - 3ème avoir émis.

**Attention** : le segment central identifie la **société émettrice** (`SOL` pour SOLUVIA), pas le client. La référence ne contient aucun trigramme client et ne reflète aucune numérotation par client.

**Références historiques.** Des factures antérieures au 2026-06-10 portent encore l'ancien format `FAC-{TRIGRAMME_CLIENT}-{NUMERO}` (par exemple `FAC-HEO-0001`). Elles n'ont pas été renumérotées : leur `numero_seq` reste valide et appartient à la même série continue. Seul le libellé de la référence diffère.

La colonne `factures.numero_seq` porte le numéro légal (ici `42`, `3`), celui à citer en cas de contrôle, **accompagné de la série** (facture ou avoir).

---

## Vérifications possibles par la comptabilité

**Deux précautions indispensables** pour toutes les requêtes ci-dessous, sans lesquelles elles signalent des anomalies sur une base parfaitement conforme :

1. Exclure les brouillons avec `WHERE numero_seq IS NOT NULL`. Un brouillon est une facture en préparation, sans numéro : il est compté par `COUNT(*)` mais ignoré par `MIN`/`MAX`.
2. Raisonner **par série** (`est_avoir`), et par société émettrice. `numero_seq = 1` existe une fois côté factures et une fois côté avoirs : ce n'est pas un doublon.

- **Continuité, par série** :

  ```sql
  SELECT est_avoir,
         MAX(numero_seq) - MIN(numero_seq) + 1 - COUNT(*) AS trous
    FROM factures
   WHERE numero_seq IS NOT NULL
   GROUP BY est_avoir;
  ```

  La colonne `trous` doit valoir `0` pour chacune des deux lignes.

- **Unicité, par série et par société** :

  ```sql
  SELECT est_avoir, societe_emettrice_id, numero_seq, COUNT(*)
    FROM factures
   WHERE numero_seq IS NOT NULL
   GROUP BY est_avoir, societe_emettrice_id, numero_seq
  HAVING COUNT(*) > 1;
  ```

  Doit retourner `0` ligne.

- **Ordre chronologique** :

  ```sql
  SELECT est_avoir, numero_seq, date_emission
    FROM factures
   WHERE numero_seq IS NOT NULL
   ORDER BY est_avoir, numero_seq;
  ```

  Dans chaque série, `date_emission` doit être non strictement décroissante (deux pièces émises le même jour peuvent avoir des numéros consécutifs dans l'ordre d'insertion). Voir la réserve en « Limites connues ».

- **Absence de DELETE** : l'absence de ligne dans les logs Postgres pour des opérations `DELETE` sur `factures` peut être vérifiée via les logs Supabase si activés.

---

## Limites connues

- **Date d'émission antérieure au numéro** : `date_emission` est la date portée par le brouillon, et elle n'est pas recalculée au moment de l'émission. Deux conséquences pour le contrôle « ordre chronologique » ci-dessus : un brouillon dont la date a été saisie manuellement peut recevoir un numéro postérieur à sa date ; et lorsque plusieurs brouillons sont émis en une seule opération depuis une sélection manuelle, l'ordre d'attribution suit l'ordre de sélection et non l'ordre des dates. La continuité et l'unicité de la série ne sont pas affectées ; seul l'ordre `numero_seq` / `date_emission` peut présenter une inversion. Point ouvert, remonté à l'audit du 2026-08-17.

- **Panne matérielle en cours d'insertion** : un crash physique de la base Postgres pendant la transaction pourrait théoriquement interrompre l'insertion avant validation. Le verrou et le ROLLBACK automatique garantissent qu'aucun numéro n'est consommé dans ce cas ; la prochaine insertion reprendra au même numéro. La politique de sauvegarde et de restauration point-in-time de l'instance PostgreSQL est à documenter séparément : elle n'est pas décrite dans ce dépôt et ne doit pas être présumée ici.
- **Migration/restoration depuis backup** : en cas de restauration partielle de la base, il faut s'assurer que la restauration inclut bien la totalité des factures émises depuis le dernier backup consistent. Le mécanisme de suivi `created_at` permet cet audit.
- **Multi-exercice** : la séquence est globale sur la vie du produit (pas remise à zéro chaque année). C'est conforme au Code de commerce qui impose une numérotation continue, pas nécessairement par exercice.

---

## Contact

Pour toute question technique : équipe SOLUVIA.
Pour toute question de conformité : se référer aux articles cités en introduction, ou consulter un expert-comptable habilité.
