-- Durcissement facturation (audit 2026-07-23) : deux gardes de defense en
-- profondeur au niveau DB.
--
-- 1. Garde multi-societe sur la numerotation.
--    Depuis 20260610130000, la serie est UNIQUE a prefixe fixe FAC-SOL-/AVR-SOL-
--    (choix legal : SOLUVIA emet ses propres factures, art. 242 nonies A CGI).
--    Mais rien n'empechait d'emettre une facture portee par une AUTRE societe
--    emettrice (ex. DIGIVIA une fois activee) : elle aurait recu une ref
--    FAC-SOL-XXXX sur la serie legale de SOLUVIA. On refuse desormais
--    l'attribution d'un numero pour toute societe non legacy_ref_format
--    (seule SOL l'est). L'activation d'une 2e societe DEVRA passer par une
--    migration de numerotation par societe (cf. 20260524110000, runbook DIGIVIA).
--
-- 2. Interdiction DB du DELETE d'une facture emise (numerotation gapless).
--    La policy RLS admin_delete_brouillon_factures ne protege pas les clients
--    service_role (crons, scripts) qui la bypassent. Un trigger BEFORE DELETE
--    ferme ce trou : une facture avec ref/numero_seq attribue (= emise) ne peut
--    jamais etre supprimee, quel que soit le role. Un brouillon (ref NULL)
--    reste supprimable.

-- ---------------------------------------------------------------------------
-- 1. generate_facture_ref / assign_facture_ref_on_send : garde societe
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION generate_facture_ref()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_num INTEGER;
  v_prefix TEXT;
  v_legacy BOOLEAN;
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

  -- Garde multi-societe : la serie unique FAC-SOL est reservee a la societe
  -- legacy (SOL). NULL tolere (factures historiques sans societe rattachee).
  IF NEW.societe_emettrice_id IS NOT NULL THEN
    SELECT legacy_ref_format INTO v_legacy
      FROM societes_emettrices WHERE id = NEW.societe_emettrice_id;
    IF v_legacy IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'Numerotation non configuree pour cette societe emettrice : la serie unique FAC-SOL est reservee a SOLUVIA. Implementer la numerotation par societe avant d''activer une 2e societe (cf. runbook DIGIVIA).';
    END IF;
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
  v_legacy BOOLEAN;
BEGIN
  IF OLD.statut = 'a_emettre' AND NEW.statut <> 'a_emettre' AND NEW.ref IS NULL THEN
    -- Garde multi-societe (meme regle que generate_facture_ref).
    IF NEW.societe_emettrice_id IS NOT NULL THEN
      SELECT legacy_ref_format INTO v_legacy
        FROM societes_emettrices WHERE id = NEW.societe_emettrice_id;
      IF v_legacy IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'Numerotation non configuree pour cette societe emettrice : la serie unique FAC-SOL est reservee a SOLUVIA. Implementer la numerotation par societe avant d''activer une 2e societe (cf. runbook DIGIVIA).';
      END IF;
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
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Trigger BEFORE DELETE : une facture emise n'est jamais supprimable
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION forbid_facture_emise_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.ref IS NOT NULL OR OLD.numero_seq IS NOT NULL THEN
    RAISE EXCEPTION 'Suppression interdite : la facture % est emise (numerotation gapless, art. 289 CGI). Emettre un avoir a la place.', OLD.ref;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_factures_forbid_emise_delete ON factures;
CREATE TRIGGER trg_factures_forbid_emise_delete
  BEFORE DELETE ON factures
  FOR EACH ROW
  EXECUTE FUNCTION forbid_facture_emise_delete();
