-- Cerveau — corrige search_brain_trgm appelée via PostgREST (REST /rpc).
-- ============================================================================
-- pg_trgm est installé dans le schéma `extensions` (convention Supabase), hors
-- du search_path restreint de PostgREST. La fonction échouait donc en REST avec
-- « function similarity(text, text) does not exist » → retrieveNotes() renvoyait
-- [] et l'assistant retombait systématiquement sur le RAG embeddings (le cerveau
-- n'était jamais utilisé). On fige `search_path = public, extensions` sur la
-- fonction pour que `similarity()` et les opérateurs trgm soient résolus.
-- ============================================================================

create or replace function public.search_brain_trgm(q text, k int default 6)
returns setof public.brain_notes
language sql stable
set search_path = public, extensions
as $$
  select *
  from public.brain_notes
  where q <> '' and (title ilike '%'||q||'%' or body ilike '%'||q||'%'
        or similarity(title, q) > 0.1 or similarity(body, q) > 0.05)
  order by greatest(similarity(title, q), similarity(body, q)) desc
  limit greatest(k, 1);
$$;
