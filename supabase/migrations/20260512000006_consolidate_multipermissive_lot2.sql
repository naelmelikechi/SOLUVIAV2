-- Lot 2 : consolidation des 8 premiers groupes multi-permissive.
-- Pattern : DROP les policies multiples, recreer 4 cmd-specifiques avec
-- conditions OR'ed pour preserver les access controls existants.

-- absences
DROP POLICY IF EXISTS absences_modify_own ON public.absences;
DROP POLICY IF EXISTS absences_select_admin ON public.absences;
DROP POLICY IF EXISTS absences_select_own ON public.absences;
CREATE POLICY absences_select ON public.absences FOR SELECT
  USING (public.is_admin() OR user_id = (SELECT auth.uid()));
CREATE POLICY absences_insert ON public.absences FOR INSERT
  WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY absences_update ON public.absences FOR UPDATE
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY absences_delete ON public.absences FOR DELETE
  USING (user_id = (SELECT auth.uid()));

-- factures
DROP POLICY IF EXISTS admin_insert_factures ON public.factures;
DROP POLICY IF EXISTS cdp_insert_factures ON public.factures;
DROP POLICY IF EXISTS admin_select_factures ON public.factures;
DROP POLICY IF EXISTS cdp_read_factures ON public.factures;
CREATE POLICY factures_select ON public.factures FOR SELECT USING (
  public.is_admin() OR EXISTS (
    SELECT 1 FROM projets p WHERE p.id = factures.projet_id
      AND (p.cdp_id = (SELECT auth.uid()) OR p.backup_cdp_id = (SELECT auth.uid()))
  )
);
CREATE POLICY factures_insert ON public.factures FOR INSERT WITH CHECK (
  public.is_admin() OR EXISTS (
    SELECT 1 FROM projets p WHERE p.id = factures.projet_id
      AND (p.cdp_id = (SELECT auth.uid()) OR p.backup_cdp_id = (SELECT auth.uid()))
  )
);

-- idees
DROP POLICY IF EXISTS admin_all_idees ON public.idees;
DROP POLICY IF EXISTS auth_propose_idees ON public.idees;
DROP POLICY IF EXISTS auth_read_idees ON public.idees;
DROP POLICY IF EXISTS author_edit_own_proposed ON public.idees;
DROP POLICY IF EXISTS shippers_update_idees ON public.idees;
DROP POLICY IF EXISTS validators_update_idees ON public.idees;
CREATE POLICY idees_select ON public.idees FOR SELECT USING (true);
CREATE POLICY idees_insert ON public.idees FOR INSERT WITH CHECK (
  public.is_admin()
  OR (auteur_id = (SELECT auth.uid()) AND statut = 'proposee'::statut_idee)
);
CREATE POLICY idees_update ON public.idees FOR UPDATE USING (
  public.is_admin()
  OR public.has_ship_ideas_access()
  OR public.has_validate_ideas_access()
  OR (auteur_id = (SELECT auth.uid()) AND statut = 'proposee'::statut_idee)
);
CREATE POLICY idees_delete ON public.idees FOR DELETE USING (public.is_admin());

-- rdv_commerciaux
DROP POLICY IF EXISTS admin_all_rdv_commerciaux ON public.rdv_commerciaux;
DROP POLICY IF EXISTS pipeline_write_rdv_commerciaux ON public.rdv_commerciaux;
DROP POLICY IF EXISTS pipeline_read_rdv_commerciaux ON public.rdv_commerciaux;
CREATE POLICY rdv_commerciaux_select ON public.rdv_commerciaux FOR SELECT
  USING (public.is_admin() OR public.has_pipeline_access());
CREATE POLICY rdv_commerciaux_insert ON public.rdv_commerciaux FOR INSERT
  WITH CHECK (public.is_admin() OR (public.has_pipeline_access() AND commercial_id = (SELECT auth.uid())));
CREATE POLICY rdv_commerciaux_update ON public.rdv_commerciaux FOR UPDATE
  USING (public.is_admin() OR (public.has_pipeline_access() AND commercial_id = (SELECT auth.uid())))
  WITH CHECK (public.is_admin() OR (public.has_pipeline_access() AND commercial_id = (SELECT auth.uid())));
CREATE POLICY rdv_commerciaux_delete ON public.rdv_commerciaux FOR DELETE
  USING (public.is_admin() OR (public.has_pipeline_access() AND commercial_id = (SELECT auth.uid())));

