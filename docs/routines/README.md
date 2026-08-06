# Routines cloud

Ce dossier contient les prompts des **routines cloud** (agents Claude Code
planifies) qui tournent sur ce depot. Chaque fichier est la source de verite
d'une routine : cote plateforme, la routine ne contient plus que quelques
lignes qui demandent de lire le fichier correspondant et de l'executer.

| Fichier | Routine | Frequence (Europe/Paris) |
|---|---|---|
| `monitoring-quotidien.md` | Monitoring quotidien - SOLUVIAV2 | tous les jours a 04:12 |
| `audit-hebdomadaire.md` | Audit hebdomadaire profond - SOLUVIAV2 | lundi a 03:23 |

## Pourquoi ici plutot que dans la routine

Un prompt de plusieurs centaines de lignes stocke uniquement cote plateforme
n'est ni relisable, ni diffable, ni testable, et une regle amelioree doit etre
recopiee a la main dans chaque routine. Ici, il est versionne avec le code
qu'il gouverne, il passe en revue comme le reste, et son historique explique
pourquoi chaque garde-fou existe.

Ce dossier est sous `docs/` et non sous `.claude/` : ce dernier est
volontairement gitignore sur ce depot, il sert a la configuration locale.

## Modifier une routine

Ouvre une PR sur le fichier concerne. Aucune action n'est necessaire cote
plateforme : la routine relit le fichier a chaque execution, sur `main`.
