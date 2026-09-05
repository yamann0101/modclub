import { query } from "./pg";

type WalletRow = { username: string; nick: string; coins: number | null; vip_until: number | string | null };

export const VIP_PACKS = {
  "7": { days: 7, coins: 500, label: "7 gün VIP" },
  "30": { days: 30, coins: 1500, label: "30 gün VIP" },
} as const;

export type VipPackId = keyof typeof VIP_PACKS;

export async function readWallet(username: string) {
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

export async function setWalletCoins(username: string, coins: number) {
  await query("UPDATE club_accounts SET coins = $1 WHERE lower(username) = lower($2)", [Math.max(0, coins), username.trim()]);
}
