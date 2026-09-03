import { query } from "./pg";

export type ClubRole = "ADMIN" | "ÜYE" | "MODERATOR";

export type ClubAccount = {
  username: string;
  password: string;
  nick: string;
  role: ClubRole;
  title?: string | null;
  appId?: string | null;
  photo?: string | null;
};

export type PublicAccount = Omit<ClubAccount, "password">;

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

export type ChatTimeout = {
  nick: string;
  until: number;
  by: string;
  label: string;
};

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
  adminPassword: string;
  theme: string;
};

export type ClubEvent = {
  id: string;
  type: "giveaway" | "chat" | "winner" | "admin" | "guess";
  title: string;
  body: string;
  sender?: string;
  at: number;
};

const DEFAULT_BANNERS: Banner[] = [
  { id: "banner-1", eyebrow: "YENİ SEZON", title: "MOD CLUB", accent: "YENİ SEZON", rest: "BAŞLADI!", copy: "Turnuvalar, ödüller ve daha fazlası seni bekliyor!", action: "Hemen Katıl", hasButton: true },
  { id: "banner-2", eyebrow: "TOPLULUK GÜNÜ", title: "BİRLİKTE", accent: "DAHA GÜÇLÜYÜZ", rest: "", copy: "Yeni arkadaşlar, yeni oyunlar ve unutulmaz anlar.", action: "Keşfet", hasButton: true },
  { id: "banner-3", eyebrow: "HAFTANIN MEYDAN OKUMASI", title: "SAHNE", accent: "SENİN!", rest: "", copy: "Skorunu yükselt, topluluk sıralamasında yerini al.", action: "Sıralamayı Gör", hasButton: true },
  { id: "banner-4", eyebrow: "ÖDÜL ZAMANI", title: "KAZANMAYA", accent: "HAZIR MISIN", rest: "", copy: "Çekilişler, turnuvalar ve özel ödüller bu sezonda.", action: "Ödülleri Gör", hasButton: true },
];

function nickKey(value: string) {
  return value.trim().toLowerCase();
}

export async function ensureSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS club_docs (
      key text PRIMARY KEY,
      value jsonb NOT NULL DEFAULT '{}'::jsonb,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS club_accounts (
      username text PRIMARY KEY,
      password text NOT NULL,
      nick text NOT NULL,
      role text NOT NULL DEFAULT 'ÜYE',
      title text,
      app_id text,
      photo text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS club_sessions (
      token text PRIMARY KEY,
      username text NOT NULL,
      expires_at timestamptz NOT NULL
    );
  `);
  await query(`INSERT INTO club_docs (key, value) VALUES ('banners', $1::jsonb) ON CONFLICT (key) DO NOTHING`, [JSON.stringify(DEFAULT_BANNERS)]);
  for (const key of ["giveaways", "films", "apps", "chat", "timeouts", "notices", "events"]) {
    await query(`INSERT INTO club_docs (key, value) VALUES ($1, '[]'::jsonb) ON CONFLICT (key) DO NOTHING`, [key]);
  }
  await query(`INSERT INTO club_docs (key, value) VALUES ('settings', '{}'::jsonb) ON CONFLICT (key) DO NOTHING`);
  await query(`INSERT INTO club_docs (key, value) VALUES ('guess_game', '{}'::jsonb) ON CONFLICT (key) DO NOTHING`);
}

async function getDoc<T>(key: string, fallback: T): Promise<T> {
  const result = await query<{ value: T }>("SELECT value FROM club_docs WHERE key = $1", [key]);
  return result.rows[0]?.value ?? fallback;
}

async function setDoc(key: string, value: unknown) {
  await query(
    `INSERT INTO club_docs (key, value, updated_at) VALUES ($1, $2::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(value)],
  );
}

export function publicAccount(account: ClubAccount): PublicAccount {
  const { password: _password, ...rest } = account;
  return rest;
}

function rowToAccount(row: {
  username: string;
  password: string;
  nick: string;
  role: string;
  title: string | null;
  app_id: string | null;
  photo: string | null;
}): ClubAccount {
  return {
    username: row.username,
    password: row.password,
    nick: row.nick,
    role: row.role === "ADMIN" || row.role === "MODERATOR" ? row.role : "ÜYE",
    title: row.title,
    appId: row.app_id,
    photo: row.photo,
  };
}

export async function listAccounts(): Promise<ClubAccount[]> {
  const result = await query<{
    username: string;
    password: string;
    nick: string;
    role: string;
    title: string | null;
    app_id: string | null;
    photo: string | null;
  }>("SELECT username, password, nick, role, title, app_id, photo FROM club_accounts ORDER BY created_at ASC");
  return result.rows.map(rowToAccount);
}

