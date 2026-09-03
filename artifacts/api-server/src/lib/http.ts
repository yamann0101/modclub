import type { Request, Response } from "express";
import { createSession, destroySession, sessionAccount, type ClubAccount } from "./club-data";

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

export function publicUser(account: ClubAccount) {
  return {
    username: account.username,
    nick: account.nick,
    name: account.nick,
    role: account.role,
    title: account.title || undefined,
    appId: account.appId || undefined,
    photo: account.photo || undefined,
  };
}
