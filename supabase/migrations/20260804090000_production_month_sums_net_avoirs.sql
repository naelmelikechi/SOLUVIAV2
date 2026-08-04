-- Totaux nets des avoirs dans production_month_sums.
--
-- Contexte (audit 2026-08-04, serie d'avoirs HEOL AVR-SOL-0001..0004) : la RPC
-- excluait les avoirs (est_avoir = false) sans neutraliser les factures
-- integralement soldees par avoir, qui restent statut 'en_retard' a vie (pas
-- de statut 'annulee'). Consequence : "Facture" juillet 2026 affiche
-- 38 937,79 EUR HT la ou le net reel est 24 145,86 EUR, et "En retard" compte
-- 4 factures annulees (14 791,93 EUR fantomes).
--
-- Nouvelle semantique (alignee sur getDashboardFinancials.totalFacture) :
--   * facture  = SUM(montant_ht) sur statut <> 'a_emettre' : les avoirs emis
--     (statut 'avoir', montant negatif) viennent EN DEDUCTION dans le mois de
--     leur mois_concerne (herite de la facture d'origine, meme bucket) ; les
--     brouillons (a_emettre, y compris avoirs brouillon) sont EXCLUS - ils
--     etaient comptes avant, un brouillon n'est pas une facture emise.
--   * en_retard = SUM(GREATEST(0, montant_ht + avoirs emis lies)) sur
--     statut = 'en_retard' : une facture totalement soldee par avoir ne pese
--     plus dans le retard ; un avoir partiel reduit le solde en retard.
-- Bloc pay inchange : un avoir n'a pas de paiement (garde applicative).
CREATE OR REPLACE FUNCTION public.production_month_sums(p_first text, p_next text)
RETURNS TABLE (mois text, facture numeric, en_retard numeric, encaisse numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
  WITH av AS (
    SELECT a.facture_origine_id, SUM(a.montant_ht) AS avoir_ht
    FROM public.factures a
    WHERE a.est_avoir = true
      AND a.statut = 'avoir'
      AND a.facture_origine_id IS NOT NULL
    GROUP BY 1
  ),
  fac AS (
    SELECT left(f.mois_concerne, 7) AS mois,
           SUM(f.montant_ht) AS facture,
           COALESCE(
             SUM(GREATEST(0, f.montant_ht + COALESCE(av.avoir_ht, 0)))
               FILTER (WHERE f.statut = 'en_retard'),
             0
           ) AS en_retard
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
