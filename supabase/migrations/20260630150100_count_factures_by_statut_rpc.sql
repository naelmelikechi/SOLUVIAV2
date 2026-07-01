-- Comptage des factures par statut pour le pie chart du dashboard.
-- Remplace un SELECT plein-table + count en JS (charts.ts) par un
-- count(*) GROUP BY statut cote base (s'appuie sur idx_factures_statut).
-- SECURITY INVOKER : la RLS de l'appelant s'applique au GROUP BY, donc le
-- scoping est IDENTIQUE au select actuel (admin = global, cdp = ses projets).
-- Exclut 'a_emettre' (brouillons, jamais comptes dans le breakdown).
CREATE OR REPLACE FUNCTION public.count_factures_by_statut()
RETURNS TABLE (statut statut_facture, n bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
  SELECT f.statut, count(*) AS n
  FROM public.factures f
  WHERE f.statut <> 'a_emettre'
  GROUP BY f.statut;
$$;

-- anon n'a rien a compter (le dashboard est authentifie). EXECUTE est accorde a
-- PUBLIC par defaut a la creation ; on revoque depuis PUBLIC (dont anon herite)
-- puis on re-grant explicitement authenticated.
REVOKE EXECUTE ON FUNCTION public.count_factures_by_statut() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.count_factures_by_statut() FROM anon;
GRANT  EXECUTE ON FUNCTION public.count_factures_by_statut() TO authenticated;
