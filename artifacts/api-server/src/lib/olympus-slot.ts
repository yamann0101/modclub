import { query } from "./pg";
import { readWallet, setWalletCoins } from "./economy";

export const SLOT_CHIPS = [10, 20, 50, 100, 200, 500] as const;
const COLS = 6;
const ROWS = 5;
const MAX_WIN_X = 1000;
const MAX_CASCADES = 8;

export type SlotCell = {
  id: string;
  t: "s" | "x" | "f";
  s?: string;
  m?: number;
};

export type SlotWin = { symbol: string; count: number; pay: number };
export type SlotStep = {
  grid: SlotCell[][];
  wins: SlotWin[];
  mults: number[];
  stepWin: number;
  pot: number;
};

export type SlotSession = {
  freesLeft: number;
  pot: number;
  lastBet: number;
};

export type SlotSpin = {
  steps: SlotStep[];
  totalWin: number;
  freesAwarded: number;
  freesLeft: number;
  pot: number;
  bet: number;
  free: boolean;
};

const PAYS: Record<string, [number, number, number]> = {
  yellow: [0.2, 0.4, 1],
  blue: [0.25, 0.5, 1.2],
  green: [0.3, 0.6, 1.5],
  purple: [0.4, 0.8, 2],
  red: [0.5, 1, 2.5],
  hour: [0.8, 1.5, 4],
  ring: [1, 2.5, 6],
  goblet: [1.5, 4, 10],
  crown: [2, 6, 20],
  zeus: [5, 15, 50],
};

const MULTS: { m: number; w: number }[] = [
  { m: 2, w: 42 },
  { m: 3, w: 26 },
  { m: 5, w: 14 },
  { m: 10, w: 9 },
  { m: 25, w: 5 },
  { m: 50, w: 2.4 },
  { m: 100, w: 1.1 },
  { m: 250, w: 0.35 },
  { m: 500, w: 0.12 },
  { m: 1000, w: 0.03 },
];

