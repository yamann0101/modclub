import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { query } from "./pg";
import { canHideRooms, canSeeHiddenRooms, canLaunchFireworks, readHideGrants } from "./room-hide";
import { listAccounts } from "./club-data";

const SEATS = 8;
const MAX_ROOMS = 24;
const STALE_MS = 900_000;
const MAX_SIGNALS = 200;
const EMOJI_MS = 3_000;
const EMOJI_IDS = new Set(["kiss-r", "kiss-l", "laugh", "cry", "angry"]);
const FIREWORK_MS = 5_000;
const FIREWORK_MAX_MS = 9_999_000;
const FIRE_KINDS = new Set(["burst", "roses", "fire", "hearts", "rain"]);
const FIRE_ANIMS = new Set(["pop", "glow", "bounce", "wave", "neon", "pulse"]);
const FIRE_TEXT_MAX = 400;
const KISS_ASK_MS = 25_000;
const KISS_LIVE_MS = 5_000;

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
  title?: string;
  frame?: string;
  role?: string;
  glow?: boolean;
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
  driver?: string;
  members: RoomMember[];
  hosts: string[];
  chats: RoomChat[];
  banned: string[];
  signals: RoomSignal[];
  createdAt: number;
  cpOn?: boolean;
  hidden?: boolean;
  lastJoin?: { nick: string; username: string; at: number };
  firework?: { text: string; kind: string; ms: number; at: number; color?: string; anim?: string; emojis?: string };
  kiss?: {
    from: string;
    to: string;
    fromNick: string;
    toNick: string;
    fromPhoto?: string;
    toPhoto?: string;
    status: "ask" | "live";
    at: number;
  };
  left?: string[];
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
  hidden?: boolean;
  skin?: "king" | "vip";
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
  driver?: string;
  serverNow: number;
  members: RoomMember[];
  hosts: string[];
  chats: RoomChat[];
  cpOn?: boolean;
  hidden?: boolean;
  lastJoin?: { nick: string; username: string; at: number };
  firework?: { text: string; kind: string; ms: number; at: number; color?: string; anim?: string; emojis?: string };
  kiss?: {
    from: string;
    to: string;
    fromNick: string;
    toNick: string;
    fromPhoto?: string;
    toPhoto?: string;
    status: "ask" | "live";
    at: number;
  };
  you: { username: string; owner: boolean; host: boolean; drive: boolean; muted: boolean; micOn: boolean; seat: number };
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
  hidden?: boolean;
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
  const blocked = new Set(room.left || []);
  const members = room.members.filter((member) => (
    !blocked.has(member.username) && now - member.lastSeen < STALE_MS
  ));
  const owner = creator;
  const ownerNick = members.find((member) => member.username === owner)?.nick || room.ownerNick;
  const signals = room.signals.filter((item) => now - item.at < 20_000).slice(-MAX_SIGNALS);
  return { ...room, members, owner, ownerNick, creator, hosts: room.hosts || [], chats: room.chats || [], signals, left: room.left || [] };
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
    hidden: Boolean(room.hidden),
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

export function publicCard(room: RoomIndex & { skin?: "king" | "vip" }): PublicRoomCard {
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
    hidden: Boolean(room.hidden),
    skin: room.skin,
  };
}

export function publicRoom(room: WatchRoom, username: string): PublicRoom {
  const you = room.members.find((member) => member.username === username);
  const now = Date.now();
  const fireMs = Math.min(FIREWORK_MAX_MS, Math.max(1_000, room.firework?.ms || FIREWORK_MS));
  const kiss = room.kiss;
  const kissLive = Boolean(
    kiss && (
      (kiss.status === "ask" && now - kiss.at < KISS_ASK_MS)
      || (kiss.status === "live" && now - kiss.at < KISS_LIVE_MS + 400)
    ),
  );
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
    driver: room.driver || room.owner,
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
    hidden: Boolean(room.hidden),
    lastJoin: room.lastJoin && now - room.lastJoin.at < 8_000 ? room.lastJoin : undefined,
    firework: room.firework && now - room.firework.at < fireMs + 1_200 ? { ...room.firework, ms: fireMs } : undefined,
    kiss: kissLive ? kiss : undefined,
    you: {
      username,
      owner: room.owner === username,
      host: isHost(room, username),
      drive: (room.driver || room.owner) === username,
      muted: Boolean(you?.muted),
      micOn: Boolean(you?.micOn),
      seat: you?.seat ?? -1,
    },
  };
}

