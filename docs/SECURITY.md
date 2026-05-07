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

### Procédure de retrait du fallback legacy

Une fois que tous les clients ont re-saisi leur clé API au moins une fois
(suivi via les logs `encryption` warn "Decryption via cle legacy") :

1. Vérifier qu'il n'y a plus aucun warn `Decryption via cle legacy` sur
   30 jours glissants en prod.
2. Supprimer `getLegacyEncryptionKey` et le bloc fallback dans
   `decryptApiKey` (lib/utils/encryption.ts).
3. Tester en preview avec les clés de prod migrées avant déploiement.

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
