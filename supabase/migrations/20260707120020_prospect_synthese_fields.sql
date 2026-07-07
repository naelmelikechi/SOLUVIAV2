-- Passation V2 — champs de pré-remplissage de la synthèse sur la fiche
-- prospect (sections 1, 3, 4 et 5 du document). Le tunnel A/B ne reçoit pas de
-- champ : type_prospect ('entreprise' = Tunnel A création complète, 'cfa' =
-- Tunnel B CFA existant), mapping via TUNNEL_LABELS côté app.

ALTER TABLE prospects
  -- Section 1 (identité du groupe)
  ADD COLUMN IF NOT EXISTS nb_implantations    INTEGER,
  ADD COLUMN IF NOT EXISTS ca_dernier_exercice NUMERIC(14,2),
  -- Section 4 (engagements négociés)
  ADD COLUMN IF NOT EXISTS formations_rncp     JSONB,
  ADD COLUMN IF NOT EXISTS type_formation      type_formation,
  ADD COLUMN IF NOT EXISTS numero_contrat      TEXT,
  -- Section 3 (historique commercial)
  ADD COLUMN IF NOT EXISTS historique_synthese  TEXT,
  ADD COLUMN IF NOT EXISTS initiateur           initiateur_contact,
  ADD COLUMN IF NOT EXISTS date_premier_contact DATE,
  -- Section 5 (calendrier prévisionnel, 10 jalons 'YYYY-MM' — clés :
  -- demarrage, recrut_directeur, nda, qualiopi, uai, agrements, opco,
  -- recrut_formateurs, premiere_cohorte, premiere_facture)
  ADD COLUMN IF NOT EXISTS calendrier_previsionnel JSONB;
