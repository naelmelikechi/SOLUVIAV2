import { Redis } from '@upstash/redis';
import { env } from '@/lib/env';

// Stockage temporaire des challenges WebAuthn (TTL 5 min).
//
// Un challenge est genere lors de register-options/login-options puis valide
// lors de register-verify/login-verify. On utilise Upstash Redis pour la
// persistance cross-instance (Vercel Functions sont stateless).
//
// Si Upstash n'est pas configure on tombe sur un store en memoire — utile en
// dev local sans Redis, mais NE PAS deployer comme tel : un challenge genere
// par une instance ne sera pas trouve par une autre.

const TTL_SECONDS = 300;

let memoryStore: Map<string, { value: string; expiresAt: number }> | null =
  null;

function getMemoryStore() {
  if (!memoryStore) memoryStore = new Map();
  return memoryStore;
}

let redisClient: Redis | null = null;
function getRedis(): Redis | null {
  const url = env.UPSTASH_REDIS_REST_KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN;
  if (!url || !token) return null;
  if (!redisClient) redisClient = new Redis({ url, token });
  return redisClient;
}

function key(sessionId: string, kind: 'register' | 'login') {
  return `soluvia:webauthn:${kind}:${sessionId}`;
}

type Stored = { challenge: string; meta: Record<string, string> };

export async function saveChallenge(
  sessionId: string,
  kind: 'register' | 'login',
  challenge: string,
  meta?: Record<string, string>,
): Promise<void> {
  const payload: Stored = { challenge, meta: meta ?? {} };
  const redis = getRedis();
  if (redis) {
    await redis.set(key(sessionId, kind), payload, { ex: TTL_SECONDS });
    return;
  }
  getMemoryStore().set(key(sessionId, kind), {
    value: JSON.stringify(payload),
    expiresAt: Date.now() + TTL_SECONDS * 1000,
  });
}

export async function consumeChallenge(
  sessionId: string,
  kind: 'register' | 'login',
): Promise<Stored | null> {
  const k = key(sessionId, kind);
  const redis = getRedis();

  if (redis) {
    const value = (await redis.get<Stored>(k)) ?? null;
    if (value) await redis.del(k);
    return value;
  }

  const mem = getMemoryStore();
  const entry = mem.get(k);
  mem.delete(k);
  if (!entry || entry.expiresAt < Date.now()) return null;
  try {
    return JSON.parse(entry.value) as Stored;
  } catch {
    return null;
  }
}
