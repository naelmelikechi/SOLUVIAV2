# Sécurité - SOLUVIA

## Chiffrement des secrets tenants

Les clés API tenants (Eduvia, Odoo) sont stockées en DB chiffrées AES-256-GCM
dans des colonnes `*_encrypted` (ex. `client_api_keys.api_key_encrypted`).

### ENCRYPTION_KEY

- Format attendu : **64 caractères hexadécimaux** (256 bits effectifs).
- Génération recommandée : `openssl rand -hex 32`.
- Variables d'environnement : `ENCRYPTION_KEY` (server only, jamais exposée
  côté client).

### Migration legacy → hex (suite au fix C2)

Avant le fix C2, `getEncryptionKey()` faisait `Buffer.from(raw.slice(0, 32), 'utf-8')`
ce qui ne donnait que ~128 bits d'entropie effective sur une clé hex.
Après fix : `Buffer.from(raw.slice(0, 64), 'hex')` = 256 bits pleins.

`decryptApiKey` implémente un **dual-read** : essai cle hex puis fallback
sur l'ancienne cle utf-8 tronquee. Tout `encryptApiKey` (au prochain write
de l'admin sur `/admin/parametres`) re-encrypte avec la nouvelle cle.

### Procédure de retrait du fallback legacy (sprint 5 #13)

#### Observabilité

Chaque appel à `decryptApiKey` qui retombe sur la clé legacy emet un
événement Sentry tagué :

```
scope: encryption.legacy_decrypt_used
level: warning
```

Filtre Sentry à utiliser pour le suivi :
`scope:encryption.legacy_decrypt_used` (saved view recommandée).

#### Procédure (7 jours d'observation minimum)

1. **J0** : déployer le fix C2 + cette observabilité (déjà en place).
2. **J0 → J7** : laisser tourner. Vérifier dans Sentry chaque jour le
   nombre d'événements `scope:encryption.legacy_decrypt_used`.
3. **J7** :
   - **Si compteur = 0** : retirer le fallback. Supprimer
     `getLegacyEncryptionKey` et le bloc try/catch legacy dans
     `decryptApiKey` (lib/utils/encryption.ts). Tester en preview
     avec les clés de prod migrées avant déploiement.
   - **Si compteur > 0** : identifier les tenants concernés (regarder
     les logs Vercel autour de l'événement Sentry pour retrouver le
     `client_id`). Soit demander aux admins concernés de ressaisir
     leur clé API via `/admin/parametres`, soit écrire et exécuter
     `scripts/migrate-legacy-encrypted.ts` qui décrypte avec la clé
     legacy + re-chiffre avec la clé courante en transactionnel.
4. **Re-vérifier J7+7** que le compteur reste à 0 puis retirer le
   fallback.

### Rotation de la ENCRYPTION_KEY

Pour faire tourner la clé maître :

1. Générer une nouvelle clé : `openssl rand -hex 32`.
2. Mettre à jour `ENCRYPTION_KEY` dans Vercel (preview + prod).
3. Pour chaque tenant : demander aux admins de ressaisir leur clé API
   tenant via `/admin/parametres` (le prochain `encryptApiKey` la
   re-chiffre avec la nouvelle clé).
4. Optionnel : script `scripts/rotate-encryption-key.ts` (à écrire si
   besoin) qui décrypte avec ancienne clé, ré-encrypte avec nouvelle,
   transactionnel.

## Cache HTTP sur routes sensibles

Les routes qui retournent des données utilisateur (PDFs facture, aperçus
échéance) doivent **toujours** utiliser :

```ts
'Cache-Control': 'private, no-store, max-age=0'
```

Jamais `public, max-age=...` : un cache partagé (CDN, proxy ISP) servirait
les PDFs cross-utilisateur, contournant la RLS Supabase.

Les routes concernées (audit C1, mai 2026) :

- `app/api/factures/[ref]/pdf/route.ts`
- `app/api/factures/brouillon/[id]/pdf/route.ts`
- `app/api/echeances/[id]/pdf-preview/route.ts`
- `app/api/echeances/[id]/preview-data/route.ts`

## Authentification routes API

Toute route `/api/**` qui lit des données protégées par RLS doit faire
un check `auth.getUser()` explicite en début de fonction. Le proxy.ts
skip `/api/*` (perf), donc la garde se fait dans la route.

```ts
const supabase = await createClient();
const {
  data: { user },
} = await supabase.auth.getUser();
if (!user)
  return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
```

## Mots de passe générés

Tous les mots de passe générés par le serveur (invitations, reset, etc.)
**doivent** utiliser `crypto.randomBytes`, jamais `Math.random()`.

```ts
import { randomBytes } from 'crypto';
const password = `Soluvia-${randomBytes(12).toString('base64url')}`;
```

## Crons

Toutes les routes `/api/cron/*` et `/api/sync/*` valident le bearer
`CRON_SECRET` via `verifyCronAuth` (`lib/utils/cron-auth.ts`), comparison
timing-safe via `crypto.timingSafeEqual`.
