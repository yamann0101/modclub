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
  hideUntil?: number;
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
  hideGrants?: Record<string, number>;
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

export async function grantRoomHide(username: string, days: number) {
  return request<ClubSnapshot>('/api/club/hide-grant', { method: 'POST', body: JSON.stringify({ username, days }) });
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

export async function slotSpin(amount: number, theme = 'olympus') {
  return request<ClubSnapshot & { spin: SlotSpin; slot: PublicSlot }>('/api/slot/spin', { method: 'POST', body: JSON.stringify({ amount, theme }) });
}

export type RouletteSpin = {
  number: number;
  color: 'red' | 'black' | 'green';
  bet: number;
  win: number;
  pick: { kind: string; value: string | number };
};

export async function rouletteBet(amount: number, kind: string, value: string | number) {
  return request<ClubSnapshot & { spin: RouletteSpin }>('/api/casino/roulette', { method: 'POST', body: JSON.stringify({ amount, kind, value }) });
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

export type RoomCard = {
  id: string;
  title: string;
  cover: string;
  ownerNick: string;
  owner?: string;
  creator?: string;
  locked: boolean;
  watching: number;
  videoTitle: string;
  hidden?: boolean;
};

export type RoomMember = {
  username: string;
  nick: string;
  photo?: string;
  seat: number;
  muted: boolean;
  micOn: boolean;
  speaking?: boolean;
  lastSeen: number;
  emoji?: string;
  emojiAt?: number;
};

export type RoomChat = {
  id: string;
  username: string;
  nick: string;
  text: string;
  at: number;
};

export type PublicRoom = {
  id: string;
  title: string;
  cover: string;
  owner: string;
  ownerNick: string;
  creator?: string;
  locked: boolean;
  videoId: string;
  videoTitle: string;
  playing: boolean;
  position: number;
  updatedAt: number;
  mediaRev?: number;
  driver?: string;
  serverNow: number;
  members: RoomMember[];
  hosts?: string[];
  chats?: RoomChat[];
  cpOn?: boolean;
  hidden?: boolean;
  lastJoin?: { nick: string; username: string; at: number };
  pairs?: [string, string][];
  you: { username: string; owner: boolean; host?: boolean; drive?: boolean; muted: boolean; micOn: boolean; seat: number };
};

export type RoomSignal = {
  id: string;
  from: string;
  to: string;
  type: 'offer' | 'answer' | 'ice';
  payload: unknown;
  at: number;
};

export type YoutubeHit = { id: string; title: string; thumb: string };

export async function fetchRooms() {
  return request<{ rooms: RoomCard[]; hideUntil?: number }>('/api/rooms');
}

export async function createWatchRoom(body: { title: string; cover: string; password?: string }) {
  return request<{ room: PublicRoom }>('/api/rooms', { method: 'POST', body: JSON.stringify(body) });
}

export async function joinWatchRoom(id: string, password = '') {
  return request<{ room: PublicRoom }>(`/api/rooms/${encodeURIComponent(id)}/join`, { method: 'POST', body: JSON.stringify({ password }) });
}

export async function leaveWatchRoom(id: string) {
  return request<{ ok: boolean }>(`/api/rooms/${encodeURIComponent(id)}/leave`, { method: 'POST', body: '{}' });
}

export async function closeWatchRoom(id: string) {
  return request<{ ok: boolean }>(`/api/rooms/${encodeURIComponent(id)}/close`, { method: 'POST', body: '{}' });
}

export async function fetchWatchRoom(id: string) {
  return request<{ room: PublicRoom; signals: RoomSignal[] }>(`/api/rooms/${encodeURIComponent(id)}`);
}

export async function pingWatchRoom(id: string, body: { micOn?: boolean; speaking?: boolean; cpOn?: boolean; emoji?: string } = {}) {
  return request<{ room: PublicRoom }>(`/api/rooms/${encodeURIComponent(id)}/ping`, { method: 'POST', body: JSON.stringify(body) });
}

export async function claimWatchSeat(id: string, seat: number) {
  return request<{ room: PublicRoom }>(`/api/rooms/${encodeURIComponent(id)}/seat`, { method: 'POST', body: JSON.stringify({ seat }) });
}

export async function setWatchMedia(id: string, body: { videoId?: string; videoTitle?: string; playing?: boolean; position?: number; claim?: boolean }) {
  return request<{ room: PublicRoom }>(`/api/rooms/${encodeURIComponent(id)}/media`, { method: 'POST', body: JSON.stringify(body) });
}

export async function kickWatchMember(id: string, username: string) {
  return request<{ room: PublicRoom }>(`/api/rooms/${encodeURIComponent(id)}/kick`, { method: 'POST', body: JSON.stringify({ username }) });
}

export async function muteWatchMember(id: string, username: string, muted: boolean) {
  return request<{ room: PublicRoom }>(`/api/rooms/${encodeURIComponent(id)}/mute`, { method: 'POST', body: JSON.stringify({ username, muted }) });
}

export async function searchWatchYoutube(q: string) {
  return request<{ items: YoutubeHit[] }>('/api/rooms/search', { method: 'POST', body: JSON.stringify({ q }) });
}

export async function sendWatchSignal(id: string, body: { to: string; type: RoomSignal['type']; payload: unknown }) {
  return request<{ ok: boolean }>(`/api/rooms/${encodeURIComponent(id)}/signal`, { method: 'POST', body: JSON.stringify(body) });
}

export async function ackWatchSignals(id: string, ids: string[]) {
  return request<{ room: PublicRoom }>(`/api/rooms/${encodeURIComponent(id)}/ack`, { method: 'POST', body: JSON.stringify({ ids }) });
}

export async function sendWatchChat(id: string, text: string) {
  return request<{ room: PublicRoom }>(`/api/rooms/${encodeURIComponent(id)}/chat`, { method: 'POST', body: JSON.stringify({ text }) });
}

export async function clearWatchChat(id: string) {
  return request<{ room: PublicRoom }>(`/api/rooms/${encodeURIComponent(id)}/clear`, { method: 'POST', body: '{}' });
}

export async function setWatchHost(id: string, username: string, grant: boolean) {
  return request<{ room: PublicRoom }>(`/api/rooms/${encodeURIComponent(id)}/host`, { method: 'POST', body: JSON.stringify({ username, grant }) });
}

export async function setWatchHidden(id: string, hidden: boolean) {
  return request<{ room: PublicRoom }>(`/api/rooms/${encodeURIComponent(id)}/hide`, { method: 'POST', body: JSON.stringify({ hidden }) });
}

export type CpPerson = { username: string; nick: string; photo?: string };
export type CpAsk = { id: string; from: string; to: string; at: number; fromUser?: CpPerson; toUser?: CpPerson };
export type CpState = {
  partner: CpPerson | null;
  partners?: CpPerson[];
  incoming: CpAsk[];
  outgoing: CpAsk[];
  pairs: [string, string][];
};

export async function fetchCp() {
  return request<CpState>('/api/cp');
}

export async function requestCp(target: string) {
  return request<CpState>('/api/cp/request', { method: 'POST', body: JSON.stringify({ target }) });
}

export async function respondCp(id: string, accept: boolean) {
  return request<CpState>('/api/cp/respond', { method: 'POST', body: JSON.stringify({ id, accept }) });
}

export async function breakCp(target?: string) {
  return request<CpState>('/api/cp/break', { method: 'POST', body: JSON.stringify({ target: target || '' }) });
}
