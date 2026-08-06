-- Timeline de lancement : dimension temporelle.
--
-- date_objectif   : saisie par l'admin ou le CDP, "quand ca devrait etre parti".
-- date_realisation: posee automatiquement au premier passage en depose (ou en
--                   lance si l'etape saute l'etape depose).
--
-- Decision produit validee : l'objectif est REALISE au depot, pas a la fin.
-- Ce qui compte pour tenir un objectif, c'est que le dossier soit parti chez
-- le tiers instructeur ; ce que le tiers en fait ensuite ne nous appartient
-- plus (c'est l'alerte "enlise", derivee cote application).
--
-- Les deux alertes ("en retard", "enlise") ne sont PAS stockees : elles se
-- derivent de ces deux dates et du statut. Une alerte stockee serait fausse
-- des le lendemain sans que rien ne l'ait mise a jour.

ALTER TABLE projet_lancement_etapes
  ADD COLUMN IF NOT EXISTS date_objectif    DATE,
  ADD COLUMN IF NOT EXISTS date_realisation DATE;

-- ---------------------------------------------------------------------------
-- date_realisation posee par trigger, jamais par le code applicatif
-- ---------------------------------------------------------------------------
-- Le trigger garantit la coherence quel que soit le chemin d'ecriture (Server
-- Action, import, correction manuelle en base). RLS n'a pas acces a OLD, donc
-- une policy ne pourrait pas exprimer "seulement si c'etait null".
--
-- Retour en arriere : si une etape repasse sous "depose" (correction d'une
-- erreur de saisie), la date est effacee. Sans cela, l'etape resterait
-- "realisee" tout en etant "en cours", et la regle "en retard" ne pourrait
-- plus jamais la signaler.

CREATE OR REPLACE FUNCTION set_lancement_date_realisation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.statut IN ('depose', 'lance') THEN
    IF NEW.date_realisation IS NULL THEN
      NEW.date_realisation := CURRENT_DATE;
    END IF;
  ELSE
    NEW.date_realisation := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lancement_date_realisation ON projet_lancement_etapes;

CREATE TRIGGER trg_lancement_date_realisation
  BEFORE INSERT OR UPDATE ON projet_lancement_etapes
  FOR EACH ROW EXECUTE FUNCTION set_lancement_date_realisation();

-- ---------------------------------------------------------------------------
-- Backfill des lignes existantes
-- ---------------------------------------------------------------------------
-- Approximation assumee : on ne sait pas quand ces etapes sont passees en
-- depose, seulement quand leur ligne a ete modifiee pour la derniere fois.
-- Pour une etape deja deposee ou lancee, updated_at est le meilleur indice
-- disponible. Sans backfill, toutes les etapes deja parties apparaitraient
-- comme jamais realisees.

UPDATE projet_lancement_etapes
   SET date_realisation = updated_at::date
 WHERE statut IN ('depose', 'lance')
   AND date_realisation IS NULL;

-- ---------------------------------------------------------------------------
-- Seuil d'enlisement, modifiable sans redeploiement
-- ---------------------------------------------------------------------------

INSERT INTO parametres (cle, valeur, categorie, description)
VALUES (
  'lancement.seuil_enlisement_jours',
  '15',
  'lancement',
  'Nombre de jours au-dela duquel une etape deposee et non terminee est signalee comme enlisee chez le tiers instructeur'
)
ON CONFLICT (cle) DO NOTHING;
