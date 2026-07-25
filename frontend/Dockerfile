# syntax=docker/dockerfile:1
# ---------------------------------------------------------------------------
# Frontend (React + Vite) image — multi-stage.
#   * build stage : compile the SPA -> dist/ (static files)
#   * serve stage : Nginx serving the static site + proxying /api to the API
#     container (service name "api" on the compose network).
#
# The app calls the API at the relative path /api, so no build-time API URL is
# needed — Nginx proxies it to the backend on the same origin.
# ---------------------------------------------------------------------------

# ---- Build stage ----------------------------------------------------------
FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build            # tsc --noEmit && vite build -> dist/

# ---- Serve stage ----------------------------------------------------------
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