function slotKey(username: string) {
  return `slot:${username.trim().toLowerCase()}`;
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

function pickWeighted<T>(items: { item: T; w: number }[]): T {
  const total = items.reduce((sum, item) => sum + item.w, 0);
  let roll = Math.random() * total;
  for (const item of items) {
    roll -= item.w;
    if (roll <= 0) return item.item;
  }
  return items[items.length - 1].item;
}

function payFor(symbol: string, count: number) {
  const table = PAYS[symbol];
  if (!table || count < 8) return 0;
  if (count >= 12) return table[2];
  if (count >= 10) return table[1];
  return table[0];
}

function cloneGrid(grid: SlotCell[][]): SlotCell[][] {
  return grid.map((col) => col.map((cell) => ({ ...cell })));
}

export function publicSlot(session: SlotSession) {
  return {
    freesLeft: session.freesLeft,
    pot: session.pot,
    lastBet: session.lastBet,
  };
}

export async function readSlot(username: string): Promise<SlotSession> {
  const raw = await getDoc<Partial<SlotSession>>(slotKey(username), {});
  return {
    freesLeft: Math.max(0, Math.floor(Number(raw.freesLeft) || 0)),
    pot: Math.max(0, Number(raw.pot) || 0),
    lastBet: Math.max(0, Math.floor(Number(raw.lastBet) || 0)),
  };
}

function makeCell(free: boolean, nextId: () => string): SlotCell {
  const scatterW = free ? 2.2 : 2.6;
  const multW = free ? 7 : 3.4;
  const kind = pickWeighted([
    { item: "cell" as const, w: 100 },
    { item: "scatter" as const, w: scatterW },
    { item: "mult" as const, w: multW },
  ]);
  if (kind === "scatter") return { id: nextId(), t: "f" };
  if (kind === "mult") {
    const m = pickWeighted(MULTS.map((item) => ({ item: item.m, w: free ? item.w * (item.m >= 25 ? 1.35 : 1) : item.w })));
    return { id: nextId(), t: "x", m };
  }
  const symbol = pickWeighted([
    { item: "yellow", w: 22 },
    { item: "blue", w: 20 },
    { item: "green", w: 18 },
    { item: "purple", w: 15 },
    { item: "red", w: 13 },
    { item: "hour", w: 8 },
    { item: "ring", w: 6 },
    { item: "goblet", w: 4.5 },
    { item: "crown", w: 3 },
    { item: "zeus", w: 1.6 },
  ]);
  return { id: nextId(), t: "s", s: symbol };
}

function emptyGrid(): SlotCell[][] {
  return Array.from({ length: COLS }, () => Array.from({ length: ROWS }, () => ({ id: "", t: "s" as const, s: "yellow" })));
}

function fillGrid(grid: SlotCell[][], free: boolean, nextId: () => string) {
  for (let col = 0; col < COLS; col += 1) {
    const kept = grid[col].filter((cell) => cell.id);
    const missing = ROWS - kept.length;
    const fresh = Array.from({ length: missing }, () => makeCell(free, nextId));
    grid[col] = [...fresh, ...kept];
  }
}

function evaluate(grid: SlotCell[][], bet: number, free: boolean, pot: number) {
  const counts = new Map<string, number>();
  const mults: number[] = [];
  let scatters = 0;
  for (const col of grid) {
    for (const cell of col) {
      if (cell.t === "s" && cell.s) counts.set(cell.s, (counts.get(cell.s) || 0) + 1);
      if (cell.t === "x" && cell.m) mults.push(cell.m);
      if (cell.t === "f") scatters += 1;
    }
  }
  const wins: SlotWin[] = [];
  let base = 0;
  for (const [symbol, count] of counts) {
    const pay = payFor(symbol, count);
    if (!pay) continue;
    wins.push({ symbol, count, pay });
    base += pay;
  }
  let nextPot = pot;
  if (free) {
    nextPot += mults.reduce((sum, value) => sum + value, 0);
  }
  const factor = wins.length
    ? Math.max(1, free ? nextPot : mults.reduce((product, value) => product * value, 1))
    : 1;
  const stepWin = wins.length ? Math.floor(base * bet * factor) : 0;
  return { wins, mults, scatters, stepWin, pot: nextPot };
}

function clearWins(grid: SlotCell[][], wins: SlotWin[], dropMults: boolean) {
  const winning = new Set(wins.map((item) => item.symbol));
  for (let col = 0; col < COLS; col += 1) {
    grid[col] = grid[col].map((cell) => {
      if (cell.t === "s" && cell.s && winning.has(cell.s)) return { id: "", t: "s" as const, s: "yellow" };
      if (dropMults && cell.t === "x") return { id: "", t: "s" as const, s: "yellow" };
      return cell;
    });
  }
}

function playRound(bet: number, free: boolean, startPot: number): { steps: SlotStep[]; totalWin: number; scatters: number; pot: number } {
  let seq = 0;
  const nextId = () => `c${++seq}`;
  const grid = emptyGrid();
  fillGrid(grid, free, nextId);
  const steps: SlotStep[] = [];
  let totalWin = 0;
  let pot = startPot;
  let bestScatter = 0;
  for (let i = 0; i < MAX_CASCADES; i += 1) {
    const result = evaluate(grid, bet, free, pot);
    bestScatter = Math.max(bestScatter, result.scatters);
    pot = result.pot;
    totalWin += result.stepWin;
    steps.push({
      grid: cloneGrid(grid),
      wins: result.wins,
      mults: result.mults,
      stepWin: result.stepWin,
      pot,
    });
    if (!result.wins.length) break;
    clearWins(grid, result.wins, true);
    fillGrid(grid, free, nextId);
  }
  return { steps, totalWin, scatters: bestScatter, pot };
}

function freesFromScatters(count: number, inFree: boolean) {
  if (inFree) return count >= 3 ? 5 : 0;
  if (count >= 6) return 25;
  if (count >= 5) return 20;
  if (count >= 4) return 15;
  return 0;
}

export async function spinOlympus(username: string, amount: number) {
  const wallet = await readWallet(username);
  if (!wallet) throw new Error("missing");
  const session = await readSlot(username);
  const free = session.freesLeft > 0;
  const bet = free ? session.lastBet : Math.floor(Number(amount));
  if (!SLOT_CHIPS.includes(bet as (typeof SLOT_CHIPS)[number])) throw new Error("chip");
  if (!free && wallet.coins < bet) throw new Error("coins");

  let coins = wallet.coins;
  if (!free) coins -= bet;

  const startPot = free ? session.pot : 0;
  const played = playRound(bet, free, startPot);
  const capped = Math.min(played.totalWin, bet * MAX_WIN_X);
  coins += capped;

  const awarded = freesFromScatters(played.scatters, free);
  let freesLeft = free ? Math.max(0, session.freesLeft - 1) : 0;
  let pot = free ? played.pot : 0;
  if (awarded && !free) {
    freesLeft += awarded;
    pot = 0;
  } else if (awarded && free) {
    freesLeft += awarded;
  }
  if (freesLeft <= 0) pot = 0;

  await setWalletCoins(username, coins);
  const next: SlotSession = { freesLeft, pot, lastBet: bet };
  await setDoc(slotKey(username), next);

  const spin: SlotSpin = {
    steps: played.steps,
    totalWin: capped,
    freesAwarded: awarded,
    freesLeft,
    pot,
    bet,
    free,
  };
  return { coins, spin, slot: publicSlot(next) };
}
