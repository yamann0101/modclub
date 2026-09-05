import type { Banner, ChatTimeout, ClubAccount, ClubNotice, ClubSettings, ContentCard, Giveaway } from './club-store';

export type SessionUser = {
  username: string;
  nick: string;
  name: string;
  role: 'ADMIN' | 'ÜYE' | 'MODERATOR';
  title?: string;
  appId?: string;
  photo?: string;
  coins?: number;
  vipUntil?: number;
};

export type SlotCell = { id: string; t: 's' | 'x' | 'f'; s?: string; m?: number };
export type SlotWin = { symbol: string; count: number; pay: number };
export type SlotStep = { grid: SlotCell[][]; wins: SlotWin[]; mults: number[]; stepWin: number; pot: number };
export type SlotSpin = {
  steps: SlotStep[];
  totalWin: number;
  freesAwarded: number;
  freesLeft: number;
  pot: number;
  bet: number;
  free: boolean;
};
export type PublicSlot = { freesLeft: number; pot: number; lastBet: number };

export type PublicGuessGame = {
  status: 'idle' | 'playing' | 'revealed' | 'ended';
  startedBy: string;
  seconds: number;
  min: number;
  max: number;
  answer?: number;
  startedAt: number;
  endsAt: number;
  winners: { nick: string; at: number; ms: number }[];
  attempted: string[];
  scores: { nick: string; wins: number }[];
  round: number;
};

export type ClubSnapshot = {
  installed: boolean;
  settings: ClubSettings | null;
  me: ClubAccount | null;
  accounts: ClubAccount[];
  banners: Banner[];
  giveaways: Giveaway[];
  films: ContentCard[];
  apps: ContentCard[];
  chat: unknown[];
  timeouts: ChatTimeout[];
  notices: ClubNotice[];
  guessGame?: PublicGuessGame;
  slot?: PublicSlot;
  spin?: SlotSpin;
};

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(String((data as { error?: string }).error || response.status));
    (error as Error & { status: number }).status = response.status;
    throw error;
  }
  return data as T;
}

export async function fetchPublicSetup() {
  try {
    return await request<{
      installed: boolean;
      clubName: string;
      adminName: string;
      adminEmail: string;
      adminUsername: string;
      theme: string;
      me: SessionUser | null;
    }>('/api/setup');
  } catch {
    return null;
  }
}

export async function saveServerSetup(settings: {
  clubName: string;
  adminName: string;
  adminEmail: string;
  adminUsername: string;
  adminPassword: string;
  theme: string;
}) {
  return request<SessionUser & { installed: boolean; clubName: string; adminName: string; adminEmail: string; adminUsername: string; theme: string; me: SessionUser }>(
    '/api/setup',
    { method: 'POST', body: JSON.stringify(settings) },
  );
}

export async function loginUser(username: string, password: string) {
  return request<SessionUser>('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
}

export async function registerUser(username: string, password: string, nick: string) {
  return request<SessionUser>('/api/auth/register', { method: 'POST', body: JSON.stringify({ username, password, nick }) });
}

export async function logoutUser() {
  try {
    await request('/api/auth/logout', { method: 'POST', body: '{}' });
  } catch {
    /* ignore */
  }
}

export async function fetchMe() {
  try {
    return await request<SessionUser>('/api/me');
  } catch {
    return null;
  }
}

export async function fetchClub() {
  return request<ClubSnapshot>('/api/club');
}

export async function patchClub(body: Partial<Pick<ClubSnapshot, 'banners' | 'giveaways' | 'films' | 'apps' | 'chat' | 'timeouts' | 'notices'>>) {
  return request<ClubSnapshot>('/api/club', { method: 'PATCH', body: JSON.stringify(body) });
}

export async function patchMe(body: { nick?: string; appId?: string; photo?: string }) {
  return request<SessionUser>('/api/me', { method: 'PATCH', body: JSON.stringify(body) });
}

export async function patchClubUser(username: string, body: { role?: string; title?: string | null }) {
  return request<ClubSnapshot>(`/api/club/users/${encodeURIComponent(username)}`, { method: 'PATCH', body: JSON.stringify(body) });
}

export async function deleteClubUser(username: string) {
  return request<ClubSnapshot>(`/api/club/users/${encodeURIComponent(username)}`, { method: 'DELETE' });
}

export async function startGuessGame(body: { min: number; max: number; secret: number; seconds: number }) {
  return request<ClubSnapshot>('/api/guess/start', { method: 'POST', body: JSON.stringify(body) });
}

export async function submitGuess(number: number) {
  return request<ClubSnapshot>('/api/guess', { method: 'POST', body: JSON.stringify({ number }) });
}

export async function endGuessGame() {
  return request<ClubSnapshot>('/api/guess/end', { method: 'POST', body: '{}' });
}

export async function adminWallet(username: string, action: 'give' | 'take' | 'reset', amount = 100) {
  return request<ClubSnapshot>('/api/wallet', { method: 'POST', body: JSON.stringify({ username, action, amount }) });
}

export async function buyVipPack(pack: '7' | '30') {
  return request<ClubSnapshot>('/api/store/vip', { method: 'POST', body: JSON.stringify({ pack }) });
}

export async function slotSpin(amount: number) {
  return request<ClubSnapshot & { spin: SlotSpin; slot: PublicSlot }>('/api/slot/spin', { method: 'POST', body: JSON.stringify({ amount }) });
}

export type CasinoKind = 'slot' | 'slot2' | 'animal' | 'roulette';

export type CasinoGame = {
  id: string;
  kind: CasinoKind;
  title: string;
  image: string;
  configured: boolean;
  symbol?: string;
};

export type CasinoStatus = {
  ready: boolean;
  missing: string[];
  note: string;
};

export async function fetchCasino() {
  return request<{ games: CasinoGame[]; status: CasinoStatus }>('/api/casino/games');
}

export async function saveCasinoGames(games: { id: string; kind: CasinoKind; title: string; image: string; symbol: string }[]) {
  return request<{ games: CasinoGame[]; status: CasinoStatus }>('/api/casino/games', { method: 'PATCH', body: JSON.stringify({ games }) });
}

export async function launchCasinoGame(id: string) {
  return request<{ url: string; title: string }>('/api/casino/launch', { method: 'POST', body: JSON.stringify({ id }) });
}
