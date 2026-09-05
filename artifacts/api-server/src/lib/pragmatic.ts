import { createHash, randomBytes } from "node:crypto";

export type CasinoKind = "slot" | "slot2" | "animal" | "roulette";

export type CasinoGame = {
  id: string;
  kind: CasinoKind;
  title: string;
  image: string;
  symbol: string;
};

const KINDS: CasinoKind[] = ["slot", "slot2", "animal", "roulette"];

export function pragmaticConfig() {
  const secureLogin = (process.env["PP_SECURE_LOGIN"] || process.env["PP_OPERATOR_ID"] || "").trim();
  const secretKey = (process.env["PP_SECRET_KEY"] || process.env["PP_SECRET"] || "").trim();
  const apiUrl = (process.env["PP_API_URL"] || "").trim().replace(/\/$/, "");
  const launchUrl = (process.env["PP_LAUNCH_URL"] || (apiUrl ? `${apiUrl}/game/url` : "")).trim();
  const currency = (process.env["PP_CURRENCY"] || "").trim();
  const language = (process.env["PP_LANGUAGE"] || "tr").trim();
  const platform = (process.env["PP_PLATFORM"] || "WEB").trim();
  const technology = (process.env["PP_TECHNOLOGY"] || "H5").trim();
  const amountScale = Number(process.env["PP_AMOUNT_SCALE"] || "1") || 1;
  return { secureLogin, secretKey, apiUrl, launchUrl, currency, language, platform, technology, amountScale };
}

export function missingPragmaticFields() {
  const cfg = pragmaticConfig();
  const missing: string[] = [];
  if (!cfg.secureLogin) missing.push("PP_SECURE_LOGIN (operator / secureLogin)");
  if (!cfg.secretKey) missing.push("PP_SECRET_KEY");
  if (!cfg.launchUrl) missing.push("PP_API_URL veya PP_LAUNCH_URL");
  if (!cfg.currency) missing.push("PP_CURRENCY (Pragmatic’in sanal/sosyal coin için verdiği para birimi kodu, fiat değil)");
  return missing;
}

export function pragmaticReady() {
  return missingPragmaticFields().length === 0;
}

export function publicCasinoStatus() {
  const missing = missingPragmaticFields();
  return {
    ready: missing.length === 0,
    missing,
    note: missing.length
      ? "Pragmatic Play resmi operator hesabı ve Seamless Wallet / Game Launch bilgileri yok. Sahte API kurulmaz. PP’den operator ID, secret, launch API adresi, sanal para birimi kodu ve callback URL onayı gerekir."
      : "Launch ve cüzdan callback’leri resmi PP sözleşmesine göre hazır.",
  };
}

export function pragmaticHash(params: Record<string, string>, secret = pragmaticConfig().secretKey) {
  const values = Object.keys(params)
    .filter((key) => key !== "hash" && params[key] !== undefined && params[key] !== "")
    .sort()
    .map((key) => String(params[key]));
  return createHash("md5").update(`${values.join("")}${secret}`, "utf8").digest("hex");
}

export function verifyPragmaticHash(params: Record<string, string>) {
  const sent = String(params.hash || "").toLowerCase();
  if (!sent || !pragmaticConfig().secretKey) return false;
  return sent === pragmaticHash(params).toLowerCase();
}

export function newCasinoToken() {
  return randomBytes(24).toString("hex");
}

export function toPublicGame(game: CasinoGame, staff = false) {
  return {
    id: game.id,
    kind: game.kind,
    title: game.title,
    image: game.image,
    configured: Boolean(game.symbol.trim()),
    symbol: staff ? game.symbol : undefined,
  };
}

export function emptyCatalog(): CasinoGame[] {
  return KINDS.map((kind, index) => ({
    id: `casino-${kind}`,
    kind,
    title: "",
    image: "",
    symbol: "",
  }));
}

export function normalizeCatalog(raw: unknown): CasinoGame[] {
  const fallback = emptyCatalog();
  const list = Array.isArray(raw) ? raw : [];
  return fallback.map((slot, index) => {
    const item = list.find((entry) => (entry as CasinoGame)?.kind === slot.kind) || list[index] || {};
    const row = item as Partial<CasinoGame>;
    return {
      id: String(row.id || slot.id),
      kind: slot.kind,
      title: String(row.title || "").trim(),
      image: String(row.image || "").trim(),
      symbol: String(row.symbol || "").trim(),
    };
  });
}

export function coinsFromPragmaticAmount(amount: string | number) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.max(0, Math.round(value / pragmaticConfig().amountScale));
}

export function pragmaticAmountFromCoins(coins: number) {
  return Number((Math.max(0, coins) * pragmaticConfig().amountScale).toFixed(2));
}

export async function requestLaunchUrl(input: {
  symbol: string;
  token: string;
  playerId: string;
  lobbyUrl: string;
}) {
  const missing = missingPragmaticFields();
  if (missing.length) {
    const error = new Error("pragmatic_missing");
    (error as Error & { missing: string[] }).missing = missing;
    throw error;
  }
  const cfg = pragmaticConfig();
  const params: Record<string, string> = {
    secureLogin: cfg.secureLogin,
    symbol: input.symbol,
    language: cfg.language,
    token: input.token,
    externalPlayerId: input.playerId,
    currency: cfg.currency,
    platform: cfg.platform,
    technology: cfg.technology,
    lobbyURL: input.lobbyUrl,
  };
  params.hash = pragmaticHash(params);

  const body = new URLSearchParams(params);
  const response = await fetch(cfg.launchUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await response.text();
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    data = Object.fromEntries(new URLSearchParams(text));
  }
  const gameURL = String(data.gameURL || data.gameUrl || data.url || "");
  const errorCode = String(data.error ?? "");
  if (!gameURL || (errorCode && errorCode !== "0")) {
    const error = new Error("pragmatic_launch");
    (error as Error & { detail: string }).detail = String(data.description || data.error || text.slice(0, 240) || "launch");
    throw error;
  }
  return gameURL;
}
