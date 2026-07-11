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

*(Optional second provider for extra safety — e.g. Backblaze B2 or Google Drive
— add another remote the same way and set `RCLONE_REMOTE_2`.)*

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
