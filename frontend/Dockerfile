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

# Per-school branding — baked into the static bundle at build time. Supplied by
# docker-compose build args from the school's env file (see .env.docker.example).
# All optional; anything unset falls back to defaults in src/lib/school.ts.
ARG VITE_SCHOOL_NAME
ARG VITE_SCHOOL_PLACE
ARG VITE_SCHOOL_FULL_NAME
ARG VITE_SCHOOL_SHORT_NAME
ARG VITE_SCHOOL_MONOGRAM
ARG VITE_SCHOOL_TAGLINE
ARG VITE_SCHOOL_INTRO
ARG VITE_SCHOOL_DIRECTOR_NAME
ARG VITE_SCHOOL_DIRECTOR_ROLE
ARG VITE_SCHOOL_PRINCIPAL_NAME
ARG VITE_SCHOOL_PRINCIPAL_ROLE
ARG VITE_SCHOOL_ADDRESS
ARG VITE_SCHOOL_PHONE
ARG VITE_SCHOOL_EMAIL
ARG VITE_SCHOOL_ESTABLISHED
ARG VITE_SCHOOL_AFFILIATION
ENV VITE_SCHOOL_NAME=$VITE_SCHOOL_NAME \
    VITE_SCHOOL_PLACE=$VITE_SCHOOL_PLACE \
    VITE_SCHOOL_FULL_NAME=$VITE_SCHOOL_FULL_NAME \
    VITE_SCHOOL_SHORT_NAME=$VITE_SCHOOL_SHORT_NAME \
    VITE_SCHOOL_MONOGRAM=$VITE_SCHOOL_MONOGRAM \
    VITE_SCHOOL_TAGLINE=$VITE_SCHOOL_TAGLINE \
    VITE_SCHOOL_INTRO=$VITE_SCHOOL_INTRO \
    VITE_SCHOOL_DIRECTOR_NAME=$VITE_SCHOOL_DIRECTOR_NAME \
    VITE_SCHOOL_DIRECTOR_ROLE=$VITE_SCHOOL_DIRECTOR_ROLE \
    VITE_SCHOOL_PRINCIPAL_NAME=$VITE_SCHOOL_PRINCIPAL_NAME \
    VITE_SCHOOL_PRINCIPAL_ROLE=$VITE_SCHOOL_PRINCIPAL_ROLE \
    VITE_SCHOOL_ADDRESS=$VITE_SCHOOL_ADDRESS \
    VITE_SCHOOL_PHONE=$VITE_SCHOOL_PHONE \
    VITE_SCHOOL_EMAIL=$VITE_SCHOOL_EMAIL \
    VITE_SCHOOL_ESTABLISHED=$VITE_SCHOOL_ESTABLISHED \
    VITE_SCHOOL_AFFILIATION=$VITE_SCHOOL_AFFILIATION

RUN npm run build            # tsc --noEmit && vite build -> dist/

# ---- Serve stage ----------------------------------------------------------
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
