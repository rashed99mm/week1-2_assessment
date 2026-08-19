# syntax=docker/dockerfile:1
#
# Builds the Angular CMS to static files. It is not served from here — the
# compose `cms-build` service copies dist/ into a volume that nginx serves, so
# the whole product sits behind one edge proxy rather than one per app.

FROM node:22-alpine AS build

WORKDIR /app

# npm ci, not install: it installs exactly what the lockfile pins and fails if
# the two disagree, rather than quietly resolving something else.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Built with baseHref=/admin/ (set in angular.json), because nginx serves this
# app under that prefix. Without it the page loads and then requests its
# bundles from the site root, which is the React portal.
RUN npm run build -- --configuration production

# ---------------------------------------------------------------------------
# The dist output, ready to be copied into the shared volume.
# ---------------------------------------------------------------------------
FROM alpine:3.20 AS dist

WORKDIR /app
COPY --from=build /app/dist/admin-cms/browser ./dist

CMD ["true"]
