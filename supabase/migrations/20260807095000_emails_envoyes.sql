-- Journal des mails rattaches a un projet ou a un client.
--
-- Deux sources dans une seule table, distinguees par `source` :
--   'app'    : envoye par l'application via lib/email/_send.ts
--   'gmail'  : echange direct CDP <-> client, collecte par delegation Workspace
--
-- ATTENTION : cette table ne contient JAMAIS le corps d'un message. Seules les
-- metadonnees sont stockees. Lire la boite d'un salarie est un traitement de
-- donnees personnelles ; le perimetre est volontairement reduit au strict
-- necessaire pour la fonctionnalite demandee (voir la source 'gmail').
--
-- A ne pas confondre avec `email_send_log`, qui est un verrou d'idempotence
-- pour les crons (job + periode_key), pas un journal.

CREATE TABLE IF NOT EXISTS emails_envoyes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source         TEXT NOT NULL CHECK (source IN ('app', 'gmail')),
  envoye_le      TIMESTAMPTZ NOT NULL,
  sujet          TEXT NOT NULL,
  expediteur     TEXT,
  destinataires  TEXT[] NOT NULL DEFAULT '{}',
  -- Type fonctionnel cote app (facture, devis, relance, notification...).
  -- Null pour la source gmail : on ne devine pas la nature d'un echange.
  type           TEXT,
  projet_id      UUID REFERENCES projets(id) ON DELETE CASCADE,
  client_id      UUID REFERENCES clients(id) ON DELETE CASCADE,
  -- Statut renvoye par le fournisseur d'envoi (source app uniquement).
  statut         TEXT,
  -- Identifiant externe, pour l'idempotence de la collecte Gmail.
  external_id    TEXT UNIQUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_emails_envoyes_projet
  ON emails_envoyes (projet_id, envoye_le DESC);
CREATE INDEX IF NOT EXISTS idx_emails_envoyes_client
  ON emails_envoyes (client_id, envoye_le DESC);

ALTER TABLE emails_envoyes ENABLE ROW LEVEL SECURITY;

-- Lecture : admin partout, CDP sur ses projets. Une seule policy permissive
-- par commande, initplan-wrap comme le reste du schema.
CREATE POLICY emails_envoyes_select ON emails_envoyes FOR SELECT USING (
  (SELECT is_admin()) OR EXISTS (
    SELECT 1 FROM projets p
     WHERE p.id = emails_envoyes.projet_id
       AND (p.cdp_id = (SELECT auth.uid()) OR p.backup_cdp_id = (SELECT auth.uid()))
  )
);

-- Ecriture reservee au service role (journalisation applicative et cron de
-- collecte) : aucun utilisateur n'ecrit dans ce journal depuis l'interface.
-- Pas de policy INSERT/UPDATE/DELETE : le service role contourne la RLS,
-- tout le reste est refuse par defaut.
