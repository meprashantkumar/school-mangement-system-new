# Running this project with Docker

One image → many schools. You build the app **once**, then run a container
**per school** with its own config, database volume, and domain. This makes
deploys reproducible (version-pinned) and portable (any host: Oracle, AWS, a
local server) — a fresh box goes live in a couple of commands.

> This does **not** change the app's behaviour or your existing (non-Docker)
> deployments. It's an additional way to run the exact same code.

---

## What's in the box

| Service | Image | Role |
|---------|-------|------|
| `mongo` | `mongo:7.0` | Self-hosted database. Data lives in a named volume (`mongo_data`) — **this is what you back up.** |
| `api`   | built from `server/Dockerfile` | Express/Mongoose backend on port 5000. Includes `mongodump`/`mongorestore`/`rclone` so the in-app Backup page works. |
| `web`   | built from `frontend/Dockerfile` | Nginx serving the React build + proxying `/api` → `api`. Published on a host port. |

Files: `docker-compose.yml`, `server/Dockerfile`, `frontend/Dockerfile`,
`frontend/nginx.conf`, `.env.docker.example`.

---

## 0. Install Docker on the host (one time)

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER      # then log out/in so `docker` works without sudo
docker version && docker compose version
```

## 1. Configure a school

```bash
cp .env.docker.example school1.env
nano school1.env          # set domain, DB password, a UNIQUE JWT_SECRET, WEB_PORT, etc.
```

Key per-school values (see the file for the full list):
- `WEB_PORT` — a unique host port per school (e.g. 8081, 8082).
- `CLIENT_URL` — the school's public URL.
- `MONGO_PASS`, `JWT_SECRET` — **unique per school** (generate: `openssl rand -hex 32`).
- `SCHOOL_NAME`, `SUPERADMIN_*`, `RAZORPAY_*`, `SCHOOL_UPI_*`, `BACKUP_REMOTE`.

> `school1.env` holds secrets and is gitignored — never commit it.

## 2. Build + run that school

```bash
docker compose --env-file school1.env -p sfms_school1 up -d --build
```

- `-p sfms_school1` namespaces the containers **and the data volume**, so each
  school is fully isolated.
- Check it: `docker compose -p sfms_school1 ps` and
  `curl http://localhost:8081/api/health` (use that school's WEB_PORT).

A second school is just another env file + project name + port:

```bash
cp .env.docker.example school2.env   # edit it (different port, DB pass, JWT, etc.)
docker compose --env-file school2.env -p sfms_school2 up -d --build
```

## 3. Put it behind a domain + HTTPS

The containers speak plain HTTP on their host ports. Terminate SSL and route
domains with a **host Nginx + Certbot** in front (same tool you already use):

`/etc/nginx/sites-available/schools`:
```nginx
server {
    listen 80;
    server_name school1.mydomain.in;
    client_max_body_size 2g;
    location / { proxy_pass http://127.0.0.1:8081; proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto $scheme; proxy_read_timeout 600s; proxy_send_timeout 600s; }
}
server {
    listen 80;
    server_name school2.mydomain.in;
    client_max_body_size 2g;
    location / { proxy_pass http://127.0.0.1:8082; proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto $scheme; proxy_read_timeout 600s; proxy_send_timeout 600s; }
}
```
```bash
sudo ln -sf /etc/nginx/sites-available/schools /etc/nginx/sites-enabled/schools
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d school1.mydomain.in -d school2.mydomain.in
```

Point both subdomains' DNS **A records** at the server's (reserved) public IP first.

## 4. Backups (per school)

The database is the `mongo_data` volume — back it up off-box nightly. Dump from
inside that school's api container (it has `mongodump` + `rclone`) and upload to
its own Google Drive folder:

```bash
# One school, on demand:
docker compose -p sfms_school1 exec -T api \
  sh -c 'mongodump --uri="$MONGO_URI" --gzip --archive' > school1-$(date +%F).archive.gz
```

Schedule it in the host crontab (2 AM), one line per school, piping straight to
rclone. The in-app **Backup → Back up to Google Drive** button also works if you
put an `rclone.conf` at `./rclone/rclone.conf` (mounted into the api container).

## 5. Update to a new version

```bash
git pull
docker compose --env-file school1.env -p sfms_school1 up -d --build
docker compose --env-file school2.env -p sfms_school2 up -d --build
```
Rebuilds the image and recreates the containers. The `mongo_data` volume (your
data) is untouched.

## 6. Make it truly reproducible (important)

Docker only freezes versions if you pin them:
- **Pin base images** to a digest (edit the `FROM` lines):
  `FROM node:20.20.2-bookworm-slim@sha256:…`, `image: mongo:7.0.x@sha256:…`.
- **Commit lockfiles** (`package-lock.json`) — already done; images build with `npm ci`.
- **Save the built image** somewhere durable so it survives even if a base image
  disappears: push to a registry (Docker Hub / GHCR) **or**
  `docker save sfms-api | gzip > sfms-api.tar.gz` and keep it with your backups.

---

## Deploying on a fresh AWS EC2 / Oracle box — quick path

1. **Provision** Ubuntu (Oracle A1 24 GB is ideal for several schools). Open ports **22, 80, 443** (Oracle: in the console Security List **and** the host firewall — `ufw` + `iptables`, see `DEPLOYMENT_GUIDE.md`).
2. **Reserve/attach a static public IP** (Oracle reserved IP / AWS Elastic IP) so it never changes.
3. **Install Docker** (step 0) and Nginx + Certbot on the host (`sudo apt-get install -y nginx certbot python3-certbot-nginx`).
4. **Clone** the repo: `git clone <repo> app && cd app`.
5. **Configure + run** each school (steps 1–2).
6. **Domain + HTTPS** (step 3), then **backups** (step 4).
7. Add uptime monitoring on each `https://.../api/health`.

That's it — the same image runs every school; only the env file and domain differ.
