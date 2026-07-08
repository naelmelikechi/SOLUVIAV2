-- Phase 2 CRM - Lot D : suppression definitive du module prospects (destructif,
-- autorise). Le CRM (schema crm) est desormais l'unique pipeline commercial ;
-- le pont opportunite gagnee -> public.clients + document_synthese est verifie
-- en prod (Lot B) et la preservation passation est posee (Lot C).
--
-- SURVIVENT au DROP (aucune cascade attendue) :
--   - public.document_synthese : prospect_id nullable + FK ON DELETE SET NULL
--     (20260707120010_passation_document_v2)
--   - public.signature_requests : prospect_id nullable + FK ON DELETE SET NULL
--     + client_id (20260708150000_signature_requests_client_based)
--   - public.clients, public.rdv_formateurs (statut_rdv conserve)
--   - enums passation/CDP : statut_synthese, typologie_client, niveau_charge,
--     niveau_risque, statut_signature, dispo_cdp, type_notification, statut_rdv

-- 0. Garde-fou : refuse le DROP si les FK prospect_id des tables survivantes ne
--    sont pas en SET NULL (preuve que les migrations de preservation sont
--    appliquees). DROP TABLE ... CASCADE supprimerait la contrainte quoi qu'il
--    arrive, mais un CASCADE au niveau ligne (ON DELETE CASCADE residuel)
--    signifierait une perte de donnees passation.
DO $$
DECLARE
  bad int;
BEGIN
  SELECT count(*) INTO bad
  FROM information_schema.referential_constraints rc
  JOIN information_schema.table_constraints tc
    ON tc.constraint_name = rc.constraint_name
   AND tc.constraint_schema = rc.constraint_schema
  WHERE rc.constraint_schema = 'public'
    AND tc.table_name IN ('document_synthese', 'signature_requests')
    AND tc.constraint_name LIKE '%prospect_id_fkey'
    AND rc.delete_rule <> 'SET NULL';
  IF bad > 0 THEN
    RAISE EXCEPTION 'FK prospect_id de document_synthese/signature_requests non SET NULL : appliquer les migrations de preservation avant le DROP';
  END IF;
END $$;

-- 1. Trigger sur une table SURVIVANTE qui reference les prospects : a retirer
--    avant de dropper la fonction bump_prospect_derniere_action().
DROP TRIGGER IF EXISTS trg_signature_requests_bump ON public.signature_requests;

-- 2. Tables du module prospects + LinkedIn (les FK internes, triggers, index et
--    policies RLS partent avec ; les FK entrantes des tables survivantes sont
--    en SET NULL, le CASCADE ne supprime que leurs contraintes).
DROP TABLE IF EXISTS public.prospect_communications CASCADE;
DROP TABLE IF EXISTS public.prospect_stage_history CASCADE;
DROP TABLE IF EXISTS public.prospect_contacts CASCADE;
DROP TABLE IF EXISTS public.prospect_notes CASCADE;
DROP TABLE IF EXISTS public.rdv_commerciaux CASCADE;
DROP TABLE IF EXISTS public.linkedin_events CASCADE;
DROP TABLE IF EXISTS public.linkedin_mapping_rules CASCADE;
DROP TABLE IF EXISTS public.prospects CASCADE;

-- 3. Les colonnes prospect_id des tables survivantes restent (types conserves
--    en nullable) mais leurs valeurs ne referencent plus rien : on les nettoie.
UPDATE public.document_synthese SET prospect_id = NULL WHERE prospect_id IS NOT NULL;
UPDATE public.signature_requests SET prospect_id = NULL WHERE prospect_id IS NOT NULL;

-- 4. Fonctions / RPC / triggers dedies aux prospects.
DROP FUNCTION IF EXISTS public.find_prospect_duplicates(text, text);
DROP FUNCTION IF EXISTS public.get_prospect_time_in_stage_median();
DROP FUNCTION IF EXISTS public.log_prospect_stage_change();
DROP FUNCTION IF EXISTS public.bump_prospect_derniere_action();
DROP FUNCTION IF EXISTS public.touch_prospect_on_stage();

-- 5. Enums desormais orphelins (verifies : plus aucune colonne restante ne les
--    utilise ; le schema crm stocke ces valeurs en TEXT + CHECK).
--    NB : stage_prospect_v2 a ete renomme stage_prospect en 20260615160600.
DROP TYPE IF EXISTS public.stage_prospect;
DROP TYPE IF EXISTS public.type_prospect;
DROP TYPE IF EXISTS public.canal_origine;
DROP TYPE IF EXISTS public.role_decision_contact;
DROP TYPE IF EXISTS public.type_rdv;
DROP TYPE IF EXISTS public.format_rdv;
DROP TYPE IF EXISTS public.type_evenement_linkedin;
DROP TYPE IF EXISTS public.statut_evenement_linkedin;
DROP TYPE IF EXISTS public.type_formation;
DROP TYPE IF EXISTS public.initiateur_contact;

-- 6. Verification post-DROP : les tables passation survivent avec leurs
--    donnees (echec bruyant plutot que perte silencieuse).
DO $$
BEGIN
  IF to_regclass('public.document_synthese') IS NULL THEN
    RAISE EXCEPTION 'document_synthese a disparu apres le DROP prospects';
  END IF;
  IF to_regclass('public.signature_requests') IS NULL THEN
    RAISE EXCEPTION 'signature_requests a disparu apres le DROP prospects';
  END IF;
END $$;
