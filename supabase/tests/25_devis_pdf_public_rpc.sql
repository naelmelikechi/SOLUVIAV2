-- ===========================================================================
-- Test : get_devis_pdf_public (20260630140000_devis_pdf_public_rpc.sql)
-- ===========================================================================
-- - anon PEUT executer la RPC (rendu PDF public depuis le lien de partage).
-- - search_path epingle (durcissement, calque 22_security_hardening.sql).
-- - token valide + statut consultable -> JSON avec ref + lignes.
-- - EXPOSITION MINIMALE : la projection n'expose ni acceptation_token, ni
--   notes_internes, ni statut cote devis, ni email_contact cote societe, ni
--   trigramme cote client (invariant cle du chantier securite).
-- - token expire / inexistant / devis brouillon -> NULL (route -> 404).

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(13);

-- --- Fixtures --------------------------------------------------------------
-- Un client, puis trois devis : un envoye (2 lignes, token valide non expire),
-- un brouillon dote d'un token valide (pour exercer le filtre de statut), et un
-- envoye dont le token est force en expiration passee.
DO $$
DECLARE
  v_client_id  UUID;
  v_societe_id UUID;
  v_devis_id   UUID;
  v_expire_id  UUID;
BEGIN
  SELECT id INTO v_societe_id FROM societes_emettrices WHERE code = 'SOL';

  INSERT INTO clients (trigramme, raison_sociale, siret, tva_intracommunautaire,
                       adresse, localisation)
  VALUES ('PDF', 'Client PDF Public', '12345678900012', 'FR12345678901',
          '1 rue du Test', '79000 Niort')
  RETURNING id INTO v_client_id;

  -- Devis envoye consultable (ref + token alloues par le trigger d'envoi).
  INSERT INTO devis (societe_emettrice_id, client_id, objet, date_validite,
                     notes_internes)
  VALUES (v_societe_id, v_client_id, 'PDF envoye', CURRENT_DATE + 90,
          'Marge negociable - NE DOIT PAS FUITER')
  RETURNING id INTO v_devis_id;

  INSERT INTO devis_lignes (devis_id, ordre, libelle, quantite,
                            prix_unitaire_ht, taux_tva, total_ht, total_tva, total_ttc)
  VALUES (v_devis_id, 1, 'Prestation A', 1, 1000, 20, 1000, 200, 1200),
         (v_devis_id, 2, 'Prestation B', 2, 500, 20, 1000, 200, 1200);

  UPDATE devis SET statut = 'envoye' WHERE id = v_devis_id;

  -- Brouillon dote d'un token valide non expire (token pose a la main : le flux
  -- normal n'alloue de token qu'a l'envoi). Sert a prouver le filtre de statut.
  INSERT INTO devis (societe_emettrice_id, client_id, objet,
                     acceptation_token, acceptation_token_expire_at)
  VALUES (v_societe_id, v_client_id, 'PDF brouillon',
          '11111111-1111-1111-1111-111111111111',
          now() + INTERVAL '30 days');

  -- Devis envoye puis force en token expire (freeze n'interdit pas ce champ).
  INSERT INTO devis (societe_emettrice_id, client_id, objet, date_validite)
  VALUES (v_societe_id, v_client_id, 'PDF expire', CURRENT_DATE + 90)
  RETURNING id INTO v_expire_id;

  UPDATE devis SET statut = 'envoye' WHERE id = v_expire_id;
  UPDATE devis SET acceptation_token_expire_at = now() - INTERVAL '1 day'
   WHERE id = v_expire_id;
END $$;

-- --- Helper : execute la RPC sous l'identite anon (chemin reel du lien) ------
CREATE OR REPLACE FUNCTION pg_temp.pdf_as_anon(p_token TEXT)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE v_result JSONB;
BEGIN
  SET LOCAL role anon;
  v_result := public.get_devis_pdf_public(p_token)::JSONB;
  RESET role;
  RETURN v_result;
END;
$$;

-- 1. anon PEUT executer la RPC.
SELECT ok(
  has_function_privilege('anon', 'public.get_devis_pdf_public(text)', 'EXECUTE'),
  'anon PEUT executer get_devis_pdf_public (rendu PDF du lien public)'
);

-- 2. search_path epingle.
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'get_devis_pdf_public'
      AND array_to_string(proconfig, ',') LIKE '%search_path%'
  ),
  'get_devis_pdf_public a un search_path epingle'
);

-- 3. Token valide + statut envoye -> JSON non-null.
SELECT isnt(
  pg_temp.pdf_as_anon(
    (SELECT acceptation_token FROM devis WHERE objet = 'PDF envoye')),
  NULL,
  'token valide (envoye) -> JSON non-null'
);

-- 4. Les 2 lignes sont projetees.
SELECT is(
  jsonb_array_length(
    pg_temp.pdf_as_anon(
      (SELECT acceptation_token FROM devis WHERE objet = 'PDF envoye'))->'lignes'),
  2,
  'projection : 2 lignes'
);

-- 5. La ref du devis est projetee.
SELECT is(
  pg_temp.pdf_as_anon(
    (SELECT acceptation_token FROM devis WHERE objet = 'PDF envoye'))
    ->'devis'->>'ref',
  (SELECT ref FROM devis WHERE objet = 'PDF envoye'),
  'projection : ref du devis correcte'
);

-- 6-10. Exposition minimale : aucun champ sensible dans la projection.
SELECT ok(
  NOT ((pg_temp.pdf_as_anon(
    (SELECT acceptation_token FROM devis WHERE objet = 'PDF envoye'))->'devis')
    ? 'acceptation_token'),
  'devis NE contient PAS acceptation_token'
);

SELECT ok(
  NOT ((pg_temp.pdf_as_anon(
    (SELECT acceptation_token FROM devis WHERE objet = 'PDF envoye'))->'devis')
    ? 'notes_internes'),
  'devis NE contient PAS notes_internes'
);

SELECT ok(
  NOT ((pg_temp.pdf_as_anon(
    (SELECT acceptation_token FROM devis WHERE objet = 'PDF envoye'))->'devis')
    ? 'statut'),
  'devis NE contient PAS statut'
);

SELECT ok(
  NOT ((pg_temp.pdf_as_anon(
    (SELECT acceptation_token FROM devis WHERE objet = 'PDF envoye'))->'societe')
    ? 'email_contact'),
  'societe NE contient PAS email_contact'
);

SELECT ok(
  NOT ((pg_temp.pdf_as_anon(
    (SELECT acceptation_token FROM devis WHERE objet = 'PDF envoye'))->'client')
    ? 'trigramme'),
  'client NE contient PAS trigramme'
);

-- 11. Token expire -> NULL.
SELECT is(
  pg_temp.pdf_as_anon(
    (SELECT acceptation_token FROM devis WHERE objet = 'PDF expire')),
  NULL,
  'token expire -> NULL'
);

-- 12. Token inexistant -> NULL.
SELECT is(
  pg_temp.pdf_as_anon('00000000-0000-0000-0000-000000000000'),
  NULL,
  'token inexistant -> NULL'
);

-- 13. Devis brouillon (token valide) -> NULL (statut non consultable).
SELECT is(
  pg_temp.pdf_as_anon('11111111-1111-1111-1111-111111111111'),
  NULL,
  'devis brouillon (token valide) -> NULL'
);

SELECT * FROM finish();
ROLLBACK;
