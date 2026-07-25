# syntax=docker/dockerfile:1
# ---------------------------------------------------------------------------
# Backend (Express + Mongoose) image — multi-stage.
#   * build stage : install ALL deps, compile TypeScript -> dist/
#   * runtime stage: prod deps only + the CLI tools the in-app backup/restore/
#     Google-Drive features shell out to (mongodump, mongorestore, rclone).
#
# For full reproducibility pin the base image to a digest, e.g.
#   FROM node:20.20.2-bookworm-slim@sha256:<digest> AS build
# (a moving tag like node:20 will drift over time.)
# ---------------------------------------------------------------------------

# ---- Build stage ----------------------------------------------------------
FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build            # tsc -> dist/

# ---- Runtime stage --------------------------------------------------------
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Tools the Backup page uses: mongodump/mongorestore (mongodb-database-tools)
# and rclone (Google Drive uploads). Kept in the image so those features work
# inside the container exactly like on a bare host.
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl gnupg ca-certificates \
 && curl -fsSL https://pgp.mongodb.com/server-7.0.asc \
      | gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor \
 && echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/debian bookworm/mongodb-org/7.0 main" \
      > /etc/apt/sources.list.d/mongodb-org-7.0.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends mongodb-database-tools rclone \
 && apt-get purge -y gnupg \
 && apt-get autoremove -y \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/*

# Production dependencies only.
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Compiled app from the build stage.
COPY --from=build /app/dist ./dist

EXPOSE 5000
CMD ["node", "dist/server.js"]
