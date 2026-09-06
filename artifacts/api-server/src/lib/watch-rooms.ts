import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { query } from "./pg";

const SEATS = 8;
const MAX_ROOMS = 24;
const STALE_MS = 180_000;
const MAX_SIGNALS = 200;
const EMOJI_MS = 3_000;
const EMOJI_IDS = new Set(["kiss-r", "kiss-l", "laugh", "cry", "angry"]);

export type RoomMember = {
  username: string;
  nick: string;
  photo?: string;
  seat: number;
  muted: boolean;
  micOn: boolean;
  speaking: boolean;
  lastSeen: number;
  emoji?: string;
  emojiAt?: number;
};

export type RoomChat = {
  id: string;
  username: string;
  nick: string;
  text: string;
  at: number;
};

export type RoomSignal = {
  id: string;
  from: string;
  to: string;
  type: "offer" | "answer" | "ice";
  payload: unknown;
  at: number;
};

export type WatchRoom = {
  id: string;
  title: string;
  cover: string;
  password?: string;
  owner: string;
  ownerNick: string;
  creator: string;
  videoId: string;
  videoTitle: string;
  playing: boolean;
  position: number;
  updatedAt: number;
  mediaRev: number;
  members: RoomMember[];
  hosts: string[];
  chats: RoomChat[];
  banned: string[];
  signals: RoomSignal[];
  createdAt: number;
  cpOn?: boolean;
};

export type PublicRoomCard = {
  id: string;
  title: string;
  cover: string;
  ownerNick: string;
  owner: string;
  creator: string;
  locked: boolean;
  watching: number;
  videoTitle: string;
};

export type PublicRoom = {
  id: string;
  title: string;
  cover: string;
  owner: string;
  ownerNick: string;
  creator: string;
  locked: boolean;
  videoId: string;
  videoTitle: string;
  playing: boolean;
  position: number;
  updatedAt: number;
  mediaRev: number;
  serverNow: number;
  members: RoomMember[];
  hosts: string[];
  chats: RoomChat[];
  cpOn?: boolean;
  you: { username: string; owner: boolean; host: boolean; muted: boolean; micOn: boolean; seat: number };
};

type RoomIndex = {
  id: string;
  title: string;
  cover: string;
  owner: string;
  ownerNick: string;
  creator: string;
  locked: boolean;
  watching: number;
  videoTitle: string;
  createdAt: number;
};

function roomKey(id: string) {
  return `watch_room:${id}`;
}

async function getDoc<T>(key: string, fallback: T): Promise<T> {
  const result = await query<{ value: T }>("SELECT value FROM club_docs WHERE key = $1", [key]);
  return result.rows[0]?.value ?? fallback;
}

