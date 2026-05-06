-- Refactor : le ref + numero_seq ne sont attribues qu'au moment de l'envoi
-- (passage du statut 'a_emettre' a 'emise' ou 'avoir'). Les brouillons ont
-- ref=NULL et numero_seq=NULL, donc supprimer un brouillon ne casse pas la
-- numerotation gapless legale.

-- Modif du trigger BEFORE INSERT : skip pour les brouillons
CREATE OR REPLACE FUNCTION generate_facture_ref()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_trigramme TEXT;
  v_num INTEGER;
BEGIN
  -- Brouillon : pas de ref ni numero_seq tant que pas envoye
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
  SELECT COALESCE(MAX(numero_seq), 0) + 1 INTO v_num FROM factures;

  NEW.numero_seq := v_num;
  NEW.ref := 'FAC-' || v_trigramme || '-' || lpad(v_num::TEXT, 4, '0');
  RETURN NEW;
END;
$$;

-- Nouveau trigger BEFORE UPDATE : attribue ref + numero_seq au moment ou
-- une facture sort du statut 'a_emettre'.
CREATE OR REPLACE FUNCTION assign_facture_ref_on_send()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_trigramme TEXT;
  v_num INTEGER;
BEGIN
  -- Transition brouillon -> envoye : attribuer le ref final
  IF OLD.statut = 'a_emettre' AND NEW.statut <> 'a_emettre' AND NEW.ref IS NULL THEN
    SELECT c.trigramme INTO v_trigramme FROM clients c WHERE c.id = NEW.client_id;

    LOCK TABLE factures IN SHARE ROW EXCLUSIVE MODE;
    SELECT COALESCE(MAX(numero_seq), 0) + 1 INTO v_num FROM factures;

    NEW.numero_seq := v_num;
    NEW.ref := 'FAC-' || v_trigramme || '-' || lpad(v_num::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_factures_assign_ref_on_send ON factures;
CREATE TRIGGER trg_factures_assign_ref_on_send
BEFORE UPDATE OF statut ON factures
FOR EACH ROW EXECUTE FUNCTION assign_facture_ref_on_send();
