
ALTER TABLE factures
  DROP CONSTRAINT IF EXISTS factures_avoir_statut_check;

ALTER TABLE factures
  ADD CONSTRAINT factures_avoir_statut_check
  CHECK (
    NOT est_avoir
    OR statut IN ('a_emettre', 'avoir')
  );

COMMENT ON CONSTRAINT factures_avoir_statut_check ON factures IS
  'Garantit qu''un avoir (est_avoir=true) ne soit jamais en statut emise/en_retard/payee. Un avoir emis a forcement statut=''avoir''.';
