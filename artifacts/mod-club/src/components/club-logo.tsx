import { cn } from '@/lib/utils';

export const CLUB_LOGO_SRC = '/logo.png';
export const CLUB_ICON_SRC = '/icons/icon-192.png';

type ClubLogoProps = {
  className?: string;
  size?: number;
  alt?: string;
};

export function ClubLogo({ className, size, alt = 'MOD CLUB' }: ClubLogoProps) {
  return (
    <img
      src={CLUB_LOGO_SRC}
      alt={alt}
      width={size}
      height={size}
      decoding="async"
      className={cn('club-logo', className)}
    />
  );
}

export function ClubWordmark({ className }: { className?: string }) {
  return (
    <span className={cn('club-wordmark', className)}>
      <img src={CLUB_LOGO_SRC} alt="MOD CLUB" className="club-wordmark-logo" />
    </span>
  );
}
