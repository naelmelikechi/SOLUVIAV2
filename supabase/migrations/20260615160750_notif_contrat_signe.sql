-- Notifications du flux de signature (Feature 5/6). ADD VALUE isolé (cf. 00052).
ALTER TYPE type_notification ADD VALUE IF NOT EXISTS 'contrat_a_signer';
ALTER TYPE type_notification ADD VALUE IF NOT EXISTS 'contrat_signe';
