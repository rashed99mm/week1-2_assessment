# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Build: compile TypeScript and the MJML templates
# ---------------------------------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app

# npm ci, not install: it installs exactly what the lockfile pins and fails if
# the two disagree, rather than quietly resolving something else.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY scripts ./scripts
COPY src ./src

# `tsc` then `build:templates`. MJML compilation happens here rather than per
# send — the compiler is slow and its output only changes when a template does.
RUN npm run build

# ---------------------------------------------------------------------------
# Runtime
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runtime

ENV NODE_ENV=production

WORKDIR /app

# Production dependencies only. The build toolchain — TypeScript, MJML,
# Vitest, the in-memory MongoDB — is several hundred megabytes that the running
# service has no use for.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

# Non-root. This service holds the JWT public key and customers' email
# addresses; it has no reason to run with more privilege than reading its own
# code needs.
USER node

EXPOSE 3000

# Reports degraded rather than unhealthy when only the broker is down — events
# queue up, but the service is working, and restarting it would not help.
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
    CMD wget --quiet --spider http://127.0.0.1:3000/health || exit 1

CMD ["node", "dist/main.js"]
