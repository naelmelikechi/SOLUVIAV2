BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT plan(8);

SELECT ok((SELECT relrowsecurity FROM pg_class WHERE relname = 'devis'), 'RLS active sur devis');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE relname = 'devis_lignes'), 'RLS active sur devis_lignes');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE relname = 'devis_public_views'), 'RLS active sur devis_public_views');

SELECT is(
  (SELECT count(*)::int FROM pg_proc WHERE proname IN ('assign_devis_ref_on_send', 'check_devis_transition', 'freeze_devis_after_send', 'recompute_devis_totaux')),
  4, 'les 4 trigger functions devis sont presentes'
);

SELECT is(
  (SELECT count(*)::int FROM pg_proc WHERE proname IN ('get_devis_public', 'accept_devis_public', 'refuse_devis_public')),
  3, 'les 3 RPCs publiques devis sont presentes'
);

-- Verifie qu il y a bien un LOCK TABLE dans assign_devis_ref (anti-race)
SELECT ok(
  (SELECT prosrc FROM pg_proc WHERE proname = 'assign_devis_ref_on_send') LIKE '%LOCK TABLE devis%',
  'assign_devis_ref_on_send contient le LOCK TABLE devis'
);

-- Verifie que le format ref est DEV-<code>-NNNN
SELECT ok(
  (SELECT prosrc FROM pg_proc WHERE proname = 'assign_devis_ref_on_send') LIKE '%''DEV-'' || v_code%',
  'assign_devis_ref_on_send genere le format DEV-<code>-NNNN'
);

-- Index unique sur (societe_emettrice_id, numero_seq)
SELECT is(
  (SELECT count(*)::int FROM pg_indexes WHERE indexname = 'uq_devis_numero_seq_par_societe'),
  1, 'index unique numero_seq par societe present'
);

SELECT * FROM finish();
ROLLBACK;
