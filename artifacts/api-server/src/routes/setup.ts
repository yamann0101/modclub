import { Router, type IRouter } from "express";
import { isInstalled, readSettings, upsertAccount, writeSettings } from "../lib/club-data";
import { currentAccount, publicUser, setLoginCookie } from "../lib/http";

const router: IRouter = Router();

router.get("/setup", async (req, res) => {
  const settings = await readSettings();
  const me = await currentAccount(req);
  res.json({
    installed: isInstalled(settings),
    clubName: settings?.clubName ?? "MOD CLUB",
    adminName: settings?.adminName ?? "",
    adminEmail: settings?.adminEmail ?? "",
    adminUsername: settings?.adminUsername ?? "",
    theme: settings?.theme ?? "electric",
    me: me ? publicUser(me) : null,
  });
});

router.post("/setup", async (req, res) => {
  const existing = await readSettings();
  if (isInstalled(existing)) {
    res.status(409).json({ error: "already_installed", installed: true });
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
  const settings = {
    clubName: String(body.clubName ?? "MOD CLUB").trim() || "MOD CLUB",
    adminName,
    adminEmail,
    adminUsername,
    adminPassword,
    theme: String(body.theme ?? "electric"),
  };
  await writeSettings(settings);
  const account = {
    username: adminUsername,
    password: adminPassword,
    nick: adminName,
    role: "ADMIN" as const,
  };
  await upsertAccount(account);
  await setLoginCookie(req, res, account);
  res.status(201).json({
    installed: true,
    clubName: settings.clubName,
    adminName,
    adminEmail,
    adminUsername,
    theme: settings.theme,
    me: publicUser(account),
  });
});

export default router;
