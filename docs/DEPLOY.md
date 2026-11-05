# Running Affiliate HQ on a VPS (step by step)

You need: a VPS (Ubuntu 22.04/24.04, **2 vCPU, 4 GB RAM**, 40 GB disk is plenty), and a domain name (for example `affiliates.yourshop.com`).
Everything runs in Docker: **database**, **app** and **Caddy** (automatic HTTPS). Your data lives in a Docker volume and in daily backups.

## 1. One-time setup

1. **Point the domain** to the VPS: add an `A` record `affiliates.yourshop.com → <VPS IP address>` at your domain provider.
2. **Log in** to the server: `ssh root@<VPS IP address>`
3. **Install Docker**:
   ```bash
   curl -fsSL https://get.docker.com | sh
   ```
4. **Open only the needed ports** (firewall):
   ```bash
   ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw --force enable
   ```
5. **Add swap** (the first build needs memory; skip if the server has 4 GB or more free):
   ```bash
   fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
   ```
6. **Get the code** and set the two values:
   ```bash
   git clone https://github.com/ahsanbashir786/ALOOMA-Affiliate-Management.git /opt/affiliate-hq
   cd /opt/affiliate-hq && git checkout claude/focused-noether-wfixvh
   cp .env.production.example .env && nano .env
   ```
   Set `DOMAIN` (your domain) and `POSTGRES_PASSWORD` (a long random password). Save with Ctrl+O, exit with Ctrl+X.
7. **Start it**:
   ```bash
   docker compose up -d --build
   ```
   The first build takes a few minutes. The database is created and migrated automatically.
8. Open `https://affiliates.yourshop.com/setup` and create the **owner (admin) account**. Then add staff in Settings.

## 2. Daily backup (do this once)

```bash
cd /opt/affiliate-hq && (crontab -l 2>/dev/null; echo "30 3 * * * cd /opt/affiliate-hq && ./scripts/backup.sh >> backups/backup.log 2>&1") | crontab -
```
This saves a dated copy every night at 03:30 and keeps the newest 14. **Also copy `backups/` to another place now and then** (your PC or cloud storage) – a backup on the same server is lost if the server is lost.

Restore a backup (replaces current data – it asks you to type YES): `./scripts/restore.sh backups/affiliate-YYYYMMDD-HHMMSS.dump`

## 3. Updating to a newer version

```bash
cd /opt/affiliate-hq
./scripts/backup.sh
git pull
docker compose up -d --build
```
Pending database migrations are applied automatically and safely when the app starts. If anything fails, the old data is untouched; restore the backup you just took.

## 4. Moving your current data (from your PC) to the server

1. On your PC: `pg_dump -Fc "<your DATABASE_URL>" -f affiliate.dump`
2. Copy `affiliate.dump` to the server (`scp affiliate.dump root@<IP>:/opt/affiliate-hq/backups/`).
3. On the server (before you create the owner account): `./scripts/restore.sh backups/affiliate.dump`
4. Open the site and log in with your existing account.

## 5. Checking on it

| Want to… | Command |
|---|---|
| See if it is running | `docker compose ps` |
| Read the app log | `docker compose logs --tail 100 app` |
| Restart | `docker compose restart app` |
| Health check (for an uptime monitor) | open `https://affiliates.yourshop.com/api/health` – it must show `{"ok":true}` |

Free uptime monitors (UptimeRobot etc.) can watch that address and email you if it fails.

## 6. Good to know

* Only ports 22, 80 and 443 are open. The database is **not** reachable from the internet.
* Logins use secure cookies, so use the **https** address. For a short test by IP address only, set `COOKIE_SECURE=false` in `.env` and run `docker compose up -d`; switch it back afterwards.
* Several people can use it at the same time.
* Not yet verified by me: the Docker image itself could not be built in my environment (no Docker engine there). I did verify the equivalent steps: the production build without a database, the standalone server, installing a fresh empty database with the migration script, first-run setup, and every screen on an empty database. If `docker compose up --build` shows an error, send me the last 30 lines.
