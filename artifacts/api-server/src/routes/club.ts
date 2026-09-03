import { Router, type IRouter } from "express";
import {
  deleteAccount,
  endGuessGame,
  findAccount,
  findAccountByNick,
  isInstalled,
  patchClub,
  publicGuessGame,
  readSettings,
  snapshot,
  startGuessRound,
  submitGuess,
  upsertAccount,
} from "../lib/club-data";
import { adminWallet, buyVip, placeRouletteBet, publicRoulette, touchRoulette } from "../lib/economy";
import { clearLoginCookie, currentAccount, publicUser, setLoginCookie } from "../lib/http";

const router: IRouter = Router();

router.get("/me", async (req, res) => {
  const account = await currentAccount(req);
  if (!account) {
    res.status(401).json({ error: "auth" });
    return;
  }
  res.json(publicUser(account));
});

router.post("/auth/register", async (req, res) => {
  const settings = await readSettings();
  if (!isInstalled(settings)) {
    res.status(409).json({ error: "not_installed" });
    return;
  }
  const username = String((req.body as { username?: string }).username ?? "").trim();
  const password = String((req.body as { password?: string }).password ?? "").trim();
  const nick = String((req.body as { nick?: string }).nick ?? "").trim();
  if (username.length < 3 || password.length < 4 || nick.length < 2) {
    res.status(400).json({ error: "invalid" });
    return;
  }
  if (settings && username.toLowerCase() === settings.adminUsername.trim().toLowerCase()) {
    res.status(409).json({ error: "admin_username" });
    return;
  }
  if (await findAccount(username)) {
    res.status(409).json({ error: "exists" });
    return;
  }
  if (await findAccountByNick(nick)) {
    res.status(409).json({ error: "nick_taken" });
    return;
  }
  const account = { username, password, nick, role: "ÜYE" as const };
  await upsertAccount(account);
  await setLoginCookie(req, res, account);
  res.status(201).json(publicUser(account));
});

router.post("/auth/login", async (req, res) => {
  const username = String((req.body as { username?: string }).username ?? "").trim();
  const password = String((req.body as { password?: string }).password ?? "").trim();
  const account = await findAccount(username);
  if (!account || account.password !== password) {
    res.status(401).json({ error: "invalid_credentials" });
    return;
  }
  await setLoginCookie(req, res, account);
  res.json(publicUser(account));
});

router.post("/auth/logout", async (req, res) => {
  await clearLoginCookie(req, res);
  res.json({ ok: true });
});

router.get("/club", async (req, res) => {
  const account = await currentAccount(req);
  if (!account) {
    res.status(401).json({ error: "auth" });
    return;
  }
  res.json(await snapshot(account.username));
});

router.patch("/club", async (req, res) => {
  const account = await currentAccount(req);
  if (!account) {
    res.status(401).json({ error: "auth" });
    return;
  }
  const body = req.body as Record<string, unknown>;
  const staff = account.role === "ADMIN" || account.role === "MODERATOR";
  if (body.banners || body.films || body.apps) {
    if (account.role !== "ADMIN") {
      res.status(403).json({ error: "admin" });
      return;
    }
  }
  if (body.giveaways && !staff && !(Array.isArray((body.giveaways as unknown[])))) {
    res.status(403).json({ error: "staff" });
    return;
  }
  await patchClub({
    banners: account.role === "ADMIN" ? (body.banners as never) : undefined,
    giveaways: body.giveaways as never,
    films: account.role === "ADMIN" ? (body.films as never) : undefined,
    apps: account.role === "ADMIN" ? (body.apps as never) : undefined,
    chat: body.chat as never,
    timeouts: staff ? (body.timeouts as never) : undefined,
    notices: body.notices as never,
  });
  res.json(await snapshot(account.username));
});

router.patch("/me", async (req, res) => {
  const account = await currentAccount(req);
  if (!account) {
    res.status(401).json({ error: "auth" });
    return;
  }
  const body = req.body as { nick?: string; appId?: string; photo?: string };
  let nick = account.nick;
  if (typeof body.nick === "string") {
    const next = body.nick.trim();
    if (next.length < 2) {
      res.status(400).json({ error: "nick" });
      return;
    }
    const taken = await findAccountByNick(next);
    if (taken && taken.username.toLowerCase() !== account.username.toLowerCase()) {
      res.status(409).json({ error: "nick_taken" });
      return;
    }
    nick = next;
  }
  const next = {
    ...account,
    nick,
    appId: typeof body.appId === "string" ? body.appId.trim() : account.appId,
    photo: typeof body.photo === "string" ? body.photo : account.photo,
  };
  await upsertAccount(next);
  res.json(publicUser(next));
});

