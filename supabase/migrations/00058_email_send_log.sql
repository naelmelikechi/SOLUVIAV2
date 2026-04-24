-- Idempotence des crons email : empeche un double envoi si Vercel retente.
-- periode_key identifie la fenetre couverte par l'email (p.ex. "2026-W17" pour
-- un hebdo, "2026-04" pour un mensuel, "2026-04-25" pour un jour ponctuel).
create table if not exists public.email_send_log (
  id uuid primary key default gen_random_uuid(),
  job text not null,
  periode_key text not null,
  sent_at timestamptz not null default now(),
  recipients_count integer,
  metadata jsonb,
  unique (job, periode_key)
);

create index if not exists idx_email_send_log_sent_at
  on public.email_send_log (sent_at desc);

-- RLS: aucun acces lecture cote utilisateur. Seul le service_role ecrit.
alter table public.email_send_log enable row level security;
