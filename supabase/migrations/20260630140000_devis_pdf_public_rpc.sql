-- RPC publique de rendu PDF : token + expiration + statut verifies cote SQL.
-- Projection STRICTEMENT limitee aux champs consommes par
-- components/devis/devis-pdf.tsx (pas de notes_internes, acceptation_*, ids
-- internes, email/ip/ua). Lecture seule (STABLE) : ne loggue PAS de vue (la
-- page get_devis_public l'a deja fait). Renvoie NULL si introuvable / expire /
-- statut non consultable (la route repond 404, sans bruit dans les logs).
CREATE OR REPLACE FUNCTION get_devis_pdf_public(p_token TEXT)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_devis   RECORD;
  v_lignes  JSON;
  v_societe RECORD;
  v_client  RECORD;
BEGIN
  -- Predicat de visibilite aligne sur get_devis_public (token + non expire).
  SELECT d.id, d.ref, d.objet, d.date_emission, d.date_validite,
         d.montant_ht, d.montant_ttc, d.conditions_reglement,
         d.statut, d.societe_emettrice_id, d.client_id
    INTO v_devis
    FROM devis d
   WHERE d.acceptation_token = p_token
     AND d.acceptation_token_expire_at > now();

  -- Statut consultable identique a get_devis_public (brouillon -> route
  -- authentifiee dediee).
  IF v_devis.id IS NULL OR v_devis.statut NOT IN ('envoye', 'accepte', 'refuse') THEN
    RETURN NULL;
  END IF;

  SELECT json_agg(json_build_object(
    'ordre', l.ordre, 'libelle', l.libelle, 'description', l.description,
    'quantite', l.quantite, 'prix_unitaire_ht', l.prix_unitaire_ht,
    'taux_tva', l.taux_tva, 'total_ht', l.total_ht, 'total_tva', l.total_tva
  ) ORDER BY l.ordre) INTO v_lignes
    FROM devis_lignes l WHERE l.devis_id = v_devis.id;

  SELECT raison_sociale, forme_juridique, capital_social, siret, tva_intracom,
         adresse, code_postal, ville, logo_url,
         conditions_reglement_default, mentions_legales,
         banque_nom, banque_iban, banque_bic
    INTO v_societe FROM societes_emettrices WHERE id = v_devis.societe_emettrice_id;

  SELECT raison_sociale, adresse, localisation, siret, tva_intracommunautaire
    INTO v_client FROM clients WHERE id = v_devis.client_id;

  RETURN json_build_object(
    'devis', json_build_object(
      'ref', v_devis.ref, 'objet', v_devis.objet,
      'date_emission', v_devis.date_emission, 'date_validite', v_devis.date_validite,
      'montant_ht', v_devis.montant_ht, 'montant_ttc', v_devis.montant_ttc,
      'conditions_reglement', v_devis.conditions_reglement
    ),
    'lignes', COALESCE(v_lignes, '[]'::JSON),
    'societe', row_to_json(v_societe),
    'client', row_to_json(v_client)
  );
END;
$$;

ALTER FUNCTION get_devis_pdf_public(TEXT) SET search_path = public, pg_temp;

-- GRANT minimal : on retire d'abord l'EXECUTE accorde a PUBLIC par defaut, puis
-- on ouvre uniquement aux roles PostgREST (durcissement vs. les RPC existantes
-- qui s'appuyaient sur le GRANT PUBLIC implicite).
REVOKE EXECUTE ON FUNCTION get_devis_pdf_public(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_devis_pdf_public(TEXT) TO anon, authenticated;
