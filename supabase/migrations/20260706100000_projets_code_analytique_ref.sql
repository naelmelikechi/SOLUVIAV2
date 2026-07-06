-- Convention analytique "REF SEULE" : un projet = un compte analytique = sa
-- ref (ex 0016-HEO-APP), pour TOUS les projets (plus seulement les libres).
-- Le suffixe typologie de la ref (-APP/-POE/-PDC/-LIB) sert de rollup par
-- nature cote Odoo (filtre "code like %-APP"). Les comptes analytiques Odoo
-- sont auto-crees au push (pushAnalyticLineForMove autoCreateAccount).
--
-- Semantique inchangee : le code est pose UNIQUEMENT si NULL (jamais
-- d'ecrasement d'une valeur posee explicitement a l'insert).
--
-- Generalise 20260706090000_projet_libre_code_analytique.sql (qui ne couvrait
-- que get_or_create_projet_libre) : desormais un trigger DB couvre tous les
-- chemins d'insertion. Le self-heal de get_or_create_projet_libre reste en
-- place (filet redondant, meme predicat IS NULL).

-- 1. Trigger BEFORE INSERT : code_analytique = ref par defaut.
--    ORDRE CRITIQUE : la ref est elle-meme generee par le trigger BEFORE
--    INSERT trg_projet_ref (generate_projet_ref, cf. 00020/00021). Les
--    triggers d'un meme event se declenchent par ordre alphabetique du nom :
--    'zzz_projets_code_analytique' > 'trg_projet_ref', donc NEW.ref est deja
--    rempli quand ce trigger s'execute (generate_projet_ref pose NEW.ref et
--    RETURN NEW ; la ligne modifiee est transmise au trigger suivant).
CREATE OR REPLACE FUNCTION public.projets_default_code_analytique()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NEW.code_analytique IS NULL THEN
    NEW.code_analytique := NEW.ref;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zzz_projets_code_analytique ON projets;
CREATE TRIGGER zzz_projets_code_analytique
  BEFORE INSERT ON projets
  FOR EACH ROW EXECUTE FUNCTION projets_default_code_analytique();

-- 2. Backfill : tous les projets sans code (archives compris) recuperent
--    leur ref comme code analytique.
UPDATE projets SET code_analytique = ref
WHERE code_analytique IS NULL;

-- 3. Bascule explicite (decision produit) : 0016-HEO-APP portait l'ancien
--    code typologique '11.01.CTR.COM' (nomenclature N3 FINANCES-WISEMANH,
--    cf. 20260526120000). Il passe a sa ref comme tous les autres.
UPDATE projets SET code_analytique = ref
WHERE code_analytique = '11.01.CTR.COM';

-- 4. Documentation de la convention au niveau colonne.
COMMENT ON COLUMN projets.code_analytique IS
  'Code du compte analytique Odoo (account.analytic.account.code). Convention "ref seule" : code = projets.ref (pose par trigger a l''insert si NULL, compte Odoo auto-cree au push). Le suffixe typologie de la ref (-APP/-POE/-PDC/-LIB) sert de rollup par nature.';