export async function findAccount(username: string) {
  const result = await query<{
    username: string;
    password: string;
    nick: string;
    role: string;
    title: string | null;
    app_id: string | null;
    photo: string | null;
  }>("SELECT username, password, nick, role, title, app_id, photo FROM club_accounts WHERE lower(username) = lower($1)", [username.trim()]);
  return result.rows[0] ? rowToAccount(result.rows[0]) : null;
}

export async function findAccountByNick(nick: string) {
  const result = await query<{
    username: string;
    password: string;
    nick: string;
    role: string;
    title: string | null;
    app_id: string | null;
    photo: string | null;
  }>("SELECT username, password, nick, role, title, app_id, photo FROM club_accounts WHERE lower(nick) = lower($1)", [nick.trim()]);
  return result.rows[0] ? rowToAccount(result.rows[0]) : null;
}

export async function upsertAccount(account: ClubAccount) {
  await query(
    `INSERT INTO club_accounts (username, password, nick, role, title, app_id, photo)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (username) DO UPDATE SET
       password = EXCLUDED.password,
       nick = EXCLUDED.nick,
       role = EXCLUDED.role,
       title = EXCLUDED.title,
       app_id = EXCLUDED.app_id,
       photo = EXCLUDED.photo`,
    [account.username.trim(), account.password, account.nick.trim(), account.role, account.title ?? null, account.appId ?? null, account.photo ?? null],
  );
}

export async function deleteAccount(username: string) {
  await query("DELETE FROM club_accounts WHERE lower(username) = lower($1)", [username.trim()]);
}

export async function readSettings(): Promise<ClubSettings | null> {
  const value = await getDoc<Partial<ClubSettings>>("settings", {});
  if (!value?.adminUsername || !value?.adminPassword) return null;
  return {
    clubName: value.clubName || "MOD CLUB",
    adminName: value.adminName || "",
    adminEmail: value.adminEmail || "",
    adminUsername: value.adminUsername,
    adminPassword: value.adminPassword,
    theme: value.theme || "electric",
  };
}

export async function writeSettings(settings: ClubSettings) {
  await setDoc("settings", settings);
  await upsertAccount({
    username: settings.adminUsername.trim(),
    password: settings.adminPassword.trim(),
    nick: settings.adminName.trim() || settings.adminUsername.trim(),
    role: "ADMIN",
  });
}

export function isInstalled(settings: ClubSettings | null) {
  return Boolean(settings?.adminUsername && settings?.adminPassword);
}

function settleGiveaways(items: Giveaway[], now = Date.now()) {
  return items.map((item) => {
    if (item.winner || !item.announceAt || item.participants.length === 0) return item;
    const announce = new Date(item.announceAt).getTime();
    if (Number.isNaN(announce) || now < announce) return item;
    const winner = item.participants[Math.floor(Math.random() * item.participants.length)];
    return { ...item, winner };
  });
}

export async function readGiveaways() {
  const items = await getDoc<Giveaway[]>("giveaways", []);
  const settled = settleGiveaways(Array.isArray(items) ? items : []);
  if (JSON.stringify(items) !== JSON.stringify(settled)) await setDoc("giveaways", settled);
  return settled;
}

export async function snapshot(username?: string) {
  const [settings, accounts, banners, giveaways, films, apps, chat, timeouts, notices, guessGame] = await Promise.all([
    readSettings(),
    listAccounts(),
    getDoc<Banner[]>("banners", DEFAULT_BANNERS),
    readGiveaways(),
    getDoc<ContentCard[]>("films", []),
    getDoc<ContentCard[]>("apps", []),
    getDoc<unknown[]>("chat", []),
    getDoc<ChatTimeout[]>("timeouts", []),
    getDoc<ClubNotice[]>("notices", []),
    readGuessGame(),
  ]);
  const me = username ? accounts.find((item) => nickKey(item.username) === nickKey(username)) : undefined;
  const staff = me?.role === "ADMIN" || me?.role === "MODERATOR";
  return {
    installed: isInstalled(settings),
    settings: settings
      ? {
          clubName: settings.clubName,
          adminName: settings.adminName,
          adminEmail: settings.adminEmail,
          adminUsername: settings.adminUsername,
          theme: settings.theme,
        }
      : null,
    me: me ? publicAccount(me) : null,
    accounts: accounts.map(publicAccount),
    banners: Array.isArray(banners) && banners.length ? banners : DEFAULT_BANNERS,
    giveaways,
    films: Array.isArray(films) ? films : [],
    apps: Array.isArray(apps) ? apps : [],
    chat: Array.isArray(chat) ? chat : [],
    timeouts: (Array.isArray(timeouts) ? timeouts : []).filter((item) => item?.nick && item.until > Date.now()),
    notices: Array.isArray(notices) ? notices.slice(0, 40) : [],
    guessGame: publicGuessGame(guessGame, staff),
  };
}

