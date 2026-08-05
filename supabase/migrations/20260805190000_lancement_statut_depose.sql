-- Timeline de lancement : nouvel etat intermediaire "depose" entre "en_cours"
-- et "lance". Un dossier depose est parti chez le tiers instructeur (OPCO,
-- rectorat, France Competences) mais n'est pas encore accepte : le distinguer
-- d'"en_cours" evite de croire qu'il reste une action cote SOLUVIA.
--
-- Le compteur d'avancement de la fiche projet continue de ne compter que
-- "lance" : "depose" n'est pas un lancement.

ALTER TABLE projet_lancement_etapes
  DROP CONSTRAINT IF EXISTS projet_lancement_etapes_statut_check;

ALTER TABLE projet_lancement_etapes
  ADD CONSTRAINT projet_lancement_etapes_statut_check
  CHECK (statut IN ('non_commence', 'en_cours', 'depose', 'lance'));
