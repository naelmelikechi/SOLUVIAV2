-- Liberation explicite d'un event facture, quand la facture qui le portait a
-- ete integralement avoirisee.
--
-- PROBLEME CORRIGE
-- L'index uq_facture_lignes_event_live garantit qu'un event (engagement /
-- opco_step) n'est facture qu'une fois. Sa clause `est_avoir = false` supposait
-- que l'avoirisation basculerait est_avoir sur les lignes d'origine, via
-- trg_factures_propagate_est_avoir. Ca n'arrive jamais : un avoir est une
-- facture SEPAREE (facture_origine_id), l'origine garde est_avoir = false et
-- ses lignes restent donc dans l'index a vie.
--
-- Cote applicatif, lib/queries/billable-events/derive.ts appliquait la regle
-- inverse : un avoir portant le meme event_source_id "liberait" l'event, qui
-- reapparaissait dans les events facturables. L'UI proposait donc des events
-- que la base rejetait systematiquement en 23505, avec un message trompeur
-- ("facture en parallele par un autre utilisateur"). Constate sur 0016-HEO-APP :
-- 4 engagements de FAC-SOL-0015 (avoirisee par AVR-SOL-0001) reproposes alors
-- qu'ils etaient deja refactures sur FAC-SOL-0017.
--
-- SOLUTION
-- Une colonne event_libere_le materialise la liberation. Elle est posee par
-- trigger a l'emission d'un avoir TOTAL, et sort la ligne de l'index unique.
-- L'app lit la meme colonne : UI et base partagent enfin la meme regle, et une
-- refacturation apres avoir devient possible sans contournement.
--
-- Avoir PARTIEL (prorata rupture, ajustement NPEC) : aucune liberation. Il
-- corrige un montant, il ne rend pas l'event refacturable.

------------------------------------------------------------
-- 1. Colonne de liberation
------------------------------------------------------------
ALTER TABLE facture_lignes
  ADD COLUMN IF NOT EXISTS event_libere_le TIMESTAMPTZ;

COMMENT ON COLUMN facture_lignes.event_libere_le IS
  'Date de liberation de l''event : la facture portant cette ligne a ete integralement avoiree, l''event redevient facturable. NULL = ligne bloquante.';

------------------------------------------------------------
-- 2. Gel post-emission : event_libere_le devient modifiable
------------------------------------------------------------
-- Sans ca, le trigger de liberation ne pourrait pas ecrire sur les lignes
-- d'une facture emise. La colonne rejoint l'allowlist par soustraction, aux
-- cotes de analytic_line_odoo_id et opco_code : elle ne porte aucune valeur
-- legale (ni PDF, ni move Odoo, ni montant), c'est un marqueur de cycle de vie.
CREATE OR REPLACE FUNCTION freeze_facture_lignes_after_emission()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_facture_id UUID;
  v_statut     statut_facture;
  v_ref        TEXT;
BEGIN
  v_facture_id := COALESCE(NEW.facture_id, OLD.facture_id);
  SELECT statut, ref INTO v_statut, v_ref FROM factures WHERE id = v_facture_id;

  IF v_statut IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF v_statut = 'a_emettre' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION
      'Facture %: ajout de ligne interdit apres emission (statut=%). Emettez un avoir.',
      v_ref, v_statut;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'Facture %: suppression de ligne interdite apres emission (statut=%). Emettez un avoir.',
      v_ref, v_statut;
  END IF;

  IF (to_jsonb(NEW) - 'analytic_line_odoo_id' - 'opco_code' - 'event_libere_le')
       IS DISTINCT FROM
     (to_jsonb(OLD) - 'analytic_line_odoo_id' - 'opco_code' - 'event_libere_le') THEN
    RAISE EXCEPTION
      'Facture %: lignes immutables apres emission (statut=%). Seuls analytic_line_odoo_id, opco_code (sync Odoo) et event_libere_le (liberation sur avoir total) sont modifiables.',
      v_ref, v_statut;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION freeze_facture_lignes_after_emission() SET search_path = public, pg_temp;

------------------------------------------------------------
-- 3. Liberation automatique a l'emission d'un avoir TOTAL
------------------------------------------------------------
CREATE OR REPLACE FUNCTION factures_liberer_events_sur_avoir_total()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_origine_ttc NUMERIC(12,2);
  v_avoirs_ttc  NUMERIC(12,2);
