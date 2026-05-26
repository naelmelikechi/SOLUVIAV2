-- Migration : ajoute contrats.deleted_in_eduvia_at pour tracer les contrats
-- qui ont disparu cote Eduvia (HTTP 404 sur /contracts/{id}).
--
-- Cas typique : un brouillon NOTSENT est cree par erreur dans Eduvia puis
-- supprime cote Eduvia. SOLUVIA ne savait pas le detecter et le contrat
-- restait visible en DB avec archive=false, faussant les compteurs UI.
--
-- Le sync Eduvia compare desormais la liste des eduvia_id renvoyee par
-- /api/v1/contracts avec ceux deja en DB pour le source_client_id donne ;
-- les orphelins sont archives (archive=true) et marques avec ce timestamp
-- pour distinguer un archivage "fantome Eduvia" d'un archivage manuel par
-- un admin.
--
-- NULL = contrat encore present cote Eduvia OU archive manuellement par
-- un user. Non-NULL = contrat supprime cote Eduvia, date de detection.

ALTER TABLE contrats
  ADD COLUMN IF NOT EXISTS deleted_in_eduvia_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN contrats.deleted_in_eduvia_at IS
  'Timestamp de detection lors du sync Eduvia : le contrat n''est plus renvoye par /api/v1/contracts. NULL = present chez Eduvia (ou contrat manuel sans eduvia_id).';

-- Index partiel : seul un sous-ensemble (rare) des contrats sera marque
-- comme fantome, le partial index garde l'overhead minimal.
CREATE INDEX IF NOT EXISTS idx_contrats_deleted_in_eduvia_at
  ON contrats (deleted_in_eduvia_at)
  WHERE deleted_in_eduvia_at IS NOT NULL;
