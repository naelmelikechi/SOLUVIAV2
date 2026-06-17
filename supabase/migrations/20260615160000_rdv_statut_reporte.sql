-- Ajoute le statut 'reporte' aux RDV.
-- Tunnel commercial : Planifié (prevu) -> Tenu (realise) -> Soldé (dérivé du
-- mail post-RDV) ; + Annulé (annule) + Reporté (reporte).
-- ADD VALUE isolé dans sa propre migration : une valeur d'enum ajoutée ne peut
-- pas être utilisée dans la même transaction que son ALTER TYPE (cf.
-- 00052_role_commercial.sql). IF NOT EXISTS rend la migration idempotente.
ALTER TYPE statut_rdv ADD VALUE IF NOT EXISTS 'reporte';
