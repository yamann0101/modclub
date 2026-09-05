import { Router, type IRouter, type Request, type Response } from "express";
import { currentAccount } from "../lib/http";
import { findCasinoGame, readCasinoGames, saveCasinoGames, saveCasinoToken } from "../lib/casino-catalog";
import { handlePragmaticWallet } from "../lib/pragmatic-wallet";
import { newCasinoToken, publicCasinoStatus, requestLaunchUrl, toPublicGame } from "../lib/pragmatic";

const router: IRouter = Router();

function walletBody(req: Request) {
  const merged = { ...(req.query as Record<string, string>), ...((req.body || {}) as Record<string, string>) };
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(merged)) {
    if (value !== undefined && value !== null) next[key] = String(value);
  }
  return next;
}

router.get("/casino/status", async (_req, res) => {
  res.json(publicCasinoStatus());
});

router.get("/casino/games", async (req, res) => {
  const account = await currentAccount(req);
  if (!account) {
    res.status(401).json({ error: "auth" });
    return;
  }
  const games = await readCasinoGames();
  const staff = account.role === "ADMIN";
  res.json({ games: games.map((item) => toPublicGame(item, staff)), status: publicCasinoStatus() });
});

router.patch("/casino/games", async (req, res) => {
  const account = await currentAccount(req);
  if (!account || account.role !== "ADMIN") {
    res.status(403).json({ error: "admin" });
    return;
  }
  const games = await saveCasinoGames((req.body as { games?: unknown }).games);
  res.json({ games: games.map((item) => toPublicGame(item, true)), status: publicCasinoStatus() });
});

router.post("/casino/launch", async (req, res) => {
  const account = await currentAccount(req);
  if (!account) {
    res.status(401).json({ error: "auth" });
    return;
  }
  const id = String((req.body as { id?: string }).id || "");
  const game = await findCasinoGame(id);
  if (!game || !game.symbol) {
    res.status(400).json({ error: "game" });
    return;
  }
  try {
    const token = newCasinoToken();
    await saveCasinoToken(token, account.username);
    const host = req.get("x-forwarded-host") || req.get("host") || "localhost";
    const proto = req.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
    const lobbyUrl = `${proto}://${host}/`;
    const url = await requestLaunchUrl({
      symbol: game.symbol,
      token,
      playerId: account.username,
      lobbyUrl,
    });
    res.json({ url, title: game.title || game.kind });
  } catch (err) {
    const code = err instanceof Error ? err.message : "pragmatic_launch";
    const missing = (err as Error & { missing?: string[] }).missing;
    const detail = (err as Error & { detail?: string }).detail;
    res.status(code === "pragmatic_missing" ? 503 : 502).json({
      error: code,
      missing: missing || publicCasinoStatus().missing,
      detail,
    });
  }
});

async function wallet(req: Request, res: Response, method: string) {
  const result = await handlePragmaticWallet(method, walletBody(req));
  res.json(result);
}

router.post("/casino/wallet", async (req, res) => {
  const method = String(walletBody(req).method || req.query.method || "");
  await wallet(req, res, method);
});

router.post("/casino/wallet/:method", async (req, res) => {
  await wallet(req, res, String(req.params.method || ""));
});

export default router;
