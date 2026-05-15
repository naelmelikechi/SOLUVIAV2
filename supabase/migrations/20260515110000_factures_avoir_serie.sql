-- Avoirs : prefixe et sequence dedies (conformite legale FR)
--
-- Avant cette migration tous les avoirs portaient le prefixe "FAC-" et
-- partageaient la sequence numero_seq avec les factures classiques. La loi
-- francaise exige une numerotation continue PAR SERIE - un avoir et une
-- facture sont deux series distinctes.
--
-- A partir de cette migration :
--   * Nouveaux avoirs (est_avoir = TRUE) : prefixe AVR-<trigramme>-, sequence
--     dediee = COALESCE(MAX(numero_seq) WHERE est_avoir) + 1.
--   * Nouvelles factures (est_avoir = FALSE) : prefixe FAC-<trigramme>-,
--     sequence dediee = COALESCE(MAX(numero_seq) WHERE NOT est_avoir) + 1.
--   * Les avoirs deja emis (s'il y en a) conservent leur ref historique
--     "FAC-..." pour ne pas casser l'audit trail. La nouvelle serie AVR
--     redemarre proprement.

CREATE OR REPLACE FUNCTION generate_facture_ref()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_trigramme TEXT;
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

  LOCK TABLE factures IN SHARE ROW EXCLUSIVE MODE;

  IF NEW.est_avoir THEN
    v_prefix := 'AVR';
    SELECT COALESCE(MAX(numero_seq), 0) + 1 INTO v_num
      FROM factures WHERE est_avoir = TRUE;
  ELSE
    v_prefix := 'FAC';
    SELECT COALESCE(MAX(numero_seq), 0) + 1 INTO v_num
      FROM factures WHERE est_avoir = FALSE;
  END IF;

  NEW.numero_seq := v_num;
  NEW.ref := v_prefix || '-' || v_trigramme || '-' || lpad(v_num::TEXT, 4, '0');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION assign_facture_ref_on_send()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_trigramme TEXT;
  v_num INTEGER;
  v_prefix TEXT;
BEGIN
  IF OLD.statut = 'a_emettre' AND NEW.statut <> 'a_emettre' AND NEW.ref IS NULL THEN
    SELECT c.trigramme INTO v_trigramme FROM clients c WHERE c.id = NEW.client_id;

    LOCK TABLE factures IN SHARE ROW EXCLUSIVE MODE;

    IF NEW.est_avoir THEN
      v_prefix := 'AVR';
      SELECT COALESCE(MAX(numero_seq), 0) + 1 INTO v_num
        FROM factures WHERE est_avoir = TRUE;
    ELSE
      v_prefix := 'FAC';
      SELECT COALESCE(MAX(numero_seq), 0) + 1 INTO v_num
        FROM factures WHERE est_avoir = FALSE;
    END IF;

    NEW.numero_seq := v_num;
    NEW.ref := v_prefix || '-' || v_trigramme || '-' || lpad(v_num::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

-- Pin search_path comme les autres fonctions de facturation (cf 20260424123743
-- et 20260511142735) pour eviter les search_path hijacks et coherence advisor.
ALTER FUNCTION generate_facture_ref() SET search_path = public, pg_temp;
ALTER FUNCTION assign_facture_ref_on_send() SET search_path = public, pg_temp;

-- Garantit l'unicite de numero_seq DANS chaque serie. Les brouillons
-- (numero_seq IS NULL) ne sont pas concernes.
DROP INDEX IF EXISTS uq_factures_numero_seq_facture;
DROP INDEX IF EXISTS uq_factures_numero_seq_avoir;

CREATE UNIQUE INDEX uq_factures_numero_seq_facture
  ON factures (numero_seq)
  WHERE numero_seq IS NOT NULL AND est_avoir = FALSE;

CREATE UNIQUE INDEX uq_factures_numero_seq_avoir
  ON factures (numero_seq)
  WHERE numero_seq IS NOT NULL AND est_avoir = TRUE;
