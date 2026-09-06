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
