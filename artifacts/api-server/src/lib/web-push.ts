import webpush from "web-push";
import { query } from "./pg";

type PushSub = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  username: string;
  deviceId: string;
  chatMuted?: boolean;
  at: number;
};

type VapidDoc = { publicKey: string; privateKey: string };

async function getDoc<T>(name: string, fallback: T): Promise<T> {
  const result = await query<{ value: T }>("SELECT value FROM club_docs WHERE key = $1", [name]);
  return result.rows[0]?.value ?? fallback;
}

async function setDoc(name: string, value: unknown) {
  await query(
    `INSERT INTO club_docs (key, value, updated_at) VALUES ($1, $2::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [name, JSON.stringify(value)],
  );
}

async function readVapid() {
  const stored = await getDoc<VapidDoc | null>("vapid_keys", null);
  if (stored?.publicKey && stored?.privateKey) return stored;
  const generated = webpush.generateVAPIDKeys();
  const next = { publicKey: generated.publicKey, privateKey: generated.privateKey };
  await setDoc("vapid_keys", next);
  return next;
}

async function readyPush() {
  const keys = await readVapid();
  webpush.setVapidDetails("mailto:modclub@app.local", keys.publicKey, keys.privateKey);
  return keys;
}

export async function vapidPublicKey() {
  return (await readyPush()).publicKey;
}

async function readSubs() {
  const raw = await getDoc<PushSub[]>("push_subs", []);
  return Array.isArray(raw) ? raw.filter((item) => item?.endpoint && item.keys?.p256dh && item.keys?.auth) : [];
}

export async function savePushSub(input: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  username: string;
  deviceId: string;
  chatMuted?: boolean;
}) {
  const endpoint = String(input.endpoint || "").slice(0, 512);
  if (!endpoint || !input.keys?.p256dh || !input.keys?.auth) throw new Error("sub");
  const subs = await readSubs();
  const next: PushSub = {
    endpoint,
    keys: { p256dh: String(input.keys.p256dh), auth: String(input.keys.auth) },
    username: String(input.username || "").slice(0, 80),
    deviceId: String(input.deviceId || "").slice(0, 40),
    chatMuted: Boolean(input.chatMuted),
    at: Date.now(),
  };
  const list = [next, ...subs.filter((item) => item.endpoint !== endpoint)].slice(0, 2500);
  await setDoc("push_subs", list);
}

export async function dropPushSub(endpoint: string) {
  const subs = await readSubs();
  await setDoc("push_subs", subs.filter((item) => item.endpoint !== endpoint));
}

export async function dispatchClubPush(event: {
  type: string;
  title: string;
  body: string;
  sender?: string;
  from?: string;
  id?: string;
}) {
  const keys = await readyPush();
  webpush.setVapidDetails("mailto:modclub@app.local", keys.publicKey, keys.privateKey);
  const subs = await readSubs();
  if (!subs.length) return;
  const payload = JSON.stringify({
    title: event.title,
    body: event.body,
    tag: event.type === "chat" ? `chat-${event.id || Date.now()}` : `${event.type}-${event.id || Date.now()}`,
    url: event.type === "chat" || event.type === "guess" ? "/?chat=1" : "/",
    type: event.type,
  });
  const stale: string[] = [];
  await Promise.all(subs.map(async (sub) => {
    if (event.from && sub.username && sub.username.toLowerCase() === event.from.toLowerCase()) return;
    if (event.sender && sub.deviceId && sub.deviceId === event.sender) return;
    if (event.type === "chat" && sub.chatMuted) return;
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys },
        payload,
        { TTL: 120, urgency: event.type === "admin" || event.type === "giveaway" || event.type === "winner" ? "high" : "normal" },
      );
    } catch (err) {
      const status = Number((err as { statusCode?: number }).statusCode || 0);
      if (status === 404 || status === 410) stale.push(sub.endpoint);
    }
  }));
  if (stale.length) {
    await setDoc("push_subs", (await readSubs()).filter((item) => !stale.includes(item.endpoint)));
  }
}
