# Tests SQL d'intégration

Tests pgTAP qui vérifient les invariants DB-level que vitest ne peut pas
couvrir (triggers atomiques, RLS policies, fonctions plpgsql).

## Lancement

Nécessite Docker + Supabase CLI :

```bash
npx supabase start             # démarre Postgres local + applique migrations
npx supabase test db           # lance tous les *.sql dans supabase/tests/
```

Sur CI : ajouter un job dédié qui spin up Supabase via docker-compose ou
GitHub Actions service container `supabase/postgres`.

## Catalogue

- `01_gapless_invoice.sql` : trigger `assign_facture_ref_on_send` doit
  attribuer un `numero_seq` strictement +1 et un `ref` formate
  `FAC-<TRIGRAMME>-<XXXX>` au passage `a_emettre -> emise/avoir`. Aucun
  trou dans la séquence, même sous concurrence.
- `02_rls_facture_delete.sql` : la RLS sur `factures` doit autoriser
  DELETE uniquement quand `statut = 'a_emettre'` (brouillon). Toute
  facture émise/payée/avoir doit refuser DELETE même pour un superadmin.
- `03_delete_user_cascade.sql` : la fonction `delete_user_cascade`
  doit nettoyer les 7 tables en transaction et refuser un caller non
  superadmin.
