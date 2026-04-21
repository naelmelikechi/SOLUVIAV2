# Numérotation des factures SOLUVIA - Memo comptable

**Destinataires** : comptable, auditeur, interlocuteur France Compétences / URSSAF
**Date du memo** : 2026-04-21
**Auteur** : équipe technique SOLUVIA

---

## Résumé exécutif

Le système SOLUVIA respecte les exigences légales françaises de numérotation des factures (article 242 nonies A de l'annexe II au CGI, article L123-22 du Code de commerce) :

- **Séquence continue sans rupture** - numéro attribué par la base de données via verrou transactionnel, impossible d'avoir un trou ou un doublon.
- **Chronologique** - chaque nouvelle facture reçoit un numéro strictement supérieur au précédent.
- **Unique sur l'ensemble des exercices** - une seule séquence globale, toutes sociétés et toutes années confondues.
- **Aucune suppression possible** - la policy de sécurité de la base interdit la commande `DELETE` sur les factures, y compris pour un administrateur.

Le numéro légal est porté par la colonne interne `numero_seq` (entier). La référence affichée dans l'UI et sur les PDF (`FAC-{TRIGRAMME-CLIENT}-{NUMERO}`, ex. `FAC-DUP-0042`) est une composition pour confort de lecture ; elle n'est **pas** une séquence par client.

---

## Détail technique

### Qui génère le numéro ?

Un **trigger PostgreSQL** nommé `generate_facture_ref` s'exécute à chaque `INSERT` sur la table `factures`. Fichier de définition : `supabase/migrations/00020_functions.sql` (lignes 56-77).

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

Deux contraintes `UNIQUE` en base :

- `factures.ref UNIQUE` - la référence affichée est unique.
- `factures.numero_seq UNIQUE` - le numéro légal est unique.

Double verrouillage : même si une hypothétique faille laissait passer deux transactions concurrentes, la contrainte d'unicité ferait échouer la seconde insertion au niveau base.

### Interdiction de suppression

La Row-Level Security de Supabase définit les policies suivantes sur la table `factures` (fichier `supabase/migrations/00030_rls_policies.sql` lignes 48-51) :

```sql
CREATE POLICY admin_select_factures ON factures FOR SELECT USING (is_admin());
CREATE POLICY admin_insert_factures ON factures FOR INSERT WITH CHECK (is_admin());
CREATE POLICY admin_update_factures ON factures FOR UPDATE USING (is_admin());
-- NO DELETE policy on factures (French legal requirement)
```

Il n'existe aucune policy `DELETE`. Sans policy autorisante, Postgres refuse toute tentative de suppression, y compris pour un administrateur.

De plus, côté code applicatif, **aucune server action** ne permet la suppression (`lib/actions/factures.ts` ne contient pas de fonction `deleteFacture` ou équivalent).

### Corrections : avoirs (notes de crédit)

En cas d'erreur ou d'annulation, on **n'efface pas** la facture originelle. On émet un **avoir** qui :

- Est enregistré dans la même table `factures` avec `est_avoir = true`.
- Porte des montants **négatifs** (par exemple `montant_ht = -320.83`).
- Récupère **son propre numéro** via le même trigger (même séquence globale `numero_seq`).
- Référence la facture annulée via `facture_origine_id`.

Aucun paiement ne peut être enregistré sur un avoir (vérification dans `lib/actions/factures.ts` ligne 342).

### Composition de la référence affichée

La colonne `factures.ref` suit le format `FAC-{TRIGRAMME_CLIENT}-{NUMERO_PADDED}` :

- Exemple 1 : `FAC-DUP-0042` - 42ème facture globale émise, pour le client dont le trigramme est `DUP`.
- Exemple 2 : `FAC-HEO-0043` - 43ème facture globale, émise pour le client `HEO`.

**Attention** : la séquence `0042`, `0043` est globale (toutes sociétés clientes confondues), **pas** par client. Le trigramme client est inclus pour faciliter la lecture visuelle ; il ne reflète pas une numérotation parallèle.

La colonne `factures.numero_seq` porte le numéro légal (ici `42`, `43`), celui à citer en cas de contrôle.

---

## Vérifications possibles par la comptabilité

- **Continuité** : `SELECT MAX(numero_seq) - MIN(numero_seq) + 1 - COUNT(*) FROM factures;` doit retourner `0` (aucun trou).
- **Unicité** : `SELECT numero_seq, COUNT(*) FROM factures GROUP BY numero_seq HAVING COUNT(*) > 1;` doit retourner `0` ligne.
- **Ordre chronologique** : `SELECT numero_seq, date_emission FROM factures ORDER BY numero_seq;` - `date_emission` doit être non strictement décroissante (deux factures émises le même jour peuvent avoir des numéros consécutifs dans l'ordre d'insertion).
- **Absence de DELETE** : l'absence de ligne dans les logs Postgres pour des opérations `DELETE` sur `factures` peut être vérifiée via les logs Supabase si activés.

---

## Limites connues

- **Panne matérielle en cours d'insertion** : un crash physique de la base Postgres pendant la transaction pourrait théoriquement interrompre l'insertion avant validation. Le verrou et le ROLLBACK automatique garantissent qu'aucun numéro n'est consommé dans ce cas ; la prochaine insertion reprendra au même numéro. Supabase hébergé chez AWS dispose de sauvegardes continues (Point-In-Time Recovery) qui mitigent ce risque.
- **Migration/restoration depuis backup** : en cas de restauration partielle de la base, il faut s'assurer que la restauration inclut bien la totalité des factures émises depuis le dernier backup consistent. Le mécanisme de suivi `created_at` permet cet audit.
- **Multi-exercice** : la séquence est globale sur la vie du produit (pas remise à zéro chaque année). C'est conforme au Code de commerce qui impose une numérotation continue, pas nécessairement par exercice.

---

## Contact

Pour toute question technique : équipe SOLUVIA.
Pour toute question de conformité : se référer aux articles cités en introduction, ou consulter un expert-comptable habilité.