BEGIN
  -- Seulement un avoir rattache a une origine, et seulement une fois EMIS
  -- (statut 'avoir' ; un brouillon d'avoir ne libere rien).
  IF NOT COALESCE(NEW.est_avoir, false)
     OR NEW.facture_origine_id IS NULL
     OR NEW.statut <> 'avoir' THEN
    RETURN NEW;
  END IF;

  SELECT montant_ttc INTO v_origine_ttc
  FROM factures WHERE id = NEW.facture_origine_id;
  IF v_origine_ttc IS NULL OR v_origine_ttc <= 0 THEN
    RETURN NEW;
  END IF;

  -- Cumul des avoirs emis sur cette origine. uq_factures_avoir_par_origine
  -- n'en autorise qu'un seul aujourd'hui (cf. migration 20260515120000) ; on
  -- somme quand meme pour rester juste si cette contrainte est un jour levee
  -- au profit d'avoirs fractionnes.
  SELECT COALESCE(SUM(montant_ttc), 0) INTO v_avoirs_ttc
  FROM factures
  WHERE facture_origine_id = NEW.facture_origine_id
    AND est_avoir
    AND statut = 'avoir';

  -- Avoir partiel : on ne libere pas. Tolerance 1 centime sur les arrondis.
  IF ABS(v_avoirs_ttc) + 0.01 < v_origine_ttc THEN
    RETURN NEW;
  END IF;

  UPDATE facture_lignes
  SET event_libere_le = now()
  WHERE facture_id = NEW.facture_origine_id
    AND event_type IS NOT NULL
    AND est_avoir = false
    AND event_libere_le IS NULL;

  RETURN NEW;
END;
$$;

ALTER FUNCTION factures_liberer_events_sur_avoir_total() SET search_path = public, pg_temp;

-- AFTER : la liberation ne conditionne pas l'ecriture de l'avoir lui-meme.
-- INSERT couvre le cas (theorique) d'un avoir cree directement en statut emis.
DROP TRIGGER IF EXISTS trg_factures_liberer_events ON factures;
CREATE TRIGGER trg_factures_liberer_events
AFTER INSERT OR UPDATE OF statut ON factures
FOR EACH ROW EXECUTE FUNCTION factures_liberer_events_sur_avoir_total();

------------------------------------------------------------
-- 4. Backfill : factures deja integralement avoirisees
------------------------------------------------------------
-- Date de liberation = date d'emission du dernier avoir, pas now(), pour que
-- la colonne reste lisible comme un fait historique.
UPDATE facture_lignes fl
SET event_libere_le = COALESCE(
  (SELECT MAX(av.date_emission)::timestamptz
     FROM factures av
    WHERE av.facture_origine_id = fl.facture_id
      AND av.est_avoir AND av.statut = 'avoir'),
  now()
)
WHERE fl.event_type IS NOT NULL
  AND fl.est_avoir = false
  AND fl.event_libere_le IS NULL
  AND EXISTS (
    SELECT 1 FROM factures orig
    WHERE orig.id = fl.facture_id
      AND orig.montant_ttc > 0
      AND ABS((SELECT COALESCE(SUM(av.montant_ttc), 0)
                 FROM factures av
                WHERE av.facture_origine_id = orig.id
                  AND av.est_avoir AND av.statut = 'avoir')) + 0.01
          >= orig.montant_ttc
  );

------------------------------------------------------------
-- 5. Index unique : les lignes liberees en sortent
------------------------------------------------------------
DROP INDEX IF EXISTS uq_facture_lignes_event_live;
CREATE UNIQUE INDEX uq_facture_lignes_event_live
  ON facture_lignes(event_type, event_source_id)
  WHERE event_type IS NOT NULL
    AND est_avoir = false
    AND event_libere_le IS NULL;

------------------------------------------------------------
-- 6. Reparation des event_source_id incoherents
------------------------------------------------------------
-- Pour un event 'engagement', event_source_id DOIT valoir contrat_id (cf.
-- lib/queries/billable-events/derive.ts). Des refacturations manuelles ont
-- contourne l'index en inventant des UUID (4 lignes de FAC-SOL-0017, qui ne
-- referencent ni contrat ni step) ou en y mettant l'id du step Eduvia
-- (FAC-SOL-0021). Consequence : l'app ne voit pas que ces events sont
-- factures et les repropose.
--
-- Le NOT EXISTS rend la reparation auto-protegee : une ligne n'est recablee
-- que si aucune autre ligne vivante non liberee n'occupe deja la place. Les 3
-- lignes en doublon avere de FAC-SOL-0021 (LEMAITRE, MORLOCK, CHEDRU, deja
-- factures sur FAC-SOL-0007 payee) sont donc laissees telles quelles : leur
-- traitement est un avoir, pas une reecriture de cle.
--
-- Aucun montant n'est touche : seul un pointeur de tracabilite est corrige.
-- Le gel post-emission est neutralise localement, dans la transaction.
ALTER TABLE facture_lignes DISABLE TRIGGER trg_facture_lignes_freeze_after_emission;

UPDATE facture_lignes fl
SET event_source_id = fl.contrat_id
WHERE fl.event_type = 'engagement'
  AND fl.est_avoir = false
  AND fl.event_libere_le IS NULL
  AND fl.contrat_id IS NOT NULL
  AND fl.event_source_id IS DISTINCT FROM fl.contrat_id
  AND NOT EXISTS (
    SELECT 1 FROM facture_lignes autre
    WHERE autre.event_type = 'engagement'
      AND autre.event_source_id = fl.contrat_id
      AND autre.est_avoir = false
      AND autre.event_libere_le IS NULL
      AND autre.id <> fl.id
  );

ALTER TABLE facture_lignes ENABLE TRIGGER trg_facture_lignes_freeze_after_emission;
