-- Permet 2 screenshots par report : capture auto de la page + screenshot
-- additionnel fourni par l'utilisateur. screenshot_path conserve le premier
-- (auto) pour retro-compat ; auto_screenshot_path et extra_screenshot_path
-- nouveaux pour plus de clarte semantique.

ALTER TABLE bug_reports
  ADD COLUMN auto_screenshot_path TEXT,
  ADD COLUMN extra_screenshot_path TEXT;

UPDATE bug_reports
SET extra_screenshot_path = screenshot_path
WHERE screenshot_path IS NOT NULL;

COMMENT ON COLUMN bug_reports.auto_screenshot_path IS
'Capture automatique de la page au moment du clic sur le bouton bug.';
COMMENT ON COLUMN bug_reports.extra_screenshot_path IS
'Capture additionnelle fournie par l utilisateur (upload, drag-drop, paste).';
