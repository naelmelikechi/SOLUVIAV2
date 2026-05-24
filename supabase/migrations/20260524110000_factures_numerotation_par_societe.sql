-- Phase 4 : numerotation factures par societe emettrice (CGI 289).
--
-- Avant cette migration, la sequence gapless numero_seq etait globale (toutes
-- societes confondues). En attendant une seule societe (SOLUVIA), c'etait
-- juridiquement OK. Quand DIGIVIA arrivera, sa compta doit avoir sa propre
-- sequence continue (article 289 CGI : numerotation continue par societe).
--
-- Cette migration :
--   1. Ajoute societes_emettrices.legacy_ref_format (BOOLEAN). True pour SOL
--      (preserve le format historique FAC-<TRIGRAMME>-NNNN). False par defaut
--      pour les nouvelles societes -> format FAC-<CODE_SOCIETE>-<TRIGRAMME>-NNNN
--      (evite collision avec les refs SOL deja emises).
--   2. Drop les index uniques globaux sur numero_seq, les recree par societe.
--   3. Update les triggers generate_facture_ref et assign_facture_ref_on_send
--      pour grouper la sequence par societe_emettrice_id et choisir le format
--      selon legacy_ref_format.
--
-- Idempotente sur SOL (sequence inchangee, format inchange).
-- Nouvelles societes : sequence demarre a 1.

-- 1. Flag de format ref legacy
ALTER TABLE societes_emettrices
  ADD COLUMN legacy_ref_format BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE societes_emettrices SET legacy_ref_format = TRUE WHERE code = 'SOL';

COMMENT ON COLUMN societes_emettrices.legacy_ref_format IS
  'True pour SOLUVIA (preserve le format historique FAC-<TRIGRAMME>-NNNN). False par defaut pour les nouvelles societes (format FAC-<CODE>-<TRIGRAMME>-NNNN).';

-- 2. Nouveaux index uniques numero_seq par societe
DROP INDEX IF EXISTS uq_factures_numero_seq_facture;
DROP INDEX IF EXISTS uq_factures_numero_seq_avoir;

CREATE UNIQUE INDEX uq_factures_numero_seq_facture
  ON factures (societe_emettrice_id, numero_seq)
  WHERE numero_seq IS NOT NULL AND est_avoir = FALSE;

CREATE UNIQUE INDEX uq_factures_numero_seq_avoir
  ON factures (societe_emettrice_id, numero_seq)
  WHERE numero_seq IS NOT NULL AND est_avoir = TRUE;

-- 3. Update trigger functions

CREATE OR REPLACE FUNCTION generate_facture_ref()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_trigramme TEXT;
  v_societe_code TEXT;
  v_legacy_format BOOLEAN;
  v_num INTEGER;
  v_prefix TEXT;
BEGIN
  -- Brouillon : pas de ref ni numero_seq tant que pas envoye.
  IF NEW.statut = 'a_emettre' THEN
    NEW.ref := NULL;
    NEW.numero_seq := NULL;
    RETURN NEW;
  END IF;

  IF NEW.ref IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT c.trigramme INTO v_trigramme FROM clients c WHERE c.id = NEW.client_id;
  SELECT s.code, s.legacy_ref_format
    INTO v_societe_code, v_legacy_format
    FROM societes_emettrices s WHERE s.id = NEW.societe_emettrice_id;

  LOCK TABLE factures IN SHARE ROW EXCLUSIVE MODE;

  IF NEW.est_avoir THEN
    v_prefix := 'AVR';
    SELECT COALESCE(MAX(numero_seq), 0) + 1 INTO v_num
      FROM factures
     WHERE est_avoir = TRUE
       AND societe_emettrice_id = NEW.societe_emettrice_id;
  ELSE
    v_prefix := 'FAC';
    SELECT COALESCE(MAX(numero_seq), 0) + 1 INTO v_num
      FROM factures
     WHERE est_avoir = FALSE
       AND societe_emettrice_id = NEW.societe_emettrice_id;
  END IF;

  NEW.numero_seq := v_num;
  IF v_legacy_format THEN
    NEW.ref := v_prefix || '-' || v_trigramme || '-' || lpad(v_num::TEXT, 4, '0');
  ELSE
    NEW.ref := v_prefix || '-' || v_societe_code || '-' || v_trigramme || '-' || lpad(v_num::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION assign_facture_ref_on_send()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_trigramme TEXT;
  v_societe_code TEXT;
  v_legacy_format BOOLEAN;
  v_num INTEGER;
  v_prefix TEXT;
BEGIN
  IF OLD.statut = 'a_emettre' AND NEW.statut <> 'a_emettre' AND NEW.ref IS NULL THEN
    SELECT c.trigramme INTO v_trigramme FROM clients c WHERE c.id = NEW.client_id;
    SELECT s.code, s.legacy_ref_format
      INTO v_societe_code, v_legacy_format
      FROM societes_emettrices s WHERE s.id = NEW.societe_emettrice_id;

    LOCK TABLE factures IN SHARE ROW EXCLUSIVE MODE;

    IF NEW.est_avoir THEN
      v_prefix := 'AVR';
      SELECT COALESCE(MAX(numero_seq), 0) + 1 INTO v_num
        FROM factures
       WHERE est_avoir = TRUE
         AND societe_emettrice_id = NEW.societe_emettrice_id;
    ELSE
      v_prefix := 'FAC';
      SELECT COALESCE(MAX(numero_seq), 0) + 1 INTO v_num
        FROM factures
       WHERE est_avoir = FALSE
         AND societe_emettrice_id = NEW.societe_emettrice_id;
    END IF;

    NEW.numero_seq := v_num;
    IF v_legacy_format THEN
      NEW.ref := v_prefix || '-' || v_trigramme || '-' || lpad(v_num::TEXT, 4, '0');
    ELSE
      NEW.ref := v_prefix || '-' || v_societe_code || '-' || v_trigramme || '-' || lpad(v_num::TEXT, 4, '0');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Pin search_path (coherence advisor + securite)
ALTER FUNCTION generate_facture_ref() SET search_path = public, pg_temp;
ALTER FUNCTION assign_facture_ref_on_send() SET search_path = public, pg_temp;
