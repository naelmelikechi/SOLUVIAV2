/**
 * Shared avatar utilities (client + server).
 *
 * 3 states for a user's avatar:
 *   - "daily"  : changes every day (seed = email|YYYY-MM-DD, computed on the fly)
 *   - "random" : rolled randomly (seed = stored random, valid only while
 *                avatar_regen_date === today ; auto-expires to daily at midnight)
 *   - "frozen" : permanent, until user unfreezes
 *
 * The effective seed for display is computed by `resolveAvatarSeed` so the UI
 * never has to worry about expiry / mode interactions.
 */

export type AvatarMode = 'daily' | 'random' | 'frozen';

/** Today as YYYY-MM-DD in local time (matches Postgres DATE semantics). */
export function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Deterministic seed for the "daily" mode. */
export function dailySeed(email: string, isoDate: string = todayIso()): string {
  return `${email}|${isoDate}`;
}

export interface AvatarSnapshot {
  email: string;
  mode: AvatarMode | null;
  seed: string | null;
  regenDate: string | null; // YYYY-MM-DD (date of last random roll)
}

export interface ResolvedAvatar {
  effectiveMode: AvatarMode;
  seed: string;
}

/**
 * Given a raw DB snapshot, returns the seed to actually render today and the
 * effective mode (random auto-expires to daily when regen_date != today).
 */
export function resolveAvatarSeed(snapshot: AvatarSnapshot): ResolvedAvatar {
  const today = todayIso();
  const mode = snapshot.mode ?? 'daily';

  if (mode === 'frozen' && snapshot.seed) {
    return { effectiveMode: 'frozen', seed: snapshot.seed };
  }

  if (mode === 'random' && snapshot.seed && snapshot.regenDate === today) {
    return { effectiveMode: 'random', seed: snapshot.seed };
  }

  return { effectiveMode: 'daily', seed: dailySeed(snapshot.email, today) };
}

/**
 * Can the user roll a new random today? (Rate-limit: 1 roll per calendar day.)
 */
export function canRollRandomToday(regenDate: string | null): boolean {
  return regenDate !== todayIso();
}

/** Build a DiceBear bottts-neutral avatar URL from a seed. */
export function dicebearUrl(seed: string, size?: number): string {
  const sizeParam = size ? `&size=${size}` : '';
  return `https://api.dicebear.com/9.x/bottts-neutral/svg?seed=${encodeURIComponent(seed)}&radius=50${sizeParam}`;
}
