# Cerveau — ingestion locale (sur abonnement Max)

Le « cerveau » est alimenté **hors-ligne**, sur ta machine, avec **tes tokens Claude Max** — jamais via une clé API Anthropic. C'est pour ça que l'analyse ne peut pas tourner sur Vercel : l'app n'a pas de clé.

L'app, elle, **lit** les notes (`brain_notes`) pour répondre (via OpenAI) — et depuis la boucle de validation semi-automatique, elle **écrit** aussi : à l'approbation d'une proposition dans `/admin/cerveau`, et à chaque 👎 (qui ouvre une lacune dans `brain_proposals`). Ce doc explique comment (re)remplir le cerveau et qui valide quoi.

## Ce qui entre tout seul, ce qui passe par toi

Le script local ne pousse jamais directement une réponse rédigée dans le cerveau : ce qui est **dérivé d'une source déjà validée** entre en direct, ce qui est **inventé ou rédigé** passe par un arbitrage humain.

**En direct** (écrit dans `brain_notes` par `npm run brain:ingest`) :

- les **fiches** process finalisées (`process_index`) ;
- les **livrables** et documents Drive référencés par ces fiches ;
- les **notes-carrefour d'entités**, _sans définition_ : une note `entites/opco` qui ne fait que relier les notes citant l'OPCO n'affirme rien, elle n'a rien à faire valider.

**Par validation humaine** (déposé dans `brain_proposals`, en attente d'arbitrage) :

- les **conversations 👍** — une réponse jugée bonne par un utilisateur devient une note candidate ;
- les **définitions d'entités** — seulement pour les entités citées par **au moins 3 notes**, et c'est Claude qui rédige la définition proposée ;
- les **lacunes 👎** — la question et la mauvaise réponse sont conservées ; c'est **l'admin qui rédige lui-même la bonne réponse**, elle devient la note ;
- l'**obsolescence** — quand une source d'une note de conversation a changé, la note est marquée `stale` (l'assistant ne s'en sert plus) et l'arbitrage demande : _garder telle quelle_ ou _archiver_.

```
process_index (fiches)   ─┐
livrables Drive (PDF…)   ─┼─► claude -p (tokens Max) ─┬─► brain_notes ──► coffre Obsidian
entités : carrefours     ─┘                           │
                                                      │
conversations 👍 / définitions / obsolescence ─────────┴─► brain_proposals ─┐
lacunes 👎 (depuis l'app, en direct) ──────────────────────────────────────┤
                                                                           ▼
                                                      /admin/cerveau (arbitrage) ──► brain_notes
```

- **Incrémental** : une source au hash inchangé n'est pas réanalysée, et une proposition déjà rejetée ne se rouvre pas tant que son contenu ne change pas.
- **Miroir** : `brain_notes` (vérité runtime, lue par l'assistant) + coffre Obsidian (`.md`, navigable). Le coffre ne reçoit que des notes vivantes : les notes archivées en sont exclues.

## Où se fait la validation

Sur **`/admin/cerveau`**, page réservée aux admins. La file affiche les propositions en attente, lacunes d'abord. Pour chacune :

| Type            | Ce que tu fais                                                                                                 |
| --------------- | -------------------------------------------------------------------------------------------------------------- |
| Lacune 👎       | tu **rédiges la réponse** (rien n'est pré-rempli), ou tu écartes la question                                   |
| Conversation 👍 | tu approuves (en éditant le corps si besoin) ou tu rejettes                                                    |
| Entité          | tu approuves la définition proposée (éditable) ou tu la rejettes                                               |
| Obsolescence    | tu **gardes telle quelle** (la note redevient consultable, ses empreintes sont rafraîchies) ou tu **archives** |

« Archiver » ne supprime pas : la note sort de la recherche (`frontmatter.archive`) mais reste en base et peut être rétablie.

Deux garde-fous : une réponse rédigée à la main (`corrige: true`) et une définition curée (`verified: true`) ne peuvent pas être écrasées par une proposition automatique — le script ne les repropose pas, et l'approbation les refuse.

## Ce qu'il faut relancer après un arbitrage

- **Rien** pour l'assistant : `brain_notes` est écrit à l'approbation, la réponse suivante en tient compte immédiatement.
- **Le coffre Obsidian**, si tu le tiens à jour : `npm run brain:vault -- /chemin/vers/soluvia-cerveau` (ou le prochain `brain:ingest -- --vault …`, qui le régénère et le pousse).
- **Rien non plus** côté script : approuver ou rejeter est mémorisé par empreinte, une exécution suivante ne repropose pas ce que tu as déjà tranché.

## Plafonds à connaître

- **40 définitions d'entités proposées au maximum par exécution.** Au-delà, un seul appel Claude devient fragile et la file devient inexploitable ; le script affiche combien de candidates sont reportées, et le run suivant les reprend.
- **File d'arbitrage affichée dans la limite de 200 propositions.** Si tu la vois saturée, arbitre : ce qui dépasse n'est pas perdu, juste pas montré.

## Prérequis (sur ta machine)

1. **Claude Code installé et connecté à ton compte Max** — vérifie : `claude -p "dis OK"` renvoie `OK`.
2. **`.env.local`** (déjà présent pour le reste du projet) doit contenir :
   - `NEXT_PUBLIC_SUPABASE_URL` (ou `SUPAVIA_API_URL`), `SUPAVIA_DASHBOARD_USER`, `SUPAVIA_DASHBOARD_PASSWORD` — accès `brain_notes` / `brain_proposals` (pg-meta).
   - `GOOGLE_SERVICE_ACCOUNT_KEY` (le JSON du compte de service, comme sur Vercel) — pour télécharger les livrables Drive. Sans lui, les fiches passent quand même, les livrables sont ignorés.
3. **Le coffre Obsidian cloné** (optionnel) : `git clone git@github.com:naelmelikechi/soluvia-cerveau.git` quelque part.

## Commandes

```bash
# Aperçu (aucune écriture, aucun appel Claude) :
npm run brain:ingest:dry

# Ingestion complète (fiches + livrables + propositions) :
npm run brain:ingest

# Fiches seulement (ni livrables Drive, ni conversations/entités/obsolescence ;
# le rattrapage des lacunes 👎 tourne quand même) :
npm run brain:ingest -- --fiches-only

# Ingestion + régénération et push du coffre Obsidian :
npm run brain:ingest -- --vault /chemin/vers/soluvia-cerveau

# Régénérer le coffre seul depuis brain_notes (sans ré-analyser) :
npm run brain:vault -- /chemin/vers/soluvia-cerveau
```

## Cadence

À lancer quand du contenu change : nouvelles fiches finalisées, nouveaux livrables déposés, 👍/👎 accumulés dans l'app. Le hash évite tout recalcul inutile. (On pourra plus tard le brancher sur un cron machine ou un `launchd`/`cron` local.)

## Où c'est branché

- Notes lues par l'assistant : `lib/brain/retrieve.ts` → route `app/api/process/ask/route.ts` (OpenAI rédige depuis les notes ; les notes `stale` et `archive` sont exclues).
- Propositions : `lib/brain/proposal.ts` (formes et empreintes), `lib/queries/brain-proposals.ts` (file), `lib/actions/brain-proposals.ts` (arbitrage), `app/(dashboard)/admin/cerveau/`.
- Format de note : `lib/brain/note.ts` (`ficheToBrainNote`, `buildMarkdown`).
- Cf. specs `docs/plans/2026-08-03-cerveau-phase1-{design,plan}.md` et `docs/plans/2026-08-05-cerveau-semi-auto-{design,plan}.md`.
