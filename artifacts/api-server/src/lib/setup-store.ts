import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type SetupRecord = {
  installedAt: string;
  clubName: string;
  adminName: string;
  adminEmail: string;
  adminUsername: string;
  adminPassword: string;
  theme: string;
};

function dataDir() {
  if (process.env["MOD_CLUB_DATA_DIR"]) {
    return path.resolve(process.env["MOD_CLUB_DATA_DIR"]);
  }
  const fromBundle = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../data");
  const fromCwd = path.resolve(process.cwd(), "data");
  if (existsSync(path.join(fromCwd, "setup.json"))) return fromCwd;
  if (existsSync(path.join(fromBundle, "setup.json"))) return fromBundle;
  return fromBundle;
}

function setupPath() {
  return path.join(dataDir(), "setup.json");
}

export function readSetup(): SetupRecord | null {
  const file = setupPath();
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as SetupRecord;
    if (!parsed?.adminUsername || !parsed?.adminPassword) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function isSetupInstalled() {
  if (process.env["MOD_CLUB_SETUP_DONE"] === "true") return true;
  return readSetup() !== null;
}

export function writeSetup(input: Omit<SetupRecord, "installedAt"> & { installedAt?: string }) {
  const dir = dataDir();
  mkdirSync(dir, { recursive: true });
  const record: SetupRecord = {
    installedAt: input.installedAt ?? new Date().toISOString(),
    clubName: input.clubName.trim() || "MOD CLUB",
    adminName: input.adminName.trim(),
    adminEmail: input.adminEmail.trim(),
    adminUsername: input.adminUsername.trim(),
    adminPassword: input.adminPassword.trim(),
    theme: input.theme.trim() || "electric",
  };
  writeFileSync(setupPath(), JSON.stringify(record, null, 2), "utf8");
  return record;
}

export function publicSetup() {
  const record = readSetup();
  return {
    installed: isSetupInstalled(),
    clubName: record?.clubName ?? "MOD CLUB",
    adminName: record?.adminName ?? "",
    adminEmail: record?.adminEmail ?? "",
    adminUsername: record?.adminUsername ?? "",
    theme: record?.theme ?? "electric",
  };
}
