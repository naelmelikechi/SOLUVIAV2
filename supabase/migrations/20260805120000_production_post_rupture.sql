-- ---------------------------------------------------------------------------
-- Production post-rupture (decision produit 2026-08-05)
-- ---------------------------------------------------------------------------
-- Jusqu'ici, un contrat rompu continuait de produire jusqu'a son terme INITIAL :
-- seul l'avoir prorata corrigeait l'exces, cote facturation. La production
-- theorique (dashboard, drill-down, fiche projet, rapport mensuel) doit
-- desormais s'arreter a la date de rupture.
--
-- Eduvia n'expose AUCUNE date de rupture (verifie le 2026-08-05 sur
-- /contracts/{id} et toutes ses sous-ressources : seul contract_end_date
-- existe, et il conserve la fin initiale). On la deduit donc, automatiquement,
-- des signaux Eduvia deja synchronises - regle composite validee par le
-- metier :
--   1. aucune activite pedagogique ET aucun jalon OPCO facture
--      -> contrat jamais demarre : date_rupture = date_debut (production 0) ;
--   2. sinon, derniere activite pedagogique (contrats_progressions) ;
--   3. sinon (activite inconnue mais jalon facture), date du constat.
-- La sync applique la meme regle a chaque nouvelle rupture detectee
-- (lib/eduvia/sync.ts), cette migration ne fait que rattraper l'existant.

-- 1. Colonne -----------------------------------------------------------------
ALTER TABLE public.contrats
  ADD COLUMN IF NOT EXISTS date_rupture DATE;

COMMENT ON COLUMN public.contrats.date_rupture IS
  'Date d''arret effectif d''un contrat rompu. Tronque la production theorique '
  '(computeContractSchedule) et sert de reference a l''avoir prorata. '
  'Deduite des signaux Eduvia par la sync ; corrigeable a la main. '
  'NULL = contrat non rompu.';

-- Les lectures filtrantes sont rares (4 contrats rompus sur ~100) : un index
-- partiel suffit et reste gratuit a maintenir.
CREATE INDEX IF NOT EXISTS idx_contrats_date_rupture
  ON public.contrats(date_rupture)
  WHERE date_rupture IS NOT NULL;

-- 2. Backfill des contrats deja rompus ---------------------------------------
-- lower(contract_state) : la prod porte 'RUPTURE' en MAJUSCULES la ou le code
-- listait 'rupture'. 'ARCHIVE' est volontairement EXCLU (decision metier
-- 2026-08-05 : fin normale, pas une rupture).
WITH rompus AS (
  SELECT
    ct.id,
    ct.date_debut,
    pg.last_activity_at,
    EXISTS (
      SELECT 1
      FROM public.eduvia_invoice_steps st
      WHERE st.contrat_id = ct.id
        AND (st.invoice_sent_at IS NOT NULL OR COALESCE(st.paid_amount, 0) > 0)
    ) AS a_jalon_facture
  FROM public.contrats ct
  LEFT JOIN public.contrats_progressions pg ON pg.contrat_id = ct.id
  WHERE ct.date_rupture IS NULL
    AND lower(ct.contract_state) IN
      ('resilie', 'annule', 'rupture', 'rompu', 'abandon', 'abandonne')
)
UPDATE public.contrats ct
SET date_rupture = CASE
      -- 1. jamais demarre -> production 0
      WHEN r.last_activity_at IS NULL AND NOT r.a_jalon_facture THEN r.date_debut
      -- 2. derniere activite pedagogique connue
      WHEN r.last_activity_at IS NOT NULL THEN r.last_activity_at::date
      -- 3. jalon facture mais aucune activite tracee -> constat
      ELSE CURRENT_DATE
    END
FROM rompus r
WHERE ct.id = r.id
  AND r.date_debut IS NOT NULL;

-- 3. contrats_actifs_fenetre : exposer date_rupture --------------------------
-- DROP + CREATE obligatoire : changer le type de retour d'une fonction SQL
-- n'est pas permis par CREATE OR REPLACE.
DROP FUNCTION IF EXISTS public.contrats_actifs_fenetre(date, date);

-- Contrats susceptibles de contribuer a la fenetre [p_first, p_next) :
-- l'echeancier theorique s'etend de M+0 (production SOLUVIA prorata duree) a
-- M+duree_mois+1 (dernier versement OPCO 10%) ; le +2 couvre ce versement.
-- Sur-ensemble strict des contributeurs : le calcul reste en JS
-- (computeContractSchedule), ce filtre reduit juste le payload. On ne filtre
-- deliberement PAS sur date_rupture : un contrat rompu contribue encore aux
-- mois anterieurs a sa rupture, c'est la troncature JS qui coupe.
CREATE FUNCTION public.contrats_actifs_fenetre(p_first date, p_next date)
RETURNS TABLE (
  date_debut date,
  duree_mois integer,
  npec_amount numeric,
  taux_commission numeric,
  date_rupture date
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
  SELECT ct.date_debut, ct.duree_mois, ct.npec_amount, pr.taux_commission,
         ct.date_rupture
  FROM public.contrats ct
  JOIN public.projets pr ON pr.id = ct.projet_id
  JOIN public.clients c ON c.id = pr.client_id
  WHERE ct.archive = false
    AND c.is_demo = false
    AND c.archive = false
    AND ct.date_debut < p_next
    AND ct.date_debut + ((ct.duree_mois + 2) * interval '1 month') >= p_first;
$$;

REVOKE EXECUTE ON FUNCTION public.contrats_actifs_fenetre(date, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.contrats_actifs_fenetre(date, date) FROM anon;
GRANT  EXECUTE ON FUNCTION public.contrats_actifs_fenetre(date, date) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.contrats_actifs_fenetre(date, date) TO service_role;
