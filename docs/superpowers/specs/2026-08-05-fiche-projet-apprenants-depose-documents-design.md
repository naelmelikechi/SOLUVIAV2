# Fiche projet : état « Déposé », réparation du dépôt de documents, section Apprenants

Date : 2026-08-05
Statut : validé par le user, prêt à implémenter

## Contexte

Trois demandes sur la fiche projet (`/projets/[ref]`), traitées en trois lots
indépendants. L'investigation préalable a été faite en lecture directe sur la
prod (pg-meta read-only) et sur l'API Eduvia live, pas sur des suppositions.

### Constats de terrain

1. **Dépôt de documents cassé en prod.** `storage.objects` a RLS activé, mais
   aucune policy n'existe pour les buckets `project-documents` et
   `client-documents`. Les migrations qui les créaient
   (`00051_documents_storage.sql`, `20260424113204_scope_storage_policies.sql`)
   sont enregistrées dans `supabase_migrations.schema_migrations` mais leurs
   instructions sur `storage.objects` n'ont jamais tourné sur l'instance
   self-hosted (baseline du 2026-05-28). Preuve : 0 objet dans ces deux buckets
   depuis toujours, contre 4 dans `passation-documents` dont les policies ont
   été créées par une migration postérieure au passage self-hosted. Toute
   insertion authentifiée est donc refusée par RLS.

2. **Statuts Eduvia réels** (API interrogée le 2026-08-05) : `ENGAGE`,
   `EN_COURS_INSTRUCTION`, `TRANSMIS`, `NOTSENT`, `ARCHIVE`, `RUPTURE`,
   `ANNULE`. Aucun état nommé « brouillon ». `ARCHIVE` et `RUPTURE` sont absents
   des tables de libellés/couleurs de `projet-contrats-table.tsx` : ils
   s'affichent aujourd'hui sans libellé ni couleur.

3. **7 apprenants Eduvia sans aucun contrat** (4 HEOL, 3 FORMA QHRC). Déjà
   synchronisés dans `apprenants`, mais rattachés à aucun projet et affichés
   nulle part. Ce sont les « élèves en brouillon » de la demande. L'API
   `/employees` ne renvoie plus de date de formation : ces élèves n'ont donc
   aucune date de début exploitable.

## Lot 1 — État « Déposé » dans la timeline de lancement

Ordre : `non_commence` (gris) → `en_cours` (orange) → **`depose` (bleu)** →
`lance` (vert).

- Migration : remplacement du `CHECK` sur `projet_lancement_etapes.statut` pour
  accepter `depose`.
- `lib/lancement/constants.ts` : entrée `{ key: 'depose', label: 'Déposé',
color: 'blue' }` insérée entre `en_cours` et `lance`. Le schéma Zod de
  `setLancementEtapeStatut` dérive de `LANCEMENT_STATUT_KEYS` : il suit
  automatiquement.
- `lancement-etape-item.tsx` : `DOT_STYLES.depose` en bleu.
- Le compteur « n/7 lancées » continue de ne compter que `lance`.

## Lot 2 — Réparation du dépôt de documents

- Migration idempotente (`DROP POLICY IF EXISTS` + `CREATE POLICY`) recréant les
  policies `storage.objects` pour `client-documents` et `project-documents`,
  reprenant à l'identique la logique de `20260424113204` (insert : `owner =
auth.uid()` ; read/delete : admin ou CDP propriétaire du projet).
- La policy de lecture et celle de suppression de `project-documents` sont
  étendues à `projet_lancement_documents` : aujourd'hui elles ne joignent que
  `projet_documents`, donc même une fois l'upload débloqué, un CDP non-admin ne
  pourrait ni relire ni supprimer les pièces de la timeline qu'il vient de
  déposer.
- `next.config.ts` : la limite de corps des Server Actions vaut 1 Mo par défaut
  alors que `MAX_FILE_SIZE` autorise 10 Mo. Sans réglage, un PDF de 2 Mo
  échouerait encore après le fix RLS. Limite portée à 12 Mo (clé exacte pour
  Next 16 à vérifier à l'implémentation).

## Lot 3 — Section « Apprenants » sur la fiche projet

### Rattachement des apprenants à un projet

`apprenants` gagne `eduvia_company_id INTEGER` et `projet_id UUID REFERENCES
projets(id)` (+ index). Les deux sont remplis au sync par `upsertApprenants`,
via la même résolution `company_id → projet` que les contrats
(`buildProjetResolution`), avec le même repli sur le projet unique du client
quand `company_id` est nul.

### Contenu de la section

Une ligne par apprenant du projet : les apprenants portés par un contrat, plus
les élèves Eduvia sans contrat rattachés au projet. Colonnes : Apprenant,
Formation, N° contrat, Début, Fin, Statut. Table basée sur le `DataTable`
partagé.

### Statuts affichés

Libellés complétés : `ARCHIVE` → « Archivé » (gris), `RUPTURE` → « Rupture »
(rouge). Nouveau badge orange « Sans contrat » pour les élèves en brouillon.

### Règle d'alerte rouge

`date_debut < aujourd'hui` **ET** `contract_state ∈ {NOTSENT, ARCHIVE}` → nom et
date en rouge, icône d'alerte et infobulle « formation démarrée, contrat non
engagé ». Extrait par une fonction pure testable.

Les élèves sans contrat n'ont aucune date de début : la règle ne peut pas les
atteindre. Décision validée : ils restent en badge orange « Sans contrat », pas
en rouge.

### Placement

Nouvelle section ancrée `#apprenants`, insérée dans la sous-nav **avant**
Contrats : Synthèse, Lancement, Finance, Apprenants, Contrats, Activité. La
table Contrats reste inchangée, orientée finance.

## Tests

- Unitaires : fonction d'alerte rouge (dates limites, statuts hors périmètre),
  fusion contrats + élèves sans contrat dans la query.
- Vérification post-déploiement en prod : upload réel d'un document sur une
  fiche projet, et contrôle que les policies `storage.objects` existent bien.

## Hors périmètre

- Aucune modification de la table Contrats existante en dehors des libellés de
  statuts manquants.
- Aucun changement du calcul de production, de facturation ou d'échéancier :
  la section Apprenants est en lecture seule.
