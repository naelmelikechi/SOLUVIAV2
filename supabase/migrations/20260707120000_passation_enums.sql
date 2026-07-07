-- Passation V2 (spec Feature 6 complète) — nouveaux enums. ADD VALUE isolés
-- dans leur propre migration : les valeurs ne sont utilisables qu'après commit
-- (le backfill est dans la migration suivante).

-- Statuts spec F6 : Généré → En cours de complétion → En attente d'arbitrage
-- → CDP affecté → Archivé. Les valeurs legacy diffusee_vague1/diffusee_vague2
-- restent dans l'enum (Postgres ne retire pas de valeur) mais ne sont plus
-- écrites après le backfill.
ALTER TYPE statut_synthese ADD VALUE IF NOT EXISTS 'en_cours_completion';
ALTER TYPE statut_synthese ADD VALUE IF NOT EXISTS 'en_attente_arbitrage';
ALTER TYPE statut_synthese ADD VALUE IF NOT EXISTS 'cdp_affecte';

-- Rôle interlocuteur « Référent DRH » (maquette section 2).
ALTER TYPE role_decision_contact ADD VALUE IF NOT EXISTS 'drh';

-- Notifications du workflow (génération auto + rappels/escalades).
ALTER TYPE type_notification ADD VALUE IF NOT EXISTS 'passation_a_completer';
ALTER TYPE type_notification ADD VALUE IF NOT EXISTS 'passation_rappel';

-- Section 8 structurée (recommandation d'affectation du Développeur).
CREATE TYPE typologie_client AS ENUM (
  'exigeant',
  'collaboratif',
  'autonome',
  'accompagnement_fort'
);
CREATE TYPE niveau_charge AS ENUM ('faible', 'moyenne', 'forte');
CREATE TYPE niveau_risque AS ENUM ('faible', 'moyen', 'fort');

-- Engagements négociés (section 4) et historique commercial (section 3).
CREATE TYPE type_formation AS ENUM ('presentiel', 'distanciel', 'hybride');
CREATE TYPE initiateur_contact AS ENUM ('soluvia', 'prospect');
