-- Realignement schema local vs prod (drift constate 2026-05-22).
--
-- En prod (supabase etmdbnmggoowtgqyxkfa) ces colonnes sont nullable
-- pour supporter le scope "facture libre" (sans projet ni contrat), cf
-- composant new-facture-libre-dialog.tsx et action createFreeBrouillon.
-- En local les migrations d'origine (00010_factures.sql) les declaraient
-- NOT NULL. Cette migration realigne le local. En prod, elle est no-op
-- (DROP NOT NULL sur une colonne deja nullable est sans effet).
--
-- Sans cette migration, npx supabase db reset produit un schema local
-- divergent qui casse npx supabase gen types typescript --local
-- (types/database.ts genere depuis la prod a projet_id: string | null,
-- mais l'insert sans projet_id echoue cote local).

ALTER TABLE factures
  ALTER COLUMN projet_id DROP NOT NULL,
  ALTER COLUMN mois_concerne DROP NOT NULL;

ALTER TABLE facture_lignes
  ALTER COLUMN contrat_id DROP NOT NULL;
