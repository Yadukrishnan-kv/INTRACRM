# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS deps
RUN apk add --no-cache python3 make g++ openssl libc6-compat
WORKDIR /app
COPY apps/api/package.json apps/api/package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY apps/api/ ./
RUN npx prisma generate && npm run build && npm prune --omit=dev

FROM node:22-alpine AS runner
RUN apk add --no-cache openssl libc6-compat wget postgresql-client \
  && addgroup -S intra && adduser -S intra -G intra
WORKDIR /app
ENV NODE_ENV=production \
    LOG_PRETTY=false \
    APP_PORT=3000 \
    STORAGE_ROOT=/app/uploads
COPY --from=build --chown=intra:intra /app/node_modules ./node_modules
COPY --from=build --chown=intra:intra /app/dist ./dist
COPY --from=build --chown=intra:intra /app/prisma ./prisma
COPY --from=build --chown=intra:intra /app/package.json ./
COPY --chown=intra:intra docs/data/sql /opt/intra-leads/sql
COPY --chown=intra:intra scripts/apply-sql.sh /usr/local/bin/apply-sql
RUN chmod +x /usr/local/bin/apply-sql && mkdir -p /app/uploads && chown intra:intra /app/uploads
USER intra
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/v1/health/live || exit 1
CMD ["node", "dist/main.js"]
