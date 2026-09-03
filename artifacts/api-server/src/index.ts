import app from "./app";
import { logger } from "./lib/logger";
import { connectPostgres } from "./lib/pg";
import { ensureSchema } from "./lib/club-data";

const rawPort = process.env["PORT"] || process.env["HTTP_PORT"] || "8080";
const port = Number(rawPort);
const host = process.env["HOST"] || "0.0.0.0";

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function waitForPostgres() {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 15; attempt += 1) {
    try {
      await connectPostgres();
      await ensureSchema();
      return;
    } catch (err) {
      lastError = err;
      logger.warn({ attempt }, "PostgreSQL henüz hazır değil, tekrar denenecek");
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  logger.error({ err: lastError }, "PostgreSQL bağlantısı veya tablo kurulumu başarısız");
  process.exit(1);
}

async function main() {
  await waitForPostgres();

  app.listen(port, host, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ host, port }, "Server listening");
  });
}

void main();
