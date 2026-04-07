-- Helper: check if current user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: get current user role
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
  SELECT role::TEXT FROM users WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Generate project ref: NNNN-TRI-TYP
CREATE OR REPLACE FUNCTION generate_projet_ref()
RETURNS TRIGGER AS $$
DECLARE
  v_trigramme TEXT;
  v_type_code TEXT;
  v_num INTEGER;
BEGIN
  IF NEW.ref IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT trigramme INTO v_trigramme FROM clients WHERE id = NEW.client_id;
  SELECT code INTO v_type_code FROM typologies_projet WHERE id = NEW.typologie_id;

  v_num := nextval('seq_projet_ref');
  NEW.ref := lpad(v_num::TEXT, 4, '0') || '-' || v_trigramme || '-' || v_type_code;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Generate contract ref: CTR-NNNNN
CREATE OR REPLACE FUNCTION generate_contrat_ref()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.ref IS NOT NULL THEN
    RETURN NEW;
  END IF;

  NEW.ref := 'CTR-' || lpad(nextval('seq_contrat_ref')::TEXT, 5, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Generate invoice ref: FAC-TRI-NNNN (gapless via max+1)
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

-- Auto-generate client trigramme from raison_sociale
CREATE OR REPLACE FUNCTION generate_trigramme()
RETURNS TRIGGER AS $$
DECLARE
  v_tri TEXT;
  v_len INTEGER := 3;
  v_clean TEXT;
BEGIN
  IF NEW.trigramme IS NOT NULL AND NEW.trigramme != '' THEN
    RETURN NEW;
  END IF;

  v_clean := regexp_replace(NEW.raison_sociale, '[^a-zA-Z]', '', 'g');
  v_tri := upper(left(v_clean, v_len));

  WHILE EXISTS (SELECT 1 FROM clients WHERE trigramme = v_tri AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID)) LOOP
    v_len := v_len + 1;
    v_tri := upper(left(v_clean, v_len));
  END LOOP;

  NEW.trigramme := v_tri;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Validate daily hours max (7h per user per day across all projects)
CREATE OR REPLACE FUNCTION check_daily_hours_max()
RETURNS TRIGGER AS $$
DECLARE
  v_total NUMERIC;
BEGIN
  SELECT COALESCE(SUM(heures), 0) INTO v_total
  FROM saisies_temps
  WHERE user_id = NEW.user_id
    AND date = NEW.date
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID);

  IF v_total + NEW.heures > 7 THEN
    RAISE EXCEPTION 'Total heures pour le % depasse 7h (actuel: %, nouveau: %)',
      NEW.date, v_total, NEW.heures;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
