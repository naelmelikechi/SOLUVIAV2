-- Le pie chart du dashboard (count_factures_by_statut) comptait les factures
-- des clients demo/archives, contrairement a tous les autres compteurs du
-- dashboard (overview, financials, production_month_sums). On aligne :
-- exclusion via factures.client_id, meme pattern que production_month_sums
-- (20260702130000). Le reste (SECURITY INVOKER, search_path, exclusion
-- 'a_emettre') est inchange ; CREATE OR REPLACE preserve les grants existants
-- (authenticated oui, anon/PUBLIC non).
CREATE OR REPLACE FUNCTION public.count_factures_by_statut()
RETURNS TABLE (statut statut_facture, n bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
  SELECT f.statut, count(*) AS n
  FROM public.factures f
  JOIN public.clients c ON c.id = f.client_id
  WHERE f.statut <> 'a_emettre'
    AND c.is_demo = false
    AND c.archive = false
  GROUP BY f.statut;
$$;
