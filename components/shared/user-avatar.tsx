/**
 * Random robot avatar powered by DiceBear Bottts.
 * Each user gets a unique robot that changes every day.
 * Seed = email + date → same robot all day, new one tomorrow.
 */

interface UserAvatarProps {
  email: string;
  name?: string;
  size?: number;
  className?: string;
}

function todaySeed() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function UserAvatar({
  email,
  name,
  size = 32,
  className = '',
}: UserAvatarProps) {
  const src = `https://api.dicebear.com/9.x/bottts-neutral/svg?seed=${encodeURIComponent(email + todaySeed())}&radius=50`;

  return (
    <img
      src={src}
      alt={name || email}
      width={size}
      height={size}
      className={`rounded-full ${className}`}
    />
  );
}
