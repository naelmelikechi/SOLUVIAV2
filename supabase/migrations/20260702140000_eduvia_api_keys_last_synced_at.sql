-- Curseur de rotation anti-famine pour la sync Eduvia horaire.
--
-- Contexte : syncAllEduviaClients tourne dans une invocation unique bornee
-- (maxDuration=300s). Sans ordre de traitement, les clients en fin de liste
-- etaient systematiquement coupes au meme endroit une fois le temps epuise
-- (famine). On ajoute un curseur last_synced_at :
--   - ordre de traitement : last_synced_at ASC NULLS FIRST (les moins
--     recemment tentes d'abord -> rotation, famine impossible) ;
--   - mis a jour apres CHAQUE tentative (succes OU echec) pour que la
--     rotation avance meme sur les clients en erreur.
--
-- Ne pas confondre avec last_sync_at (existant) : derniere sync ABOUTIE,
-- affichee dans l'UI admin. last_synced_at est un curseur technique.
ALTER TABLE client_api_keys
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN client_api_keys.last_synced_at IS
  'Curseur de rotation sync Eduvia : derniere TENTATIVE de sync (succes ou echec). Ordonne ASC NULLS FIRST par syncAllEduviaClients. Distinct de last_sync_at (derniere sync aboutie, UI).';
