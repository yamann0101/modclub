import { Router, type IRouter } from "express";
import { isSetupInstalled, publicSetup, readSetup, writeSetup } from "../lib/setup-store";

const router: IRouter = Router();

router.get("/setup", (_req, res) => {
  res.json(publicSetup());
});

router.post("/setup", (req, res) => {
  if (isSetupInstalled()) {
    res.status(409).json({ error: "already_installed", ...publicSetup() });
    return;
  }

  const body = req.body as {
    clubName?: string;
    adminName?: string;
    adminEmail?: string;
    adminUsername?: string;
    adminPassword?: string;
    theme?: string;
  };

  const adminName = String(body.adminName ?? "").trim();
  const adminEmail = String(body.adminEmail ?? "").trim();
  const adminUsername = String(body.adminUsername ?? "").trim();
  const adminPassword = String(body.adminPassword ?? "").trim();

  if (adminName.length < 2 || !adminEmail.includes("@") || adminUsername.length < 3 || adminPassword.length < 4) {
    res.status(400).json({ error: "invalid_setup" });
    return;
  }

  writeSetup({
    clubName: String(body.clubName ?? "MOD CLUB"),
    adminName,
    adminEmail,
    adminUsername,
    adminPassword,
    theme: String(body.theme ?? "electric"),
  });
  res.status(201).json(publicSetup());
});

router.post("/setup/login", (req, res) => {
  const record = readSetup();
  const username = String((req.body as { username?: string }).username ?? "").trim().toLowerCase();
  const password = String((req.body as { password?: string }).password ?? "").trim();
  if (!record || record.adminUsername.trim().toLowerCase() !== username || record.adminPassword !== password) {
    res.status(401).json({ error: "invalid_credentials" });
    return;
  }

  const nick = record.adminName.trim() || record.adminUsername.trim();
  res.json({
    ok: true,
    username: record.adminUsername,
    nick,
    name: nick,
    role: "ADMIN",
  });
});

export default router;
