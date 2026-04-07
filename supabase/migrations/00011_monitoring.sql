-- KPI snapshots (immutable -- no UPDATE or DELETE)
CREATE TABLE kpi_snapshots (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mois       DATE NOT NULL,
  type_kpi   TEXT NOT NULL,
  valeur     NUMERIC(14,2) NOT NULL,
  scope      scope_kpi NOT NULL DEFAULT 'global',
  scope_id   UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_snapshot UNIQUE (mois, type_kpi, scope, scope_id)
);

-- Notifications
CREATE TABLE notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id),
  type       type_notification NOT NULL,
  titre      TEXT NOT NULL,
  message    TEXT,
  lien       TEXT,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
