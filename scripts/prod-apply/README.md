# Apply migrations synergies en prod

> Le `supabase db push --linked` standard n'est pas utilisable ici à cause d'un
> drift d'historique existant entre les migrations locales et la prod (des
> migrations ont été appliquées via le SQL Editor sans CLI). Pour éviter tout
> risque sur la prod live, on applique les nouvelles migrations manuellement.

## Étapes

1. Ouvrir Supabase Dashboard → projet SOLUVIA → SQL Editor.
2. Coller le contenu de [`synergies-migrations.sql`](./synergies-migrations.sql).
3. Run. Les migrations sont **idempotentes** (`CREATE TABLE IF NOT EXISTS`,
   `ADD COLUMN IF NOT EXISTS`) → safe à rejouer.
4. Vérifier :
   ```sql
   SELECT column_name FROM information_schema.columns WHERE table_name='projets' AND column_name='code_analytique';
   SELECT column_name FROM information_schema.columns WHERE table_name='facture_lignes' AND column_name='analytic_line_odoo_id';
   SELECT table_name FROM information_schema.tables WHERE table_name='bank_lines_mirror';
   ```
   → les 3 doivent retourner 1 ligne.
5. **Régénérer les types** :
   ```bash
   npx supabase gen types typescript --linked > types/database.ts
   ```
   (Optionnel, à faire au prochain dev local pour retirer les casts `as any`/`as never`.)

## Contenu (rappel)

- `projets.code_analytique TEXT NULL` (+ index partiel)
- `facture_lignes.analytic_line_odoo_id TEXT NULL`
- Table `bank_lines_mirror` complète + index trigram + RLS admin/superadmin
