-- Agregation production cote SQL : remplace le chargement ligne a ligne
-- (fetchAllRows factures+paiements+contrats, payload croissant) par deux RPC
-- partagees entre getProductionData, getMonthlyTrend, getDashboardFinancials
-- et le cron rapport mensuel (module lib/queries/production-aggregates.ts).
-- INVARIANT : la production theorique reste calculee en JS via
-- computeContractSchedule (lib/queries/production.ts = source unique). Ici on
-- ne fait QUE des sommes de factures/paiements et un pre-filtrage fenetre des
-- contrats.

-- ---------------------------------------------------------------------------
-- 1. production_month_sums(p_first, p_next)
-- ---------------------------------------------------------------------------
-- Sommes mensuelles facture / en_retard / encaisse (HT) sur [p_first, p_next).
-- mois_concerne est un TEXT a formats mixtes ('YYYY-MM' event-based,
-- 'YYYY-MM-01' echeancier) : des bornes COURTES 'YYYY-MM' sont correctes
-- lexicographiquement pour les deux formats ('2025-07' < '2025-07-01'
-- < '2025-08'), et left(mois_concerne, 7) bucketise les deux dans le meme mois.
-- encaisse : paiements TTC ramenes en HT au prorata HT/TTC de la facture,
-- semantique IDENTIQUE a encaisseHt (lib/utils/montant-ht.ts) : ratio = 1 si
-- montant_ttc <= 0 (anomalie / facture 0 EUR) pour ne perdre aucun
-- encaissement. Pas d'arrondi ici : round2 reste applique cote JS a
-- l'assemblage, comme avant.
-- Parite filtres avec les selects PostgREST actuels : est_avoir = false sur
-- la base facture/en_retard (exclut les avoirs y compris en brouillon), pas
-- de filtre est_avoir cote paiements (la requete paiements actuelle joint
-- factures sans exclure les avoirs ; un avoir n'a pas de paiement en
-- pratique), clients non demo / non archives via factures.client_id.
-- SECURITY INVOKER : la RLS de l'appelant s'applique aux 3 tables jointes
-- (cdp = ses projets, admin = global), identique au scoping actuel.
CREATE OR REPLACE FUNCTION public.production_month_sums(p_first text, p_next text)
RETURNS TABLE (mois text, facture numeric, en_retard numeric, encaisse numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
  WITH fac AS (
    SELECT left(f.mois_concerne, 7) AS mois,
           SUM(f.montant_ht) AS facture,
           COALESCE(SUM(f.montant_ht) FILTER (WHERE f.statut = 'en_retard'), 0) AS en_retard
    FROM public.factures f
    JOIN public.clients c ON c.id = f.client_id
    WHERE f.mois_concerne >= p_first
      AND f.mois_concerne <  p_next
      AND f.est_avoir = false
      AND c.is_demo = false
      AND c.archive = false
    GROUP BY 1
  ),
  pay AS (
    SELECT left(f.mois_concerne, 7) AS mois,
           SUM(
             CASE WHEN f.montant_ttc <= 0 THEN p.montant
                  ELSE p.montant * f.montant_ht / f.montant_ttc
             END
           ) AS encaisse
    FROM public.paiements p
    JOIN public.factures f ON f.id = p.facture_id
    JOIN public.clients c ON c.id = f.client_id
    WHERE f.mois_concerne >= p_first
      AND f.mois_concerne <  p_next
      AND c.is_demo = false
      AND c.archive = false
    GROUP BY 1
  )
  SELECT COALESCE(fa.mois, pa.mois) AS mois,
         COALESCE(fa.facture, 0)    AS facture,
         COALESCE(fa.en_retard, 0)  AS en_retard,
         COALESCE(pa.encaisse, 0)   AS encaisse
  FROM fac fa
  FULL OUTER JOIN pay pa ON pa.mois = fa.mois;
$$;

-- ---------------------------------------------------------------------------
-- 2. contrats_actifs_fenetre(p_first, p_next)
-- ---------------------------------------------------------------------------
-- Contrats actifs susceptibles de contribuer a la fenetre [p_first, p_next) :
-- l'echeancier theorique d'un contrat s'etend de M+0 (production SOLUVIA
-- prorata duree) a M+duree_mois+1 (dernier versement OPCO 10%) ; le +2 couvre
-- ce versement. Sur-ensemble strict des contrats contributeurs : le calcul
-- lui-meme reste en JS (computeContractSchedule), ce filtre reduit juste le
-- payload. date_debut ou duree_mois NULL => predicat NULL => exclu (ces
-- contrats sont de toute facon ignores par les gardes JS).
-- Parite filtres avec les selects actuels : contrats.archive = false +
-- client (via projet) non demo / non archive. NB : pas de filtre
-- projets.archive, comme dans les requetes actuelles.
CREATE OR REPLACE FUNCTION public.contrats_actifs_fenetre(p_first date, p_next date)
RETURNS TABLE (date_debut date, duree_mois integer, npec_amount numeric, taux_commission numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
  SELECT ct.date_debut, ct.duree_mois, ct.npec_amount, pr.taux_commission
  FROM public.contrats ct
  JOIN public.projets pr ON pr.id = ct.projet_id
  JOIN public.clients c ON c.id = pr.client_id
  WHERE ct.archive = false
    AND c.is_demo = false
    AND c.archive = false
    AND ct.date_debut < p_next
    AND ct.date_debut + ((ct.duree_mois + 2) * interval '1 month') >= p_first;
$$;

-- Grants : meme modele que count_factures_by_statut (revoke PUBLIC/anon,
-- grant authenticated). service_role est ajoute car le cron rapport mensuel
-- consomme contrats_actifs_fenetre via le client admin (service role, RLS
-- bypass, comme le select direct qu'il remplace).
REVOKE EXECUTE ON FUNCTION public.production_month_sums(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.production_month_sums(text, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.production_month_sums(text, text) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.production_month_sums(text, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.contrats_actifs_fenetre(date, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.contrats_actifs_fenetre(date, date) FROM anon;
GRANT  EXECUTE ON FUNCTION public.contrats_actifs_fenetre(date, date) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.contrats_actifs_fenetre(date, date) TO service_role;
