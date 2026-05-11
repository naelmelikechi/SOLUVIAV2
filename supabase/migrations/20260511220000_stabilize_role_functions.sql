-- Marque is_admin() et get_user_role() comme STABLE (au lieu de VOLATILE).
--
-- Ces fonctions lisent users.role pour auth.uid() : dans une meme query,
-- elles retournent toujours le meme resultat. Marquer STABLE permet a
-- PostgreSQL de mettre le resultat en cache dans le plan d execution
-- (en plus de notre wrapping `(SELECT is_admin())` dans les policies RLS).
--
-- Pas de risque secu : la verification du role a chaque query reste
-- presente, mais le plan ne fait plus 1 SELECT par ligne.
--
-- Les autres fonctions has_*_access et is_commercial sont deja STABLE.

ALTER FUNCTION public.is_admin() STABLE;
ALTER FUNCTION public.get_user_role() STABLE;
