-- Re-epingle le search_path des fonctions facturation. Les migrations
-- 20260506160100 (facture_lignes_set_est_avoir, factures_propagate_est_avoir)
-- et 20260506160500 (generate_facture_ref recree, assign_facture_ref_on_send
-- nouveau) ont recree ces fonctions sans search_path explicite, undoant
-- l effet de 20260424123743_pin_function_search_path pour generate_facture_ref
-- et laissant les nouvelles fonctions vulnerables au lint 0011.
--
-- Ferme le WARN Supabase advisor: function_search_path_mutable.

ALTER FUNCTION public.generate_facture_ref()
  SET search_path = public, pg_catalog;
ALTER FUNCTION public.assign_facture_ref_on_send()
  SET search_path = public, pg_catalog;
ALTER FUNCTION public.facture_lignes_set_est_avoir()
  SET search_path = public, pg_catalog;
ALTER FUNCTION public.factures_propagate_est_avoir()
  SET search_path = public, pg_catalog;
