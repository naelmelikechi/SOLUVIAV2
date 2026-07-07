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

-- Prospect signé pour le flux passation (generation -> saisies 6/8 ->
-- soumission). Stage 'signe' suffit au guard de genererSynthese.
INSERT INTO public.prospects (
  type_prospect, nom, stage, siren, forme_juridique, adresse,
  code_naf, naf_libelle, effectif_tranche, site_web,
  taux_npec, duree_contrat_ans, mois_demarrage,
  volume_an1, volume_an2, volume_an3, perimetre_missions
)
SELECT
  'entreprise', 'E2E PASSATION TEST', 'signe', '900000001', 'SAS',
  '1 rue du Test, 75001 Paris', '4120B', 'Construction de bâtiments',
  '100-249', 'e2e-passation.test',
  35, 3, 3, 15, 40, 70, 'Missions A à K incluses'
WHERE NOT EXISTS (
  SELECT 1 FROM public.prospects WHERE nom = 'E2E PASSATION TEST'
);