export async function listRooms(viewer: { username: string; role?: string }) {
  const now = Date.now();
  const index = await getDoc<RoomIndex[]>("rooms_index", []);
  const live: RoomIndex[] = [];
  const cards: PublicRoomCard[] = [];
  const canSeeHidden = await canSeeHiddenRooms(viewer.username, viewer.role);
  const accounts = await listAccounts();
  const hideGrants = await readHideGrants();
  const roleOf = new Map(accounts.map((item) => [item.username.toLowerCase(), item.role]));
  const skinOf = (room: WatchRoom): "king" | "vip" | undefined => {
    const ownerRole = roleOf.get(room.owner.toLowerCase()) || roleOf.get((room.creator || room.owner).toLowerCase());
    if (ownerRole === "ADMIN") return "king";
    const until = Math.max(
      hideGrants[room.owner.toLowerCase()] || 0,
      hideGrants[(room.creator || room.owner).toLowerCase()] || 0,
    );
    if (until > now) return "vip";
    return undefined;
  };
  for (const item of index) {
    const raw = await readRoom(item.id);
    if (!raw) continue;
    const room = prune(raw, now);
    if (room.members.length !== raw.members.length || room.owner !== raw.owner) await writeRoom(room);
    live.push(toIndex(room));
    const mine = viewer.username === room.owner || viewer.username === (room.creator || room.owner);
    if (room.hidden && !canSeeHidden && !mine) continue;
    cards.push({ ...publicCard(toIndex(room)), skin: skinOf(room) });
  }
  await setDoc("rooms_index", live.slice(0, MAX_ROOMS));
  cards.sort((a, b) => Number(b.skin === "king") - Number(a.skin === "king"));
  return cards;
}

export async function createRoom(input: {
  username: string;
  nick: string;
  photo?: string;
  title: string;
  cover: string;
  password?: string;
  role?: string;
  memberTitle?: string;
  memberFrame?: string;
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
    driver: input.username,
    members: [{
      username: input.username,
      nick: input.nick,
      photo: input.photo,
      seat: 0,
      muted: false,
      micOn: false,
      speaking: false,
      lastSeen: now,
      title: input.memberTitle,
      frame: input.memberFrame,
      role: input.role,
    }],
    hosts: [],
    chats: [],
    banned: [],
    signals: [],
    createdAt: now,
    cpOn: false,
    hidden: false,
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
  role?: string;
  title?: string;
  frame?: string;
}) {
  const raw = await readRoom(input.id);
  if (!raw) throw new Error("missing");
  raw.left = (raw.left || []).filter((name) => name !== input.username);
  const room = prune(raw);
  room.left = (room.left || []).filter((name) => name !== input.username);
  if (room.banned.includes(input.username)) throw new Error("banned");
  const owns = input.username === room.owner || input.username === (room.creator || room.owner);
  const adminBypass = input.role === "ADMIN";
  if (room.password && !owns && !adminBypass && !checkPassword(room.password, input.password || "")) throw new Error("password");
  const existing = room.members.find((member) => member.username === input.username);
  if (existing) {
    existing.nick = input.nick;
    existing.photo = input.photo;
    existing.lastSeen = Date.now();
    existing.micOn = false;
    existing.speaking = false;
    existing.title = input.title;
    existing.frame = input.frame;
    existing.role = input.role;
    await writeRoom(room);
    return room;
  }
  const taken = new Set(room.members.map((member) => member.seat));
  const seat = Array.from({ length: SEATS }, (_, index) => index).find((index) => !taken.has(index));
  if (seat === undefined) throw new Error("full");
  const now = Date.now();
  room.members.push({
    username: input.username,
    nick: input.nick,
    photo: input.photo,
    seat,
    muted: false,
    micOn: false,
    speaking: false,
    lastSeen: now,
    title: input.title,
    frame: input.frame,
    role: input.role,
  });
  room.lastJoin = { nick: input.nick, username: input.username, at: now };
  await writeRoom(room);
  return room;
}

