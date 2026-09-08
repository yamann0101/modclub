import { Router, type IRouter } from "express";
import { Readable } from "node:stream";
import { currentAccount } from "../lib/http";
import {
  ackSignals,
  canManage,
  claimSeat,
  clearChat,
  createRoom,
  deleteRoom,
  joinRoom,
  kickMember,
  leaveRoom,
  listRooms,
  muteMember,
  pingRoom,
  postChat,
  publicRoom,
  pushSignal,
  readRoom,
  searchYoutube,
  relatedYoutube,
  resolveYoutubePlay,
  setHidden,
  setHost,
  setMedia,
  takeSignals,
} from "../lib/watch-rooms";
import { listCpPairs } from "../lib/couples";
import { hideUntilOf } from "../lib/room-hide";

const router: IRouter = Router();

async function packRoom(room: Parameters<typeof publicRoom>[0], username: string) {
  return { ...publicRoom(room, username), pairs: await listCpPairs() };
}

function fail(res: { status: (code: number) => { json: (body: unknown) => void } }, code: string) {
  const status = code === "auth" ? 401
    : code === "password" || code === "banned" || code === "owner" || code === "perk" ? 403
    : code === "missing" || code === "member" ? 404
    : code === "full" || code === "owned" ? 409
    : 400;
  res.status(status).json({ error: code });
}

router.get("/rooms", async (req, res) => {
  const account = await currentAccount(req);
  if (!account) return fail(res, "auth");
  res.json({
    rooms: await listRooms(account),
    hideUntil: account.role === "ADMIN" ? Date.now() + 10 * 365 * 24 * 60 * 60 * 1000 : await hideUntilOf(account.username),
  });
});

router.post("/rooms", async (req, res) => {
  const account = await currentAccount(req);
  if (!account) return fail(res, "auth");
  const body = (req.body || {}) as { title?: string; cover?: string; password?: string };
  try {
    const room = await createRoom({
      username: account.username,
      nick: account.nick,
      photo: account.photo || undefined,
      title: String(body.title || ""),
      cover: String(body.cover || ""),
      password: body.password ? String(body.password) : undefined,
    });
    res.json({ room: await packRoom(room, account.username) });
  } catch (err) {
    fail(res, err instanceof Error ? err.message : "title");
  }
});

router.post("/rooms/search", async (req, res) => {
  const account = await currentAccount(req);
  if (!account) return fail(res, "auth");
  const q = String((req.body as { q?: string }).q || "");
  try {
    res.json({ items: await searchYoutube(q) });
  } catch {
    res.json({ items: [] });
  }
});

router.post("/rooms/related", async (req, res) => {
  const account = await currentAccount(req);
  if (!account) return fail(res, "auth");
  const videoId = String((req.body as { videoId?: string }).videoId || "");
  try {
    res.json({ items: await relatedYoutube(videoId) });
  } catch {
    res.json({ items: [] });
  }
});

router.post("/rooms/play", async (req, res) => {
  const account = await currentAccount(req);
  if (!account) return fail(res, "auth");
  const videoId = String((req.body as { videoId?: string }).videoId || "");
  try {
    res.json(await resolveYoutubePlay(videoId));
  } catch {
    res.json({ urls: [], title: "" });
  }
});

function allowedStreamUrl(value: string) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host.endsWith(".googlevideo.com")
      || host === "googlevideo.com"
      || host.endsWith(".youtube.com")
      || host === "youtube.com"
      || [
        "pipedapi.kavin.rocks",
        "pipedapi.adminforge.de",
        "pipedapi.leptons.xyz",
        "api.piped.private.coffee",
        "inv.nadeko.net",
        "invidious.nerdvpn.de",
        "yewtu.be",
        "iv.ggtyler.dev",
        "invidious.materialio.us",
      ].includes(host);
  } catch {
    return false;
  }
}

