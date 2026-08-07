-- La policy de lecture de emails_envoyes ne couvrait que projet_id : un mail
-- rattache au seul client (projet_id NULL) n'etait visible que par un admin.
--
-- Or la query de la fiche projet va chercher "projet_id = X OU (projet_id IS
-- NULL ET client_id = Y)" : pour un CDP, la seconde branche etait filtree par
-- RLS et la fonctionnalite ne marchait qu'en admin. Un mail est rattache au
-- seul client des que l'appelant ne connait pas le projet concerne, ce qui est
-- le cas le plus frequent cote collecte Gmail.
--
-- On aligne la policy sur l'intention : un CDP voit les mails de ses projets,
-- et les mails de ses clients non rattaches a un projet precis.

DROP POLICY IF EXISTS emails_envoyes_select ON emails_envoyes;

CREATE POLICY emails_envoyes_select ON emails_envoyes FOR SELECT USING (
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
