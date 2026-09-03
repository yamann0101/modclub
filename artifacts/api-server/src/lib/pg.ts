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

function poolConfig(): pg.PoolConfig | undefined {
  const host = (process.env["PGHOST"] || process.env["POSTGRES_HOST"] || "").trim();
  const password = process.env["PGPASSWORD"] || process.env["POSTGRES_PASSWORD"] || "";
  if (host && password) {
    const local = host.includes("localhost") || host.includes("127.0.0.1");
    const internal = host.includes(".railway.internal");
    return {
      host,
      port: Number(process.env["PGPORT"] || process.env["POSTGRES_PORT"] || 5432),
      user: process.env["PGUSER"] || process.env["POSTGRES_USER"] || "postgres",
      password,
      database: process.env["PGDATABASE"] || process.env["POSTGRES_DB"] || "railway",
      max: 8,
      ssl: local || internal ? false : { rejectUnauthorized: false },
    };
  }
  const url = databaseUrl();
  if (!url) return undefined;
  const local = url.includes("localhost") || url.includes("127.0.0.1");
  const internal = url.includes(".railway.internal");
  return {
    connectionString: url,
    max: 8,
    ssl: local || internal ? false : { rejectUnauthorized: false },
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

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params: unknown[] = []) {
  const db = getPool();
  if (!db) throw new Error("DATABASE_URL missing");
  return db.query<T>(text, params);
}
