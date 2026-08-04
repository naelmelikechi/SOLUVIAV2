# Cerveau — ingestion locale (sur abonnement Max)

Le « cerveau » est alimenté **hors-ligne**, sur ta machine, avec **tes tokens Claude Max** — jamais via une clé API Anthropic. L'app Vercel ne fait que **lire** les notes (`brain_notes`) pour répondre (via OpenAI). Ce doc explique comment (re)remplir le cerveau.

## Comment ça marche

```
process_index (fiches)  ─┐
livrables Drive (PDF…)  ─┴─►  claude -p  (analyse, tokens Max)  ─►  brain_notes (Postgres)
                                                                   └─►  coffre Obsidian (GitHub)
```

- **Analyse** : le script shelle vers `claude -p` (ta CLI Claude Code authentifiée en Max). Aucune clé API.
- **Incrémental** : une source au hash inchangé n'est pas réanalysée.
- **Miroir** : `brain_notes` (vérité runtime, lue par l'assistant) + coffre Obsidian (`.md`, navigable).

## Prérequis (sur ta machine)

1. **Claude Code installé et connecté à ton compte Max** — vérifie : `claude -p "dis OK"` renvoie `OK`.
2. **`.env.local`** (déjà présent pour le reste du projet) doit contenir :
   - `NEXT_PUBLIC_SUPABASE_URL` (ou `SUPAVIA_API_URL`), `SUPAVIA_DASHBOARD_USER`, `SUPAVIA_DASHBOARD_PASSWORD` — accès `brain_notes` (pg-meta).
   - `GOOGLE_SERVICE_ACCOUNT_KEY` (le JSON du compte de service, comme sur Vercel) — pour télécharger les livrables Drive. Sans lui, les fiches passent quand même, les livrables sont ignorés.
3. **Le coffre Obsidian cloné** (optionnel) : `git clone git@github.com:naelmelikechi/soluvia-cerveau.git` quelque part.

## Commandes

```bash
# Aperçu (aucune écriture, aucun appel Claude) :
npm run brain:ingest:dry

# Ingestion complète (fiches + livrables) :
npm run brain:ingest

# Fiches seulement (sans les livrables Drive) :
npm run brain:ingest -- --fiches-only

# Ingestion + régénération et push du coffre Obsidian :
npm run brain:ingest -- --vault /chemin/vers/soluvia-cerveau

# Régénérer le coffre seul depuis brain_notes (sans ré-analyser) :
npm run brain:vault -- /chemin/vers/soluvia-cerveau
```

## Cadence

À lancer quand du contenu change : nouvelles fiches finalisées, nouveaux livrables déposés. Le hash évite tout recalcul inutile. (On pourra plus tard le brancher sur un cron machine ou un `launchd`/`cron` local.)

## Où c'est branché

- Notes lues par l'assistant : `lib/brain/retrieve.ts` → route `app/api/process/ask/route.ts` (OpenAI rédige depuis les notes).
- Format de note : `lib/brain/note.ts` (`ficheToBrainNote`, `buildMarkdown`).
- Cf. specs `docs/plans/2026-08-03-cerveau-phase1-{design,plan}.md`.