export type FireworkPatch = string | false | { text?: string; kind?: string; ms?: number; color?: string; anim?: string; emojis?: string };

function cleanFireColor(value?: string) {
  const text = String(value || "").trim().toLowerCase();
  if (text === "rainbow") return "rainbow";
  return /^#[0-9a-f]{6}$/.test(text) ? text : "#fff7d6";
}

function cleanFireEmojis(value?: string) {
  const raw = String(value || "").slice(0, 160);
  try {
    return [...new Intl.Segmenter("tr", { granularity: "grapheme" }).segment(raw)]
      .map((item) => item.segment)
      .filter((item) => item.trim() && !/^[A-Za-z0-9.,!?;:]+$/.test(item))
      .slice(0, 24)
      .join("");
  } catch {
    return raw.replace(/[A-Za-z0-9\s]/g, "").slice(0, 72);
  }
}

function fireworkFrom(patch: FireworkPatch, now: number) {
  if (patch === false) return undefined;
  const payload = typeof patch === "string" ? { text: patch, kind: "burst", ms: FIREWORK_MS } : patch;
  const kind = FIRE_KINDS.has(String(payload.kind || "")) ? String(payload.kind) : "burst";
  const anim = FIRE_ANIMS.has(String(payload.anim || "")) ? String(payload.anim) : "pop";
  const ms = Math.min(FIREWORK_MAX_MS, Math.max(1_000, Number(payload.ms) || FIREWORK_MS));
  return {
    text: String(payload.text || "").trim().slice(0, FIRE_TEXT_MAX),
    kind,
    ms,
    at: now,
    color: cleanFireColor(payload.color),
    anim,
    emojis: cleanFireEmojis(payload.emojis),
  };
}

