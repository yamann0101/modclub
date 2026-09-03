import pg from "pg";

const { Pool } = pg;

export function databaseUrl() {
  return (
    process.env["DATABASE_URL"]
    || process.env["POSTGRES_URL"]
    || process.env["DATABASE_PRIVATE_URL"]
    || process.env["POSTGRES_PRIVATE_URL"]
    || ""
  ).trim();
}

let pool: pg.Pool | undefined;

export function getPool() {
  const url = databaseUrl();
  if (!url) return undefined;
  if (!pool) {
    const local = url.includes("localhost") || url.includes("127.0.0.1");
    const internal = url.includes(".railway.internal");
    pool = new Pool({
      connectionString: url,
      max: 8,
      ssl: local || internal ? false : { rejectUnauthorized: false },
    });
  }
  return pool;
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params: unknown[] = []) {
  const db = getPool();
  if (!db) throw new Error("DATABASE_URL missing");
  return db.query<T>(text, params);
}
