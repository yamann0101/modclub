FROM node:22-bookworm-slim
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm run build

ENV HOST=0.0.0.0
ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
