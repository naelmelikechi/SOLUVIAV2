-- Projet libre : rattachement automatique des factures orphelines (libres,
-- issues de devis, avoirs historiques) a un vrai projet, un par client, pour
-- etablir l'invariant "aucune facture sans projet". Modele calque sur
-- est_interne (20260428103623_projets_internes.sql).

-- 1. Flag est_libre + exclusivite avec est_interne.
ALTER TABLE projets ADD COLUMN est_libre BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE projets ADD CONSTRAINT chk_libre_interne_exclusifs
  CHECK (NOT (est_interne AND est_libre));

COMMENT ON COLUMN projets.est_libre IS
  'TRUE = projet libre systeme (un par client) portant les factures sans projet metier. Exclu des listings/KPI/pickers, cdp_id NULL (admin-only).';

-- 2. Un seul projet libre par client (idempotence + garde anti-concurrence).
CREATE UNIQUE INDEX uq_projet_libre_par_client
  ON projets (client_id) WHERE est_libre;

-- 3. Typologie dediee 'LIB' : le trigger generate_projet_ref produit
--    NNNN-TRI-LIB. ON CONFLICT (code) pour idempotence (re-run / db reset).
INSERT INTO typologies_projet (id, code, libelle, actif)
VALUES ('00000000-0000-0000-0000-00000000bbff', 'LIB', 'Libre', true)
ON CONFLICT (code) DO NOTHING;

-- 4. Source UNIQUE de la logique find-or-create, partagee runtime (RPC) +
--    backfill. SECURITY INVOKER : un appel RPC direct par un non-admin echoue
--    a l'INSERT via la RLS projets_admin_insert (pas d'escalade de privilege).
CREATE OR REPLACE FUNCTION get_or_create_projet_libre(p_client_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_projet_id uuid;
  v_typologie uuid;
BEGIN
  -- Find : predicat IDENTIQUE a l'index unique (WHERE est_libre, sans archive).
  SELECT id INTO v_projet_id
  FROM projets WHERE client_id = p_client_id AND est_libre LIMIT 1;
  IF FOUND THEN RETURN v_projet_id; END IF;

  SELECT id INTO v_typologie FROM typologies_projet WHERE code = 'LIB';

  INSERT INTO projets (client_id, typologie_id, est_libre, statut, archive, taux_commission, cdp_id)
  VALUES (p_client_id, v_typologie, true, 'actif', false, 0, NULL)
  ON CONFLICT (client_id) WHERE est_libre DO NOTHING
  RETURNING id INTO v_projet_id;

  IF v_projet_id IS NULL THEN
    -- Course concurrente perdue : l'autre insert a gagne, on relit.
    SELECT id INTO v_projet_id
    FROM projets WHERE client_id = p_client_id AND est_libre LIMIT 1;
  END IF;

  RETURN v_projet_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_or_create_projet_libre(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_or_create_projet_libre(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION get_or_create_projet_libre(uuid) TO authenticated;