async function setDoc(key: string, value: unknown) {
  await query(
    `INSERT INTO club_docs (key, value, updated_at) VALUES ($1, $2::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(value)],
  );
}

function hashPassword(password: string) {
  const salt = randomBytes(8).toString("hex");
  const digest = createHash("sha256").update(`${salt}:${password}`).digest("hex");
  return `${salt}$${digest}`;
}

function checkPassword(stored: string, password: string) {
  const [salt, digest] = stored.split("$");
  if (!salt || !digest) return false;
  const next = createHash("sha256").update(`${salt}:${password}`).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(digest, "hex"), Buffer.from(next, "hex"));
  } catch {
    return false;
  }
}

function prune(room: WatchRoom, now = Date.now()): WatchRoom {
  const creator = room.creator || room.owner;
  const members = room.members.filter((member) => (
    now - member.lastSeen < STALE_MS || member.username === creator
  ));
  const owner = creator;
  const ownerNick = members.find((member) => member.username === owner)?.nick || room.ownerNick;
  const signals = room.signals.filter((item) => now - item.at < 20_000).slice(-MAX_SIGNALS);
  return { ...room, members, owner, ownerNick, creator, hosts: room.hosts || [], chats: room.chats || [], signals };
}

function toIndex(room: WatchRoom): RoomIndex {
  return {
    id: room.id,
    title: room.title,
    cover: room.cover,
    owner: room.owner,
    ownerNick: room.ownerNick,
    creator: room.creator || room.owner,
    locked: Boolean(room.password),
    watching: room.members.length,
    videoTitle: room.videoTitle,
    createdAt: room.createdAt,
  };
}

async function writeRoom(room: WatchRoom) {
  await setDoc(roomKey(room.id), room);
  const index = (await getDoc<RoomIndex[]>("rooms_index", [])).filter((item) => item.id !== room.id);
  index.unshift(toIndex(room));
  await setDoc("rooms_index", index.slice(0, MAX_ROOMS));
}

async function dropRoom(id: string) {
  await setDoc(roomKey(id), null);
  const index = (await getDoc<RoomIndex[]>("rooms_index", [])).filter((item) => item.id !== id);
  await setDoc("rooms_index", index);
}

export async function readRoom(id: string) {
  const room = await getDoc<WatchRoom | null>(roomKey(id), null);
  return room && room.id ? room : null;
}

export function publicCard(room: RoomIndex): PublicRoomCard {
  return {
    id: room.id,
    title: room.title,
    cover: room.cover,
    ownerNick: room.ownerNick,
    owner: room.owner,
    creator: room.creator || room.owner,
    locked: room.locked,
    watching: room.watching,
    videoTitle: room.videoTitle,
  };
}

export function publicRoom(room: WatchRoom, username: string): PublicRoom {
  const you = room.members.find((member) => member.username === username);
  const now = Date.now();
  return {
    id: room.id,
    title: room.title,
    cover: room.cover,
    owner: room.owner,
    ownerNick: room.ownerNick,
    creator: room.creator || room.owner,
    locked: Boolean(room.password),
    videoId: room.videoId,
    videoTitle: room.videoTitle,
    playing: room.playing,
    position: room.position,
    updatedAt: room.updatedAt,
    mediaRev: room.mediaRev || 0,
    serverNow: now,
    members: room.members.map((member) => {
      const fresh = Boolean(member.emoji && member.emojiAt && now - member.emojiAt < EMOJI_MS + 400);
      return {
        ...member,
        speaking: Boolean(member.speaking),
        micOn: Boolean(member.micOn),
        emoji: fresh ? member.emoji : undefined,
        emojiAt: fresh ? member.emojiAt : undefined,
      };
    }),
    hosts: room.hosts || [],
    chats: room.chats || [],
    cpOn: Boolean(room.cpOn),
    you: {
      username,
      owner: room.owner === username,
      host: isHost(room, username),
      muted: Boolean(you?.muted),
      micOn: Boolean(you?.micOn),
      seat: you?.seat ?? -1,
    },
  };
}

export async function listRooms() {
  const now = Date.now();
  const index = await getDoc<RoomIndex[]>("rooms_index", []);
  const live: RoomIndex[] = [];
  for (const item of index) {
    const raw = await readRoom(item.id);
    if (!raw) continue;
    const room = prune(raw, now);
    if (room.members.length !== raw.members.length || room.owner !== raw.owner) await writeRoom(room);
    live.push(toIndex(room));
  }
  await setDoc("rooms_index", live.slice(0, MAX_ROOMS));
  return live.map(publicCard);
}

export async function createRoom(input: {
  username: string;
  nick: string;
  photo?: string;
  title: string;
  cover: string;
  password?: string;
}) {
  const title = input.title.trim().slice(0, 48);
  if (!title) throw new Error("title");
  const index = await getDoc<RoomIndex[]>("rooms_index", []);
  if (index.length >= MAX_ROOMS) throw new Error("full");
  for (const item of index) {
    const raw = await readRoom(item.id);
    if (!raw) continue;
    const live = prune(raw);
    if ((live.creator || live.owner) === input.username) throw new Error("owned");
  }
  const now = Date.now();
  const room: WatchRoom = {
    id: randomBytes(6).toString("hex"),
    title,
    cover: String(input.cover || "").slice(0, 180_000),
    password: input.password?.trim() ? hashPassword(input.password.trim()) : undefined,
    owner: input.username,
    ownerNick: input.nick,
    creator: input.username,
    videoId: "",
    videoTitle: "",
    playing: false,
    position: 0,
    updatedAt: now,
    mediaRev: 0,
    members: [{
      username: input.username,
      nick: input.nick,
      photo: input.photo,
      seat: 0,
      muted: false,
      micOn: false,
      speaking: false,
      lastSeen: now,
    }],
    hosts: [],
    chats: [],
    banned: [],
    signals: [],
    createdAt: now,
    cpOn: false,
  };
  await writeRoom(room);
  return room;
}

export async function joinRoom(input: {
  id: string;
  username: string;
  nick: string;
  photo?: string;
  password?: string;
}) {
  const raw = await readRoom(input.id);
  if (!raw) throw new Error("missing");
  const room = prune(raw);
  if (room.banned.includes(input.username)) throw new Error("banned");
  if (room.password && !checkPassword(room.password, input.password || "")) throw new Error("password");
  const existing = room.members.find((member) => member.username === input.username);
  if (existing) {
    existing.nick = input.nick;
    existing.photo = input.photo;
    existing.lastSeen = Date.now();
    await writeRoom(room);
    return room;
  }
  const taken = new Set(room.members.map((member) => member.seat));
  const seat = Array.from({ length: SEATS }, (_, index) => index).find((index) => !taken.has(index));
  if (seat === undefined) throw new Error("full");
  room.members.push({
    username: input.username,
    nick: input.nick,
    photo: input.photo,
    seat,
    muted: false,
    micOn: false,
    speaking: false,
    lastSeen: Date.now(),
  });
  await writeRoom(room);
  return room;
}

export async function pingRoom(id: string, username: string, patch?: { micOn?: boolean; speaking?: boolean; cpOn?: boolean; emoji?: string }) {
  const raw = await readRoom(id);
  if (!raw) throw new Error("missing");
  const room = prune(raw);
  const member = room.members.find((item) => item.username === username);
  if (!member) throw new Error("member");
  const now = Date.now();
  member.lastSeen = now;
  if (typeof patch?.emoji === "string" && EMOJI_IDS.has(patch.emoji)) {
    member.emoji = patch.emoji;
    member.emojiAt = now;
  }
  for (const item of room.members) {
    if (item.emojiAt && now - item.emojiAt > EMOJI_MS + 2_000) {
      item.emoji = undefined;
      item.emojiAt = undefined;
    }
  }
  if (typeof patch?.cpOn === "boolean") room.cpOn = patch.cpOn;
  if (typeof patch?.micOn === "boolean" && !member.muted) member.micOn = patch.micOn;
  if (typeof patch?.speaking === "boolean") member.speaking = patch.speaking && member.micOn && !member.muted;
  if (member.muted) {
    member.micOn = false;
    member.speaking = false;
  }
  if (!member.micOn) member.speaking = false;
  await writeRoom(room);
  return room;
}

export async function claimSeat(id: string, username: string, seat: number) {
  if (!Number.isInteger(seat) || seat < 0 || seat >= SEATS) throw new Error("seat");
  const raw = await readRoom(id);
  if (!raw) throw new Error("missing");
  const room = prune(raw);
  const me = room.members.find((item) => item.username === username);
  if (!me) throw new Error("member");
  if (room.members.some((item) => item.seat === seat && item.username !== username)) throw new Error("taken");
  me.seat = seat;
  me.lastSeen = Date.now();
  await writeRoom(room);
  return room;
}

export async function deleteRoom(id: string, username: string) {
  const raw = await readRoom(id);
  if (!raw) throw new Error("missing");
  const room = prune(raw);
  const creator = room.creator || room.owner;
  if (username !== creator && username !== room.owner) throw new Error("owner");
  await dropRoom(id);
}

export async function leaveRoom(id: string, username: string) {
  const raw = await readRoom(id);
  if (!raw) return null;
  const room = prune(raw);
  room.members = room.members.filter((member) => member.username !== username);
  room.signals = room.signals.filter((item) => item.from !== username && item.to !== username);
  room.owner = room.creator || room.owner;
  await writeRoom(room);
  return room;
}

export function isHost(room: WatchRoom, username: string) {
  return room.owner === username || (room.hosts || []).includes(username);
}

export function canManage(room: WatchRoom, username: string, role?: string) {
  return isHost(room, username) || role === "ADMIN" || role === "MODERATOR";
}

export async function postChat(id: string, username: string, nick: string, text: string) {
  const raw = await readRoom(id);
  if (!raw) throw new Error("missing");
  const room = prune(raw);
  if (!room.members.some((member) => member.username === username)) throw new Error("member");
  const clean = text.trim().slice(0, 240);
  if (!clean) throw new Error("text");
  room.chats = [...(room.chats || []), {
    id: randomBytes(4).toString("hex"),
    username,
    nick,
    text: clean,
    at: Date.now(),
  }].slice(-80);
  await writeRoom(room);
  return room;
}

export async function clearChat(id: string, username: string, role?: string) {
  const raw = await readRoom(id);
  if (!raw) throw new Error("missing");
  const room = prune(raw);
  if (!canManage(room, username, role)) throw new Error("owner");
  room.chats = [];
  await writeRoom(room);
  return room;
}

export async function setHost(id: string, username: string, target: string, grant: boolean) {
  const raw = await readRoom(id);
  if (!raw) throw new Error("missing");
  const room = prune(raw);
  if (room.owner !== username) throw new Error("owner");
  if (target === room.owner) throw new Error("owner");
  if (!room.members.some((member) => member.username === target)) throw new Error("member");
  const hosts = new Set(room.hosts || []);
  if (grant) hosts.add(target);
  else hosts.delete(target);
  room.hosts = [...hosts];
  await writeRoom(room);
  return room;
}

export async function setMedia(id: string, username: string, role: string | undefined, input: {
  videoId?: string;
  videoTitle?: string;
  playing?: boolean;
  position?: number;
}) {
  const raw = await readRoom(id);
  if (!raw) throw new Error("missing");
  const room = prune(raw);
  if (!canManage(room, username, role)) throw new Error("owner");
  if (input.videoId !== undefined) {
    if (input.videoId && !/^[a-zA-Z0-9_-]{11}$/.test(input.videoId)) throw new Error("video");
    room.videoId = input.videoId;
    room.videoTitle = String(input.videoTitle || "").slice(0, 120);
    room.position = typeof input.position === "number" ? Math.max(0, input.position) : 0;
    room.playing = typeof input.playing === "boolean" ? input.playing : Boolean(input.videoId);
  } else {
    if (typeof input.playing === "boolean") room.playing = input.playing;
    if (typeof input.position === "number" && Number.isFinite(input.position)) {
      room.position = Math.max(0, input.position);
    }
  }
  room.updatedAt = Date.now();
  room.mediaRev = (room.mediaRev || 0) + 1;
  await writeRoom(room);
  return room;
}

export async function kickMember(id: string, username: string, role: string | undefined, target: string) {
  const raw = await readRoom(id);
  if (!raw) throw new Error("missing");
  const room = prune(raw);
  if (!canManage(room, username, role)) throw new Error("owner");
  if (target === room.owner) throw new Error("owner");
  room.members = room.members.filter((member) => member.username !== target);
  room.hosts = (room.hosts || []).filter((name) => name !== target);
  if (!room.banned.includes(target)) room.banned.push(target);
  room.signals = room.signals.filter((item) => item.from !== target && item.to !== target);
  await writeRoom(room);
  return room;
}

export async function muteMember(id: string, username: string, role: string | undefined, target: string, muted: boolean) {
  const raw = await readRoom(id);
  if (!raw) throw new Error("missing");
  const room = prune(raw);
  if (!canManage(room, username, role)) throw new Error("owner");
  const member = room.members.find((item) => item.username === target);
  if (!member) throw new Error("member");
  member.muted = muted;
  if (muted) member.micOn = false;
  await writeRoom(room);
  return room;
}

export async function pushSignal(id: string, from: string, input: { to: string; type: RoomSignal["type"]; payload: unknown }) {
  const raw = await readRoom(id);
  if (!raw) throw new Error("missing");
  const room = prune(raw);
  if (!room.members.some((member) => member.username === from)) throw new Error("member");
  if (!room.members.some((member) => member.username === input.to)) throw new Error("member");
  room.signals.push({
    id: randomBytes(5).toString("hex"),
    from,
    to: input.to,
    type: input.type,
    payload: input.payload,
    at: Date.now(),
  });
  room.signals = room.signals.slice(-MAX_SIGNALS);
  await writeRoom(room);
  return room;
}

export async function ackSignals(id: string, username: string, ids: string[]) {
  const raw = await readRoom(id);
  if (!raw) throw new Error("missing");
  const room = prune(raw);
  const drop = new Set(ids);
  room.signals = room.signals.filter((item) => !(item.to === username && drop.has(item.id)));
  await writeRoom(room);
  return room;
}

export function takeSignals(room: WatchRoom, username: string) {
  return room.signals.filter((item) => item.to === username);
}

export function parseYoutubeId(value: string) {
  const text = value.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(text)) return text;
  try {
    const url = new URL(text);
    if (url.hostname.includes("youtu.be")) return url.pathname.replace("/", "").slice(0, 11);
    const fromQuery = url.searchParams.get("v");
    if (fromQuery && /^[a-zA-Z0-9_-]{11}$/.test(fromQuery)) return fromQuery;
    const embed = url.pathname.match(/\/(?:embed|shorts)\/([a-zA-Z0-9_-]{11})/);
    if (embed) return embed[1];
  } catch {
    /* not a url */
  }
  return "";
}

function collectVideos(node: unknown, out: { id: string; title: string; thumb: string }[], seen = new Set<string>()) {
  if (!node || out.length >= 8) return;
  if (Array.isArray(node)) {
    for (const item of node) collectVideos(item, out, seen);
    return;
  }
  if (typeof node !== "object") return;
  const row = node as Record<string, unknown>;
  const video = (row.videoRenderer || row.compactVideoRenderer) as Record<string, unknown> | undefined;
  if (video?.videoId) {
    const id = String(video.videoId);
    if (/^[a-zA-Z0-9_-]{11}$/.test(id) && !seen.has(id)) {
      const titleNode = video.title as { runs?: { text?: string }[]; simpleText?: string } | undefined;
      const title = titleNode?.runs?.[0]?.text || titleNode?.simpleText || "YouTube";
      seen.add(id);
      out.push({ id, title: String(title).slice(0, 120), thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` });
    }
  }
  for (const value of Object.values(row)) collectVideos(value, out, seen);
}

