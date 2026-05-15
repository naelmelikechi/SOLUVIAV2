-- Integrite legale des factures :
--   * CHECK signe montants (avoir <= 0, facture >= 0)
--   * CHECK coherence TTC = HT + TVA (tolerance 1 centime sur l'arrondi)
--   * UNIQUE (facture_origine_id) WHERE est_avoir : un seul avoir par facture
--   * Trigger freeze : interdit la modification des champs financiers et
--     identifiants apres emission (legal FR : une facture emise est immuable,
--     pour ajuster il faut un avoir).

ALTER TABLE factures
  DROP CONSTRAINT IF EXISTS factures_signe_montants_check;

ALTER TABLE factures
  ADD CONSTRAINT factures_signe_montants_check
  CHECK (
    (est_avoir = TRUE
      AND montant_ht <= 0
      AND montant_tva <= 0
      AND montant_ttc <= 0)
    OR
    (est_avoir = FALSE
      AND montant_ht >= 0
      AND montant_tva >= 0
      AND montant_ttc >= 0)
  );

COMMENT ON CONSTRAINT factures_signe_montants_check ON factures IS
  'Garantit que les montants suivent le signe selon est_avoir (avoir <= 0, facture >= 0).';

ALTER TABLE factures
  DROP CONSTRAINT IF EXISTS factures_ttc_coherent_check;

ALTER TABLE factures
  ADD CONSTRAINT factures_ttc_coherent_check
  CHECK (ABS(montant_ttc - (montant_ht + montant_tva)) <= 0.01);

COMMENT ON CONSTRAINT factures_ttc_coherent_check ON factures IS
  'Garantit que montant_ttc = montant_ht + montant_tva (tolerance 1 cent pour rounding).';

-- Un seul avoir par facture origine. Sans cet index, deux admins simultanes
-- peuvent creer deux avoirs sur la meme facture (cf race condition relevee
-- dans avoirs.ts:196-205 qui ne checke que cote app).
DROP INDEX IF EXISTS uq_factures_avoir_par_origine;
CREATE UNIQUE INDEX uq_factures_avoir_par_origine
  ON factures (facture_origine_id)
  WHERE est_avoir = TRUE AND facture_origine_id IS NOT NULL;

-- Trigger freeze : empeche la modification post-emission des champs legaux.
-- Colonnes immutables une fois sorties du statut 'a_emettre' :
--   ref, numero_seq, projet_id, client_id, mois_concerne, date_emission,
--   date_echeance, montant_ht, taux_tva, montant_tva, montant_ttc, est_avoir,
--   avoir_motif, facture_origine_id, objet, conditions_reglement, created_by.
-- Colonnes mutables post-emission :
--   statut (en_retard, payee, avoir), email_envoye, email_envoye_at,
--   email_last_attempt_at, email_erreur, odoo_id, pdf_url, updated_at.
CREATE OR REPLACE FUNCTION freeze_facture_after_emission()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.statut = 'a_emettre' THEN
    -- Avant emission : tout est modifiable.
    RETURN NEW;
  END IF;

  IF NEW.ref IS DISTINCT FROM OLD.ref THEN
    RAISE EXCEPTION 'Facture %: ref est immutable apres emission', OLD.ref;
  END IF;
  IF NEW.numero_seq IS DISTINCT FROM OLD.numero_seq THEN
    RAISE EXCEPTION 'Facture %: numero_seq est immutable apres emission', OLD.ref;
  END IF;
  IF NEW.projet_id IS DISTINCT FROM OLD.projet_id THEN
    RAISE EXCEPTION 'Facture %: projet_id est immutable apres emission', OLD.ref;
  END IF;
  IF NEW.client_id IS DISTINCT FROM OLD.client_id THEN
    RAISE EXCEPTION 'Facture %: client_id est immutable apres emission', OLD.ref;
  END IF;
  IF NEW.mois_concerne IS DISTINCT FROM OLD.mois_concerne THEN
    RAISE EXCEPTION 'Facture %: mois_concerne est immutable apres emission', OLD.ref;
  END IF;
  IF NEW.date_emission IS DISTINCT FROM OLD.date_emission THEN
    RAISE EXCEPTION 'Facture %: date_emission est immutable apres emission', OLD.ref;
  END IF;
  IF NEW.date_echeance IS DISTINCT FROM OLD.date_echeance THEN
    RAISE EXCEPTION 'Facture %: date_echeance est immutable apres emission', OLD.ref;
  END IF;
  IF NEW.montant_ht IS DISTINCT FROM OLD.montant_ht THEN
    RAISE EXCEPTION 'Facture %: montant_ht est immutable apres emission', OLD.ref;
  END IF;
  IF NEW.taux_tva IS DISTINCT FROM OLD.taux_tva THEN
    RAISE EXCEPTION 'Facture %: taux_tva est immutable apres emission', OLD.ref;
  END IF;
  IF NEW.montant_tva IS DISTINCT FROM OLD.montant_tva THEN
    RAISE EXCEPTION 'Facture %: montant_tva est immutable apres emission', OLD.ref;
  END IF;
  IF NEW.montant_ttc IS DISTINCT FROM OLD.montant_ttc THEN
    RAISE EXCEPTION 'Facture %: montant_ttc est immutable apres emission', OLD.ref;
  END IF;
  IF NEW.est_avoir IS DISTINCT FROM OLD.est_avoir THEN
    RAISE EXCEPTION 'Facture %: est_avoir est immutable apres emission', OLD.ref;
  END IF;
  IF NEW.avoir_motif IS DISTINCT FROM OLD.avoir_motif THEN
    RAISE EXCEPTION 'Facture %: avoir_motif est immutable apres emission', OLD.ref;
  END IF;
  IF NEW.facture_origine_id IS DISTINCT FROM OLD.facture_origine_id THEN
    RAISE EXCEPTION 'Facture %: facture_origine_id est immutable apres emission', OLD.ref;
  END IF;
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'Facture %: created_by est immutable apres emission', OLD.ref;
  END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Facture %: created_at est immutable apres emission', OLD.ref;
  END IF;
  -- objet et conditions_reglement apparaissent sur le PDF, donc figes legal.
  IF NEW.objet IS DISTINCT FROM OLD.objet THEN
    RAISE EXCEPTION 'Facture %: objet est immutable apres emission', OLD.ref;
  END IF;
  IF NEW.conditions_reglement IS DISTINCT FROM OLD.conditions_reglement THEN
    RAISE EXCEPTION 'Facture %: conditions_reglement est immutable apres emission', OLD.ref;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION freeze_facture_after_emission() SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_factures_freeze_after_emission ON factures;
CREATE TRIGGER trg_factures_freeze_after_emission
BEFORE UPDATE ON factures
FOR EACH ROW EXECUTE FUNCTION freeze_facture_after_emission();
