-- Index keyset pour la pagination serveur de /facturation (tri numero_seq DESC, id DESC).
-- Partiel : exclut les brouillons (a_emettre -> numero_seq NULL, jamais listes ici).
-- Additif, IF NOT EXISTS, lock bref (volume modere). Aucun impact sur les triggers
-- gapless/freeze (index transparent en lecture).
CREATE INDEX IF NOT EXISTS idx_factures_keyset_seq_id
  ON public.factures (numero_seq DESC, id DESC)
  WHERE statut <> 'a_emettre';
