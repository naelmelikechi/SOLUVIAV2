-- Fixtures minimales pour les tests e2e (CI et local).
-- Idempotent : rejouable sans erreur. La societe emettrice SOLUVIA existe
-- deja via migration (20260522100000), seul un client de test est requis
-- pour le flux facture libre.
--
-- Convention : tout objet e2e est prefixe "E2E" pour etre reconnaissable
-- et ne JAMAIS etre confondu avec de la donnee reelle.

INSERT INTO public.clients (trigramme, raison_sociale, siret, tva_intracommunautaire, adresse, localisation)
SELECT 'ZZE', 'E2E CLIENT TEST', '90000000000018', 'FR00900000000', '1 rue du Test', '75001 Paris'
WHERE NOT EXISTS (
  SELECT 1 FROM public.clients WHERE trigramme = 'ZZE'
);

-- Client + synthese de passation client-ancree pour le flux passation
-- (saisies 6/8 -> soumission). Depuis la Phase 2 CRM, la synthese est generee
-- automatiquement par le pont opportunite gagnee ; la fixture seed directement
-- une ligne document_synthese en statut 'generee' avec un snapshot V2 minimal
-- autoporteur (le rendu PDF ne relit aucune table commerciale).
INSERT INTO public.clients (trigramme, raison_sociale, siret, adresse, localisation)
SELECT 'ZZP', 'E2E PASSATION TEST', '90000000100010', '1 rue du Test', '75001 Paris'
WHERE NOT EXISTS (
  SELECT 1 FROM public.clients WHERE trigramme = 'ZZP'
);

INSERT INTO public.document_synthese (client_id, statut, reference_dossier, contenu)
SELECT
  c.id,
  'generee',
  'SLV-2026-E2ETEST',
  jsonb_build_object(
    'version', 2,
    'meta', jsonb_build_object(
      'referenceDossier', 'SLV-2026-E2ETEST',
      'numeroContrat', NULL,
      'dateSignature', NULL,
      'dateProduction', now()::text,
      'developpeur', NULL,
      'tunnel', 'entreprise'
    ),
    'identite', jsonb_build_object(
      'raisonSociale', 'E2E PASSATION TEST',
      'formeJuridique', 'SAS',
      'siren', '900000001',
      'siret', '90000000100010',
      'siege', '1 rue du Test, 75001 Paris',
      'codeNaf', '4120B',
      'nafLibelle', 'Construction de bâtiments',
      'region', NULL,
      'siteWeb', 'e2e-passation.test',
      'effectif', '100-249',
      'nbImplantations', NULL,
      'caDernierExercice', NULL
    ),
    'contacts', '[]'::jsonb,
    'historique', jsonb_build_object(
      'canal', NULL,
      'datePremierContact', NULL,
      'initiateur', NULL,
      'evolution', NULL,
      'rdvs', '[]'::jsonb
    ),
    'engagements', jsonb_build_object(
      'perimetre', 'Missions A à K incluses',
      'formationsRncp', '[]'::jsonb,
      'typeFormation', NULL,
      'tauxNpec', 35,
      'dureeAns', 3,
      'moisDemarrage', 3,
      'volumeAn1', 15,
      'volumeAn2', 40,
      'volumeAn3', 70,
      'volumeGarantiSeuil', NULL,
      'leviers', '[]'::jsonb
    ),
    'calendrier', '{}'::jsonb,
    'documents', '[]'::jsonb
  )
FROM public.clients c
WHERE c.trigramme = 'ZZP'
  AND NOT EXISTS (
    SELECT 1 FROM public.document_synthese ds WHERE ds.client_id = c.id
  );
