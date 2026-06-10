-- Numerotation factures : serie unique a prefixe FIXE (conformite FR)
--
-- Avant : ref = 'FAC-' || trigramme_client || '-' || seq, avec un compteur
-- numero_seq GLOBAL. Le prefixe variant par client (FAC-HEO, FAC-MEC) sur un
-- compteur global presentait, lu par prefixe, des "series" a trous
-- (FAC-MEC demarrait a 0005, sans 0001-0004) -> ambigu au regard de
-- l'art. 242 nonies A annexe II CGI (sequence continue ; series distinctes
-- admises seulement avec une numerotation PROPRE par serie + justification).
-- SOLUVIA emet ses propres factures (pas un mandataire) -> une seule serie.
--
-- Apres : prefixe FIXE 'SOL' -> 'FAC-SOL-<seq>' (factures) et 'AVR-SOL-<seq>'
-- (avoirs, serie dediee conservee). Le compteur gapless MAX(numero_seq)+1 par
-- serie est INCHANGE : la continuite est preservee (le n6 suit le n5). Les
-- factures deja emises gardent leur ref historique (jamais renumerotees).

CREATE OR REPLACE FUNCTION generate_facture_ref()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
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
  NEW.ref := v_prefix || '-SOL-' || lpad(v_num::TEXT, 4, '0');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION assign_facture_ref_on_send()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_num INTEGER;
  v_prefix TEXT;
BEGIN
  IF OLD.statut = 'a_emettre' AND NEW.statut <> 'a_emettre' AND NEW.ref IS NULL THEN
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
    NEW.ref := v_prefix || '-SOL-' || lpad(v_num::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;