-- rdv_formateurs
DROP POLICY IF EXISTS admin_all_rdv_formateurs ON public.rdv_formateurs;
DROP POLICY IF EXISTS cdp_write_rdv_formateurs ON public.rdv_formateurs;
DROP POLICY IF EXISTS cdp_read_rdv_formateurs ON public.rdv_formateurs;
CREATE POLICY rdv_formateurs_select ON public.rdv_formateurs FOR SELECT USING (
  public.is_admin() OR EXISTS (
    SELECT 1 FROM projets p WHERE p.id = rdv_formateurs.projet_id
      AND (p.cdp_id = (SELECT auth.uid()) OR p.backup_cdp_id = (SELECT auth.uid()))
  )
);
CREATE POLICY rdv_formateurs_insert ON public.rdv_formateurs FOR INSERT WITH CHECK (
  public.is_admin() OR EXISTS (
    SELECT 1 FROM projets p WHERE p.id = rdv_formateurs.projet_id
      AND (p.cdp_id = (SELECT auth.uid()) OR p.backup_cdp_id = (SELECT auth.uid()))
  )
);
CREATE POLICY rdv_formateurs_update ON public.rdv_formateurs FOR UPDATE USING (
  public.is_admin() OR EXISTS (
    SELECT 1 FROM projets p WHERE p.id = rdv_formateurs.projet_id
      AND (p.cdp_id = (SELECT auth.uid()) OR p.backup_cdp_id = (SELECT auth.uid()))
  )
) WITH CHECK (
  public.is_admin() OR EXISTS (
    SELECT 1 FROM projets p WHERE p.id = rdv_formateurs.projet_id
      AND (p.cdp_id = (SELECT auth.uid()) OR p.backup_cdp_id = (SELECT auth.uid()))
  )
);
CREATE POLICY rdv_formateurs_delete ON public.rdv_formateurs FOR DELETE USING (
  public.is_admin() OR EXISTS (
    SELECT 1 FROM projets p WHERE p.id = rdv_formateurs.projet_id
      AND (p.cdp_id = (SELECT auth.uid()) OR p.backup_cdp_id = (SELECT auth.uid()))
  )
);

-- saisies_temps
DROP POLICY IF EXISTS admin_all_saisies_temps ON public.saisies_temps;
DROP POLICY IF EXISTS cdp_own_saisies ON public.saisies_temps;
DROP POLICY IF EXISTS users_write_temps_internes ON public.saisies_temps;
CREATE POLICY saisies_temps_select ON public.saisies_temps FOR SELECT
  USING (public.is_admin() OR user_id = (SELECT auth.uid()));
CREATE POLICY saisies_temps_insert ON public.saisies_temps FOR INSERT
  WITH CHECK (public.is_admin() OR user_id = (SELECT auth.uid()));
CREATE POLICY saisies_temps_update ON public.saisies_temps FOR UPDATE
  USING (public.is_admin() OR user_id = (SELECT auth.uid()))
  WITH CHECK (public.is_admin() OR user_id = (SELECT auth.uid()));
CREATE POLICY saisies_temps_delete ON public.saisies_temps FOR DELETE
  USING (public.is_admin() OR user_id = (SELECT auth.uid()));

-- saisies_temps_axes
DROP POLICY IF EXISTS admin_all_saisies_axes ON public.saisies_temps_axes;
DROP POLICY IF EXISTS cdp_own_axes ON public.saisies_temps_axes;
DROP POLICY IF EXISTS users_write_axes_internes ON public.saisies_temps_axes;
CREATE POLICY saisies_temps_axes_select ON public.saisies_temps_axes FOR SELECT USING (
  public.is_admin() OR EXISTS (
    SELECT 1 FROM saisies_temps st
    WHERE st.id = saisies_temps_axes.saisie_id AND st.user_id = (SELECT auth.uid())
  )
);
CREATE POLICY saisies_temps_axes_insert ON public.saisies_temps_axes FOR INSERT WITH CHECK (
  public.is_admin() OR EXISTS (
    SELECT 1 FROM saisies_temps st
    WHERE st.id = saisies_temps_axes.saisie_id AND st.user_id = (SELECT auth.uid())
  )
);
CREATE POLICY saisies_temps_axes_update ON public.saisies_temps_axes FOR UPDATE USING (
  public.is_admin() OR EXISTS (
    SELECT 1 FROM saisies_temps st
    WHERE st.id = saisies_temps_axes.saisie_id AND st.user_id = (SELECT auth.uid())
  )
) WITH CHECK (
  public.is_admin() OR EXISTS (
    SELECT 1 FROM saisies_temps st
    WHERE st.id = saisies_temps_axes.saisie_id AND st.user_id = (SELECT auth.uid())
  )
);
CREATE POLICY saisies_temps_axes_delete ON public.saisies_temps_axes FOR DELETE USING (
  public.is_admin() OR EXISTS (
    SELECT 1 FROM saisies_temps st
    WHERE st.id = saisies_temps_axes.saisie_id AND st.user_id = (SELECT auth.uid())
  )
);
