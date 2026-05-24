-- Phase 2 : triggers numerotation/transitions/pdf_locked + RPCs publiques.

-- Numerotation alloue ref+seq a la premiere transition brouillon -> envoye.
-- Format : DEV-<code_societe>-NNNN (sequence par societe emettrice).
CREATE OR REPLACE FUNCTION assign_devis_ref_on_send()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_code TEXT;
  v_num  INTEGER;
BEGIN
  IF OLD.statut = 'brouillon' AND NEW.statut = 'envoye' AND NEW.ref IS NULL THEN
    SELECT code INTO v_code FROM societes_emettrices WHERE id = NEW.societe_emettrice_id;
    IF v_code IS NULL THEN
      RAISE EXCEPTION 'societe_emettrice introuvable pour devis %', NEW.id;
    END IF;

    LOCK TABLE devis IN SHARE ROW EXCLUSIVE MODE;

    SELECT COALESCE(MAX(numero_seq), 0) + 1 INTO v_num
      FROM devis WHERE societe_emettrice_id = NEW.societe_emettrice_id;

    NEW.numero_seq := v_num;
    NEW.ref := 'DEV-' || v_code || '-' || lpad(v_num::TEXT, 4, '0');
    NEW.date_emission := CURRENT_DATE;
    NEW.date_envoi := now();

    -- Token UUID v4 + expiration = date_validite + 7j (ou +90j si pas de date_validite)
    NEW.acceptation_token := gen_random_uuid()::TEXT;
    NEW.acceptation_token_expire_at := COALESCE(
      (NEW.date_validite + INTERVAL '7 days')::TIMESTAMPTZ,
      now() + INTERVAL '97 days'
    );

    -- pdf_locked set par l action server (apres rendu du PDF), pas ici.
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION assign_devis_ref_on_send() SET search_path = public, pg_temp;

CREATE TRIGGER trg_devis_assign_ref_on_send
  BEFORE UPDATE ON devis
  FOR EACH ROW EXECUTE FUNCTION assign_devis_ref_on_send();

-- Transitions de statut autorisees.
CREATE OR REPLACE FUNCTION check_devis_transition()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.statut = NEW.statut THEN RETURN NEW; END IF;

  -- Map des transitions legales
  IF NOT (
    (OLD.statut = 'brouillon' AND NEW.statut IN ('envoye', 'annule'))
    OR (OLD.statut = 'envoye' AND NEW.statut IN ('accepte', 'refuse', 'expire', 'remplace'))
  ) THEN
    RAISE EXCEPTION 'Transition statut devis illegale: % -> %', OLD.statut, NEW.statut;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION check_devis_transition() SET search_path = public, pg_temp;

CREATE TRIGGER trg_devis_check_transition
  BEFORE UPDATE ON devis
  FOR EACH ROW EXECUTE FUNCTION check_devis_transition();

-- Immuabilite apres envoi : ref, numero_seq, montants, lignes (gere par
-- trigger devis_lignes), pdf_url une fois locked.
CREATE OR REPLACE FUNCTION freeze_devis_after_send()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.statut != 'brouillon' THEN
    IF NEW.ref IS DISTINCT FROM OLD.ref THEN
      RAISE EXCEPTION 'Devis %: ref immutable apres envoi', OLD.ref;
    END IF;
    IF NEW.numero_seq IS DISTINCT FROM OLD.numero_seq THEN
      RAISE EXCEPTION 'Devis %: numero_seq immutable apres envoi', OLD.ref;
    END IF;
    IF NEW.societe_emettrice_id IS DISTINCT FROM OLD.societe_emettrice_id THEN
      RAISE EXCEPTION 'Devis %: societe_emettrice_id immutable apres envoi', OLD.ref;
    END IF;
    IF OLD.pdf_locked AND NEW.pdf_url IS DISTINCT FROM OLD.pdf_url THEN
      RAISE EXCEPTION 'Devis %: pdf_url verrouille', OLD.ref;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION freeze_devis_after_send() SET search_path = public, pg_temp;

CREATE TRIGGER trg_devis_freeze_after_send
  BEFORE UPDATE ON devis
  FOR EACH ROW EXECUTE FUNCTION freeze_devis_after_send();

