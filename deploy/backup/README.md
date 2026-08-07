# Database backups — School Fee & ERP

Two layers protect the data:

1. **Automatic nightly backup (2:00 AM)** — `sfms-backup.sh` dumps the whole
   database, uploads it **off the server** to cloud object storage, keeps a
   rolling set of daily/weekly/monthly copies, and (optionally) mirrors to a
   second provider.
2. **On-demand "Backup now" button** — in the app (Super Admin → **Backup**),
   downloads a fresh compressed dump straight to the admin's computer. No setup
   beyond having `mongodump` installed on the server.

Everyday actions are *also* reversible (Recycle Bin, void payment, undo
promotion) — backups are the deeper safety net beneath all of that.

---

## Why self-hosted MongoDB + off-box backups

- **Storage:** Oracle Always Free gives **200 GB** of block storage. This ERP
  grows only ~1–2 GB/year (5,000 students + 200 staff), so 200 GB is decades of
  runway — the free MongoDB Atlas tier's **512 MB** cap, by contrast, fills up
  in the first year at this scale.
- **Speed:** app and DB on the same host = localhost round-trips.
- **The one trade-off:** backups become our responsibility. That's what this
  folder automates.

**Golden rule:** a backup on the *same disk* as the database is not a backup.
The nightly job always pushes a copy off the server.

---

## One-time setup on the server

### 1. Install the tools

```bash
# MongoDB database tools (mongodump / mongorestore)
sudo apt-get update
sudo apt-get install -y mongodb-database-tools

# rclone (uploads backups to cloud storage)
sudo -v ; curl https://rclone.org/install.sh | sudo bash
```

### 2. Create a cloud bucket + credentials (Oracle Object Storage, S3-compatible)

In the OCI console:

1. **Object Storage → Buckets → Create Bucket** — name it e.g. `sfms-backups`
   (Always Free includes ~20 GB, plenty for many months of compressed dumps).
2. **Profile → Customer secret keys → Generate key** — this gives an
   **Access Key** + **Secret Key** for the S3-compatible endpoint.
3. Note your **namespace** and **region** (e.g. `ap-hyderabad-1`). The S3
   endpoint is: `https://<namespace>.compat.objectstorage.<region>.oraclecloud.com`

### 3. Configure rclone

```bash
rclone config
# n) New remote
# name> ocibackup
# Storage> s3
# provider> Other
# access_key_id> <your OCI access key>
# secret_access_key> <your OCI secret key>
# region> <your region, e.g. ap-hyderabad-1>
# endpoint> https://<namespace>.compat.objectstorage.<region>.oraclecloud.com
# (accept defaults for the rest)

# Verify:
rclone lsd ocibackup:
```

*(Optional second provider for extra safety — add another remote the same way
and set `RCLONE_REMOTE_2`.)*

---

## 3b. Google Drive instead of object storage

This is what the production boxes actually use, so follow this section rather
than the S3 one if you are setting up a new server. Drive is free at the sizes
this app produces and the account usually already exists.

Two things about it are not obvious, and getting either wrong wastes an evening:

> **Use your OWN Google OAuth client, not rclone's built-in one.** The shared
> client is heavily rate-limited and Google has been retiring it; uploads start
> failing with quota errors that look like network faults.
>
> **Publish the consent screen to Production.** While it is in "Testing", Google
> expires the refresh token after **7 days** — the backup silently stops working
> a week after you set it up, which is the worst possible failure mode.

### i. Create your own OAuth client (once, in a browser)

1. <https://console.cloud.google.com> → create or pick a project.
2. **APIs & Services → Library → Google Drive API → Enable.**
3. **OAuth consent screen** → External → fill in the app name and your email →
   **PUBLISH APP** so the status reads *In production*, not *Testing*.
4. **Credentials → Create credentials → OAuth client ID → Application type:
   Desktop app.** Copy the **Client ID** and **Client secret**.

### ii. Authorise rclone on a machine WITH a browser

The server is headless: the OAuth redirect cannot complete there. Do this step
on a laptop/PC that has rclone installed, then carry the result over.

```bash
rclone config
# n) New remote
# name> gdrive
# Storage> drive
# client_id>     <the Client ID from step i>
# client_secret> <the Client secret from step i>
# scope> 1        (full access)
# Edit advanced config? n
# Use auto config? y   -> a browser opens; sign in and allow
# Configure this as a Shared Drive? n

rclone lsd gdrive:          # verify
rclone about gdrive:        # shows free space on the account
```

### iii. Copy the credentials to the server

```bash
# on the PC — find where the config lives:
rclone config file          # e.g. C:\Users\you\AppData\Roaming\rclone\rclone.conf

# copy it to the server (from the PC):
scp -i <key.pem> "<that path>" ubuntu@<server>:/tmp/rclone.conf

# on the server:
mkdir -p ~/.config/rclone
mv /tmp/rclone.conf ~/.config/rclone/rclone.conf
chmod 600 ~/.config/rclone/rclone.conf   # it holds a refresh token
rclone lsd gdrive:                       # must work here too before going on
```

Then set the destination in `/etc/sfms-backup.env`:

```bash
RCLONE_REMOTE="gdrive:sfms-backups"
```

The script creates `sfms-backups/{daily,weekly,monthly}` on first run.