export type GuessWinner = {
  nick: string;
  at: number;
  ms: number;
};

export type GuessScore = {
  nick: string;
  wins: number;
};

export type GuessGame = {
  status: "idle" | "playing" | "revealed" | "ended";
  startedBy: string;
  seconds: number;
  min: number;
  max: number;
  secret: number;
  startedAt: number;
  endsAt: number;
  winners: GuessWinner[];
  attempted: string[];
  scores: GuessScore[];
  round: number;
  scored: boolean;
};

const EMPTY_GUESS: GuessGame = {
  status: "idle",
  startedBy: "",
  seconds: 10,
  min: 1,
  max: 20,
  secret: 0,
  startedAt: 0,
  endsAt: 0,
  winners: [],
  attempted: [],
  scores: [],
  round: 0,
  scored: false,
};

function normalizeGuess(value: Partial<GuessGame> | null | undefined): GuessGame {
  return {
    ...EMPTY_GUESS,
    ...(value || {}),
    winners: Array.isArray(value?.winners) ? value.winners : [],
    attempted: Array.isArray(value?.attempted) ? value.attempted : [],
    scores: Array.isArray(value?.scores) ? value.scores : [],
  };
}

export function publicGuessGame(game: GuessGame, staff = false) {
  const settled = settleGuessGame(game);
  const showAnswer = staff || settled.status === "revealed" || settled.status === "ended";
  return {
    status: settled.status,
    startedBy: settled.startedBy,
    seconds: settled.seconds,
    min: settled.min,
    max: settled.max,
    answer: showAnswer && settled.secret ? settled.secret : undefined,
    startedAt: settled.startedAt,
    endsAt: settled.endsAt,
    winners: [...settled.winners].sort((a, b) => a.at - b.at),
    attempted: settled.attempted,
    scores: [...settled.scores].sort((a, b) => b.wins - a.wins || a.nick.localeCompare(b.nick, "tr")),
    round: settled.round,
  };
}

function addWins(scores: GuessScore[], winners: GuessWinner[]) {
  const next = scores.map((item) => ({ ...item }));
  for (const winner of winners) {
    const found = next.find((item) => nickKey(item.nick) === nickKey(winner.nick));
    if (found) found.wins += 1;
    else next.push({ nick: winner.nick, wins: 1 });
  }
  return next;
}

function settleGuessGame(game: GuessGame, now = Date.now()): GuessGame {
  if (game.status !== "playing" || now < game.endsAt) return game;
  const winners = [...game.winners].sort((a, b) => a.at - b.at);
  return {
    ...game,
    status: "revealed",
    winners,
    scores: game.scored ? game.scores : addWins(game.scores, winners),
    scored: true,
  };
}

async function pushChat(entry: Record<string, unknown>) {
  const chat = await getDoc<unknown[]>("chat", []);
  const list = Array.isArray(chat) ? chat : [];
  list.push(entry);
  await setDoc("chat", list.slice(-400));
}

export async function readGuessGame() {
  const stored = normalizeGuess(await getDoc<Partial<GuessGame>>("guess_game", {}));
  const settled = settleGuessGame(stored);
  if (JSON.stringify(stored) !== JSON.stringify(settled)) {
    await setDoc("guess_game", settled);
    if (stored.status === "playing" && settled.status === "revealed") {
      await pushChat({
        id: `guess-round-${settled.round}`,
        author: "MOD CLUB",
        initials: "MC",
        avatar: "bg-[#a15be9] text-white",
        photo: "/logo.png",
        message: settled.winners.length ? `${settled.winners.length} kişi bildi` : "Kimse bilemedi",
        time: new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }),
        kind: "guess-round",
        at: Date.now(),
        winners: settled.winners,
        prizeText: String(settled.secret),
        prizeTitle: `${settled.min}–${settled.max}`,
      });
    }
  }
  return settled;
}

