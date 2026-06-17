-- Notifications du module Référent CDP (Feature 7). ADD VALUE isolé (cf. 00052).
ALTER TYPE type_notification ADD VALUE IF NOT EXISTS 'cdp_a_affecter';
ALTER TYPE type_notification ADD VALUE IF NOT EXISTS 'cdp_affecte';
ALTER TYPE type_notification ADD VALUE IF NOT EXISTS 'cdp_saturation';
