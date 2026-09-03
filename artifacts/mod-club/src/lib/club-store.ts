export type CosmeticTitle = 'ELDER' | 'ASSTN';

export type ClubAccount = {
  username: string;
  password: string;
  nick: string;
  role: 'ADMIN' | 'ÜYE' | 'MODERATOR';
  title?: CosmeticTitle;
  appId?: string;
  photo?: string;
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

const USERS_KEY = 'mod-club-users';
const GIVEAWAYS_KEY = 'mod-club-giveaways';
const FILMS_KEY = 'mod-club-films';
const APPS_KEY = 'mod-club-apps';
const TITLES_KEY = 'mod-club-titles';
const TIMEOUTS_KEY = 'mod-club-chat-timeouts';
const CHAT_KEY = 'mod-club-chat-feed';
const APP_IDS_KEY = 'mod-club-app-ids';
const PHOTOS_KEY = 'mod-club-photos';
const COLOR_KEY = 'mod-club-color-mode-v2';
const NOTICES_KEY = 'mod-club-notices';
const CHAT_READ_KEY = 'mod-club-chat-read-at';

function readList<T>(key: string): T[] {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

function writeList<T>(key: string, items: T[]) {
  window.localStorage.setItem(key, JSON.stringify(items));
}

export function readAccounts(): ClubAccount[] {
  return readList<ClubAccount>(USERS_KEY);
}

export function saveAccounts(accounts: ClubAccount[]) {
  writeList(USERS_KEY, accounts);
}

export function upsertAccount(account: ClubAccount) {
  const accounts = readAccounts().filter((item) => item.username.toLowerCase() !== account.username.toLowerCase());
  accounts.push(account);
  saveAccounts(accounts);
}

export function findAccount(username: string) {
  return readAccounts().find((item) => item.username.toLowerCase() === username.trim().toLowerCase());
}

export function readGiveaways(): Giveaway[] {
  const current = readList<Giveaway>(GIVEAWAYS_KEY);
  const settled = settleGiveaways(current);
  if (JSON.stringify(current) !== JSON.stringify(settled)) {
    writeList(GIVEAWAYS_KEY, settled);
  }
  return settled;
}

export function saveGiveaways(items: Giveaway[]) {
  writeList(GIVEAWAYS_KEY, settleGiveaways(items));
}

export function readFilms(): ContentCard[] {
  return readList<ContentCard>(FILMS_KEY);
}

export function saveFilms(items: ContentCard[]) {
  writeList(FILMS_KEY, items);
}

export function readApps(): ContentCard[] {
  return readList<ContentCard>(APPS_KEY);
}

export function saveApps(items: ContentCard[]) {
  writeList(APPS_KEY, items);
}

export function giveawayStatus(item: Giveaway, now = Date.now()) {
  const announce = new Date(item.announceAt).getTime();
  if (Number.isNaN(announce)) return 'invalid' as const;
  if (now >= announce) return 'announced' as const;
  return 'open' as const;
}

export function settleGiveaways(items: Giveaway[], now = Date.now()) {
  return items.map((item) => {
    if (item.winner || giveawayStatus(item, now) !== 'announced' || item.participants.length === 0) {
      return item;
    }
    const winner = item.participants[Math.floor(Math.random() * item.participants.length)];
    return { ...item, winner };
  });
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

function nickKey(value: string) {
  return value.trim().toLowerCase();
}

export function readCosmeticTitles(): Record<string, CosmeticTitle> {
  try {
    const stored = window.localStorage.getItem(TITLES_KEY);
    if (!stored) return {};
    const parsed = JSON.parse(stored) as Record<string, CosmeticTitle>;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function getCosmeticTitle(nick: string): CosmeticTitle | undefined {
  const titles = readCosmeticTitles();
  return titles[nickKey(nick)];
}

export function setCosmeticTitle(nick: string, title: CosmeticTitle | null) {
  const titles = readCosmeticTitles();
  const key = nickKey(nick);
  if (!title) delete titles[key];
  else titles[key] = title;
  window.localStorage.setItem(TITLES_KEY, JSON.stringify(titles));
}

export function readChatTimeouts(): ChatTimeout[] {
  return readList<ChatTimeout>(TIMEOUTS_KEY).filter((item) => item?.nick && item.until > Date.now());
}

export function activeChatTimeout(nick: string, now = Date.now()): ChatTimeout | null {
  const key = nickKey(nick);
  return readList<ChatTimeout>(TIMEOUTS_KEY).find((item) => nickKey(item.nick) === key && item.until > now) ?? null;
}

export function saveChatTimeout(entry: ChatTimeout) {
  const key = nickKey(entry.nick);
  const next = readList<ChatTimeout>(TIMEOUTS_KEY).filter((item) => nickKey(item.nick) !== key);
  next.push(entry);
  writeList(TIMEOUTS_KEY, next);
}

export function clearChatTimeout(nick: string) {
  const key = nickKey(nick);
  writeList(TIMEOUTS_KEY, readList<ChatTimeout>(TIMEOUTS_KEY).filter((item) => nickKey(item.nick) !== key));
}

export function formatMuteRemaining(until: number, now = Date.now()) {
  const remaining = until - now;
  if (remaining > 1000 * 60 * 60 * 24 * 200) return 'kalıcı';
  return formatCountdown(until, now);
}

export function readChatFeed<T>(): T[] {
  return readList<T>(CHAT_KEY);
}

export function saveChatFeed<T>(items: T[]) {
  writeList(CHAT_KEY, items);
}

export type ColorMode = 'light' | 'dark';

export function readColorMode(): ColorMode {
  try {
    return window.localStorage.getItem(COLOR_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function applyColorMode(mode: ColorMode) {
  window.localStorage.setItem(COLOR_KEY, mode);
  document.documentElement.classList.toggle('dark', mode === 'dark');
}

export type ClubNotice = {
  id: string;
  title: string;
  body: string;
  at: number;
  read: boolean;
};

export function readNotices(): ClubNotice[] {
  return readList<ClubNotice>(NOTICES_KEY);
}

export function saveNotices(items: ClubNotice[]) {
  writeList(NOTICES_KEY, items);
}

export function readChatReadAt() {
  const raw = Number(window.localStorage.getItem(CHAT_READ_KEY) || 0);
  return Number.isFinite(raw) ? raw : 0;
}

export function saveChatReadAt(at = Date.now()) {
  window.localStorage.setItem(CHAT_READ_KEY, String(at));
}

export function readAppIds(): Record<string, string> {
  try {
    const stored = window.localStorage.getItem(APP_IDS_KEY);
    if (!stored) return {};
    const parsed = JSON.parse(stored) as Record<string, string>;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function getAppId(nick: string) {
  return readAppIds()[nickKey(nick)];
}

export function setAppId(nick: string, appId: string) {
  const ids = readAppIds();
  ids[nickKey(nick)] = appId.trim();
  window.localStorage.setItem(APP_IDS_KEY, JSON.stringify(ids));
}

export function readPhotos(): Record<string, string> {
  try {
    const stored = window.localStorage.getItem(PHOTOS_KEY);
    if (!stored) return {};
    const parsed = JSON.parse(stored) as Record<string, string>;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function getPhoto(nick: string) {
  return readPhotos()[nickKey(nick)];
}

export function setPhoto(nick: string, photo: string) {
  const photos = readPhotos();
  photos[nickKey(nick)] = photo;
  window.localStorage.setItem(PHOTOS_KEY, JSON.stringify(photos));
}

export function avatarFor(nick: string, photo?: string | null) {
  const name = nick.trim() || 'uye';
  return photo || getPhoto(name) || `https://i.pravatar.cc/160?u=${encodeURIComponent(name.toLowerCase())}`;
}
