# Decisions sur les constats des routines

Memoire partagee des routines cloud de ce depot. Elles la lisent AVANT de
remonter quoi que ce soit, et n'y ajoutent que des decisions deja prises.

Sans ce fichier, un constat ecarte revient a chaque execution : la seule
deduplication dont dispose une routine est "existe-t-il une PR ou une issue
ouverte ?", et cette question oublie tout ce qui a ete referme. Un constat
juge non pertinent en aout serait donc re-remonte a l'identique en septembre,
indefiniment.

## Format

Une ligne par decision, la plus recente en haut. Cite le fichier concerne
quand le constat est localise, sinon decris-le assez precisement pour qu'il
soit reconnaissable.

Valeurs de la colonne Decision :

- `wontfix` : ce n'est pas un bug ici, et ca ne le deviendra pas.
- `acceptee` : c'est un choix assume, documente par la raison.
- `corrigee` : traitee, ne pas re-remonter.
- `reportee` : reelle mais pas maintenant. Cite l'issue qui la porte.

| Date | Constat | Decision | Raison |
|---|---|---|---|
|  |  |  |  |

<!-- Ajoute tes lignes au-dessus de ce commentaire, sous l'en-tete du tableau. -->
