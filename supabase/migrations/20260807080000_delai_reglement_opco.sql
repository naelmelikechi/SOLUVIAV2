-- Delai au-dela duquel un jalon OPCO transmis et non regle est considere en
-- retard d'encaissement. 60 jours : ordre de grandeur constate des delais de
-- reglement OPCO. Modifiable dans /admin/parametres sans redeploiement, parce
-- que ce delai varie d'un OPCO a l'autre et se calera a l'usage.

INSERT INTO parametres (cle, valeur, categorie, description)
VALUES (
  'facturation.delai_reglement_opco_jours',
  '60',
  'facturation',
  'Nombre de jours apres transmission au-dela duquel un jalon OPCO non regle est signale en retard d encaissement'
)
ON CONFLICT (cle) DO NOTHING;
