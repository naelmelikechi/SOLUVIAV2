/**
 * Robot avatar powered by DiceBear Bottts-Neutral.
 *
 * Supports the 3-state avatar model (daily / random / frozen). See `lib/utils/avatar.ts`
 * for the shared resolution logic.
 */

import Image from 'next/image';

import {
  dicebearUrl,
  resolveAvatarSeed,
  type AvatarMode,
} from '@/lib/utils/avatar';

interface UserAvatarProps {
  email: string;
  avatarSeed?: string | null;
  avatarMode?: AvatarMode | null;
  avatarRegenDate?: string | null;
  name?: string;
  size?: number;
  className?: string;
}

/**
 * Returns the display URL for a user's avatar today, honouring their mode.
 * If `avatarMode` is omitted (legacy callers), falls back to the old 2-state
 * semantics: seed set = frozen, seed null = daily.
 */
export function getAvatarUrl(
  email: string,
  avatarSeed?: string | null,
  size?: number,
  avatarMode?: AvatarMode | null,
  avatarRegenDate?: string | null,
) {
  const { seed } = resolveAvatarSeed({
    email,
    // Legacy fallback: if mode isn't provided, a stored seed means "frozen".
    mode: avatarMode ?? (avatarSeed ? 'frozen' : 'daily'),
    seed: avatarSeed ?? null,
    regenDate: avatarRegenDate ?? null,
  });
  return dicebearUrl(seed, size);
}

export function UserAvatar({
  email,
  avatarSeed,
  avatarMode,
  avatarRegenDate,
  name,
  size = 32,
  className = '',
}: UserAvatarProps) {
  return (
    <Image
      src={getAvatarUrl(email, avatarSeed, size, avatarMode, avatarRegenDate)}
      alt={name || email}
      width={size}
      height={size}
      unoptimized
      className={`rounded-full ${className}`}
    />
  );
}
