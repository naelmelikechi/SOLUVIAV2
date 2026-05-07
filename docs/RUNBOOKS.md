# Runbooks SOLUVIA

Procedures manuelles pour reagir aux incidents qu'on ne peut pas
recuperer automatiquement.

---

## Auth.users orphelin apres echec de `deleteUser`

### Symptome

Un superadmin a tente de supprimer un user via /admin/utilisateurs. Le
toast affiche :

> Profil supprime mais l'auth Supabase est restee : contactez un superadmin

Cause : la migration cote DB (`delete_user_cascade` RPC) a reussi, mais
l'appel `auth.admin.deleteUser` a echoue (erreur reseau, rate-limit
Supabase, etc). On a un user dans `auth.users` sans entree
`public.users` correspondante. Symptomes derives :

- Re-inviter avec le meme email echoue : "Email already registered"
- Le user fantome n'apparait nulle part dans l'app
- Aucune donnee metier rattachee (RPC a tout nettoye)

### Reconciliation

1. **Identifier l'orphelin**. Dans le SQL Editor Supabase :

   ```sql
   SELECT a.id, a.email, a.created_at
   FROM auth.users a
   LEFT JOIN public.users p ON p.id = a.id
   WHERE p.id IS NULL;
   ```

2. **Verifier qu'aucune donnee metier ne reference l'id** (la cascade
   DB a deja nettoye, mais defense en profondeur) :

   ```sql
   SELECT 'notifications' AS t, count(*) FROM notifications WHERE user_id = '<auth_id>'
   UNION ALL SELECT 'saisies_temps', count(*) FROM saisies_temps WHERE user_id = '<auth_id>'
   UNION ALL SELECT 'projets_cdp', count(*) FROM projets WHERE cdp_id = '<auth_id>'
   UNION ALL SELECT 'projets_backup', count(*) FROM projets WHERE backup_cdp_id = '<auth_id>'
   UNION ALL SELECT 'factures', count(*) FROM factures WHERE created_by = '<auth_id>';
   ```

   Toutes les counts doivent etre `0`. Sinon, re-executer la cascade :
   `SELECT delete_user_cascade('<auth_id>'::uuid);` (en tant que
   superadmin connecte).

3. **Supprimer l'auth orphelin** via la dashboard Supabase Admin
   (Authentication > Users > Delete) OU via la CLI :

   ```bash
   supabase auth users delete <auth_id>
   ```

4. **Re-inviter** depuis /admin/utilisateurs si necessaire.

### Prevention

- L'erreur `auth.admin.deleteUser` etait silencieusement ignoree avant
  le sprint 5 (#5). Maintenant on retourne une erreur explicite et le
  superadmin sait qu'il doit reconcilier manuellement.
- Si le pattern se repete, suspecter un rate-limit Supabase Auth ou une
  panne reseau. Verifier les logs Vercel pour l'erreur exacte (le
  `logger.error('actions.users', 'auth.admin.deleteUser failed', ...)`
  en pousse une).
