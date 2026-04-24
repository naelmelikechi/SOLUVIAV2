# Déploiement

## Vue d'ensemble

Le projet est déployé sur Vercel (région `cdg1`). Chaque push sur la
branche `main` déclenche un déploiement de production automatique.

Les deploys de preview sont créés automatiquement à chaque push sur une
branche autre que `main`, OU via `vercel deploy` (sans `--prod`).

## Workflow recommandé

**Règle d'or depuis l'incident du 24/04** : ne jamais pousser directement
sur `main` pour une feature ou un durcissement qui touche les env vars /
le boot de l'app. Toujours passer par une feature branch + preview URL.

```bash
# 1. Créer une feature branch
git checkout -b feat/nom-feature

# 2. Développer + commit(s)
# ...

# 3. Push : Vercel crée une preview automatiquement
git push -u origin feat/nom-feature

# 4. Vérifier la preview URL retournée par Vercel (ou visible dans le
#    dashboard Vercel) : https://soluvia-<hash>-naelmelis-projects.vercel.app

# 5. Tester les chemins critiques sur la preview :
#    - login / logout
#    - chemins modifiés par la feature
#    - cron manuel si impacté (curl avec CRON_SECRET)

# 6. Merger dans main (GitHub PR ou merge local)
git checkout main
git merge feat/nom-feature
git push origin main
# → déploiement production automatique
```

Pour un one-off preview sans passer par Git :

```bash
vercel deploy  # sans --prod, preview URL isolée
```

## Variables d'environnement

Liste complète dans [README.md#variables-denvironnement](../README.md#variables-denvironnement).

### Ajouter / modifier une variable

```bash
# Pour production
vercel env add MA_VARIABLE production --value "xxx"

# Pour preview (toutes branches)
vercel env add MA_VARIABLE preview --value "xxx"
# Si le CLI râle en mode agent, passer par le dashboard Vercel :
# Project → Settings → Environment Variables

# Pour dev
vercel env add MA_VARIABLE development --value "xxx"
```

**Attention** : un changement d'env var **ne redéploie pas**
automatiquement. Les functions continuent à utiliser l'ancienne valeur
au cold start suivant, OU gardent la valeur du snapshot au boot si elles
sont warm.

Pour forcer la prise en compte immédiate : `vercel deploy --prod --yes`
(fresh deploy depuis le HEAD local).

### Ordre de précaution

Si tu ajoutes un code qui **exige** une nouvelle env var (check strict),
**set la variable sur tous les envs cibles AVANT de pousser le code**.
Sinon les fonctions bootent en échec et renvoient 500.

Rappel de la leçon du 24/04 : j'ai mis `ENCRYPTION_KEY` requise en prod
via `superRefine` dans `lib/env.ts`, puis j'ai pushé. Le deploy a booté
sans la variable → `throw` à l'import de `lib/env.ts` → 500 sur toutes
les routes pendant ~30 min, jusqu'au redéploiement fresh avec la variable.

## Rollback

Vercel garde toutes les deployments précédentes et permet un rollback
instantané :

### Via le dashboard Vercel

Deployments → cliquer sur un deploy ancien "Ready" → **Promote to Production**.

### Via la CLI

```bash
# Lister les deploys récents
vercel ls

# Promouvoir un ancien deploy en production
vercel promote https://soluvia-<hash>-naelmelis-projects.vercel.app

# Ou inspecter un deploy avant promotion
vercel inspect https://soluvia-<hash>-naelmelis-projects.vercel.app
```

Le rollback **ne concerne pas** :

- Les migrations Supabase (appliquer le rollback SQL manuellement)
- Les env vars (elles sont globales, pas par deploy)
- Les données en base (backups Supabase à restaurer)

## Migrations Supabase

### Workflow local → remote

```bash
# Créer une nouvelle migration
npx supabase migration new nom_de_la_migration
# Éditer le fichier créé dans supabase/migrations/

# Appliquer en local (dev)
npx supabase db push

# Appliquer en remote (staging ou prod)
npx supabase link --project-ref <project-ref>  # si pas déjà lié
npx supabase db push --linked
```

### Via l'agent (MCP Supabase)

L'agent peut appliquer une migration via `apply_migration`. **Attention** :
le versioning utilisé par l'agent est un timestamp (`YYYYMMDDHHMMSS`),
pas un numéro séquentiel. Si l'agent applique une migration, **renommer
le fichier local** pour qu'il corresponde au timestamp remote, sinon
`supabase db push` essaiera de ré-appliquer la migration et échouera sur
`CREATE POLICY` idempotent.

### Régénérer les types après migration

```bash
# Depuis la DB locale
npx supabase gen types typescript --local > types/database.ts

# Depuis la DB liée (staging/prod)
npx supabase gen types typescript --linked > types/database.ts
```

## Checklist incident "prod down"

1. Vérifier le dashboard Vercel : dernier deploy en "Error" ?
2. Si oui : rollback immédiat vers le dernier deploy "Ready" via dashboard
3. Si le deploy récent est "Ready" mais la prod renvoie 500 :
   - Probablement un throw au boot (env var manquante, validation échouée)
   - `curl -sI https://soluvia.vercel.app/login` → confirmer le 500
   - `vercel logs <deployment-url>` pour voir la raison
4. Fix le root cause (set env var, amender le code) → `vercel deploy --prod --yes`
5. Vérifier : `curl -sI https://soluvia.vercel.app/login` → 200
6. Post-mortem dans `docs/INCIDENTS.md` (à créer si récurrent)

## Observabilité pendant et après un deploy

- **Vercel logs** : `vercel logs --follow <deployment-url>`
- **Sentry** (si configuré) : dashboard pour les erreurs runtime
- **Speed Insights** : Core Web Vitals (LCP, CLS, INP) sur `/` et les
  pages critiques
- **Analytics** : trafic temps réel sur le dashboard Vercel
- **Supabase** : dashboard → Logs → filtrer par `auth` / `db` / `storage`

## Domaines

- Production : `soluvia.vercel.app` et alias `app.mysoluvia.com`
- Preview : `soluvia-<hash>-naelmelis-projects.vercel.app` (un par deploy)

## Région et DR

**Single region `cdg1` (Paris)**. Pas de failover multi-région. Si Vercel
cdg1 tombe, toute l'app est indisponible jusqu'au rétablissement.
Supabase est également single-region (`eu-west-3`).

Décision à prendre si l'usage justifie un DR : ajouter `fra1` en région
de failover, activer le PITR Supabase, tester une restore.

## Références

- [`docs/CRONS.md`](./CRONS.md) — détail des 11 jobs cron
- [`docs/numerotation-factures.md`](./numerotation-factures.md) — gapless invoices
- [`vercel.json`](../vercel.json) — config Vercel
- [`CLAUDE.md`](../CLAUDE.md) — conventions projet pour l'agent