export async function pingRoom(id: string, username: string, patch?: { micOn?: boolean; speaking?: boolean; cpOn?: boolean; emoji?: string; firework?: FireworkPatch; kiss?: string | false; kissAnswer?: boolean; title?: string; frame?: string; role?: string }, role?: string) {
  const latest = await readRoom(id);
  if (!latest) throw new Error("missing");
  if ((latest.left || []).includes(username)) throw new Error("member");
  const now = Date.now();
  const room = prune(latest, now);
  const member = room.members.find((item) => item.username === username);
  if (!member) throw new Error("member");
  member.lastSeen = now;
  if (patch?.title !== undefined) member.title = patch.title;
  if (patch?.frame !== undefined) member.frame = patch.frame;
  if (patch?.role !== undefined) member.role = patch.role;
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
  if (typeof patch?.cpOn === "boolean" && (username === room.owner || username === (room.creator || room.owner))) {
    room.cpOn = patch.cpOn;
  }
  if (patch?.firework !== undefined) {
    if (!(isHost(room, username) || await canLaunchFireworks(username, role))) throw new Error("perk");
    room.firework = fireworkFrom(patch.firework, now);
  }
  if (room.kiss) {
    const age = now - room.kiss.at;
    if ((room.kiss.status === "ask" && age > KISS_ASK_MS) || (room.kiss.status === "live" && age > KISS_LIVE_MS + 800)) {
      room.kiss = undefined;
    }
  }
  if (patch?.kiss === false) {
    if (room.kiss && (room.kiss.from === username || room.kiss.to === username)) room.kiss = undefined;
  } else if (typeof patch?.kiss === "string") {
    const target = room.members.find((item) => item.username === patch.kiss);
    if (!target) throw new Error("member");
    if (target.username === username) throw new Error("self");
    room.kiss = {
      from: username,
      to: target.username,
      fromNick: member.nick,
      toNick: target.nick,
      fromPhoto: member.photo,
      toPhoto: target.photo,
      status: "ask",
      at: now,
    };
  }
  if (typeof patch?.kissAnswer === "boolean" && room.kiss?.status === "ask" && room.kiss.to === username) {
    if (patch.kissAnswer) {
      room.kiss = { ...room.kiss, status: "live", at: now };
    } else {
      room.kiss = undefined;
    }
  }
  if (typeof patch?.micOn === "boolean" && !member.muted) member.micOn = patch.micOn;
  if (typeof patch?.speaking === "boolean") member.speaking = patch.speaking && member.micOn && !member.muted;
  if (member.muted) {
    member.micOn = false;
    member.speaking = false;
  }
  if (!member.micOn) member.speaking = false;
  const confirm = await readRoom(id);
  if (!confirm || (confirm.left || []).includes(username)) throw new Error("member");
  if (!confirm.members.some((item) => item.username === username)) throw new Error("member");
  room.left = confirm.left || [];
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
  room.left = [...new Set([...(room.left || []), username])];
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

export function canSteerCinema(room: WatchRoom, username: string, role?: string) {
  return room.owner === username || (room.driver || room.owner) === username || role === "ADMIN";
}

export async function patchRoomSettings(input: {
  id: string;
  username: string;
  role?: string;
  title?: string;
  cover?: string;
  password?: string | null;
}) {
  const raw = await readRoom(input.id);
  if (!raw) throw new Error("missing");
  const room = prune(raw);
  const owns = input.username === room.owner || input.username === (room.creator || room.owner) || input.role === "ADMIN";
  if (!owns) throw new Error("owner");
  if (typeof input.title === "string") {
    const title = input.title.trim().slice(0, 48);
    if (!title) throw new Error("title");
    room.title = title;
  }
  if (typeof input.cover === "string") {
    room.cover = input.cover.slice(0, 180_000);
  }
  if (input.password === null || input.password === "") {
    room.password = undefined;
  } else if (typeof input.password === "string" && input.password.trim()) {
    room.password = hashPassword(input.password.trim());
  }
  await writeRoom(room);
  return room;
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
  if (!grant && (room.driver || room.owner) === target) room.driver = room.owner;
  await writeRoom(room);
  return room;
}

export async function setMedia(id: string, username: string, role: string | undefined, input: {
  videoId?: string;
  videoTitle?: string;
  playing?: boolean;
  position?: number;
  claim?: boolean;
}) {
  const raw = await readRoom(id);
  if (!raw) throw new Error("missing");
  const room = prune(raw);
  const picking = input.videoId !== undefined;
  const takingWheel = Boolean(input.claim) || picking;
  if (picking) {
    if (!canManage(room, username, role) && !canSteerCinema(room, username, role)) throw new Error("owner");
  } else if (!canSteerCinema(room, username, role)) {
    throw new Error("owner");
  }
  const currentDriver = room.driver || room.owner;
  if (!takingWheel && currentDriver !== username) return room;
  const now = Date.now();
  const expected = room.playing
    ? room.position + Math.max(0, (now - room.updatedAt) / 1000)
    : room.position;
  const nextPos = typeof input.position === "number" && Number.isFinite(input.position)
    ? Math.max(0, input.position)
    : room.position;
  const seekJump = Math.abs(nextPos - expected) > 2.4;
  const playingChanged = typeof input.playing === "boolean" && input.playing !== room.playing;
  if (picking) {
    if (input.videoId && !/^[a-zA-Z0-9_-]{11}$/.test(input.videoId)) throw new Error("video");
    room.videoId = input.videoId || "";
    room.videoTitle = String(input.videoTitle || "").slice(0, 120);
    room.position = typeof input.position === "number" ? Math.max(0, input.position) : 0;
    room.playing = typeof input.playing === "boolean" ? input.playing : Boolean(input.videoId);
  } else {
    if (typeof input.playing === "boolean") room.playing = input.playing;
    if (typeof input.position === "number" && Number.isFinite(input.position)) {
      room.position = nextPos;
    }
  }
  if (takingWheel) room.driver = username;
  room.updatedAt = now;
  if (picking || playingChanged || (takingWheel && seekJump)) room.mediaRev = (room.mediaRev || 0) + 1;
  await writeRoom(room);
  return room;
}

export async function kickMember(id: string, username: string, role: string | undefined, target: string) {
  const raw = await readRoom(id);
  if (!raw) throw new Error("missing");
  const room = prune(raw);
  if (!canManage(room, username, role)) throw new Error("owner");
  if (target === room.owner) throw new Error("owner");
  if (isHost(room, target) && room.owner !== username) throw new Error("owner");
  room.members = room.members.filter((member) => member.username !== target);
  room.hosts = (room.hosts || []).filter((name) => name !== target);
  if ((room.driver || room.owner) === target) room.driver = room.owner;
  if (!room.banned.includes(target)) room.banned.push(target);
  room.signals = room.signals.filter((item) => item.from !== target && item.to !== target);
  await writeRoom(room);
  return room;
}

export async function setHidden(id: string, username: string, role: string | undefined, hidden: boolean) {
  const raw = await readRoom(id);
  if (!raw) throw new Error("missing");
  const room = prune(raw);
  const owns = username === room.owner || username === (room.creator || room.owner);
  if (role !== "ADMIN" && !owns) throw new Error("owner");
  if (!(await canHideRooms(username, role))) throw new Error("perk");
  room.hidden = Boolean(hidden);
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
  if (!node || out.length >= 24) return;
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
  const lockup = row.lockupViewModel as { contentId?: string; metadata?: { lockupMetadataViewModel?: { title?: { content?: string } } } } | undefined;
  if (lockup?.contentId && /^[a-zA-Z0-9_-]{11}$/.test(lockup.contentId) && !seen.has(lockup.contentId)) {
    const title = lockup.metadata?.lockupMetadataViewModel?.title?.content || "YouTube";
    seen.add(lockup.contentId);
    out.push({ id: lockup.contentId, title: String(title).slice(0, 120), thumb: `https://i.ytimg.com/vi/${lockup.contentId}/hqdefault.jpg` });
  }
  for (const value of Object.values(row)) collectVideos(value, out, seen);
}

function innertubeBody(extra: Record<string, unknown>, android = false) {
  return {
    context: {
      client: android
        ? { clientName: "ANDROID", clientVersion: "19.47.53", hl: "tr", gl: "TR" }
        : { clientName: "WEB", clientVersion: "2.20260326.01.00", hl: "tr", gl: "TR" },
    },
    ...extra,
  };
}

async function innertubePost(path: string, extra: Record<string, unknown>, android = false) {
  const response = await fetch(`https://www.youtube.com/youtubei/v1/${path}?prettyPrint=false`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": android
        ? "com.google.android.youtube/19.47.53 (Linux; U; Android 14; TR) gzip"
        : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36",
      "x-youtube-client-name": android ? "3" : "1",
      "x-youtube-client-version": android ? "19.47.53" : "2.20260326.01.00",
    },
    body: JSON.stringify(innertubeBody(extra, android)),
    signal: AbortSignal.timeout(7000),
  });
  if (!response.ok) return [];
  const items: { id: string; title: string; thumb: string }[] = [];
  collectVideos(await response.json(), items);
  return items;
}

