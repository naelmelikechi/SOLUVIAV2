-- Coût employé annualisé pour le calcul de rentabilité projet.
-- Toutes les colonnes sont nullable: si vide pour un user, on tombe sur les
-- défauts SOLUVIA stockés dans `parametres` (categorie='cout_employe').
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS salaire_brut_annuel NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS primes_annuelles NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS avantages_annuels NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS taux_charges_patronales NUMERIC(5, 2),
  ADD COLUMN IF NOT EXISTS heures_hebdo NUMERIC(5, 2),
  ADD COLUMN IF NOT EXISTS jours_conges_payes INTEGER,
  ADD COLUMN IF NOT EXISTS jours_rtt INTEGER;

-- Données RH sensibles : on les sort de la portée du rôle authenticated.
-- Seul le service_role (admin client server-side) peut les lire/écrire.
-- Les CDP ne pourront jamais récupérer ces colonnes via l'API directe,
-- même si la policy users permet SELECT * sur les autres champs.
REVOKE SELECT (
  salaire_brut_annuel,
  primes_annuelles,
  avantages_annuels,
  taux_charges_patronales,
  heures_hebdo,
  jours_conges_payes,
  jours_rtt
) ON users FROM authenticated, anon;

REVOKE UPDATE (
  salaire_brut_annuel,
  primes_annuelles,
  avantages_annuels,
  taux_charges_patronales,
  heures_hebdo,
  jours_conges_payes,
  jours_rtt
) ON users FROM authenticated, anon;

-- Defaults SOLUVIA (parametres categorie='cout_employe') - admin only via UI
INSERT INTO parametres (cle, valeur, categorie, description) VALUES
  ('salaire_brut_annuel_defaut', '40000', 'cout_employe', 'Salaire brut annuel par défaut (€) - utilisé pour les CDP sans coût personnalisé'),
  ('primes_annuelles_defaut', '0', 'cout_employe', 'Primes annuelles par défaut (€)'),
  ('avantages_annuels_defaut', '1800', 'cout_employe', 'Avantages annuels par défaut (€) - tickets resto + mutuelle'),
  ('taux_charges_patronales_defaut', '42', 'cout_employe', 'Taux charges patronales (%) appliqué sur le brut'),
  ('heures_hebdo_defaut', '35', 'cout_employe', 'Heures hebdomadaires de référence'),
  ('jours_conges_payes_defaut', '25', 'cout_employe', 'Jours de congés payés annuels (ouvrés)'),
  ('jours_rtt_defaut', '0', 'cout_employe', 'Jours RTT annuels (cadres au forfait)')
ON CONFLICT (cle) DO NOTHING;
