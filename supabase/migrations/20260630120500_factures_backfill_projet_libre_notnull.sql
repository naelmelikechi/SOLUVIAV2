-- Backfill : rattache toute facture orpheline (projet_id IS NULL) au projet
-- libre de son client, puis verrouille la colonne en NOT NULL.
-- Couvre factures libres + issues de devis + avoirs orphelins historiques.

-- 1. Un projet libre par client ayant au moins une facture orpheline.
--    Reutilise get_or_create_projet_libre (source unique de la logique).
SELECT get_or_create_projet_libre(c.client_id)
FROM (SELECT DISTINCT client_id FROM factures WHERE projet_id IS NULL) c;

-- 2. Affectation. Le trigger freeze_facture_after_emission rend projet_id
--    immuable post-emission (20260515120000). Ici on REMPLIT un trou
--    (NULL -> projet), pas une mutation d'une valeur legale emise : projet_id
--    n'apparait ni sur le PDF ni dans le move Odoo. Neutralisation locale,
--    transactionnelle (DDL transactionnel : rollback si la migration echoue).
ALTER TABLE factures DISABLE TRIGGER trg_factures_freeze_after_emission;

UPDATE factures f
SET projet_id = p.id
FROM projets p
WHERE f.projet_id IS NULL
  AND p.client_id = f.client_id
  AND p.est_libre;

ALTER TABLE factures ENABLE TRIGGER trg_factures_freeze_after_emission;

-- 3. Verrou : plus aucune facture sans projet. Echoue si un orphelin subsiste.
--    NB : mois_concerne et facture_lignes.contrat_id restent VOLONTAIREMENT
--    nullable (factures devis sans mois_concerne, lignes libres/devis sans
--    contrat). On ne re-verrouille QUE projet_id.
ALTER TABLE factures ALTER COLUMN projet_id SET NOT NULL;