async function searchInnertube(q: string) {
  try {
    const android = await innertubePost("search", { query: q }, true);
    if (android.length) return android;
  } catch {
    /* web next */
  }
  return innertubePost("search", { query: q }, false);
}

export async function relatedYoutube(videoId: string) {
  const id = parseYoutubeId(videoId);
  if (!id) return [];
  try {
    const android = await innertubePost("next", { videoId: id }, true);
    const next = android.filter((item) => item.id !== id);
    if (next.length) return next.slice(0, 24);
  } catch {
    /* web next */
  }
  try {
    const web = await innertubePost("next", { videoId: id }, false);
    return web.filter((item) => item.id !== id).slice(0, 24);
  } catch {
    return [];
  }
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
        .slice(0, 24);
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

const PLAY_PIPED = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://pipedapi.leptons.xyz",
  "https://api.piped.private.coffee",
];

const PLAY_INVIDIOUS = [
  "https://inv.nadeko.net",
  "https://invidious.nerdvpn.de",
  "https://yewtu.be",
  "https://iv.ggtyler.dev",
  "https://invidious.materialio.us",
];

function pushUrl(bag: string[], url?: string) {
  const value = String(url || "").trim();
  if (value.startsWith("http") && !bag.includes(value)) bag.push(value);
}

async function innertubePlay(id: string) {
  const urls: string[] = [];
  let title = "";
  for (const android of [true, false]) {
    try {
      const response = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": android
            ? "com.google.android.youtube/19.47.53 (Linux; U; Android 14; TR) gzip"
            : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36",
          "x-youtube-client-name": android ? "3" : "1",
          "x-youtube-client-version": android ? "19.47.53" : "2.20260326.01.00",
        },
        body: JSON.stringify({
          ...innertubeBody({ videoId: id }, android),
          videoId: id,
          contentCheckOk: true,
          racyCheckOk: true,
        }),
        signal: AbortSignal.timeout(7000),
      });
      if (!response.ok) continue;
      const data = await response.json() as {
        videoDetails?: { title?: string };
        streamingData?: { formats?: { url?: string }[]; adaptiveFormats?: { url?: string }[] };
      };
      if (data.videoDetails?.title) title = String(data.videoDetails.title).slice(0, 120);
      for (const row of data.streamingData?.formats || []) pushUrl(urls, row.url);
      if (urls.length) break;
    } catch {
      /* next client */
    }
  }
  return { urls, title };
}

