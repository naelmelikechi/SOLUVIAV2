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
