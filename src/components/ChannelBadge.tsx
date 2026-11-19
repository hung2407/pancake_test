import type { PlatformType } from '../types/schema';

export const PLATFORM_META: Record<
  PlatformType,
  {
    label: string;
    short: string;
    bg: string;
    text: string;
  }
> = {
  facebook: {
    label: 'Facebook Fanpage',
    short: 'FB',
    bg: '#1877F2',
    text: '#FFFFFF',
  },
  instagram: {
    label: 'Instagram',
    short: 'IG',
    bg: '#E1306C',
    text: '#FFFFFF',
  },
  zalo: {
    label: 'Zalo OA',
    short: 'ZL',
    bg: '#0068FF',
    text: '#FFFFFF',
  },
  tiktok: {
    label: 'TikTok Shop',
    short: 'TT',
    bg: '#111827',
    text: '#FFFFFF',
  },
  shopee: {
    label: 'Shopee',
    short: 'SP',
    bg: '#EE4D2D',
    text: '#FFFFFF',
  },
  website: {
    label: 'Website Livechat',
    short: 'WEB',
    bg: '#0F766E',
    text: '#FFFFFF',
  },
};

export function ChannelBadge({
  platform,
  size = 'sm',
}: {
  platform: PlatformType;
  size?: 'xs' | 'sm' | 'md';
}) {
  const meta = PLATFORM_META[platform];
  const sizeClass =
    size === 'xs'
      ? 'w-5 h-5 text-[9px]'
      : size === 'md'
        ? 'w-9 h-9 text-xs'
        : 'w-6 h-6 text-[10px]';

  return (
    <span
      title={meta.label}
      style={{ backgroundColor: meta.bg, color: meta.text }}
      className={`inline-flex items-center justify-center rounded-md font-bold tracking-tight shrink-0 select-none ${sizeClass}`}
    >
      {meta.short}
    </span>
  );
}
