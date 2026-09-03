import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: "4mb" }));
app.use(express.urlencoded({ extended: true, limit: "4mb" }));

app.use("/api", router);

app.get("/sitemap.xml", (req, res) => {
  const host = req.get("x-forwarded-host") || req.get("host") || "localhost";
  const proto = req.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`.replace(/\/$/, "");
  const today = new Date().toISOString().slice(0, 10);
  res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url>
    <loc>${origin}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
    <image:image>
      <image:loc>${origin}/logo.png</image:loc>
      <image:title>MOD CLUB</image:title>
      <image:caption>MOD CLUB</image:caption>
    </image:image>
  </url>
  <url><loc>${origin}/?p=etkinlikler</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>
  <url><loc>${origin}/?p=oyunlar</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>
  <url><loc>${origin}/?p=film</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>
  <url><loc>${origin}/?p=uygulama</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>
</urlset>
`);
});

app.get("/robots.txt", (req, res) => {
  const host = req.get("x-forwarded-host") || req.get("host") || "localhost";
  const proto = req.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
  res.type("text/plain").send(`User-agent: *
Allow: /
Sitemap: ${proto}://${host}/sitemap.xml
`);
});

const publicDirCandidates = [
  path.resolve(process.cwd(), "artifacts/mod-club/dist/public"),
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../mod-club/dist/public",
  ),
];
const publicDir = publicDirCandidates.find((dir) => existsSync(dir));

if (publicDir) {
  app.use(express.static(publicDir));
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api")) {
      next();
      return;
    }

    res.sendFile(path.join(publicDir, "index.html"));
  });
}

export default app;
