import type { Request, Response } from "express";
import { createSession, destroySession, sessionAccount, type ClubAccount } from "./club-data";
import { hideUntilOf, seeUntilOf, fireUntilOf } from "./room-hide";

export const SESSION_COOKIE = "mc_sid";

export function sessionToken(req: Request) {
  const cookie = req.cookies?.[SESSION_COOKIE];
  return typeof cookie === "string" ? cookie : "";
}

export async function currentAccount(req: Request) {
  return sessionAccount(sessionToken(req));
}

export async function setLoginCookie(req: Request, res: Response, account: ClubAccount) {
  const token = await createSession(account.username);
  const proto = String(req.get("x-forwarded-proto") || req.protocol || "");
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: proto.includes("https"),
    path: "/",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
  return token;
}

export async function clearLoginCookie(req: Request, res: Response) {
  await destroySession(sessionToken(req));
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

export function publicUser(account: ClubAccount, hideUntil = 0, seeUntil = 0, fireUntil = 0) {
  const forever = Date.now() + 10 * 365 * 24 * 60 * 60 * 1000;
  const admin = account.role === "ADMIN";
  return {
    username: account.username,
    nick: account.nick,
    name: account.nick,
    role: account.role,
    title: account.title || undefined,
    appId: account.appId || undefined,
    photo: account.photo || undefined,
    coins: account.coins ?? 0,
    vipUntil: account.vipUntil || undefined,
    hideUntil: admin ? forever : hideUntil,
    seeUntil: admin ? forever : seeUntil,
    fireUntil: admin ? forever : fireUntil,
  };
}

export async function publicSession(account: ClubAccount) {
  const [hideUntil, seeUntil, fireUntil] = await Promise.all([
    hideUntilOf(account.username),
    seeUntilOf(account.username),
    fireUntilOf(account.username),
  ]);
  return publicUser(account, hideUntil, seeUntil, fireUntil);
}