router.patch("/club/users/:username", async (req, res) => {
  const actor = await currentAccount(req);
  if (!actor || actor.role !== "ADMIN") {
    res.status(403).json({ error: "admin" });
    return;
  }
  const target = await findAccount(String(req.params.username ?? ""));
  if (!target) {
    res.status(404).json({ error: "missing" });
    return;
  }
  const body = req.body as { role?: string; title?: string | null };
  const role = body.role === "MODERATOR" || body.role === "ÜYE" || body.role === "ADMIN" ? body.role : target.role;
  const title = body.title === "ELDER" || body.title === "ASSTN" ? body.title : body.title === null || body.title === "" ? null : target.title;
  await upsertAccount({ ...target, role, title });
  res.json(await snapshot(actor.username));
});

router.delete("/club/users/:username", async (req, res) => {
  const actor = await currentAccount(req);
  if (!actor || actor.role !== "ADMIN") {
    res.status(403).json({ error: "admin" });
    return;
  }
  const target = await findAccount(String(req.params.username ?? ""));
  if (!target || target.role === "ADMIN") {
    res.status(400).json({ error: "forbidden" });
    return;
  }
  await deleteAccount(target.username);
  res.json(await snapshot(actor.username));
});

function isStaff(role: string) {
  return role === "ADMIN" || role === "MODERATOR";
}

router.post("/guess/start", async (req, res) => {
  const account = await currentAccount(req);
  if (!account || !isStaff(account.role)) {
    res.status(403).json({ error: "staff" });
    return;
  }
  const body = req.body as { min?: number; max?: number; secret?: number; seconds?: number };
  try {
    const game = await startGuessRound({
      by: account.nick,
      min: Number(body.min),
      max: Number(body.max),
      secret: Number(body.secret),
      seconds: Number(body.seconds),
    });
    res.json({ ...await snapshot(account.username), guessGame: publicGuessGame(game, true) });
  } catch (err) {
    const code = err instanceof Error ? err.message : "invalid";
    res.status(code === "busy" ? 409 : 400).json({ error: code });
  }
});

router.post("/guess", async (req, res) => {
  const account = await currentAccount(req);
  if (!account) {
    res.status(401).json({ error: "auth" });
    return;
  }
  try {
    const game = await submitGuess(account.nick, Number((req.body as { number?: number }).number));
    res.json({ ...await snapshot(account.username), guessGame: publicGuessGame(game, isStaff(account.role)) });
  } catch (err) {
    const code = err instanceof Error ? err.message : "invalid";
    res.status(code === "closed" ? 409 : 400).json({ error: code });
  }
});

router.post("/guess/end", async (req, res) => {
  const account = await currentAccount(req);
  if (!account || !isStaff(account.role)) {
    res.status(403).json({ error: "staff" });
    return;
  }
  try {
    const game = await endGuessGame(account.nick);
    res.json({ ...await snapshot(account.username), guessGame: publicGuessGame(game, true) });
  } catch (err) {
    const code = err instanceof Error ? err.message : "invalid";
    res.status(400).json({ error: code });
  }
});

router.post("/wallet", async (req, res) => {
  const account = await currentAccount(req);
  if (!account || account.role !== "ADMIN") {
    res.status(403).json({ error: "admin" });
    return;
  }
  const body = req.body as { username?: string; action?: string; amount?: number };
  try {
    await adminWallet(account.role, String(body.username || ""), body.action === "take" || body.action === "reset" ? body.action : "give", Number(body.amount));
    res.json(await snapshot(account.username));
  } catch (err) {
    const code = err instanceof Error ? err.message : "invalid";
    res.status(code === "missing" ? 404 : 400).json({ error: code });
  }
});

router.post("/store/vip", async (req, res) => {
  const account = await currentAccount(req);
  if (!account) {
    res.status(401).json({ error: "auth" });
    return;
  }
  try {
    await buyVip(account.username, String((req.body as { pack?: string }).pack || ""));
    res.json(await snapshot(account.username));
  } catch (err) {
    const code = err instanceof Error ? err.message : "invalid";
    res.status(code === "coins" ? 409 : 400).json({ error: code });
  }
});

router.post("/roulette/here", async (req, res) => {
  const account = await currentAccount(req);
  if (!account) {
    res.status(401).json({ error: "auth" });
    return;
  }
  const room = await touchRoulette(account.nick);
  res.json({ ...await snapshot(account.username), roulette: publicRoulette(room) });
});

router.post("/roulette/bet", async (req, res) => {
  const account = await currentAccount(req);
  if (!account) {
    res.status(401).json({ error: "auth" });
    return;
  }
  try {
    const room = await placeRouletteBet(account.username, req.body as { kind?: string; number?: number; amount?: number });
    res.json({ ...await snapshot(account.username), roulette: publicRoulette(room) });
  } catch (err) {
    const code = err instanceof Error ? err.message : "invalid";
    res.status(code === "closed" || code === "coins" ? 409 : 400).json({ error: code });
  }
});

export default router;
