# Cerveau — boucle d'apprentissage semi-automatique (design)

Date : 2026-08-05
Statut : validé, prêt pour plan d'implémentation

## Problème

Les trois phases du cerveau sont livrées : ≈221 notes (fiches, livrables, documents Drive,
entités, conversations). Mais tout ce que le cerveau **dérive** — ce qu'il invente plutôt que
ce qu'il reflète — est écrit sans garde-fou :

| Signal             | Comportement actuel                                                                  |
| ------------------ | ------------------------------------------------------------------------------------ |
| 👍 sur une réponse | `ingestConversations` écrit une note `conversation` en direct (filtre `isNonAnswer`) |
| Entités citées     | `ingestEntities` crée les notes-carrefour + définitions Claude en direct             |
| Source modifiée    | note dépendante marquée `stale`, exclue de la recherche, sans suite                  |
| 👎 sur une réponse | ligne dans `_lacunes.md` dans le coffre — que personne ne lit                        |

Conséquences : le bruit et les approximations deviennent de la connaissance de référence sans
relecture ; les lacunes signalées ne produisent aucun apprentissage ; les notes obsolètes
s'accumulent sans arbitrage.

La direction cadrée avec l'utilisateur était une boucle **semi-automatique** : _le cerveau
propose, l'utilisateur valide_. C'est la brique manquante.

## Contrainte structurante

**L'app Vercel ne peut pas appeler Claude.** L'analyse tourne hors-ligne via `claude -p`
(abonnement Max ; la Messages API exigerait une clé Console séparée). Donc :

- tout ce qui demande une **génération** est produit par le script local `brain:ingest` ;
- l'app peut **arbitrer** une proposition déjà générée, et **écrire du texte saisi par l'humain** ;
- le seul aller-retour en deux temps est la régénération : l'app pose un drapeau, le prochain
  run local fait l'analyse et repropose.

## Décisions

