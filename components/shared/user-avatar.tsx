/**
 * Random robot avatar powered by DiceBear Bottts.
 * Each user gets a unique robot based on their email.
 */

interface UserAvatarProps {
  email: string;
  name?: string;
  size?: number;
  className?: string;
}

export function UserAvatar({
  email,
  name,
  size = 32,
  className = '',
}: UserAvatarProps) {
  const src = `https://api.dicebear.com/9.x/bottts-neutral/svg?seed=${encodeURIComponent(email)}&radius=50`;

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
