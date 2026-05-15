-- Ajoute des flags sur client_contacts pour identifier les destinataires
-- des emails de facturation (TO + CC). Permet l'envoi multi-destinataires
-- depuis le dialog d'envoi, et l'usage par les crons (relances, retard).
--
-- Backfill : pour chaque client, le contact le plus ancien recoit
-- recoit_factures = true. Preserve le comportement actuel (1er contact
-- = destinataire) tant que l'admin n'ajuste rien.

ALTER TABLE client_contacts
  ADD COLUMN recoit_factures    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN recoit_factures_cc BOOLEAN NOT NULL DEFAULT false;

-- Backfill : 1er contact par client (created_at le plus ancien) ayant un
-- email non null devient destinataire principal.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY client_id ORDER BY created_at ASC, id ASC) AS rn
  FROM client_contacts
  WHERE email IS NOT NULL AND email <> ''
)
UPDATE client_contacts c
SET recoit_factures = true
FROM ranked r
WHERE c.id = r.id AND r.rn = 1;

CREATE INDEX idx_client_contacts_recoit_factures
  ON client_contacts(client_id)
  WHERE recoit_factures = true OR recoit_factures_cc = true;

COMMENT ON COLUMN client_contacts.recoit_factures IS
  'Si true, ce contact recoit les factures (TO) en envoi automatique ou comme prefill du dialog manuel.';
COMMENT ON COLUMN client_contacts.recoit_factures_cc IS
  'Si true, ce contact est mis en copie (CC) des emails de facturation.';