> **The classic "works by hand, silent at 2 AM" trap.** If cron runs the script
> as **root** while rclone was configured as **ubuntu**, root looks in
> `/root/.config/rclone` and finds nothing. Either put the cron entry in the same
> user's crontab, or point rclone at the config explicitly by adding this line to
> `/etc/sfms-backup.env`:
>
> ```bash
> export RCLONE_CONFIG="/home/ubuntu/.config/rclone/rclone.conf"
> ```
>
> The `export` is load-bearing. The script *sources* that file, so a plain
> `RCLONE_CONFIG=...` would be a shell variable only and the rclone child process
> would never see it.

### 4. Install the scripts + config

```bash
sudo mkdir -p /opt/sfms
sudo cp deploy/backup/sfms-backup.sh  /opt/sfms/
sudo cp deploy/backup/sfms-restore.sh /opt/sfms/
sudo chmod +x /opt/sfms/*.sh

sudo cp deploy/backup/sfms-backup.env.sample /etc/sfms-backup.env
sudo nano /etc/sfms-backup.env      # fill in MONGO_URI + RCLONE_REMOTE
sudo chmod 600 /etc/sfms-backup.env # contains the DB connection string
```

### 5. Test it once, then schedule it

```bash
# Run manually and watch the log:
sudo /opt/sfms/sfms-backup.sh
rclone ls ocibackup:sfms-backups/daily/     # confirm the archive landed

# Schedule for 2:00 AM daily (root's crontab):
sudo crontab -e
# add this line:
0 2 * * * /opt/sfms/sfms-backup.sh >> /var/log/sfms-backup.log 2>&1
```

> Note: cron uses the server's timezone. Set it to IST if you want 2 AM local:
> `sudo timedatectl set-timezone Asia/Kolkata`

---

## Backing up a MULTI-SCHOOL Docker box

Everything above assumes one database, reached by a `mongodump` installed on the
host. The `deploy/multi-school/` layout is different in two ways that will stop
you cold if you follow the steps above unchanged:

- **mongod runs in a container** (`sfms-mongo`), and on that box **no port is
  published to the host** — only Caddy binds one. A host `mongodump` pointed at
  `127.0.0.1:27017` connects to nothing.
- **There are several databases**, one per school (`sfms_school1`,
  `sfms_school2`, …). One `MONGO_URI` backs up **one school**. Set it up once and
  you have been quietly backing up a third of your data.

### The approach that needs no compose change

Dump *inside* the container and stream the archive out to the host, then let the
existing script handle upload and retention. Credentials are in
`deploy/multi-school/infra.env` on the box (`MONGO_USER` / `MONGO_PASS`).

```bash
# one school, by hand — check this works before automating anything
source ~/app/deploy/multi-school/infra.env
docker exec sfms-mongo sh -c \
  "mongodump --uri='mongodb://${MONGO_USER}:${MONGO_PASS}@127.0.0.1:27017/sfms_school1?authSource=admin' --gzip --archive" \
  > /var/backups/sfms/school1-$(date +%F).archive.gz
```

`mongodump` lives inside the mongo image, so nothing extra is installed on the
host. `--archive` with no filename writes to stdout, which is why this streams
cleanly without mounting a volume.

### Wiring it to the nightly job

Give **each school its own env file and its own cron line**, so one school
failing cannot silently take the others with it:

```bash
# /etc/sfms-backup-school1.env   (chmod 600, one per school)
MONGO_URI="mongodb://sfms:PASSWORD@127.0.0.1:27017/sfms_school1?authSource=admin"
STAGING_DIR="/var/backups/sfms/school1"
RCLONE_REMOTE="gdrive:sfms-backups/school1"
export RCLONE_CONFIG="/home/ubuntu/.config/rclone/rclone.conf"
```

Separate remote paths per school matter as much as separate files: a restore is
already stressful, and `sfms-2026-08-07.archive.gz` sitting in one folder with no
idea which school it came from is how the wrong data gets restored.

Then either run the dump inside the container as shown above, or — simpler if
you would rather use the script unchanged — publish mongo to the loopback only,
by adding this to the mongo service in `docker-compose.infra.yml`:

```yaml
    ports:
      - "127.0.0.1:27017:27017"    # host-only; never 0.0.0.0
```

and installing `mongodb-database-tools` on the host. Binding to `127.0.0.1` is
not optional — `- "27017:27017"` publishes the database to the whole internet.

> **Verify before you trust it.** Run each school's backup by hand once, confirm
> the archive lands in the right Drive folder, and test-restore one into a
> scratch database (below). A backup nobody has ever restored is a hope, not a
> backup.

---

## Restoring

**Always test a backup into a scratch database before trusting it.**

```bash
# 1. Pull an archive down from cloud storage:
rclone copy ocibackup:sfms-backups/daily/sfms-2026-07-11_020001.archive.gz .

# 2. Test-restore into a throwaway DB (safe, doesn't touch live data):
/opt/sfms/sfms-restore.sh sfms-2026-07-11_020001.archive.gz \
  "mongodb://127.0.0.1:27017/sfms_restore_test"

# 3. Real restore into the live DB (overwrites current data — be sure):
/opt/sfms/sfms-restore.sh sfms-2026-07-11_020001.archive.gz
```

---

## Retention at a glance

| Set      | Kept for      | Roughly |
|----------|---------------|---------|
| daily/   | 14 days       | last 2 weeks, every day |
| weekly/  | 70 days       | ~10 Sundays |
| monthly/ | 400 days      | ~13 months (1st of each month) |
| local    | 3 newest      | on the server, for fast restore |

Tune these in `/etc/sfms-backup.env`. Even at ~200 MB/dump, the whole rolling
set is only a few GB — well within the free 20 GB object-storage allowance.