1. **Surface de validation** : page admin in-app `/admin/cerveau` (dans la lignée de
   `/admin/syncs` et `/admin/bugs`). Retenue contre une CLI interactive (pas d'historique,
   suppose d'être devant la machine) et contre une validation dans le coffre Obsidian
   (manuelle, dépendante d'une convention de dossier).
2. **Périmètre** : les quatre signaux passent par la validation — conversations 👍,
   lacunes 👎, entités & définitions, obsolescence.
3. **Modération a priori**, pas a posteriori : rien n'entre dans `brain_notes` sans clic.
4. **Table dédiée** `brain_proposals`, pas une colonne `status` sur `brain_notes` : une lacune
   n'est pas une note, et mélanger polluerait les index trgm et la logique d'idempotence
   par `source_hash`.
5. **Lecture du cerveau** : le contenu du Drive « SOLUVIA BRAIN » est de la documentation
   interne légitimement lisible par tout salarié. On supprime donc le contournement
   service-role au lieu de filtrer par type (cf. §6).

## 1. Modèle de données

```sql
create table public.brain_proposals (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('conversation','entite','lacune','obsolescence')),
  status      text not null default 'en_attente'
              check (status in ('en_attente','approuvee','rejetee','a_regenerer')),
  target_path text,                        -- note visée (null pour une lacune non résolue)
  payload     jsonb not null,              -- BrainNote prête à upsert, ou {question, answer_ko, sources}
  source_ref  text not null,               -- id feedback / entite:slug / path de la note
  source_hash text not null,               -- hash du contenu proposé
  reason      text,                        -- motif de rejet
  decided_by  uuid references public.users(id),
  decided_at  timestamptz,
  created_at  timestamptz not null default now(),
  unique (kind, source_ref)
);
create index if not exists brain_proposals_status_kind_idx
  on public.brain_proposals (status, kind);
```

RLS : `select` et `update` réservés à `is_admin()`, même pattern que `brain_notes`.
L'insertion vient du script local (pg-meta, superuser) ou de l'app via client admin.

**Idempotence.** `unique (kind, source_ref)` garantit une seule ligne vivante par objet
proposé. `source_hash` porte le contenu : à chaque run, le script compare et

- si une proposition existe avec le même `source_hash` → ne touche à rien, quel que soit
  son statut. **Une proposition rejetée reste rejetée** : pas de reproposition à chaque run.
- si le hash diffère (la source a changé) → la ligne repasse en `en_attente` avec le nouveau
  payload, y compris si elle avait été rejetée : le contenu n'est plus celui qui avait été
  refusé.

## 2. Qui produit quoi

| kind           | producteur                   | payload                          | approuver =                                                             |
| -------------- | ---------------------------- | -------------------------------- | ----------------------------------------------------------------------- |
| `conversation` | script local (👍)            | `BrainNote` complète             | upsert `brain_notes`                                                    |
| `entite`       | script local                 | `BrainNote` (définition Claude)  | upsert `brain_notes`                                                    |
| `lacune`       | **l'app**, à l'instant du 👎 | `{question, answer_ko, sources}` | note `conversation` construite depuis la réponse **saisie par l'admin** |
| `obsolescence` | script local (stale)         | `{path, sources_modifiees}`      | arbitrage : _garder_ / _archiver_ / _régénérer_                         |

Les notes `fiche`, `livrable` et `document` restent écrites **en direct** par le script :
ce sont des reflets de sources de vérité, il n'y a rien à arbitrer. Seul le dérivé passe
par la validation humaine.

### Arbitrage de l'obsolescence

- **Garder** → `frontmatter.stale = false`, bandeau retiré du corps, la note redevient
  servie en recherche.
- **Archiver** → la note est supprimée de `brain_notes` (elle disparaît du coffre au prochain
  `brain:vault`). La proposition passe `approuvee` avec `reason = 'archivée'`.
- **Régénérer** → statut `a_regenerer`. Le prochain run local relit la source, refait
  l'analyse Claude, écrit un nouveau payload avec un nouveau `source_hash` et remet la
  proposition en `en_attente`.

## 3. Modules et frontières

**`lib/brain/proposal.ts` (nouveau, pur, testable sans I/O)**

```ts
export type ProposalKind =
  | 'conversation'
  | 'entite'
  | 'lacune'
  | 'obsolescence';
export type ProposalStatus =
  | 'en_attente'
  | 'approuvee'
  | 'rejetee'
  | 'a_regenerer';

export interface BrainProposal {
  kind: ProposalKind;
  status: ProposalStatus;
  target_path: string | null;
  payload: Record<string, unknown>;
  source_ref: string;
  source_hash: string;
}

/** Proposition à partir d'une note dérivée déjà construite (kind dérivé de note.type). */
export function noteToProposal(note: BrainNote): BrainProposal;

/** Décide s'il faut écrire/réveiller une proposition face à l'état en base. Pur. */
export function shouldPropose(
  next: BrainProposal,
  existing: { status: ProposalStatus; source_hash: string } | null,
): 'skip' | 'insert' | 'reopen';

/** Lacune (👎) + réponse rédigée par l'admin → note `conversation`. */
export function gapToBrainNote(
  gap: { id: string; question: string; answer_ko: string; sources: unknown },
  humanAnswer: string,
  derivedFrom: string[],
  sourceHashes: Record<string, string>,
): BrainNote;

/** payload d'une proposition → BrainNote validée (avec édition éventuelle du corps).
 *  Ne concerne que `conversation` et `entite`, dont le payload EST une note.
 *  `lacune` passe par `gapToBrainNote` ; `obsolescence` ne produit pas de note
 *  (c'est un arbitrage sur une note existante, cf. §2). */
export function applyProposal(p: BrainProposal, editedBody?: string): BrainNote;
```

Ces fonctions ne connaissent ni Postgres ni Next : elles transforment des données. Toute
la logique de décision (idempotence, réouverture, construction de note) y est testable
en pur, comme `lib/brain/note.ts` aujourd'hui.

**`scripts/brain-ingest.ts` (modifié)** — les trois fonctions Phase 3 remplacent
`upsertNote(...)` par un `proposeNote(...)` qui applique `shouldPropose`. Le reste du script
(fiches, livrables, hashes, vault) est inchangé. Nouvelle étape en fin de run : consommer les
propositions `a_regenerer`.

**`app/api/admin/brain/proposals/[id]/route.ts` (nouveau)** — `POST { action, body?, answer?, reason? }`
avec `action ∈ approve | reject | regenerate`. Garde `isAdmin(user.role)` côté serveur.
Écriture dans `brain_notes` via le client admin (la RLS de `brain_notes` n'ouvre que le
`select`). Transition conditionnelle `update … where id = $1 and status = 'en_attente'` :
0 ligne affectée = déjà traité (double-clic, deux onglets) → 409, pas de double écriture.

**`app/(dashboard)/admin/cerveau/page.tsx` (nouveau)** — server component, `getUser()` +
`isAdmin` + `redirect('/accueil')`, `loading.tsx`, requête des propositions `en_attente`
groupées par `kind`.

**`components/admin/cerveau/proposals-review.tsx` (nouveau, client)** — une section par
`kind` avec compteur ; liste à gauche, détail à droite : aperçu du markdown final et
`textarea` éditable pour corriger avant d'approuver. Pour une lacune, le détail affiche la
question et la réponse jugée insuffisante, et fait saisir la bonne réponse.

**`app/api/process/feedback/route.ts` (modifié)** — sur `rating = -1`, crée aussi la
proposition `lacune` (`source_ref` = id du feedback). Best-effort : si l'insertion de la
proposition échoue, le feedback est quand même enregistré et la route répond `ok`.

## 4. Flux complet

```
👍  script local ─ analyse Claude ─→ brain_proposals(en_attente)
👎  app (au vote) ───────────────────→ brain_proposals(en_attente, kind=lacune)
stale  script local ────────────────→ brain_proposals(en_attente, kind=obsolescence)

                    /admin/cerveau  ── approuver/éditer ──→ brain_notes ──→ coffre (brain:vault)
                                    ── rejeter ───────────→ rien (mémorisé par source_hash)
                                    ── régénérer ─────────→ a_regenerer ──→ prochain run local
```

## 5. Gestion d'erreurs

- Upsert `brain_notes` en échec à l'approbation → la proposition **reste** `en_attente`,
  message d'erreur affiché. Rien n'est perdu, l'admin réessaie.
- `claude -p` en échec sur une source → aucune proposition écrite pour cette source, le run
  continue sur les autres (comportement actuel conservé).
- Source injoignable → aucun delete, l'état existant est conservé (règle déjà en vigueur).
- Concurrence sur une proposition → transition conditionnelle par `status` (cf. §3).
- Feedback 👎 dont l'insertion de proposition échoue → feedback conservé, lacune rattrapée
  au prochain run local (le script balaie les `rating = -1` sans proposition).

## 6. Correction de la dette de lecture

`lib/brain/retrieve.ts` sert aujourd'hui les notes via le client **service-role**, qui
court-circuite la RLS, alors que `brain_notes` est `select` admin-only : tout utilisateur
authentifié lit donc tout le cerveau, y compris le contenu des livrables Drive et des
conversations internes (dette documentée en commentaire dans le fichier).

Décision : le contenu indexé est de la documentation interne légitimement lisible par tout
salarié. On **supprime le contournement** plutôt que de filtrer par type :

- policy `select` sur `brain_notes` ouverte à `authenticated` (remplace la policy admin-only) ;
- `retrieveNotes` reçoit le client **de l'utilisateur** au lieu du client admin ;
- `search_brain_trgm` n'est pas `security definer` : la RLS s'applique bien à l'appelant.
  Attention à conserver son `set search_path = public, extensions` (cf. migration
  `20260804120000` — sans lui, la fonction échoue en REST).

La RLS redevient la seule source de vérité sur la lecture, et le garde-fou se déplace sur
ce qui **entre** dans le cerveau : c'est précisément la boucle construite ici. Une note
lisible par tous est une note qu'un admin a validée ; les fiches, livrables et documents
sont des reflets de sources déjà accessibles dans l'app.

## 7. Tests

`__tests__/brain-proposals.test.ts` (purs, fakes injectés) :

- `shouldPropose` : hash identique → `skip` quel que soit le statut (y compris `rejetee`) ;
  pas de ligne existante → `insert` ; hash différent sur une rejetée → `reopen`.
- `gapToBrainNote` : question + réponse humaine → note `conversation` bien formée
  (path slugifié tronqué, links vers les sources, frontmatter `source_hashes`).
- `applyProposal` : payload → `BrainNote` ; corps édité pris en compte.
- `noteToProposal` : hash stable sur deux appels avec la même note.

`__tests__/brain-retrieve.test.ts` (étendu) : `retrieveNotes` utilise le client passé
(plus de client admin) et exclut toujours les notes `stale`.

Commande : `npx vitest run __tests__/brain-*.test.ts && npx tsc --noEmit && npm run lint && npm run build`.

## Hors périmètre

- Notification (mail/Slack) quand des propositions attendent — à voir à l'usage.
- Mop-up des ~21 collisions de path du coffre (slug tronqué à 70 caractères) : indépendant.
- Remplacement d'OpenAI par Claude pour la rédaction des réponses live : hors sujet ici.

## Décisions révisées en cours d'implémentation (2026-08-05)

Ce document reste la trace de ce qui était prévu. Cinq points ont été tranchés autrement
pendant la mise en œuvre :

- **Notes-entités créées en direct, sans définition.** Une note-carrefour ne fait que relier
  les notes qui citent l'entité : elle n'invente rien, donc rien à faire valider. Seules les
  **définitions** d'entités citées par au moins 3 notes sont proposées — la règle initiale en
  aurait mis 842 dans la file, iningérables.
- **« Archiver » marque la note au lieu de la supprimer.** Le design prescrivait un `delete` ;
  il détruisait sans recours la seule copie d'une réponse rédigée à la main. L'arbitrage pose
  `frontmatter.archive = true` : la note sort de la recherche, reste en base, reste
  récupérable.
- **« Régénérer » supprimé.** Pour une note de conversation il n'y a rien à régénérer (la
  question et la réponse n'ont pas bougé, seule une source a changé) et le statut
  `a_regenerer` ne menait nulle part. Le panneau d'obsolescence n'offre plus que _garder_ /
  _archiver_.
- **Chemin des notes de conversation suffixé d'un hash**, pour être injectif : le slug tronqué
  faisait collisionner deux questions distinctes sur le même fichier.
- **Contenu curé à la main protégé.** Une réponse rédigée par un admin (`corrige: true`) et une
  définition validée (`verified: true`) ne peuvent pas être écrasées par une proposition
  automatique — le script ne les repropose pas, l'approbation les refuse.
