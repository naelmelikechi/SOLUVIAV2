-- Fix Sentry SOLUVIA-N / SOLUVIA-M / SOLUVIA-Q : "permission denied for function is_admin"
--
-- Contexte : les helpers RLS (is_admin, get_user_role, etc.) sont SECURITY
-- DEFINER et EXECUTE etait granted uniquement a authenticated + service_role
-- (cf. migration 20260511223719_revoke_security_definer_from_public.sql).
--
-- Probleme : quand un cookie sb-*-auth-token est present mais invalide
-- (token expire, signature invalide), le client SSR Supabase tombe au role
-- anon. Le proxy.ts ne valide que la PRESENCE du cookie, pas sa validite.
-- Toute requete sur une table dont la policy appelle is_admin() explose en
-- 42501 "permission denied for function" avant meme que le layout puisse
-- rediriger vers /login.
--
-- Fix : grant EXECUTE TO anon sur les helpers. La fonction est SECURITY
-- DEFINER et son corps fait `WHERE id = auth.uid()` ; pour anon, auth.uid()
-- est NULL donc la fonction retourne false sans rien fuir. Les policies
-- evaluent alors a 0 ligne au lieu de crasher.
--
-- Defense en profondeur : le layout (dashboard) redirige toujours vers
-- /login quand getCurrentUser() est null. Ce grant evite juste le crash
-- pendant la breve fenetre ou la query du page run en parallele de la
-- redirect du layout.

GRANT EXECUTE ON FUNCTION public.is_admin() TO anon;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO anon;
GRANT EXECUTE ON FUNCTION public.is_commercial() TO anon;
GRANT EXECUTE ON FUNCTION public.has_pipeline_access() TO anon;
GRANT EXECUTE ON FUNCTION public.has_ship_ideas_access() TO anon;
GRANT EXECUTE ON FUNCTION public.has_validate_ideas_access() TO anon;
