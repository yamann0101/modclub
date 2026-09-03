import { query } from "./pg";

function nickKey(value: string) {
  return value.trim().toLowerCase();
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

export const VIP_PACKS = {
  "7": { days: 7, coins: 500, label: "7 gün VIP" },
  "30": { days: 30, coins: 1500, label: "30 gün VIP" },
} as const;

export type VipPackId = keyof typeof VIP_PACKS;

export const ROULETTE_CHIPS = [10, 50, 100, 500] as const;
const BETTING_MS = 20_000;
const SPIN_MS = 8_000;
const RESULT_MS = 5_000;
const PRESENCE_MS = 20_000;

export const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export type RouletteKind = "red" | "black" | "odd" | "even" | "low" | "high" | "straight";

export type RouletteBet = {
  nick: string;
  kind: RouletteKind;
  number?: number;
  amount: number;
};

export type RouletteWinner = {
  nick: string;
  payout: number;
  vip: boolean;
};

export type RouletteRoom = {
  status: "betting" | "spinning" | "settled";
  round: number;
  bettingEndsAt: number;
  spinEndsAt: number;
  settledUntil: number;
  result?: number;
  bets: RouletteBet[];
  winners: RouletteWinner[];
  presence: { nick: string; at: number }[];
  paid: boolean;
};

const EMPTY_ROOM: RouletteRoom = {
  status: "betting",
  round: 0,
  bettingEndsAt: 0,
  spinEndsAt: 0,
  settledUntil: 0,
  bets: [],
  winners: [],
  presence: [],
  paid: false,
};

type WalletRow = { username: string; nick: string; coins: number | null; vip_until: number | string | null };

async function readWallet(username: string) {
  const result = await query<WalletRow>(
    "SELECT username, nick, coins, vip_until FROM club_accounts WHERE lower(username) = lower($1)",
    [username.trim()],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    username: row.username,
    nick: row.nick,
    coins: Math.max(0, Number(row.coins || 0)),
    vipUntil: row.vip_until ? Number(row.vip_until) : 0,
  };
}

async function readWalletByNick(nick: string) {
  const result = await query<WalletRow>(
    "SELECT username, nick, coins, vip_until FROM club_accounts WHERE lower(nick) = lower($1)",
    [nick.trim()],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    username: row.username,
    nick: row.nick,
    coins: Math.max(0, Number(row.coins || 0)),
    vipUntil: row.vip_until ? Number(row.vip_until) : 0,
  };
}

export function isVipUntil(vipUntil?: number | null, now = Date.now()) {
  return Boolean(vipUntil && vipUntil > now);
}

export async function adminWallet(actorRole: string, username: string, action: "give" | "take" | "reset", amount = 100) {
  if (actorRole !== "ADMIN") throw new Error("admin");
  const wallet = await readWallet(username);
  if (!wallet) throw new Error("missing");
  const delta = Math.max(0, Math.floor(Number(amount) || 0));
  let coins = wallet.coins;
  if (action === "give") coins += Math.max(1, delta);
  else if (action === "take") coins = Math.max(0, coins - Math.max(1, delta));
  else coins = 0;
  await query("UPDATE club_accounts SET coins = $1 WHERE lower(username) = lower($2)", [coins, username.trim()]);
  return { ...wallet, coins };
}

export async function buyVip(username: string, packId: string) {
  const pack = VIP_PACKS[packId as VipPackId];
  if (!pack) throw new Error("pack");
  const wallet = await readWallet(username);
  if (!wallet) throw new Error("missing");
  if (wallet.coins < pack.coins) throw new Error("coins");
  const now = Date.now();
  const from = Math.max(now, wallet.vipUntil || 0);
  const vipUntil = from + pack.days * 24 * 60 * 60 * 1000;
  await query("UPDATE club_accounts SET coins = $1, vip_until = $2 WHERE lower(username) = lower($3)", [
    wallet.coins - pack.coins,
    vipUntil,
    username.trim(),
  ]);
  return { coins: wallet.coins - pack.coins, vipUntil };
}

function pocketColor(n: number) {
  if (n === 0) return "green";
  return RED_NUMBERS.has(n) ? "red" : "black";
}

function betWins(bet: RouletteBet, result: number) {
  if (bet.kind === "straight") return bet.number === result;
  if (result === 0) return false;
  if (bet.kind === "red") return pocketColor(result) === "red";
  if (bet.kind === "black") return pocketColor(result) === "black";
  if (bet.kind === "odd") return result % 2 === 1;
  if (bet.kind === "even") return result % 2 === 0;
  if (bet.kind === "low") return result >= 1 && result <= 18;
  if (bet.kind === "high") return result >= 19 && result <= 36;
  return false;
}

function betPayout(bet: RouletteBet, result: number) {
  if (!betWins(bet, result)) return 0;
  return bet.kind === "straight" ? bet.amount * 36 : bet.amount * 2;
}

function prunePresence(list: RouletteRoom["presence"], now: number) {
  return (Array.isArray(list) ? list : []).filter((item) => item?.nick && now - item.at < PRESENCE_MS);
}

function freshBetting(round: number, now: number, presence: RouletteRoom["presence"]): RouletteRoom {
  return {
    status: "betting",
    round,
    bettingEndsAt: now + BETTING_MS,
    spinEndsAt: 0,
    settledUntil: 0,
    bets: [],
    winners: [],
    presence,
    paid: false,
  };
}

function normalizeRoom(value: Partial<RouletteRoom> | null | undefined): RouletteRoom {
  return {
    ...EMPTY_ROOM,
    ...(value || {}),
    bets: Array.isArray(value?.bets) ? value.bets : [],
    winners: Array.isArray(value?.winners) ? value.winners : [],
    presence: Array.isArray(value?.presence) ? value.presence : [],
  };
}

async function payWinners(room: RouletteRoom) {
  if (room.paid || room.result === undefined) return room;
  const grouped = new Map<string, number>();
  for (const bet of room.bets) {
    const pay = betPayout(bet, room.result);
    if (!pay) continue;
    grouped.set(bet.nick, (grouped.get(bet.nick) || 0) + pay);
  }
  const winners: RouletteWinner[] = [];
  for (const [nick, payout] of grouped) {
    const wallet = await readWalletByNick(nick);
    if (wallet) {
      await query("UPDATE club_accounts SET coins = $1 WHERE lower(username) = lower($2)", [wallet.coins + payout, wallet.username]);
    }
    winners.push({ nick, payout, vip: isVipUntil(wallet?.vipUntil) });
  }
  winners.sort((a, b) => b.payout - a.payout || Number(b.vip) - Number(a.vip));
  return { ...room, winners, paid: true };
}

export async function readRoulette(now = Date.now()) {
  let room = normalizeRoom(await getDoc<Partial<RouletteRoom>>("roulette", {}));
  room.presence = prunePresence(room.presence, now);
  if (!room.round || !room.bettingEndsAt) {
    room = freshBetting(1, now, room.presence);
    await setDoc("roulette", room);
    return room;
  }
  if (room.status === "betting" && now >= room.bettingEndsAt) {
    room = {
      ...room,
      status: "spinning",
      result: Math.floor(Math.random() * 37),
      spinEndsAt: now + SPIN_MS,
      paid: false,
      winners: [],
    };
    await setDoc("roulette", room);
    return room;
  }
  if (room.status === "spinning" && now >= room.spinEndsAt) {
    room = await payWinners({ ...room, status: "settled", settledUntil: now + RESULT_MS });
    await setDoc("roulette", room);
    return room;
  }
  if (room.status === "settled" && now >= room.settledUntil) {
    room = freshBetting(room.round + 1, now, room.presence);
    await setDoc("roulette", room);
  }
  return room;
}

export function publicRoulette(room: RouletteRoom, now = Date.now()) {
  const live = prunePresence(room.presence, now);
  return {
    status: room.status,
    round: room.round,
    bettingEndsAt: room.bettingEndsAt,
    spinEndsAt: room.spinEndsAt,
    settledUntil: room.settledUntil,
    result: room.status === "betting" ? undefined : room.result,
    bets: room.bets,
    winners: room.winners,
    players: live.length,
    presence: live.map((item) => item.nick),
  };
}

export async function touchRoulette(nick: string) {
  const room = await readRoulette();
  const now = Date.now();
  const key = nickKey(nick);
  const presence = prunePresence(room.presence, now).filter((item) => nickKey(item.nick) !== key);
  presence.push({ nick, at: now });
  room.presence = presence;
  await setDoc("roulette", room);
  return room;
}

export async function placeRouletteBet(username: string, input: { kind?: string; number?: number; amount?: number }) {
  const wallet = await readWallet(username);
  if (!wallet) throw new Error("missing");
  const room = await readRoulette();
  if (room.status !== "betting" || Date.now() >= room.bettingEndsAt) throw new Error("closed");
  const amount = Math.floor(Number(input.amount));
  if (!ROULETTE_CHIPS.includes(amount as (typeof ROULETTE_CHIPS)[number])) throw new Error("chip");
  if (wallet.coins < amount) throw new Error("coins");
  const kind = String(input.kind || "") as RouletteKind;
  const allowed: RouletteKind[] = ["red", "black", "odd", "even", "low", "high", "straight"];
  if (!allowed.includes(kind)) throw new Error("kind");
  const number = kind === "straight" ? Math.floor(Number(input.number)) : undefined;
  if (kind === "straight" && (number === undefined || number < 0 || number > 36)) throw new Error("number");
  await query("UPDATE club_accounts SET coins = $1 WHERE lower(username) = lower($2)", [wallet.coins - amount, username.trim()]);
  room.bets.push({ nick: wallet.nick, kind, number, amount });
  const key = nickKey(wallet.nick);
  room.presence = prunePresence(room.presence, Date.now()).filter((item) => nickKey(item.nick) !== key);
  room.presence.push({ nick: wallet.nick, at: Date.now() });
  await setDoc("roulette", room);
  return room;
}
