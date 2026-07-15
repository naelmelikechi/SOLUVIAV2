-- Notification "contrat facturable dans Eduvia" (cron a-facturer-notif) :
-- envoyee au CDP du projet + superadmins quand un contrat apparait dans la
-- liste A facturer (echeance OPCO due non transmise).
ALTER TYPE type_notification ADD VALUE IF NOT EXISTS 'contrat_facturable';
