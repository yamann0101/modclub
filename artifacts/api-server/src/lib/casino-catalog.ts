import { query } from "./pg";
import { normalizeCatalog, type CasinoGame } from "./pragmatic";

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

export async function readCasinoGames(): Promise<CasinoGame[]> {
  return normalizeCatalog(await getDoc<unknown>("casino_games", []));
}

export async function saveCasinoGames(input: unknown) {
  const games = normalizeCatalog(input);
  await setDoc("casino_games", games);
  return games;
}

export async function findCasinoGame(id: string) {
  return (await readCasinoGames()).find((item) => item.id === id) || null;
}

type TokenRow = { username: string; exp: number };

export async function saveCasinoToken(token: string, username: string, hours = 4) {
  const all = await getDoc<Record<string, TokenRow>>("casino_tokens", {});
  const now = Date.now();
  const next: Record<string, TokenRow> = {};
  for (const [key, value] of Object.entries(all || {})) {
    if (value?.exp > now) next[key] = value;
  }
  next[token] = { username, exp: now + hours * 60 * 60 * 1000 };
  await setDoc("casino_tokens", next);
}

export async function readCasinoToken(token: string) {
  const all = await getDoc<Record<string, TokenRow>>("casino_tokens", {});
  const row = all?.[token];
  if (!row || row.exp <= Date.now()) return null;
  return row.username;
}

type RefRow = { kind: string; amount: number; username: string };

export async function seenCasinoRef(reference: string) {
  const all = await getDoc<Record<string, RefRow>>("casino_refs", {});
  return all?.[reference] || null;
}

export async function markCasinoRef(reference: string, row: RefRow) {
  const all = await getDoc<Record<string, RefRow>>("casino_refs", {});
  const next = { ...(all || {}), [reference]: row };
  const keys = Object.keys(next);
  if (keys.length > 400) {
    for (const key of keys.slice(0, keys.length - 400)) delete next[key];
  }
  await setDoc("casino_refs", next);
}
