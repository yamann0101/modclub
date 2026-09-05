import { readWallet, setWalletCoins } from "./economy";
import { markCasinoRef, readCasinoToken, seenCasinoRef } from "./casino-catalog";
import {
  coinsFromPragmaticAmount,
  pragmaticAmountFromCoins,
  pragmaticConfig,
  verifyPragmaticHash,
} from "./pragmatic";

type WalletBody = Record<string, string>;

function ok(extra: Record<string, unknown> = {}) {
  return {
    error: "0",
    description: "OK",
    ...extra,
  };
}

function fail(code: string, description: string) {
  return { error: code, description };
}

function params(body: WalletBody) {
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(body || {})) {
    if (value !== undefined && value !== null) next[key] = String(value);
  }
  return next;
}

async function userFrom(body: WalletBody) {
  const token = String(body.token || "");
  const player = String(body.userId || body.externalPlayerId || "");
  const fromToken = token ? await readCasinoToken(token) : null;
  return fromToken || player || "";
}

async function balancePayload(username: string) {
  const wallet = await readWallet(username);
  if (!wallet) return null;
  const cfg = pragmaticConfig();
  return {
    currency: cfg.currency,
    cash: pragmaticAmountFromCoins(wallet.coins),
    bonus: 0,
    balance: pragmaticAmountFromCoins(wallet.coins),
  };
}

export async function handlePragmaticWallet(method: string, raw: WalletBody) {
  const body = params(raw);
  if (!verifyPragmaticHash(body)) {
    return fail("5", "Invalid hash");
  }

  const action = method.toLowerCase();
  if (action === "authenticate") {
    const username = await userFrom(body);
    const payload = username ? await balancePayload(username) : null;
    if (!payload) return fail("2", "User not found");
    return ok({
      userId: username,
      currency: payload.currency,
      cash: payload.cash,
      bonus: payload.bonus,
    });
  }

  if (action === "balance") {
    const username = await userFrom(body);
    const payload = username ? await balancePayload(username) : null;
    if (!payload) return fail("2", "User not found");
    return ok({ currency: payload.currency, cash: payload.cash, bonus: 0 });
  }

  const username = await userFrom(body);
  const wallet = username ? await readWallet(username) : null;
  if (!wallet) return fail("2", "User not found");

  const reference = String(body.reference || body.transactionId || "");
  const amount = coinsFromPragmaticAmount(body.amount || "0");

  if (action === "bet") {
    if (reference) {
      const seen = await seenCasinoRef(reference);
      if (seen) {
        const payload = await balancePayload(username);
        return ok(payload || {});
      }
    }
    if (wallet.coins < amount) return fail("1", "INSUFFICIENT_FUNDS");
    await setWalletCoins(username, wallet.coins - amount);
    if (reference) await markCasinoRef(reference, { kind: "bet", amount, username });
    return ok(await balancePayload(username) || {});
  }

  if (action === "result" || action === "bonuswin" || action === "jackpotwin" || action === "promowin") {
    if (reference) {
      const seen = await seenCasinoRef(reference);
      if (seen) return ok(await balancePayload(username) || {});
    }
    await setWalletCoins(username, wallet.coins + amount);
    if (reference) await markCasinoRef(reference, { kind: action, amount, username });
    return ok(await balancePayload(username) || {});
  }

  if (action === "refund") {
    if (reference) {
      const seen = await seenCasinoRef(`refund:${reference}`);
      if (seen) return ok(await balancePayload(username) || {});
    }
    await setWalletCoins(username, wallet.coins + amount);
    if (reference) await markCasinoRef(`refund:${reference}`, { kind: "refund", amount, username });
    return ok(await balancePayload(username) || {});
  }

  if (action === "endround" || action === "adjustment") {
    return ok(await balancePayload(username) || {});
  }

  return fail("7", "Bad method");
}
