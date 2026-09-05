export type CosmeticTitle = 'ELDER' | 'ASSTN';

export type ClubAccount = {
  username: string;
  password?: string;
  nick: string;
  role: 'ADMIN' | 'ÜYE' | 'MODERATOR';
  title?: CosmeticTitle | string | null;
  appId?: string | null;
  photo?: string | null;
  coins?: number;
  vipUntil?: number | null;
};

export type ChatTimeout = {
  nick: string;
  until: number;
  by: string;
  label: string;
};

export type Giveaway = {
  id: string;
  title: string;
  prizeText: string;
  prizeImage: string;
  announceAt: string;
  participants: string[];
  winner?: string;
};

export type ContentCard = {
  id: string;
  title: string;
  description: string;
  image: string;
  link: string;
};

export type ColorMode = 'light' | 'dark';

export type ClubNotice = {
  id: string;
  title: string;
  body: string;
  at: number;
  read?: boolean;
};

export type ClubSettings = {
  clubName: string;
  adminName: string;
  adminEmail: string;
  adminUsername: string;
  theme: string;
};

export type Banner = {
  id: string;
  eyebrow: string;
  title: string;
  accent: string;
  rest: string;
  copy: string;
  action: string;
  hasButton: boolean;
};

export const DEFAULT_BANNERS: Banner[] = [
  { id: 'banner-1', eyebrow: 'YENİ SEZON', title: 'MOD CLUB', accent: 'YENİ SEZON', rest: 'BAŞLADI!', copy: 'Turnuvalar, ödüller ve daha fazlası seni bekliyor!', action: 'Hemen Katıl', hasButton: true },
  { id: 'banner-2', eyebrow: 'TOPLULUK GÜNÜ', title: 'BİRLİKTE', accent: 'DAHA GÜÇLÜYÜZ', rest: '', copy: 'Yeni arkadaşlar, yeni oyunlar ve unutulmaz anlar.', action: 'Keşfet', hasButton: true },
  { id: 'banner-3', eyebrow: 'HAFTANIN MEYDAN OKUMASI', title: 'SAHNE', accent: 'SENİN!', rest: '', copy: 'Skorunu yükselt, topluluk sıralamasında yerini al.', action: 'Sıralamayı Gör', hasButton: true },
  { id: 'banner-4', eyebrow: 'ÖDÜL ZAMANI', title: 'KAZANMAYA', accent: 'HAZIR MISIN', rest: '', copy: 'Çekilişler, turnuvalar ve özel ödüller bu sezonda.', action: 'Ödülleri Gör', hasButton: true },
];

export function giveawayStatus(item: Giveaway, now = Date.now()) {
  const announce = new Date(item.announceAt).getTime();
  if (Number.isNaN(announce)) return 'invalid' as const;
  if (now >= announce) return 'announced' as const;
  return 'open' as const;
}

export function giveawayDayLabel(item: Giveaway) {
  const date = new Date(item.announceAt);
  if (Number.isNaN(date.getTime())) return 'Tarihsiz';
  return date.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function groupGiveawaysByDay(items: Giveaway[]) {
  const groups = new Map<string, Giveaway[]>();
  for (const item of items) {
    const key = giveawayDayLabel(item);
    const list = groups.get(key) || [];
    list.push(item);
    groups.set(key, list);
  }
  return Array.from(groups.entries());
}

export function formatCountdown(target: number, now = Date.now()) {
  const remaining = Math.max(0, target - now);
  const total = Math.floor(remaining / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export function formatMuteRemaining(until: number, now = Date.now()) {
  const remaining = until - now;
  if (remaining > 1000 * 60 * 60 * 24 * 200) return 'kalıcı';
  return formatCountdown(until, now);
}

export function nickKey(value: string) {
  return value.trim().toLowerCase();
}

export function activeChatTimeout(list: ChatTimeout[], nick: string, now = Date.now()): ChatTimeout | null {
  const key = nickKey(nick);
  return list.find((item) => nickKey(item.nick) === key && item.until > now) ?? null;
}

export function avatarFor(nick: string, photo?: string | null) {
  const name = nick.trim() || 'uye';
  return photo || `https://i.pravatar.cc/160?u=${encodeURIComponent(name.toLowerCase())}`;
}

export function applyColorMode(mode: ColorMode) {
  document.documentElement.classList.toggle('dark', mode === 'dark');
}

export function readColorMode(): ColorMode {
  return loadColorMode();
}

const COLOR_KEY = 'mod-club-color-mode';

export function loadColorMode(): ColorMode {
  try {
    return window.sessionStorage.getItem(COLOR_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function storeColorMode(mode: ColorMode) {
  try {
    window.sessionStorage.setItem(COLOR_KEY, mode);
  } catch {
    /* ignore */
  }
  applyColorMode(mode);
}
