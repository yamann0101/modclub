import { Router, type IRouter } from "express";
import { addEvent, readEvents } from "../lib/club-data";
import { currentAccount } from "../lib/http";
import { dropPushSub, savePushSub, vapidPublicKey } from "../lib/web-push";

const EVENT_TYPES = new Set(["giveaway", "chat", "winner", "admin", "guess"]);
const router: IRouter = Router();

router.get("/notify", async (req, res) => {
  const since = Number(req.query.since ?? 0) || 0;
  const events = await readEvents();
  res.json({
    now: Date.now(),
    events: events.filter((item) => item.at > since),
  });
});

router.get("/notify/key", async (_req, res) => {
  res.json({ key: await vapidPublicKey() });
});

router.post("/notify/subscribe", async (req, res) => {
  const account = await currentAccount(req);
  if (!account) {
    res.status(401).json({ error: "auth" });
    return;
  }
  const body = (req.body || {}) as {
    subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    deviceId?: string;
    chatMuted?: boolean;
  };
  const sub = body.subscription;
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    res.status(400).json({ error: "sub" });
    return;
  }
  await savePushSub({
    endpoint: sub.endpoint,
    keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    username: account.username,
    deviceId: String(body.deviceId || ""),
    chatMuted: Boolean(body.chatMuted),
  });
  res.json({ ok: true });
});

router.post("/notify/unsubscribe", async (req, res) => {
  const endpoint = String((req.body as { endpoint?: string })?.endpoint || "");
  if (endpoint) await dropPushSub(endpoint);
  res.json({ ok: true });
});

router.post("/notify", async (req, res) => {
  const account = await currentAccount(req);
  const body = req.body as { type?: string; title?: string; body?: string; sender?: string };
  const type = EVENT_TYPES.has(String(body.type)) ? (body.type as "giveaway" | "chat" | "winner" | "admin" | "guess") : "giveaway";
  const title = String(body.title ?? "").trim();
  const text = String(body.body ?? "").trim();
  if (!title || !text) {
    res.status(400).json({ error: "title and body required" });
    return;
  }
  const event = await addEvent({
    id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    title: title.slice(0, 80),
    body: text.slice(0, type === "admin" ? 280 : 180),
    sender: body.sender ? String(body.sender).slice(0, 40) : undefined,
    from: account?.username,
    at: Date.now(),
  });
  res.status(201).json({ ok: true, id: event.id });
});

export default router;
