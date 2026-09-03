import { Router, type IRouter } from "express";
import { addEvent, readEvents } from "../lib/club-data";

const EVENT_TYPES = new Set(["giveaway", "chat", "winner", "admin"]);
const router: IRouter = Router();

router.get("/notify", async (req, res) => {
  const since = Number(req.query.since ?? 0) || 0;
  const events = await readEvents();
  res.json({
    now: Date.now(),
    events: events.filter((item) => item.at > since),
  });
});

router.post("/notify", async (req, res) => {
  const body = req.body as { type?: string; title?: string; body?: string; sender?: string };
  const type = EVENT_TYPES.has(String(body.type)) ? (body.type as "giveaway" | "chat" | "winner" | "admin") : "giveaway";
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
    at: Date.now(),
  });
  res.status(201).json({ ok: true, id: event.id });
});

export default router;
