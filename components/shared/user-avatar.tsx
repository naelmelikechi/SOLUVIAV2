/**
 * Robot avatar powered by DiceBear Bottts-Neutral.
 *
 * - `avatarSeed` set → locked avatar (never changes)
 * - `avatarSeed` null → daily rotation (email + today's date)
 */

interface UserAvatarProps {
  email: string;
  avatarSeed?: string | null;
  name?: string;
  size?: number;
  className?: string;
}

function todaySeed() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function getAvatarUrl(
  email: string,
  avatarSeed?: string | null,
  size?: number,
) {
  const seed = avatarSeed ?? email + todaySeed();
  const sizeParam = size ? `&size=${size}` : '';
  return `https://api.dicebear.com/9.x/bottts-neutral/svg?seed=${encodeURIComponent(seed)}&radius=50${sizeParam}`;
}

export function UserAvatar({
  email,
  avatarSeed,
  name,
  size = 32,
  className = '',
}: UserAvatarProps) {
  return (
    <img
      src={getAvatarUrl(email, avatarSeed, size)}
      alt={name || email}
      width={size}
      height={size}
      className={`rounded-full ${className}`}
    />
  );
}
