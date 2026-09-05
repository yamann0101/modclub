import { SLOT_CHIPS } from "./olympus-slot";
import { readWallet, setWalletCoins } from "./economy";

const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export type RoulettePick =
  | { kind: "number"; value: number }
  | { kind: "color"; value: "red" | "black" }
  | { kind: "parity"; value: "even" | "odd" };

function colorOf(n: number) {
  if (n === 0) return "green";
  return RED.has(n) ? "red" : "black";
}

function parsePick(raw: { kind?: string; value?: string | number }): RoulettePick {
  const kind = String(raw.kind || "");
  if (kind === "number") {
    const value = Math.floor(Number(raw.value));
    if (value < 0 || value > 36) throw new Error("pick");
    return { kind: "number", value };
  }
  if (kind === "color") {
    const value = String(raw.value);
    if (value !== "red" && value !== "black") throw new Error("pick");
    return { kind: "color", value };
  }
  if (kind === "parity") {
    const value = String(raw.value);
    if (value !== "even" && value !== "odd") throw new Error("pick");
    return { kind: "parity", value };
  }
  throw new Error("pick");
}

function payout(pick: RoulettePick, n: number) {
  if (pick.kind === "number") return pick.value === n ? 36 : 0;
  if (n === 0) return 0;
  if (pick.kind === "color") return colorOf(n) === pick.value ? 2 : 0;
  const even = n % 2 === 0;
  return (pick.value === "even" ? even : !even) ? 2 : 0;
}

export async function playRoulette(username: string, amount: number, rawPick: { kind?: string; value?: string | number }) {
  const wallet = await readWallet(username);
  if (!wallet) throw new Error("missing");
  const bet = Math.floor(Number(amount));
  if (!SLOT_CHIPS.includes(bet as (typeof SLOT_CHIPS)[number])) throw new Error("chip");
  if (wallet.coins < bet) throw new Error("coins");
  const pick = parsePick(rawPick);
  const number = Math.floor(Math.random() * 37);
  const mult = payout(pick, number);
  const win = bet * mult;
  const coins = wallet.coins - bet + win;
  await setWalletCoins(username, coins);
  return {
    coins,
    spin: {
      number,
      color: colorOf(number),
      bet,
      win,
      pick,
    },
  };
}