async function searchInnertube(q: string) {
  const response = await fetch("https://www.youtube.com/youtubei/v1/search?prettyPrint=false", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "Mozilla/5.0",
    },
    body: JSON.stringify({
      context: { client: { clientName: "WEB", clientVersion: "2.20260326.01.00", hl: "tr", gl: "TR" } },
      query: q,
    }),
    signal: AbortSignal.timeout(7000),
  });
  if (!response.ok) return [];
  const items: { id: string; title: string; thumb: string }[] = [];
  collectVideos(await response.json(), items);
  return items;
}

async function searchPiped(q: string) {
  const hosts = ["https://pipedapi.kavin.rocks", "https://pipedapi.adminforge.de", "https://api.piped.private.coffee"];
  for (const host of hosts) {
    try {
      const response = await fetch(`${host}/search?q=${encodeURIComponent(q)}&filter=videos`, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) continue;
      const data = await response.json() as { items?: { url?: string; title?: string; thumbnail?: string }[] };
      const items = (data.items || [])
        .map((row) => {
          const id = parseYoutubeId(String(row.url || ""));
          return id ? { id, title: String(row.title || "YouTube").slice(0, 120), thumb: row.thumbnail || `https://i.ytimg.com/vi/${id}/hqdefault.jpg` } : null;
        })
        .filter((row): row is { id: string; title: string; thumb: string } => Boolean(row))
        .slice(0, 8);
      if (items.length) return items;
    } catch {
      /* next */
    }
  }
  return [];
}

export async function searchYoutube(queryText: string) {
  const q = queryText.trim().slice(0, 80);
  if (!q) return [];
  const direct = parseYoutubeId(q);
  if (direct) {
    try {
      const response = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${direct}&format=json`, {
        signal: AbortSignal.timeout(4000),
      });
      if (response.ok) {
        const data = await response.json() as { title?: string; thumbnail_url?: string };
        return [{ id: direct, title: data.title || "YouTube", thumb: data.thumbnail_url || `https://i.ytimg.com/vi/${direct}/hqdefault.jpg` }];
      }
    } catch {
      /* fall through */
    }
    return [{ id: direct, title: "YouTube", thumb: `https://i.ytimg.com/vi/${direct}/hqdefault.jpg` }];
  }

  try {
    const inner = await searchInnertube(q);
    if (inner.length) return inner;
  } catch {
    /* next */
  }
  try {
    const piped = await searchPiped(q);
    if (piped.length) return piped;
  } catch {
    /* next */
  }
  return [];
}
