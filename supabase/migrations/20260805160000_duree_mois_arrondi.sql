-- Backfill de contrats.duree_mois : arrondi au mois le plus proche.
--
-- Bug corrige : le sync calculait la duree avec differenceInMonths, qui compte
-- les mois REVOLUS. Un contrat d'apprentissage de 12 mois court du jour J au
-- jour J-1 de l'anniversaire (ex 2026-05-26 -> 2027-05-25, date_fin incluse),
-- il lui manque donc un jour pour valoir 12 mois revolus et il tombait a 11.
--
-- Impact reel, pas cosmetique : computeJalonContribution (lib/echeancier/calc.ts)
-- ecarte tout jalon dont mois_relatif > duree_mois. Le jalon M+12 du template
-- standard "3/12 + 1/12" (quote-part 0.0836) n'etait donc JAMAIS facture, soit
-- 8,36 % de la commission perdue sans aucun signal. Constate sur 0017-FOR-APP
-- (14 contrats sur 15) et 0018-MON-APP (2 contrats sur 2).
--
-- Le fix applicatif est dans lib/utils/duree-contrat.ts (computeDureeMois) ;
-- cette migration realigne les contrats deja synchronises. Les prochains syncs
-- ecriront directement la bonne valeur.
--
-- Regle SQL, miroir exact du TS : mois revolus (AGE) + 1 si le reliquat de
-- jours atteint 15. AGE('2027-05-25','2026-05-26') = 11 mons 29 days -> 12.
-- Un contrat reellement plus court n'est pas gonfle : AGE('2027-04-01',
-- '2026-05-01') = 11 mons 0 days -> reste 11.

UPDATE contrats
SET duree_mois = (
      EXTRACT(YEAR  FROM AGE(date_fin, date_debut))::int * 12
    + EXTRACT(MONTH FROM AGE(date_fin, date_debut))::int
    + CASE WHEN EXTRACT(DAY FROM AGE(date_fin, date_debut))::int >= 15
           THEN 1 ELSE 0 END
  )
WHERE date_debut IS NOT NULL
  AND date_fin IS NOT NULL
  AND date_fin >= date_debut
  AND duree_mois IS DISTINCT FROM (
      EXTRACT(YEAR  FROM AGE(date_fin, date_debut))::int * 12
    + EXTRACT(MONTH FROM AGE(date_fin, date_debut))::int
    + CASE WHEN EXTRACT(DAY FROM AGE(date_fin, date_debut))::int >= 15
           THEN 1 ELSE 0 END
  );
