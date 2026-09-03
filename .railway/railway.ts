import { defineRailway, github, postgres, project, service } from "railway/iac";

export default defineRailway(() => {
  const db = postgres("Postgres");
  const web = service("modclub", {
    source: github("yamann0101/modclub"),
    build: "pnpm run build",
    start: "pnpm start",
    healthcheck: "/api/healthz",
    env: {
      DATABASE_URL: db.env.DATABASE_URL,
    },
  });

  return project("modclub", {
    resources: [web, db],
  });
});
