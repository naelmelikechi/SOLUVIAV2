-- Projet libre : code_analytique = ref automatique. Ferme la boucle analytique
-- Odoo pour les factures generiques : les projets libres naissaient avec
-- code_analytique NULL -> pushAnalyticLineForMove skippait toutes les lignes.
-- Semantique : le code est pose UNIQUEMENT si NULL (jamais d'ecrasement d'une
-- valeur posee manuellement) ; l'appel repare aussi un projet libre historique
-- dont le code serait NULL (self-heal, meme predicat que le backfill).

-- 1. Reproduction a l'identique de 20260630120000_projets_libre.sql, avec pour
--    seul ajout l'UPDATE code_analytique. La ref est generee par le trigger
--    BEFORE INSERT trg_projet_ref (generate_projet_ref) : elle est disponible
--    des le RETURNING, mais on passe par un UPDATE unique en fin de fonction
--    pour couvrir les trois chemins (find, insert, course concurrente perdue).
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

  IF NOT FOUND THEN
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
  END IF;

  -- code_analytique = ref (compte analytique Odoo auto-cree au push).
  -- Pose UNIQUEMENT si NULL : pas d'ecrasement manuel, self-heal des NULL.
  UPDATE projets SET code_analytique = ref
  WHERE id = v_projet_id AND code_analytique IS NULL;

  RETURN v_projet_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_or_create_projet_libre(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_or_create_projet_libre(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION get_or_create_projet_libre(uuid) TO authenticated;

-- 2. Backfill : les projets libres existants (3 en prod) recuperent leur ref
--    comme code analytique. Meme garde IS NULL que la fonction.
UPDATE projets SET code_analytique = ref
WHERE est_libre = true AND code_analytique IS NULL;
