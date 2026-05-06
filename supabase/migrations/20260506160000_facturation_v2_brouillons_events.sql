-- Facturation v2 : brouillons (statut a_emettre exploite), mode auto/manual,
-- evenements facturables (engagement contrat, etape OPCO REGLE) avec
-- idempotence forte au niveau DB.
--
-- Avant cette migration : createFactures cree les factures directement en
-- 'emise' et envoie l'email immediatement. Le statut 'a_emettre' existait
-- dans l'enum mais n'etait jamais utilise.
--
-- Apres : createFactures cree en 'a_emettre' (= brouillon), puis une action
-- explicite envoie la facture (transition vers 'emise', email + push Odoo).
-- Pareil pour les avoirs.

------------------------------------------------------------
-- 1. Mode de facturation par projet
------------------------------------------------------------
ALTER TABLE projets
  ADD COLUMN IF NOT EXISTS billing_mode text NOT NULL DEFAULT 'auto';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_projets_billing_mode'
  ) THEN
    ALTER TABLE projets
      ADD CONSTRAINT chk_projets_billing_mode
      CHECK (billing_mode IN ('auto','manual'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_projets_billing_mode_manual
  ON projets(billing_mode)
  WHERE billing_mode = 'manual';

------------------------------------------------------------
-- 2. Evenements facturables sur facture_lignes
--    event_type : 'engagement' | 'opco_step' | NULL (= ligne classique)
--    event_source_id : contrats.id pour engagement, eduvia_invoice_steps.id
--                      pour opco_step
------------------------------------------------------------
ALTER TABLE facture_lignes
  ADD COLUMN IF NOT EXISTS event_type text NULL,
  ADD COLUMN IF NOT EXISTS event_source_id uuid NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_facture_lignes_event_type'
  ) THEN
    ALTER TABLE facture_lignes
      ADD CONSTRAINT chk_facture_lignes_event_type
      CHECK (
        event_type IS NULL
        OR event_type IN ('engagement','opco_step')
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_facture_lignes_event_pair'
  ) THEN
    ALTER TABLE facture_lignes
      ADD CONSTRAINT chk_facture_lignes_event_pair
      CHECK (
        (event_type IS NULL AND event_source_id IS NULL)
        OR (event_type IS NOT NULL AND event_source_id IS NOT NULL)
      );
  END IF;
END $$;

------------------------------------------------------------
-- 3. Denormalisation est_avoir sur facture_lignes
--    Necessaire pour l'index UNIQUE partial : on autorise un event a etre
--    refacture si la facture initiale a ete avoirisee. Sans denormaliser,
--    l'index ne peut pas referencer factures.est_avoir.
------------------------------------------------------------
ALTER TABLE facture_lignes
  ADD COLUMN IF NOT EXISTS est_avoir boolean NOT NULL DEFAULT false;

-- Backfill : remplir depuis la facture parente
UPDATE facture_lignes fl
SET est_avoir = COALESCE(
  (SELECT f.est_avoir FROM factures f WHERE f.id = fl.facture_id),
  false
)
WHERE fl.est_avoir = false;

-- Trigger : auto-populate est_avoir lors d'un INSERT sur facture_lignes
CREATE OR REPLACE FUNCTION facture_lignes_set_est_avoir()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  SELECT COALESCE(f.est_avoir, false) INTO NEW.est_avoir
  FROM factures f WHERE f.id = NEW.facture_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_facture_lignes_est_avoir ON facture_lignes;
CREATE TRIGGER trg_facture_lignes_est_avoir
BEFORE INSERT ON facture_lignes
FOR EACH ROW EXECUTE FUNCTION facture_lignes_set_est_avoir();

-- Trigger : si la facture parente bascule est_avoir, propager (rare mais
-- possible quand on transforme une facture en avoir).
CREATE OR REPLACE FUNCTION factures_propagate_est_avoir()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.est_avoir IS DISTINCT FROM OLD.est_avoir THEN
    UPDATE facture_lignes SET est_avoir = NEW.est_avoir WHERE facture_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_factures_propagate_est_avoir ON factures;
CREATE TRIGGER trg_factures_propagate_est_avoir
AFTER UPDATE OF est_avoir ON factures
FOR EACH ROW EXECUTE FUNCTION factures_propagate_est_avoir();

------------------------------------------------------------
-- 4. UNIQUE INDEX partial : garantit l'idempotence des events
--    Un meme event ne peut etre facture qu'une seule fois sur une facture
--    "live" (pas un avoir). Si la facture est ensuite avoirisee, est_avoir
--    bascule a true sur ses lignes -> elles sortent de l'index, et l'event
--    redevient facturable.
------------------------------------------------------------
DROP INDEX IF EXISTS uq_facture_lignes_event_live;
CREATE UNIQUE INDEX uq_facture_lignes_event_live
  ON facture_lignes(event_type, event_source_id)
  WHERE event_type IS NOT NULL AND est_avoir = false;

CREATE INDEX IF NOT EXISTS idx_facture_lignes_contrat_event
  ON facture_lignes(contrat_id, event_type)
  WHERE event_type IS NOT NULL;

------------------------------------------------------------
-- 5. Migration des donnees : HEOLDEMO en mode manual
--    HEOLDEMO est notre client de test specialise (commission 50% HEOL).
--    Tous les autres projets restent en mode auto par defaut.
------------------------------------------------------------
UPDATE projets
SET billing_mode = 'manual'
WHERE id = '48b58cfd-d45b-4c45-a9cd-46a9efeb238d';
