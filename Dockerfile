# Glyphwild TCG API image.
#   Build:  docker build -t tcg-api-demo:local .        (podman build -t tcg-api-demo:local . works the same)
#   Run:    docker run --rm -p 3000:3000 tcg-api-demo:local
# Usually you do not run these by hand: `docker compose up --build` uses this file (see compose.yaml).

# NODE_VERSION: Node major of the base image: 22, 24 (LTS, default) or 26.
# The image name is fully qualified so Podman never asks which registry to use.
ARG NODE_VERSION=24
FROM docker.io/library/node:${NODE_VERSION}-alpine

LABEL org.opencontainers.image.title="tcg-api-demo" \
      org.opencontainers.image.description="Glyphwild TCG practice API for teaching API test automation"

# NODE_OPTIONS hides the one-line node:sqlite ExperimentalWarning printed by some Node versions.
# SCARF_ANALYTICS=false: no install analytics from swagger-ui-dist.
ENV NODE_ENV=production \
    NODE_OPTIONS=--disable-warning=ExperimentalWarning \
    SCARF_ANALYTICS=false \
    PORT=3000 \
    DB_FILE=/app/data/tcg.db

WORKDIR /app

# 1) Dependencies first, so this layer stays cached until package*.json changes.
#    --ignore-scripts: no dependency needs install scripts (node:sqlite is built into Node).
COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# 2) Fail the build early if this Node build has no working node:sqlite.
RUN node -e "new (require('node:sqlite').DatabaseSync)(':memory:').exec('select 1')"

# 3) The app itself.
COPY src ./src

# 4) Data folder owned by the unprivileged 'node' user (uid 1000). Docker and Podman copy this ownership
#    onto a NEW, empty named volume mounted here, so SQLite can create /app/data/tcg.db.
RUN mkdir -p /app/data && chown node:node /app/data
USER node

EXPOSE 3000
# The health check lives in compose.yaml (Podman ignores HEALTHCHECK in its default image format).
CMD ["node", "src/server.js"]
