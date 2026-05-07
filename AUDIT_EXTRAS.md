# Findings hors-scope audit sprint 5

Items decouverts en cours de remediation mais hors du scope sprint 5.
A trier en sprint 6.

## Pre-existant : timestamps de migration en collision

Deux migrations partagent le meme prefix `20260506160000` :

- `supabase/migrations/20260506160000_drop_qualite_evidence_notes.sql`
- `supabase/migrations/20260506160000_facturation_v2_brouillons_events.sql`

Symptome : `supabase db push --local` echoue avec
`duplicate key value violates unique constraint "schema_migrations_pkey"
Key (version)=(20260506160000) already exists` sur la 2e migration.
Le contournement applique pendant le sprint 5 a ete d appliquer
manuellement les migrations restantes via psql.

Sur prod : ces 2 migrations sont probablement appliquees (sinon
billing_mode et qualite_evidence_notes seraient cassees), mais la
table `schema_migrations` ne reflete que la 1ere. Risque : un
prochain `db push` peut tomber sur un etat inconsistant.

Fix recommande : renommer
`20260506160000_facturation_v2_brouillons_events.sql` en
`20260506160100_*.sql` (ou autre timestamp unique +1min) et inserer
manuellement le row correspondant dans `schema_migrations` cote prod.
A faire dans une fenetre maintenance.