router.get("/rooms/stream", async (req, res) => {
  const account = await currentAccount(req);
  if (!account) return fail(res, "auth");
  const target = String(req.query.u || "");
  if (!allowedStreamUrl(target)) return fail(res, "url");
  try {
    const headers: Record<string, string> = {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36",
    };
    if (req.headers.range) headers.range = String(req.headers.range);
    const up = await fetch(target, { headers, redirect: "follow" });
    res.status(up.status);
    const type = up.headers.get("content-type");
    if (type) res.setHeader("content-type", type);
    const range = up.headers.get("content-range");
    if (range) res.setHeader("content-range", range);
    const length = up.headers.get("content-length");
    if (length) res.setHeader("content-length", length);
    const accept = up.headers.get("accept-ranges");
    res.setHeader("accept-ranges", accept || "bytes");
    if (!up.body) {
      res.end();
      return;
    }
    Readable.fromWeb(up.body as never).pipe(res);
  } catch {
    res.status(502).json({ error: "stream" });
  }
});

router.get("/rooms/:id", async (req, res) => {
  const account = await currentAccount(req);
  if (!account) return fail(res, "auth");
  const raw = await readRoom(req.params.id);
  if (!raw) return fail(res, "missing");
  if (!raw.members.some((member) => member.username === account.username)) return fail(res, "member");
  const room = await pingRoom(req.params.id, account.username);
  const signals = takeSignals(room, account.username);
  res.json({ room: await packRoom(room, account.username), signals });
});

router.post("/rooms/:id/join", async (req, res) => {
  const account = await currentAccount(req);
  if (!account) return fail(res, "auth");
  try {
    const room = await joinRoom({
      id: req.params.id,
      username: account.username,
      nick: account.nick,
      photo: account.photo || undefined,
      password: String((req.body as { password?: string }).password || ""),
      role: account.role,
    });
    res.json({ room: await packRoom(room, account.username) });
  } catch (err) {
    fail(res, err instanceof Error ? err.message : "missing");
  }
});

router.post("/rooms/:id/leave", async (req, res) => {
  const account = await currentAccount(req);
  if (!account) return fail(res, "auth");
  await leaveRoom(req.params.id, account.username);
  res.json({ ok: true });
});

router.post("/rooms/:id/close", async (req, res) => {
  const account = await currentAccount(req);
  if (!account) return fail(res, "auth");
  try {
    await deleteRoom(req.params.id, account.username);
    res.json({ ok: true });
  } catch (err) {
    fail(res, err instanceof Error ? err.message : "owner");
  }
});

router.post("/rooms/:id/ping", async (req, res) => {
  const account = await currentAccount(req);
  if (!account) return fail(res, "auth");
  try {
    const body = (req.body || {}) as { micOn?: boolean; speaking?: boolean; cpOn?: boolean; emoji?: string; firework?: string | false | { text?: string; kind?: string; ms?: number }; kiss?: string | false; kissAnswer?: boolean };
    const room = await pingRoom(req.params.id, account.username, {
      micOn: typeof body.micOn === "boolean" ? body.micOn : undefined,
      speaking: typeof body.speaking === "boolean" ? body.speaking : undefined,
      cpOn: typeof body.cpOn === "boolean" ? body.cpOn : undefined,
      emoji: typeof body.emoji === "string" ? body.emoji : undefined,
      firework: body.firework === false || typeof body.firework === "string" || (body.firework && typeof body.firework === "object")
        ? body.firework
        : undefined,
      kiss: body.kiss === false || typeof body.kiss === "string" ? body.kiss : undefined,
      kissAnswer: typeof body.kissAnswer === "boolean" ? body.kissAnswer : undefined,
    });
    res.json({ room: await packRoom(room, account.username) });
  } catch (err) {
    fail(res, err instanceof Error ? err.message : "missing");
  }
});

router.post("/rooms/:id/seat", async (req, res) => {
  const account = await currentAccount(req);
  if (!account) return fail(res, "auth");
  try {
    const room = await claimSeat(req.params.id, account.username, Number((req.body as { seat?: number }).seat));
    res.json({ room: await packRoom(room, account.username) });
  } catch (err) {
    fail(res, err instanceof Error ? err.message : "seat");
  }
});

