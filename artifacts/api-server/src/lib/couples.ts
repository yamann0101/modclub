import { randomBytes } from "crypto";
import { query } from "./pg";
import { findAccount, findAccountByNick, listAccounts } from "./club-data";

export type CpBond = { a: string; b: string; since: number };
export type CpAsk = { id: string; from: string; to: string; at: number };
export type CpPerson = { username: string; nick: string; photo?: string };
export type CpState = { bonds: CpBond[]; asks: CpAsk[] };

const DOC = "cp_bonds";
const ASK_MS = 15_000;

function key(value: string) {
  return value.trim().toLowerCase();
}

function same(left: string, right: string) {
  return key(left) === key(right);
}

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

async function readState(): Promise<CpState> {
  const raw = await getDoc<CpState>(DOC, { bonds: [], asks: [] });
  const now = Date.now();
  const asks = (Array.isArray(raw.asks) ? raw.asks : []).filter((item) => now - item.at < ASK_MS);
  const bonds = Array.isArray(raw.bonds) ? raw.bonds : [];
  if (asks.length !== (raw.asks || []).length) await setDoc(DOC, { bonds, asks });
  return { bonds, asks };
}

function bondOf(bonds: CpBond[], username: string) {
  return bonds.find((item) => same(item.a, username) || same(item.b, username));
}

function otherOf(bond: CpBond, username: string) {
  return same(bond.a, username) ? bond.b : bond.a;
}

async function personOf(username: string): Promise<CpPerson | null> {
  const account = await findAccount(username);
  if (!account) return null;
  return { username: account.username, nick: account.nick, photo: account.photo || undefined };
}

async function personByNick(nick: string) {
  return (await findAccountByNick(nick)) || (await findAccount(nick));
}

export async function listCpPairs() {
  const state = await readState();
  return state.bonds.map((item) => [item.a, item.b] as [string, string]);
}

export async function publicCp(username: string) {
  const state = await readState();
  const accounts = await listAccounts();
  const lookup = (name: string) => {
    const account = accounts.find((item) => same(item.username, name) || same(item.nick, name));
    return account
      ? { username: account.username, nick: account.nick, photo: account.photo || undefined }
      : { username: name, nick: name };
  };
  const bond = bondOf(state.bonds, username);
  return {
    partner: bond ? lookup(otherOf(bond, username)) : null,
    incoming: state.asks.filter((item) => same(item.to, username)).map((item) => ({ ...item, fromUser: lookup(item.from) })),
    outgoing: state.asks.filter((item) => same(item.from, username)).map((item) => ({ ...item, toUser: lookup(item.to) })),
    pairs: state.bonds.map((item) => [item.a, item.b] as [string, string]),
  };
}

export async function requestCp(from: string, target: string) {
  const toAccount = await personByNick(target.trim());
  if (!toAccount) throw new Error("missing");
  if (same(from, toAccount.username)) throw new Error("self");
  const state = await readState();
  if (bondOf(state.bonds, from) || bondOf(state.bonds, toAccount.username)) throw new Error("taken");
  const pending = state.asks.some((item) =>
    (same(item.from, from) && same(item.to, toAccount.username))
    || (same(item.from, toAccount.username) && same(item.to, from)),
  );
  if (pending) throw new Error("pending");
  state.asks.push({
    id: randomBytes(5).toString("hex"),
    from,
    to: toAccount.username,
    at: Date.now(),
  });
  await setDoc(DOC, state);
  return publicCp(from);
}

export async function respondCp(username: string, id: string, accept: boolean) {
  const state = await readState();
  const ask = state.asks.find((item) => item.id === id && same(item.to, username));
  if (!ask) throw new Error("missing");
  state.asks = state.asks.filter((item) => item.id !== id);
  if (accept) {
    if (bondOf(state.bonds, ask.from) || bondOf(state.bonds, ask.to)) throw new Error("taken");
    state.bonds.push({ a: ask.from, b: ask.to, since: Date.now() });
    state.asks = state.asks.filter((item) =>
      !same(item.from, ask.from) && !same(item.to, ask.from) && !same(item.from, ask.to) && !same(item.to, ask.to),
    );
  }
  await setDoc(DOC, state);
  return publicCp(username);
}

export async function breakCp(username: string) {
  const state = await readState();
  state.bonds = state.bonds.filter((item) => !same(item.a, username) && !same(item.b, username));
  await setDoc(DOC, state);
  return publicCp(username);
}

export async function partnerOf(username: string) {
  return (await personOf(username)) ? (await publicCp(username)).partner : null;
}
