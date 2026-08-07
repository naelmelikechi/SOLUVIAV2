-- Correctifs issus de la revue de securite du module Projet (7 lots).
--
-- Six points, une seule migration : ils partagent la meme famille (invariants
-- qui doivent tenir quel que soit le chemin d'ecriture) et se relisent mieux
-- ensemble que dispersees.
--
--   1. l'archivage automatique etait defait chaque matin par la sync Eduvia
--   2. set_contrat_state_changed_at n'avait pas de branche ELSE
--   3. set_lancement_date_realisation acceptait une date fournie par le client
--   4. policies laissees en TO public au lieu de TO authenticated
--   5. is_admin() nu au lieu de (SELECT is_admin()) sur les ecritures
--   6. index FK manquant sur contrats_regles_archivage.updated_by
--   7. parametre de retention du journal des mails

-- ---------------------------------------------------------------------------
-- 1. L'archivage par regle survit a la synchronisation Eduvia
-- ---------------------------------------------------------------------------
-- La sync Eduvia (lib/eduvia/sync.ts) repose `archive = false` sur toutes les
-- lignes qu'elle voit : c'est sa facon de dire "ce contrat existe toujours
-- chez Eduvia, ce n'est pas un fantome". Elle tourne de 9h a 18h, le cron
-- d'archivage a 4h30. Resultat avant ce correctif : un contrat archive a 4h30
-- etait desarchive a 9h, tous les jours, en laissant archive_auto_le et
-- archive_regle_id renseignes sur une ligne archive = false. La
-- fonctionnalite ne produisait rien et polluait la tracabilite.
--
-- La colonne `archive` porte deux sens qui entrent en conflit ("fantome
-- Eduvia" et "sorti de la production par une regle"). On ne peut donc pas
-- retirer le `archive: false` de la sync : on protege le second sens par un
-- trigger, plutot que par une condition dans le code applicatif. Meme raison
-- que partout ailleurs dans ce chantier : l'invariant doit tenir quel que soit
-- le chemin d'ecriture, et RLS n'a pas acces a OLD.

CREATE OR REPLACE FUNCTION protege_archivage_auto_contrat()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Un contrat sorti de la production par une regle ne peut pas etre
  -- desarchive par une ecriture qui ne l'a pas decide.
  --
  -- Le desarchivage volontaire reste possible : il suffit d'effacer
  -- archive_regle_id dans la meme instruction, ce que fait l'action de
  -- desarchivage manuel (lib/actions/contrats-regles.ts).
  IF OLD.archive_regle_id IS NOT NULL
     AND NEW.archive_regle_id IS NOT DISTINCT FROM OLD.archive_regle_id
     AND NEW.archive IS DISTINCT FROM OLD.archive
     AND NEW.archive = false
  THEN
    NEW.archive := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protege_archivage_auto_contrat ON contrats;

CREATE TRIGGER trg_protege_archivage_auto_contrat
  BEFORE UPDATE ON contrats
  FOR EACH ROW EXECUTE FUNCTION protege_archivage_auto_contrat();

-- Nettoyage des lignes deja incoherentes : archivees par une regle puis
-- desarchivees par la sync, elles portent une tracabilite qui ne correspond a
-- rien. On efface la trace plutot que de re-archiver : ces contrats ont passe
-- des jours dans la production affichee, les re-sortir en silence changerait
-- des chiffres deja lus. Le prochain passage du cron les reprendra si la
-- regle s'applique toujours, et cette fois l'archivage tiendra.
UPDATE contrats
   SET archive_auto_le = NULL,
       archive_regle_id = NULL
 WHERE archive = false
   AND archive_regle_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. contract_state_changed_at n'est plus fixable de l'exterieur
-- ---------------------------------------------------------------------------
-- Sans branche ELSE, un UPDATE sans changement d'etat conservait la valeur du
-- payload : PATCH /contrats?id=eq.X {"contract_state_changed_at":"2020-01-01"}
-- faisait sortir un contrat de la production au cron suivant, sans qu'aucun
-- etat n'ait change. Reserve aux admins par la policy existante, mais c'est un
-- contournement silencieux d'un invariant.

CREATE OR REPLACE FUNCTION set_contrat_state_changed_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.contract_state_changed_at := COALESCE(NEW.contract_state_changed_at, now());
  ELSIF NEW.contract_state IS DISTINCT FROM OLD.contract_state THEN
    NEW.contract_state_changed_at := now();
  ELSE
    -- Aucun changement d'etat : la date ne bouge pas, quoi qu'envoie
    -- l'appelant. C'est cette colonne qui decide de l'archivage automatique.
    NEW.contract_state_changed_at := OLD.contract_state_changed_at;
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. date_realisation n'est plus fixable de l'exterieur
-- ---------------------------------------------------------------------------
-- Le trigger ne posait la date que si NEW.date_realisation IS NULL : une
-- valeur fournie par le client etait conservee telle quelle. Or la policy
-- lancement_etapes_update autorise le CDP du projet a ecrire. Un CDP pouvait
-- appeler PostgREST avec {"statut":"depose","date_realisation":"2026-06-01"}
-- et neutraliser l'alerte "en retard" sur son propre projet.
--
-- Comportement voulu, inchange : posee au premier passage en depose (ou en
-- lance si l'etape saute depose), effacee si l'etape repasse en dessous,
-- jamais fixable de l'exterieur.

CREATE OR REPLACE FUNCTION set_lancement_date_realisation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.statut IN ('depose', 'lance') THEN
    IF TG_OP = 'UPDATE' AND OLD.date_realisation IS NOT NULL THEN
      -- Deja realisee : la date du premier depot fait foi et ne se reecrit
      -- pas. (OLD.date_realisation non nulle implique OLD.statut deja dans
      -- ('depose','lance') : le trigger l'efface dans tous les autres cas.)
      NEW.date_realisation := OLD.date_realisation;
    ELSE
      -- Premier passage : la date est celle du jour, pas celle du payload.
      NEW.date_realisation := CURRENT_DATE;
    END IF;
  ELSE
    NEW.date_realisation := NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4 et 5. Policies : TO authenticated + is_admin() wrappe partout
-- ---------------------------------------------------------------------------
-- Convention posee par le correctif de securite #123 : jamais TO public (qui
-- inclut anon), et is_admin() toujours wrappe en (SELECT is_admin()) pour que
-- Postgres l'evalue une fois par requete et non une fois par ligne.

DROP POLICY IF EXISTS regles_archivage_select ON contrats_regles_archivage;
DROP POLICY IF EXISTS regles_archivage_insert ON contrats_regles_archivage;
DROP POLICY IF EXISTS regles_archivage_update ON contrats_regles_archivage;
DROP POLICY IF EXISTS regles_archivage_delete ON contrats_regles_archivage;

CREATE POLICY regles_archivage_select ON contrats_regles_archivage
  FOR SELECT TO authenticated USING ((SELECT is_admin()));
CREATE POLICY regles_archivage_insert ON contrats_regles_archivage
  FOR INSERT TO authenticated WITH CHECK ((SELECT is_admin()));
CREATE POLICY regles_archivage_update ON contrats_regles_archivage
  FOR UPDATE TO authenticated
  USING ((SELECT is_admin())) WITH CHECK ((SELECT is_admin()));
CREATE POLICY regles_archivage_delete ON contrats_regles_archivage
  FOR DELETE TO authenticated USING ((SELECT is_admin()));

DROP POLICY IF EXISTS emails_envoyes_select ON emails_envoyes;

CREATE POLICY emails_envoyes_select ON emails_envoyes
FOR SELECT TO authenticated USING (
  (SELECT is_admin())
  OR EXISTS (
    SELECT 1 FROM projets p
     WHERE p.id = emails_envoyes.projet_id
       AND (p.cdp_id = (SELECT auth.uid()) OR p.backup_cdp_id = (SELECT auth.uid()))
  )
  OR (
    emails_envoyes.projet_id IS NULL
    AND EXISTS (
      SELECT 1 FROM projets p
       WHERE p.client_id = emails_envoyes.client_id
         AND (p.cdp_id = (SELECT auth.uid()) OR p.backup_cdp_id = (SELECT auth.uid()))
    )
  )
);

-- ---------------------------------------------------------------------------
-- 6. Index sur clef etrangere
-- ---------------------------------------------------------------------------
-- Regle systematique du depot : toute FK porte un index, sans quoi la
-- suppression d'un utilisateur declenche un seq scan de la table referencante.

CREATE INDEX IF NOT EXISTS idx_regles_archivage_updated_by
  ON contrats_regles_archivage (updated_by);

-- ---------------------------------------------------------------------------
-- 7. Retention du journal des mails
-- ---------------------------------------------------------------------------
-- emails_envoyes accumule des metadonnees issues des boites de salaries. Le
-- commentaire RGPD de sa migration d'origine promet un perimetre "reduit au
-- strict necessaire" : sans duree de conservation ni chemin d'effacement, la
-- promesse ne tenait pas dans le temps. La purge est appliquee par le cron
-- gmail-collecte (app/api/cron/gmail-collecte/route.ts), y compris quand la
-- collecte Gmail est inactive.

INSERT INTO parametres (cle, valeur, categorie, description)
VALUES (
  'suivi.retention_emails_mois',
  '24',
  'suivi',
  'Nombre de mois de conservation des metadonnees du journal des mails - au-dela, les lignes sont supprimees chaque jour par le cron de collecte'
)
ON CONFLICT (cle) DO NOTHING;
