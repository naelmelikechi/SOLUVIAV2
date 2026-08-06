-- ===========================================================================
-- « En retard » = restant du, paiements deduits (audit #122, constat 13)
-- ===========================================================================
--
-- Trois implementations divergeaient sous UN SEUL libelle, aucune n'etant
-- qualifiee a l'ecran :
--
--   lib/queries/dashboard/financials.ts   avoirs ET paiements deduits
--   lib/queries/factures.ts (kpiEncours)  avoirs seuls
--   production_month_sums + fallback TS   avoirs seuls
--
-- Le rapprochement decisif est /pilotage contre /facturation : deux cumuls a
-- date directement comparables. Sur une facture de 12 000 HT (14 400 TTC) avec
-- un acompte de 8 000 TTC, le chip du pilotage affichait 5 333,33 HT et la carte
-- facturation 12 000 HT. Or le chip porte le CTA « Relancer » vers
-- /facturation : on cliquait sur « En retard 5 333 » pour atterrir sur un ecran
-- affichant « En retard 12 000 ».
--
-- CONVENTION RETENUE, option 1 du chantier C recommandee par le rapport : le
-- restant du, avoirs ET paiements deduits. C'est la grandeur utile a la relance,
-- et celle qu'implementait deja financials.ts.
--
-- Cette migration part de la definition REELLE de la fonction en production
-- (relevee via pg-meta) et n'en change QUE les expressions en_retard /
-- en_retard_ttc, plus l'ajout d'une CTE de paiements par facture. Signature,
-- volatilite, search_path et le reste des CTE sont conserves a l'identique : la
-- CTE `pay` existante agrege par mois et ne permettait pas de deduire facture
-- par facture, d'ou `payf`.
--
-- Le fallback TS et kpiEncours sont alignes dans le meme commit, via
-- soldeRestantDuHt / soldeRestantDuTtc de lib/utils/avoir-netting, desormais
-- seul endroit ou la regle est ecrite.
--
-- Consequence attendue : les montants « En retard » affiches BAISSENT sur les
-- ecrans qui ne deduisaient pas les paiements. Ce n'est pas une perte, c'est la
-- disparition d'une surestimation.

CREATE OR REPLACE FUNCTION public.production_month_sums(p_first text, p_next text)
 RETURNS TABLE(mois text, facture numeric, facture_ttc numeric, en_retard numeric, en_retard_ttc numeric, encaisse numeric, encaisse_ttc numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_catalog'
AS $function$
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
  -- Paiements deja recus PAR FACTURE (la CTE `pay` existante agrege par mois,
  -- elle ne permet pas de deduire facture par facture).
  payf AS (
    SELECT p.facture_id, SUM(p.montant) AS paye_ttc
    FROM public.paiements p
    GROUP BY 1
  ),
  fac AS (
    SELECT left(f.mois_concerne, 7) AS mois,
           SUM(f.montant_ht)  AS facture,
           SUM(f.montant_ttc) AS facture_ttc,
           -- Restant du HT : solde apres avoirs, MOINS les paiements deja
           -- recus, ramenes au HT au prorata reel de la facture (et non a un
           -- taux suppose), borne a 0. Meme regle que soldeRestantDuHt cote TS.
           COALESCE(
             SUM(
               GREATEST(
                 0,
                 GREATEST(0, f.montant_ht + COALESCE(av.avoir_ht, 0))
                   - COALESCE(payf.paye_ttc, 0)
                     * CASE WHEN f.montant_ttc IS NULL OR f.montant_ttc <= 0
                            THEN 1
                            ELSE f.montant_ht / f.montant_ttc
                       END
               )
             ) FILTER (WHERE f.statut = 'en_retard'),
             0
           ) AS en_retard,
           COALESCE(
             SUM(
               GREATEST(
                 0,
                 GREATEST(0, f.montant_ttc + COALESCE(av.avoir_ttc, 0))
                   - COALESCE(payf.paye_ttc, 0)
               )
             ) FILTER (WHERE f.statut = 'en_retard'),
             0
           ) AS en_retard_ttc
    FROM public.factures f
    JOIN public.clients c ON c.id = f.client_id
    LEFT JOIN av ON av.facture_origine_id = f.id
    LEFT JOIN payf ON payf.facture_id = f.id
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
$function$;


COMMENT ON FUNCTION public.production_month_sums(TEXT, TEXT) IS
  '« En retard » = restant du, avoirs ET paiements deduits (audit #122, constat 13). Definition unique partagee avec soldeRestantDuHt/Ttc de lib/utils/avoir-netting cote TypeScript.';