export async function resolveYoutubePlay(videoId: string) {
  const id = parseYoutubeId(videoId);
  if (!id) return { urls: [] as string[], title: "" };
  const urls: string[] = [];
  let title = "";

  try {
    const inner = await innertubePlay(id);
    if (inner.title) title = inner.title;
    for (const url of inner.urls) pushUrl(urls, url);
  } catch {
    /* next */
  }

  for (const host of PLAY_INVIDIOUS) {
    pushUrl(urls, `${host}/latest_version?id=${id}&itag=22`);
    pushUrl(urls, `${host}/latest_version?id=${id}&itag=18`);
  }

  for (const host of PLAY_PIPED) {
    try {
      const response = await fetch(`${host}/streams/${id}`, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) continue;
      const data = await response.json() as {
        title?: string;
        hls?: string;
        videoStreams?: { url?: string; videoOnly?: boolean; mimeType?: string; quality?: string }[];
      };
      if (data.title) title = String(data.title).slice(0, 120);
      pushUrl(urls, data.hls);
      const muxed = (data.videoStreams || []).filter((row) => !row.videoOnly && String(row.mimeType || "").includes("mp4"));
      muxed.sort((a, b) => (parseInt(b.quality || "0", 10) || 0) - (parseInt(a.quality || "0", 10) || 0));
      for (const row of muxed) pushUrl(urls, row.url);
      if (muxed.length) break;
    } catch {
      /* next instance */
    }
  }

  for (const host of PLAY_INVIDIOUS) {
    try {
      const response = await fetch(`${host}/api/v1/videos/${id}?hl=tr&region=TR`, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) continue;
      const data = await response.json() as {
        title?: string;
        formatStreams?: { url?: string }[];
        hlsUrl?: string;
      };
      if (data.title) title = String(data.title).slice(0, 120);
      pushUrl(urls, data.hlsUrl);
      for (const row of data.formatStreams || []) pushUrl(urls, row.url);
      if ((data.formatStreams || []).length) break;
    } catch {
      /* next instance */
    }
  }

  return { urls, title };
}
