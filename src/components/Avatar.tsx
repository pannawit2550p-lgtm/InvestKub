import type { CSSProperties } from 'react';
import Image from 'next/image';
import { isProfileAvatarId, type ProfileAvatarId, type ProfileAvatarType } from '@/lib/profile/avatars';

interface AvatarProps {
  name: string;
  id: string;
  size: number;
  ringColor?: string;
  className?: string;
  avatarType?: ProfileAvatarType;
  avatarCharacter?: ProfileAvatarId | null;
  avatarUrl?: string | null;
}

const AVATAR_BACKGROUNDS = [
  'linear-gradient(135deg, #403277, #785bd3)',
  'linear-gradient(135deg, #124c44, #198b70)',
  'linear-gradient(135deg, #17436c, #3276ad)',
  'linear-gradient(135deg, #663d32, #bd7150)',
  'linear-gradient(135deg, #54335d, #995ba4)',
  'linear-gradient(135deg, #46522c, #7d923f)',
];

function stableHash(value: string): number {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export default function Avatar({ name, id, size, ringColor, className, avatarType = 'initial', avatarCharacter, avatarUrl }: AvatarProps) {
  const initial = Array.from(name.trim())[0]?.toLocaleUpperCase('th-TH') ?? 'ผ';
  const background = AVATAR_BACKGROUNDS[stableHash(id) % AVATAR_BACKGROUNDS.length];
  const imageUrl = avatarType === 'upload' && avatarUrl
    ? avatarUrl
    : avatarType === 'character' && isProfileAvatarId(avatarCharacter)
      ? `/avatars/${avatarCharacter}.png`
      : null;
  const style: CSSProperties = {
    width: size,
    height: size,
    flexBasis: size,
    background,
    ...(ringColor ? { borderColor: ringColor } : {}),
  };

  return (
    <span className={`investkub-avatar${className ? ` ${className}` : ''}`} style={style} aria-hidden="true">
      {imageUrl ? <Image src={imageUrl} width={size} height={size} alt="" unoptimized className="investkub-avatar-image" /> : initial}
    </span>
  );
}
