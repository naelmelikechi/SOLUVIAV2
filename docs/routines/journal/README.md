# Journal des routines — un fichier par exécution

Chaque exécution de routine écrit **son propre fichier** dans ce dossier, au lieu
d'éditer `../decisions.md` :

    docs/routines/journal/AAAA-MM-JJ-<routine>.md
    ex. 2026-08-12-monitoring.md, 2026-08-17-audit-hebdo.md

## Règles

- **Ne jamais modifier `docs/routines/decisions.md` dans une PR de routine.**
  C'est ce qui créait des conflits entre les PR ouvertes en parallèle : toutes
  éditaient le même fichier cumulatif.
- Un fichier = une exécution. Si le fichier du jour existe déjà (re-run),
  suffixer : `2026-08-12-monitoring-2.md`.
- Contenu d'un fragment : mêmes conventions que `decisions.md` (constat, statut
  confirmé/réfuté/reporté, décision prise, liens vers PR et issues).
- Pour recharger la mémoire des routines : lire `../decisions.md` (archive
  figée) **puis** tous les fichiers de ce dossier, du plus récent au plus ancien.
- `decisions.md` devient une archive en lecture seule. Une consolidation
  périodique (manuelle ou routine dédiée, hors PR de monitoring) pourra y
  replier les fragments anciens.