router.post("/rooms/:id/media", async (req, res) => {
  const account = await currentAccount(req);
  if (!account) return fail(res, "auth");
  const body = (req.body || {}) as { videoId?: string; videoTitle?: string; playing?: boolean; position?: number; claim?: boolean };
  try {
    const room = await setMedia(req.params.id, account.username, account.role, body);
    res.json({ room: await packRoom(room, account.username) });
  } catch (err) {
    fail(res, err instanceof Error ? err.message : "owner");
  }
});

router.post("/rooms/:id/kick", async (req, res) => {
  const account = await currentAccount(req);
  if (!account) return fail(res, "auth");
  try {
    const room = await kickMember(req.params.id, account.username, account.role, String((req.body as { username?: string }).username || ""));
    res.json({ room: await packRoom(room, account.username) });
  } catch (err) {
    fail(res, err instanceof Error ? err.message : "owner");
  }
});

router.post("/rooms/:id/mute", async (req, res) => {
  const account = await currentAccount(req);
  if (!account) return fail(res, "auth");
  const body = (req.body || {}) as { username?: string; muted?: boolean };
  try {
    const room = await muteMember(req.params.id, account.username, account.role, String(body.username || ""), Boolean(body.muted));
    res.json({ room: await packRoom(room, account.username) });
  } catch (err) {
    fail(res, err instanceof Error ? err.message : "owner");
  }
});

router.post("/rooms/:id/chat", async (req, res) => {
  const account = await currentAccount(req);
  if (!account) return fail(res, "auth");
  try {
    const room = await postChat(req.params.id, account.username, account.nick, String((req.body as { text?: string }).text || ""));
    res.json({ room: await packRoom(room, account.username) });
  } catch (err) {
    fail(res, err instanceof Error ? err.message : "text");
  }
});

router.post("/rooms/:id/clear", async (req, res) => {
  const account = await currentAccount(req);
  if (!account) return fail(res, "auth");
  try {
    const room = await clearChat(req.params.id, account.username, account.role);
    res.json({ room: await packRoom(room, account.username) });
  } catch (err) {
    fail(res, err instanceof Error ? err.message : "owner");
  }
});

router.post("/rooms/:id/host", async (req, res) => {
  const account = await currentAccount(req);
  if (!account) return fail(res, "auth");
  const body = (req.body || {}) as { username?: string; grant?: boolean };
  try {
    const room = await setHost(req.params.id, account.username, String(body.username || ""), Boolean(body.grant));
    res.json({ room: await packRoom(room, account.username) });
  } catch (err) {
    fail(res, err instanceof Error ? err.message : "owner");
  }
});

router.post("/rooms/:id/hide", async (req, res) => {
  const account = await currentAccount(req);
  if (!account) return fail(res, "auth");
  try {
    const room = await setHidden(req.params.id, account.username, account.role, Boolean((req.body as { hidden?: boolean }).hidden));
    res.json({ room: await packRoom(room, account.username) });
  } catch (err) {
    fail(res, err instanceof Error ? err.message : "owner");
  }
});

router.post("/rooms/:id/signal", async (req, res) => {
  const account = await currentAccount(req);
  if (!account) return fail(res, "auth");
  const body = (req.body || {}) as { to?: string; type?: "offer" | "answer" | "ice"; payload?: unknown };
  if (!body.to || !body.type) return fail(res, "signal");
  try {
    await pushSignal(req.params.id, account.username, { to: body.to, type: body.type, payload: body.payload });
    res.json({ ok: true });
  } catch (err) {
    fail(res, err instanceof Error ? err.message : "member");
  }
});

router.post("/rooms/:id/ack", async (req, res) => {
  const account = await currentAccount(req);
  if (!account) return fail(res, "auth");
  const ids = ((req.body as { ids?: string[] }).ids || []).filter((id) => typeof id === "string");
  try {
    const room = await ackSignals(req.params.id, account.username, ids);
    res.json({ room: await packRoom(room, account.username) });
  } catch (err) {
    fail(res, err instanceof Error ? err.message : "missing");
  }
});

router.get("/rooms/:id/can", async (req, res) => {
  const account = await currentAccount(req);
  if (!account) return fail(res, "auth");
  const room = await readRoom(req.params.id);
  if (!room) return fail(res, "missing");
  res.json({ manage: canManage(room, account.username, account.role) });
});

export default router;
