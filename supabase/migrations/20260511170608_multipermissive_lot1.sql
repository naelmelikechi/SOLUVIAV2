-- Consolide les multi-permissive policies sur projets/clients/contrats
-- (Supabase advisor lint 0006_multiple_permissive_policies).
--
-- Probleme : pour SELECT, plusieurs policies PERMISSIVE s appliquent (admin
-- + cdp + parfois users), Postgres les evalue toutes a chaque ligne. Cout
-- proportionnel au nombre de policies.
--
-- Solution : 1 policy SELECT consolidee (qui OR les conditions des policies
-- d origine), + 3 policies INSERT/UPDATE/DELETE separees pour conserver
-- l acces admin sur ces actions (puisqu on perd le ALL).
--
-- Lot 1 = projets, clients, contrats (le coeur metier).
-- Lots 2-5 seront traites dans des sessions dediees.

-- ==========================================================================
-- 1. PROJETS
-- ==========================================================================
-- Avant : admin_all_projets (ALL, is_admin), cdp_read_projets (SELECT, own),
--         users_read_projets_internes (SELECT, est_interne=true)
-- Apres : 1 SELECT consolidee + 3 admin write-only

DROP POLICY IF EXISTS admin_all_projets ON public.projets;
DROP POLICY IF EXISTS cdp_read_projets ON public.projets;
DROP POLICY IF EXISTS users_read_projets_internes ON public.projets;

CREATE POLICY projets_select ON public.projets
  FOR SELECT
  USING (
    is_admin()
    OR cdp_id = (SELECT auth.uid())
    OR backup_cdp_id = (SELECT auth.uid())
    OR est_interne = true
  );

CREATE POLICY projets_admin_insert ON public.projets
  FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY projets_admin_update ON public.projets
  FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY projets_admin_delete ON public.projets
  FOR DELETE
  USING (is_admin());

-- ==========================================================================
-- 2. CLIENTS
-- ==========================================================================
-- Avant : admin_all_clients (ALL, is_admin), cdp_read_clients (SELECT, qual=true)
-- Le qual=true sur cdp_read_clients signifie que tout user authentifie peut
-- lire les clients - c est le comportement actuel, on le preserve.
-- Apres : 1 SELECT consolidee (=true effectif) + 3 admin write-only

DROP POLICY IF EXISTS admin_all_clients ON public.clients;
DROP POLICY IF EXISTS cdp_read_clients ON public.clients;

CREATE POLICY clients_select ON public.clients
  FOR SELECT
  USING (true);

CREATE POLICY clients_admin_insert ON public.clients
  FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY clients_admin_update ON public.clients
  FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY clients_admin_delete ON public.clients
  FOR DELETE
  USING (is_admin());

-- ==========================================================================
-- 3. CONTRATS
-- ==========================================================================
-- Avant : admin_all_contrats (ALL, is_admin), cdp_read_contrats (SELECT, via projets)
-- Apres : 1 SELECT consolidee + 3 admin write-only

DROP POLICY IF EXISTS admin_all_contrats ON public.contrats;
DROP POLICY IF EXISTS cdp_read_contrats ON public.contrats;

CREATE POLICY contrats_select ON public.contrats
  FOR SELECT
  USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM public.projets p
      WHERE p.id = contrats.projet_id
        AND (p.cdp_id = (SELECT auth.uid()) OR p.backup_cdp_id = (SELECT auth.uid()))
    )
  );

CREATE POLICY contrats_admin_insert ON public.contrats
  FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY contrats_admin_update ON public.contrats
  FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY contrats_admin_delete ON public.contrats
  FOR DELETE
  USING (is_admin());
