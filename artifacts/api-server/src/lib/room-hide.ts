import { query } from "./pg";

const DOC = "room_hide_grants";

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

function nickKey(value: string) {
  return value.trim().toLowerCase();
}

export async function readHideGrants() {
  const raw = await getDoc<Record<string, number>>(DOC, {});
  const now = Date.now();
  const live: Record<string, number> = {};
  for (const [name, until] of Object.entries(raw || {})) {
    if (typeof until === "number" && until > now) live[nickKey(name)] = until;
  }
  return live;
}

export async function hideUntilOf(username: string) {
  const grants = await readHideGrants();
  return grants[nickKey(username)] || 0;
}

export async function canHideRooms(username: string, role?: string) {
  if (role === "ADMIN") return true;
  return (await hideUntilOf(username)) > Date.now();
}

export async function grantHideRooms(username: string, days: number) {
  const grants = await readHideGrants();
  const key = nickKey(username);
  if (!key) throw new Error("missing");
  if (days <= 0) delete grants[key];
  else grants[key] = Date.now() + days * 24 * 60 * 60 * 1000;
  await setDoc(DOC, grants);
  return grants;
}

const SEE_DOC = "room_see_grants";

export async function readSeeGrants() {
  const raw = await getDoc<Record<string, number>>(SEE_DOC, {});
  const now = Date.now();
  const live: Record<string, number> = {};
  for (const [name, until] of Object.entries(raw || {})) {
    if (typeof until === "number" && until > now) live[nickKey(name)] = until;
  }
  return live;
}

export async function seeUntilOf(username: string) {
  const grants = await readSeeGrants();
  return grants[nickKey(username)] || 0;
}

export async function canSeeHiddenRooms(username: string, role?: string) {
  if (role === "ADMIN") return true;
  return (await seeUntilOf(username)) > Date.now();
}

export async function grantSeeHidden(username: string, days: number) {
  const grants = await readSeeGrants();
  const key = nickKey(username);
  if (!key) throw new Error("missing");
  if (days <= 0) delete grants[key];
  else grants[key] = Date.now() + days * 24 * 60 * 60 * 1000;
  await setDoc(SEE_DOC, grants);
  return grants;
}

const FIRE_DOC = "room_fire_grants";

export async function readFireGrants() {
  const raw = await getDoc<Record<string, number>>(FIRE_DOC, {});
  const now = Date.now();
  const live: Record<string, number> = {};
  for (const [name, until] of Object.entries(raw || {})) {
    if (typeof until === "number" && until > now) live[nickKey(name)] = until;
  }
  return live;
}

export async function fireUntilOf(username: string) {
  const grants = await readFireGrants();
  return grants[nickKey(username)] || 0;
}

export async function canLaunchFireworks(username: string, role?: string) {
  if (role === "ADMIN") return true;
  return (await fireUntilOf(username)) > Date.now();
}

export async function grantFirework(username: string, days: number) {
  const grants = await readFireGrants();
  const key = nickKey(username);
  if (!key) throw new Error("missing");
  if (days <= 0) delete grants[key];
  else grants[key] = Date.now() + days * 24 * 60 * 60 * 1000;
  await setDoc(FIRE_DOC, grants);
  return grants;
}

const GLOW_DOC = "room_glow_grants";

export async function readGlowGrants() {
  const raw = await getDoc<Record<string, number>>(GLOW_DOC, {});
  const now = Date.now();
  const live: Record<string, number> = {};
  for (const [name, until] of Object.entries(raw || {})) {
    if (typeof until === "number" && until > now) live[nickKey(name)] = until;
  }
  return live;
}

export async function glowUntilOf(username: string) {
  const grants = await readGlowGrants();
  return grants[nickKey(username)] || 0;
}

export async function grantGlowName(username: string, days: number) {
  const grants = await readGlowGrants();
  const key = nickKey(username);
  if (!key) throw new Error("missing");
  if (days <= 0) delete grants[key];
  else grants[key] = Date.now() + days * 24 * 60 * 60 * 1000;
  await setDoc(GLOW_DOC, grants);
  return grants;
}

export function grantNickKey(value: string) {
  return nickKey(value);
}

export async function grantRoomPack(username: string, days: number) {
  await grantHideRooms(username, days);
  await grantSeeHidden(username, days);
  await grantFirework(username, days);
  await grantGlowName(username, days);
  return {
    hide: await hideUntilOf(username),
    see: await seeUntilOf(username),
    fire: await fireUntilOf(username),
    glow: await glowUntilOf(username),
  };
}
