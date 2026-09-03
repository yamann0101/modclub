import pg from "pg";

const { Pool } = pg;

function rawDatabaseUrl() {
  return (
    process.env["DATABASE_URL"]
    || process.env["POSTGRES_URL"]
    || process.env["DATABASE_PRIVATE_URL"]
    || process.env["POSTGRES_PRIVATE_URL"]
    || ""
  ).trim();
}

function encodeDatabaseUrl(url: string) {
  const match = url.match(/^(postgres(?:ql)?:\/\/)([^:/?#]+):([^@]*)@([^/]+)(\/[^?]*)?(\?.*)?$/i);
  if (!match) return url;
  const [, scheme, user, password, host, path = "", query = ""] = match;
  let decoded = password;
  try {
    decoded = decodeURIComponent(password);
  } catch {
    decoded = password;
  }
  return `${scheme}${encodeURIComponent(user)}:${encodeURIComponent(decoded)}@${host}${path}${query}`;
}

export function databaseUrl() {
  return encodeDatabaseUrl(rawDatabaseUrl());
}

function sslFor(value: string): boolean | { rejectUnauthorized: false } {
  const local = value.includes("localhost") || value.includes("127.0.0.1");
  const internal = value.includes(".railway.internal");
  return local || internal ? false : { rejectUnauthorized: false };
}

function parsedUrl() {
  const url = databaseUrl();
  if (!url) return null;
  const match = url.match(/^(postgres(?:ql)?:\/\/)([^:]+):([^@]*)@([^/:]+)(?::(\d+))?\/?([^?]*)/i);
  if (!match) return null;
  let password = match[3];
  try {
    password = decodeURIComponent(password);
  } catch {
    /* keep */
  }
  let user = match[2];
  try {
    user = decodeURIComponent(user);
  } catch {
    /* keep */
  }
  const database = decodeURIComponent(match[6] || "").replace(/^\//, "").split("/")[0];
  return {
    user,
    password,
    host: match[4],
    port: Number(match[5] || 5432),
    database: database || "",
  };
}

function poolConfig(databaseName?: string): pg.PoolConfig | undefined {
  const parsed = parsedUrl();
  if (parsed) {
    return {
      host: parsed.host,
      port: parsed.port,
      user: parsed.user,
      password: parsed.password,
      database: databaseName || parsed.database || process.env["PGDATABASE"] || "postgres",
      max: 8,
      ssl: sslFor(parsed.host),
    };
  }
  const host = (process.env["PGHOST"] || process.env["POSTGRES_HOST"] || "").trim();
  const password = process.env["PGPASSWORD"] || process.env["POSTGRES_PASSWORD"] || "";
  if (!host || !password) return undefined;
  return {
    host,
    port: Number(process.env["PGPORT"] || process.env["POSTGRES_PORT"] || 5432),
    user: process.env["PGUSER"] || process.env["POSTGRES_USER"] || "postgres",
    password,
    database: databaseName || process.env["PGDATABASE"] || process.env["POSTGRES_DB"] || "postgres",
    max: 8,
    ssl: sslFor(host),
  };
}

let pool: pg.Pool | undefined;

export function getPool() {
  if (pool) return pool;
  const config = poolConfig();
  if (!config) return undefined;
  pool = new Pool(config);
  return pool;
}

function resetPool(databaseName: string) {
  const previous = pool;
  pool = new Pool(poolConfig(databaseName));
  void previous?.end();
  return pool;
}

function pgErrorCode(err: unknown) {
  return typeof err === "object" && err && "code" in err ? String((err as { code?: string }).code) : "";
}

function safeDbName(value: string) {
  return /^[A-Za-z0-9_]+$/.test(value) ? value : "";
}

export async function connectPostgres() {
  const db = getPool();
  if (!db) throw new Error("DATABASE_URL missing");
  try {
    await db.query("SELECT 1");
    return db;
  } catch (err) {
    if (pgErrorCode(err) !== "3D000") throw err;
  }

  const wanted = safeDbName(poolConfig()?.database || "") || "railway";
  const admin = new Pool(poolConfig("postgres"));
  try {
    if (wanted && wanted !== "postgres") {
      await admin.query(`CREATE DATABASE ${wanted}`);
    }
  } catch (err) {
    if (pgErrorCode(err) !== "42P04") {
      /* database exists or cannot create; fall back below */
    }
  } finally {
    await admin.end();
  }

  try {
    const created = resetPool(wanted);
    await created.query("SELECT 1");
    return created;
  } catch (err) {
    if (pgErrorCode(err) !== "3D000") throw err;
    const fallback = resetPool("postgres");
    await fallback.query("SELECT 1");
    return fallback;
  }
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params: unknown[] = []) {
  const db = getPool();
  if (!db) throw new Error("DATABASE_URL missing");
  return db.query<T>(text, params);
}