-- Table de log des consultations publiques (utile pour relances).
CREATE TABLE devis_public_views (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  devis_id    UUID NOT NULL REFERENCES devis(id) ON DELETE CASCADE,
  token       TEXT NOT NULL,
  ip          INET,
  user_agent  TEXT,
  viewed_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_devis_public_views_devis ON devis_public_views (devis_id);

ALTER TABLE devis_public_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY devis_public_views_admin_select ON devis_public_views FOR SELECT TO authenticated
  USING (get_user_role() IN ('admin', 'superadmin'));

-- RPC publique : lit un devis par son token. Loggue la consultation.
-- Renvoie une vue restreinte (pas notes_internes, pas acceptation_*).
CREATE OR REPLACE FUNCTION get_devis_public(p_token TEXT, p_ip INET DEFAULT NULL, p_user_agent TEXT DEFAULT NULL)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_devis RECORD;
  v_lignes JSON;
  v_societe RECORD;
  v_client RECORD;
BEGIN
  SELECT d.id, d.ref, d.statut, d.objet, d.date_emission, d.date_validite,
         d.acceptation_token_expire_at,
         d.montant_ht, d.montant_tva, d.montant_ttc,
         d.conditions_reglement, d.societe_emettrice_id, d.client_id
    INTO v_devis
    FROM devis d
   WHERE d.acceptation_token = p_token
     AND d.acceptation_token_expire_at > now();

  IF v_devis.id IS NULL THEN
    RAISE EXCEPTION 'Devis introuvable ou lien expire' USING ERRCODE = 'P0002';
  END IF;

  IF v_devis.statut NOT IN ('envoye', 'accepte', 'refuse') THEN
    RAISE EXCEPTION 'Devis non consultable (statut=%)', v_devis.statut USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO devis_public_views (devis_id, token, ip, user_agent)
  VALUES (v_devis.id, p_token, p_ip, p_user_agent);

  SELECT json_agg(json_build_object(
    'ordre', l.ordre, 'libelle', l.libelle, 'description', l.description,
    'quantite', l.quantite, 'prix_unitaire_ht', l.prix_unitaire_ht,
    'taux_tva', l.taux_tva,
    'total_ht', l.total_ht, 'total_tva', l.total_tva, 'total_ttc', l.total_ttc
  ) ORDER BY l.ordre) INTO v_lignes
    FROM devis_lignes l WHERE l.devis_id = v_devis.id;

  SELECT code, raison_sociale, forme_juridique, siret, tva_intracom,
         adresse, code_postal, ville, pays, email_contact,
         banque_nom, banque_iban, banque_bic, mentions_legales,
         conditions_reglement_default, logo_url
    INTO v_societe FROM societes_emettrices WHERE id = v_devis.societe_emettrice_id;

  SELECT raison_sociale, adresse, localisation
    INTO v_client FROM clients WHERE id = v_devis.client_id;

  RETURN json_build_object(
    'devis', row_to_json(v_devis),
    'lignes', COALESCE(v_lignes, '[]'::JSON),
    'societe', row_to_json(v_societe),
    'client', row_to_json(v_client)
  );
END;
$$;

ALTER FUNCTION get_devis_public(TEXT, INET, TEXT) SET search_path = public, pg_temp;
GRANT EXECUTE ON FUNCTION get_devis_public(TEXT, INET, TEXT) TO anon, authenticated;

-- RPC publique : accepte le devis. Race-safe via SELECT FOR UPDATE.
CREATE OR REPLACE FUNCTION accept_devis_public(
  p_token TEXT, p_nom TEXT, p_email TEXT,
  p_ip INET DEFAULT NULL, p_user_agent TEXT DEFAULT NULL
)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_devis_id UUID;
  v_statut statut_devis;
  v_ref TEXT;
BEGIN
  IF length(trim(p_nom)) < 2 THEN
    RAISE EXCEPTION 'Nom signataire requis' USING ERRCODE = 'P0001';
  END IF;
  IF p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Email invalide' USING ERRCODE = 'P0001';
  END IF;

  SELECT id, statut, ref INTO v_devis_id, v_statut, v_ref
    FROM devis WHERE acceptation_token = p_token
      AND acceptation_token_expire_at > now()
    FOR UPDATE;

  IF v_devis_id IS NULL THEN
    RAISE EXCEPTION 'Devis introuvable ou lien expire' USING ERRCODE = 'P0002';
  END IF;
  IF v_statut != 'envoye' THEN
    RAISE EXCEPTION 'Devis non acceptable (statut=%)', v_statut USING ERRCODE = 'P0001';
  END IF;

  UPDATE devis SET
    statut = 'accepte',
    date_acceptation = now(),
    acceptation_nom = trim(p_nom),
    acceptation_email = lower(trim(p_email)),
    acceptation_ip = p_ip,
    acceptation_user_agent = p_user_agent
  WHERE id = v_devis_id;

  RETURN json_build_object('success', true, 'ref', v_ref);
END;
$$;

ALTER FUNCTION accept_devis_public(TEXT, TEXT, TEXT, INET, TEXT) SET search_path = public, pg_temp;
GRANT EXECUTE ON FUNCTION accept_devis_public(TEXT, TEXT, TEXT, INET, TEXT) TO anon, authenticated;

-- RPC publique : refuse le devis avec motif.
CREATE OR REPLACE FUNCTION refuse_devis_public(p_token TEXT, p_motif TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_devis_id UUID;
  v_statut statut_devis;
  v_ref TEXT;
BEGIN
  SELECT id, statut, ref INTO v_devis_id, v_statut, v_ref
    FROM devis WHERE acceptation_token = p_token
      AND acceptation_token_expire_at > now()
    FOR UPDATE;

  IF v_devis_id IS NULL THEN
    RAISE EXCEPTION 'Devis introuvable ou lien expire' USING ERRCODE = 'P0002';
  END IF;
  IF v_statut != 'envoye' THEN
    RAISE EXCEPTION 'Devis non refusable (statut=%)', v_statut USING ERRCODE = 'P0001';
  END IF;

  UPDATE devis SET
    statut = 'refuse',
    date_refus = now(),
    refus_motif = NULLIF(trim(p_motif), '')
  WHERE id = v_devis_id;

  RETURN json_build_object('success', true, 'ref', v_ref);
END;
$$;

ALTER FUNCTION refuse_devis_public(TEXT, TEXT) SET search_path = public, pg_temp;
GRANT EXECUTE ON FUNCTION refuse_devis_public(TEXT, TEXT) TO anon, authenticated;
