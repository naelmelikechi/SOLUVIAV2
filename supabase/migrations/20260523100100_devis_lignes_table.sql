-- Phase 2 : lignes du devis. Cascade delete avec le devis parent.
-- Trigger recalcule les totaux du devis a chaque insert/update/delete.

CREATE TABLE devis_lignes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  devis_id         UUID NOT NULL REFERENCES devis(id) ON DELETE CASCADE,
  ordre            INTEGER NOT NULL,
  libelle          TEXT NOT NULL,
  description      TEXT,
  quantite         NUMERIC(10, 2) NOT NULL DEFAULT 1 CHECK (quantite > 0),
  prix_unitaire_ht NUMERIC(12, 2) NOT NULL CHECK (prix_unitaire_ht >= 0),
  taux_tva         NUMERIC(5, 2) NOT NULL DEFAULT 20 CHECK (taux_tva >= 0),
  total_ht         NUMERIC(12, 2) NOT NULL,
  total_tva        NUMERIC(12, 2) NOT NULL,
  total_ttc        NUMERIC(12, 2) NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_devis_lignes_devis_ordre ON devis_lignes (devis_id, ordre);

CREATE TRIGGER trg_devis_lignes_updated_at
  BEFORE UPDATE ON devis_lignes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE devis_lignes ENABLE ROW LEVEL SECURITY;

CREATE POLICY devis_lignes_admin_all ON devis_lignes FOR ALL TO authenticated
  USING (get_user_role() IN ('admin', 'superadmin'))
  WITH CHECK (get_user_role() IN ('admin', 'superadmin'));

-- Recalcul totaux devis a chaque modification de ligne. Rejette si le
-- devis n est plus en brouillon (immuabilite legale apres envoi).
CREATE OR REPLACE FUNCTION recompute_devis_totaux()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_devis_id UUID;
  v_statut   statut_devis;
  v_ht       NUMERIC(12, 2);
  v_tva      NUMERIC(12, 2);
  v_ttc      NUMERIC(12, 2);
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_devis_id := OLD.devis_id;
  ELSE
    v_devis_id := NEW.devis_id;
  END IF;

  SELECT statut INTO v_statut FROM devis WHERE id = v_devis_id;
  IF v_statut IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF v_statut != 'brouillon' THEN
    RAISE EXCEPTION 'Devis %: lignes immutables apres envoi (statut=%)', v_devis_id, v_statut;
  END IF;

  SELECT
    COALESCE(SUM(total_ht), 0),
    COALESCE(SUM(total_tva), 0),
    COALESCE(SUM(total_ttc), 0)
  INTO v_ht, v_tva, v_ttc
  FROM devis_lignes WHERE devis_id = v_devis_id;

  UPDATE devis
     SET montant_ht = v_ht, montant_tva = v_tva, montant_ttc = v_ttc
   WHERE id = v_devis_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

ALTER FUNCTION recompute_devis_totaux() SET search_path = public, pg_temp;

CREATE TRIGGER trg_devis_lignes_recompute
  AFTER INSERT OR UPDATE OR DELETE ON devis_lignes
  FOR EACH ROW EXECUTE FUNCTION recompute_devis_totaux();

COMMENT ON TABLE devis_lignes IS
  'Lignes libres du devis (libelle, qte, PU HT, TVA, totaux). Recalcul totaux devis automatique. Immuables apres envoi.';
