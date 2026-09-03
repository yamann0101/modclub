import { Router, type IRouter } from "express";

type ClubEvent = {
  id: string;
  type: "giveaway" | "chat" | "winner" | "admin";
  title: string;
  body: string;
  sender?: string;
  at: number;
};

const EVENT_TYPES = new Set(["giveaway", "chat", "winner", "admin"]);

const events: ClubEvent[] = [];
const MAX_EVENTS = 250;

const router: IRouter = Router();

router.get("/notify", (req, res) => {
  const since = Number(req.query.since ?? 0) || 0;
  res.json({
    now: Date.now(),
    events: events.filter((item) => item.at > since),
  });
});

router.post("/notify", (req, res) => {
  const body = req.body as Partial<ClubEvent>;
  const type = EVENT_TYPES.has(String(body.type)) ? (body.type as ClubEvent["type"]) : "giveaway";
  const title = String(body.title ?? "").trim();
  const text = String(body.body ?? "").trim();
  if (!title || !text) {
    res.status(400).json({ error: "title and body required" });
    return;
  }

  const event: ClubEvent = {
    id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    title: title.slice(0, 80),
    body: text.slice(0, type === "admin" ? 280 : 180),
    sender: body.sender ? String(body.sender).slice(0, 40) : undefined,
    at: Date.now(),
  };
  events.push(event);
  if (events.length > MAX_EVENTS) {
    events.splice(0, events.length - MAX_EVENTS);
  }
  res.status(201).json({ ok: true, id: event.id });
});

export default router;
