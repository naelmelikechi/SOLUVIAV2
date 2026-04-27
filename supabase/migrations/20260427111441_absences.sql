-- Migration vers une saisie d absence par periode (table dediee).
-- Spec : docs/superpowers/specs/2026-04-27-absences-periode-design.md

-- 1. Schema
CREATE TYPE absence_type AS ENUM ('conges', 'maladie');

CREATE TABLE absences (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type            absence_type NOT NULL,
  date_debut      DATE NOT NULL,
  date_fin        DATE NOT NULL,
  demi_jour_debut BOOLEAN NOT NULL DEFAULT false,
  demi_jour_fin   BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_dates CHECK (date_fin >= date_debut),
  CONSTRAINT chk_demi_jour_meme_jour CHECK (
    NOT (date_debut = date_fin AND demi_jour_debut AND demi_jour_fin)
  )
);

CREATE INDEX idx_absences_user_dates ON absences (user_id, date_debut, date_fin);

CREATE TRIGGER absences_updated_at
  BEFORE UPDATE ON absences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- 2. RLS
ALTER TABLE absences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "absences_select_own" ON absences
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "absences_select_admin" ON absences
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "absences_modify_own" ON absences
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 3. Migration des donnees existantes : convertir saisies_temps (CON/MAL) en absences
-- Note : la colonne est_absence n existe pas sur le remote ; on identifie les
-- saisies d absence uniquement via le projet_id (ref 9999-CON-ABS / 9998-MAL-ABS).
DO $$
DECLARE
  cur_user UUID;
  cur_type absence_type;
  cur_start DATE;
  cur_end DATE;
  cur_start_hours NUMERIC;
  cur_end_hours NUMERIC;
  prev_date DATE;
  rec RECORD;
BEGIN
  cur_user := NULL;
  cur_type := NULL;
  cur_start := NULL;
  cur_end := NULL;
  cur_start_hours := NULL;
  cur_end_hours := NULL;
  prev_date := NULL;

  FOR rec IN
    SELECT
      st.user_id,
      CASE p.ref
        WHEN '9999-CON-ABS' THEN 'conges'::absence_type
        WHEN '9998-MAL-ABS' THEN 'maladie'::absence_type
      END AS type,
      st.date,
      st.heures
    FROM saisies_temps st
    JOIN projets p ON p.id = st.projet_id
    WHERE p.ref IN ('9999-CON-ABS', '9998-MAL-ABS')
    ORDER BY st.user_id, type, st.date
  LOOP
    IF cur_user IS NULL OR
       rec.user_id <> cur_user OR
       rec.type <> cur_type OR
       rec.date <> prev_date + 1 THEN
      -- Flush previous group
      IF cur_user IS NOT NULL THEN
        INSERT INTO absences (user_id, type, date_debut, date_fin, demi_jour_debut, demi_jour_fin)
        VALUES (
          cur_user,
          cur_type,
          cur_start,
          cur_end,
          cur_start_hours = 3.5,
          -- Sur un jour unique avec demi-journee, demi_jour_fin = false pour
          -- eviter la violation de chk_demi_jour_meme_jour
          CASE WHEN cur_start = cur_end THEN false ELSE cur_end_hours = 3.5 END
        );
      END IF;
      -- Start new group
      cur_user := rec.user_id;
      cur_type := rec.type;
      cur_start := rec.date;
      cur_end := rec.date;
      cur_start_hours := rec.heures;
      cur_end_hours := rec.heures;
    ELSE
      cur_end := rec.date;
      cur_end_hours := rec.heures;
    END IF;
    prev_date := rec.date;
  END LOOP;

  -- Flush last group
  IF cur_user IS NOT NULL THEN
    INSERT INTO absences (user_id, type, date_debut, date_fin, demi_jour_debut, demi_jour_fin)
    VALUES (
      cur_user,
      cur_type,
      cur_start,
      cur_end,
      cur_start_hours = 3.5,
      CASE WHEN cur_start = cur_end THEN false ELSE cur_end_hours = 3.5 END
    );
  END IF;
END $$;

-- 4. Cleanup : supprimer les saisies vers les projets systeme et leurs axes orphelins
DELETE FROM saisies_temps_axes
  WHERE saisie_id IN (
    SELECT st.id FROM saisies_temps st
    JOIN projets p ON p.id = st.projet_id
    WHERE p.ref IN ('9999-CON-ABS', '9998-MAL-ABS', '9997-FER-ABS')
  );

DELETE FROM saisies_temps
  WHERE projet_id IN (
    SELECT id FROM projets WHERE ref IN ('9999-CON-ABS', '9998-MAL-ABS', '9997-FER-ABS')
  );

-- 5. Cleanup : supprimer les projets systeme et leurs clients
DELETE FROM projets WHERE ref IN ('9999-CON-ABS', '9998-MAL-ABS', '9997-FER-ABS');
DELETE FROM clients WHERE id IN (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003'
);
