# syntax=docker/dockerfile:1
#
# Builds the React portal to static files. It is not served from here — the
# compose `portal-build` service copies dist/ into a volume that nginx serves,
# so there is one edge proxy for the whole product rather than one per SPA.

FROM node:22-alpine AS build

WORKDIR /app

# npm ci, not install: it installs exactly what package-lock.json pins and
# fails if the two disagree, rather than quietly resolving something else.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# `tsc -b && vite build`. There is no test runner in this app, so the
# typecheck is the gate.
RUN npm run build

# ---------------------------------------------------------------------------
# The dist output, ready to be copied into the shared volume.
# ---------------------------------------------------------------------------
FROM alpine:3.20 AS dist

WORKDIR /app
COPY --from=build /app/dist ./dist

CMD ["true"]