export async function startGuessRound(input: { by: string; min: number; max: number; secret: number; seconds: number }) {
  const current = await readGuessGame();
  if (current.status === "playing") throw new Error("busy");
  const min = Math.max(1, Math.min(99, Math.floor(input.min)));
  const max = Math.max(min, Math.min(99, Math.floor(input.max)));
  const secret = Math.floor(input.secret);
  const seconds = Math.max(5, Math.min(60, Math.floor(input.seconds) || 10));
  if (secret < min || secret > max) throw new Error("range");
  const now = Date.now();
  const fresh = current.status === "ended" || current.status === "idle";
  const game: GuessGame = {
    status: "playing",
    startedBy: input.by,
    seconds,
    min,
    max,
    secret,
    startedAt: now,
    endsAt: now + seconds * 1000,
    winners: [],
    attempted: [],
    scores: fresh ? [] : current.scores,
    round: fresh ? 1 : current.round + 1,
    scored: false,
  };
  await setDoc("guess_game", game);
  await pushChat({
    id: `guess-start-${game.round}-${now}`,
    author: input.by,
    initials: input.by.slice(0, 2).toUpperCase(),
    avatar: "bg-[#a15be9] text-white",
    photo: "/logo.png",
    message: "Sayı tahmini oyunu başlıyor",
    time: new Date(now).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }),
    kind: "guess-start",
    at: now,
    prizeTitle: `${min}–${max}`,
    muteLabel: `${seconds} sn`,
  });
  return game;
}

export async function submitGuess(nick: string, value: number) {
  const game = await readGuessGame();
  if (game.status !== "playing") throw new Error("closed");
  if (Date.now() >= game.endsAt) throw new Error("closed");
  const number = Math.floor(value);
  if (number < game.min || number > game.max) throw new Error("range");
  const key = nickKey(nick);
  if (game.attempted.some((item) => nickKey(item) === key)) throw new Error("used");
  game.attempted.push(nick);
  if (number === game.secret) {
    game.winners.push({ nick, at: Date.now(), ms: Date.now() - game.startedAt });
  }
  await setDoc("guess_game", game);
  return game;
}

export async function endGuessGame(by: string) {
  const current = settleGuessGame(await readGuessGame());
  if (current.status === "idle") throw new Error("idle");
  const game: GuessGame = {
    ...current,
    status: "ended",
    scores: current.status === "playing" && !current.scored ? addWins(current.scores, current.winners) : current.scores,
    scored: true,
  };
  await setDoc("guess_game", game);
  await pushChat({
    id: `guess-end-${Date.now()}`,
    author: by,
    initials: "MC",
    avatar: "bg-[#a15be9] text-white",
    photo: "/logo.png",
    message: "Oyun sonu · En çok kazananlar",
    time: new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }),
    kind: "guess-end",
    at: Date.now(),
    winners: [...game.scores].sort((a, b) => b.wins - a.wins).slice(0, 5).map((item, index) => ({
      nick: item.nick,
      at: item.wins,
      ms: index + 1,
    })),
  });
  return game;
}

export async function patchClub(input: {
  banners?: Banner[];
  giveaways?: Giveaway[];
  films?: ContentCard[];
  apps?: ContentCard[];
  chat?: unknown[];
  timeouts?: ChatTimeout[];
  notices?: ClubNotice[];
}) {
  if (input.banners) await setDoc("banners", input.banners.length ? input.banners : DEFAULT_BANNERS);
  if (input.giveaways) await setDoc("giveaways", settleGiveaways(input.giveaways));
  if (input.films) await setDoc("films", input.films);
  if (input.apps) await setDoc("apps", input.apps);
  if (input.chat) await setDoc("chat", input.chat.slice(-400));
  if (input.timeouts) await setDoc("timeouts", input.timeouts);
  if (input.notices) await setDoc("notices", input.notices.slice(0, 40));
}

export async function readEvents() {
  const items = await getDoc<ClubEvent[]>("events", []);
  return Array.isArray(items) ? items : [];
}

export async function addEvent(event: ClubEvent) {
  const items = await readEvents();
  items.push(event);
  await setDoc("events", items.slice(-250));
  return event;
}

export async function createSession(username: string) {
  const token = `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  await query(
    "INSERT INTO club_sessions (token, username, expires_at) VALUES ($1, $2, now() + interval '30 days')",
    [token, username],
  );
  return token;
}

export async function sessionAccount(token?: string) {
  if (!token) return null;
  await query("DELETE FROM club_sessions WHERE expires_at < now()");
  const result = await query<{ username: string }>("SELECT username FROM club_sessions WHERE token = $1 AND expires_at > now()", [token]);
  const username = result.rows[0]?.username;
  if (!username) return null;
  return findAccount(username);
}

export async function destroySession(token?: string) {
  if (!token) return;
  await query("DELETE FROM club_sessions WHERE token = $1", [token]);
}
