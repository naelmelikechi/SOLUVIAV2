-- Delai d'echeance par defaut des factures : 7 jours.
--
-- date_echeance = date_emission + 7 (cf. getDelaiEcheanceJours +
-- lib/utils/dates.addDaysIso). Auparavant la date_echeance etait codee en dur
-- ("fin du mois prochain" via lastDayOfNextMonthUtcISO) et le parametre
-- facturation.delai_echeance_jours etait inerte (jamais lu, et le formulaire
-- admin ecrivait sur une mauvaise cle). On force ici la valeur a 7 et on
-- garantit l'existence de la ligne en prod. Idempotent (re-jouable sans effet
-- de bord).
--
-- Les factures DEJA emises ne sont pas touchees : date_echeance est immutable
-- apres emission (trigger factures_integrity_guards). Seul le defaut a la
-- creation des nouveaux brouillons/factures change.
INSERT INTO parametres (cle, valeur, categorie, description)
VALUES (
  'facturation.delai_echeance_jours',
  '7',
  'facturation',
  'Delai echeance en jours (date_echeance = date_emission + N)'
)
ON CONFLICT (cle) DO UPDATE
  SET valeur = EXCLUDED.valeur,
      description = EXCLUDED.description;
