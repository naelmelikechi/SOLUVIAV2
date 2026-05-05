-- Drop legacy Eduvia columns. Toutes les readers/writers ont migre depuis
-- le commit 6f310a2 (2026-04-28) vers les nouveaux noms. Les data ont ete
-- backfillees vers les nouveaux champs au plus tard ce 2026-05-04 (npec_amount).
--
-- Verifications avant drop (faites le 2026-05-05 sur prod) :
-- - SELECT count(*) FROM eduvia_companies WHERE name IS NOT NULL : 24/24 -> donnees egalent denomination
-- - SELECT count(*) FROM formations WHERE titre IS NOT NULL : 8/8 -> donnees egalent qualification_title
-- - SELECT count(*) FROM contrats WHERE npec_amount IS NULL AND montant_prise_en_charge IS NOT NULL : 0
-- - grep code : aucune reference active aux 3 colonnes (seules occurrences sont
--   dans les migrations historiques et commentaires)

ALTER TABLE eduvia_companies DROP COLUMN IF EXISTS name;
ALTER TABLE formations DROP COLUMN IF EXISTS titre;
ALTER TABLE contrats DROP COLUMN IF EXISTS montant_prise_en_charge;
