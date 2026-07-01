-- Durcissement securite (audit 2026-06-30).

-- 1. FUITE DE DONNEES NON AUTHENTIFIEE (P1)
-- find_prospect_duplicates() est SECURITY DEFINER (contourne la RLS de prospects)
-- et son corps ne fait AUCUN check auth.uid()/has_pipeline_access(). Elle etait
-- GRANT EXECUTE ... TO anon : la cle anon etant dans le bundle client, n'importe
-- qui pouvait POST /rest/v1/rpc/find_prospect_duplicates et enumerer le CRM
-- (nom, SIRET, etape pipeline) sans authentification.
-- NB : revoquer depuis anon seul ne suffit PAS (EXECUTE est accorde a PUBLIC par
-- defaut a la creation de la fonction, dont anon herite). On revoque donc depuis
-- PUBLIC, puis on re-grant explicitement authenticated (qui a deja acces au
-- pipeline via has_pipeline_access cote app).
REVOKE EXECUTE ON FUNCTION public.find_prospect_duplicates(TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.find_prospect_duplicates(TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.find_prospect_duplicates(TEXT, TEXT) TO authenticated;

-- 2. SECURITY DEFINER sans search_path epingle (P2)
-- bump_prospect_derniere_action() (triggers sur prospect_notes, rdv_commerciaux,
-- prospect_contacts, signature_requests) est la derniere fonction DEFINER non
-- epinglee (les autres l'ont ete dans 20260424123743 / 20260610120000).
-- Pin pour fermer le risque de shadowing de relation via search_path (WARN 0011)
-- et rester coherent avec l'hygiene du reste du schema.
ALTER FUNCTION public.bump_prospect_derniere_action()
  SET search_path = public, pg_catalog, pg_temp;
