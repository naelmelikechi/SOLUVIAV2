-- Ajout des equivalents TTC a production_month_sums (chantier "HT + TTC
-- partout", 2026-08-04). Regle anti-derive de centimes : les TTC sont les
-- SOMMES des montant_ttc factures (les valeurs imprimees sur les PDF, ecrites
-- par les triggers) et des paiements bruts (stockes en TTC) - jamais un
-- recalcul x1,2 (clients intracom a TVA 0%).
--
-- Changement du type de retour => DROP + CREATE (CREATE OR REPLACE refuse) ;
-- grants reappliques a l'identique (revoke PUBLIC/anon, grant authenticated
-- + service_role). Semantique des colonnes existantes inchangee (migration
-- 20260804090000 : net des avoirs, brouillons exclus, en_retard = solde).

DROP FUNCTION IF EXISTS public.production_month_sums(text, text);

CREATE FUNCTION public.production_month_sums(p_first text, p_next text)
RETURNS TABLE (
  mois text,
  facture numeric,
  facture_ttc numeric,
  en_retard numeric,
  en_retard_ttc numeric,
  encaisse numeric,
  encaisse_ttc numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
  WITH av AS (
    SELECT a.facture_origine_id,
           SUM(a.montant_ht)  AS avoir_ht,
           SUM(a.montant_ttc) AS avoir_ttc
    FROM public.factures a
    WHERE a.est_avoir = true
      AND a.statut = 'avoir'
      AND a.facture_origine_id IS NOT NULL
    GROUP BY 1
  ),
  fac AS (
    SELECT left(f.mois_concerne, 7) AS mois,
           SUM(f.montant_ht)  AS facture,
           SUM(f.montant_ttc) AS facture_ttc,
           COALESCE(
             SUM(GREATEST(0, f.montant_ht + COALESCE(av.avoir_ht, 0)))
               FILTER (WHERE f.statut = 'en_retard'),
             0
           ) AS en_retard,
           COALESCE(
             SUM(GREATEST(0, f.montant_ttc + COALESCE(av.avoir_ttc, 0)))
               FILTER (WHERE f.statut = 'en_retard'),
             0
           ) AS en_retard_ttc
    FROM public.factures f
    JOIN public.clients c ON c.id = f.client_id
    LEFT JOIN av ON av.facture_origine_id = f.id
    WHERE f.mois_concerne >= p_first
      AND f.mois_concerne <  p_next
      AND f.statut <> 'a_emettre'
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
           ) AS encaisse,
           SUM(p.montant) AS encaisse_ttc
    FROM public.paiements p
    JOIN public.factures f ON f.id = p.facture_id
    JOIN public.clients c ON c.id = f.client_id
    WHERE f.mois_concerne >= p_first
      AND f.mois_concerne <  p_next
      AND c.is_demo = false
      AND c.archive = false
    GROUP BY 1
  )
  SELECT COALESCE(fa.mois, pa.mois)     AS mois,
         COALESCE(fa.facture, 0)        AS facture,
         COALESCE(fa.facture_ttc, 0)    AS facture_ttc,
         COALESCE(fa.en_retard, 0)      AS en_retard,
         COALESCE(fa.en_retard_ttc, 0)  AS en_retard_ttc,
         COALESCE(pa.encaisse, 0)       AS encaisse,
         COALESCE(pa.encaisse_ttc, 0)   AS encaisse_ttc
  FROM fac fa
  FULL OUTER JOIN pay pa ON pa.mois = fa.mois;
$$;

REVOKE EXECUTE ON FUNCTION public.production_month_sums(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.production_month_sums(text, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.production_month_sums(text, text) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.production_month_sums(text, text) TO service_role;
