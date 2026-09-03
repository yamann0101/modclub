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
  type: "giveaway" | "chat" | "winner" | "admin";
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
  const [settings, accounts, banners, giveaways, films, apps, chat, timeouts, notices] = await Promise.all([
    readSettings(),
    listAccounts(),
    getDoc<Banner[]>("banners", DEFAULT_BANNERS),
    readGiveaways(),
    getDoc<ContentCard[]>("films", []),
    getDoc<ContentCard[]>("apps", []),
    getDoc<unknown[]>("chat", []),
    getDoc<ChatTimeout[]>("timeouts", []),
    getDoc<ClubNotice[]>("notices", []),
  ]);
  const me = username ? accounts.find((item) => nickKey(item.username) === nickKey(username)) : undefined;
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
  };
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
