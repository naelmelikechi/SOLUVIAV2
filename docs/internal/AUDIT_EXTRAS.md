# Findings hors-scope audit sprint 5

Items decouverts en cours de remediation mais hors du scope sprint 5.
A trier en sprint 6.

## ~~Pre-existant : timestamps de migration en collision~~ RESOLU

Deux migrations partageaient le meme prefix `20260506160000` :

- `supabase/migrations/20260506160000_drop_qualite_evidence_notes.sql`
- `supabase/migrations/20260506160000_facturation_v2_brouillons_events.sql`

Symptome : `supabase start` / `db push` sur fresh install echouait
avec `duplicate key value violates unique constraint
"schema_migrations_pkey"`. Confirme par le CI sprint 7 (workflow
`sql-tests.yml`).

**Fix sprint 7** : la 2e migration a ete renommee en
`20260506160100_facturation_v2_brouillons_events.sql`. Aucun impact
sur la prod, qui a deja applique les deux migrations sous des
timestamps differents (`20260506103843` + `20260506161233`). Le
rename local n affecte que les fresh installs (CI, dev local) qui
partent vide.
