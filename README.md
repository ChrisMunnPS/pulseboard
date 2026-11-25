# Pulseboard

## 📌 Executive summary

Pulseboard is a monitoring platform for Windows, Linux and server estates, built for everyone from home labs to multi-client MSPs. Its design goal is that you see what is wrong immediately and reach any critical detail in at most two clicks.

**This is phase 1, the foundation.** It monitors real devices over ping, TCP and SNMP (routers, switches, NAS and Linux hosts), with hardware details such as CPU model, total RAM, disks and serial number where the device reports them. Demo devices still use simulated metrics, clearly labelled. It includes: sign-in with roles, a live dashboard fed over WebSocket every 5 seconds with drag-and-drop widgets, a device list and per-device detail pages, an Add Device wizard, alerts you can acknowledge, a full-screen NOC wall, a Settings area (alert rules that really fire, notification channels, users and roles, audit log), light and dark themes with a custom accent colour, and an audit log. Real data collection (the Go agent, SSH and WinRM) comes in the next phases. See the design document for the full plan.

## 🚀 Quick start

You need [Docker](https://docs.docker.com/get-docker/) and nothing else.

1. Create your configuration. This generates secrets and an admin password for you:
   - Linux or macOS: `./setup.sh`
   - Windows PowerShell: `./setup.ps1`
2. Start everything: `docker compose up -d`
3. Open <http://localhost:3000> and sign in with the admin details the setup script printed.

The first start builds the images, so allow a few minutes. Demo devices and alerts load automatically while `SEED_DEMO=true` in `.env`.

## 🔄 Upgrading

```
git pull
docker compose up -d --build
```

Database changes apply themselves on startup. The first start after upgrading to 0.3.0 signs everyone out once. The running version is shown at `http://localhost:4000/health`.

## 💾 Backup and restore

All data lives in one Docker volume (`pgdata`).

```
# Back up
docker compose exec -T db pg_dump -U pulse pulse > backup.sql

# Restore into a fresh install
docker compose exec -T db psql -U pulse pulse < backup.sql
```

## 🧰 Troubleshooting

| Symptom | What to do |
|---|---|
| API exits straight away | Run `docker compose logs api`. It prints a plain-English list of missing settings. |
| Web page cannot sign in | Check that port 4000 is reachable from your browser. If you changed `API_PORT`, run `docker compose up -d --build`. |
| Every ping device shows "No reply" although it is up | The API sends pings without special privileges. If your Docker setup blocks that, switch those devices to TCP or SNMP monitoring. |
| Forgot the admin password | The first admin is only created on an empty database. Change it in `.env`, then run `docker compose down -v` (this deletes all data) and start again. |

## 🗂️ Project layout

| Path | What it is |
|---|---|
| `apps/web` | Next.js app (React, TypeScript, Tailwind, Recharts, Framer Motion) |
| `apps/api` | Fastify REST API and WebSocket gateway, with SQL migrations in `migrations/` |
| `packages/shared` | Types and permission rules shared by web and API, so they cannot drift apart |
| `docker-compose.yml` | Database, API and web, with health checks and restart policies |

Theme colours live in one place: `apps/web/app/globals.css`.

## 🛠️ Development without Docker

Requires Node 22 and a PostgreSQL database with the TimescaleDB extension.

```
npm install
npm run dev:api     # needs DATABASE_URL, JWT_SECRET and ADMIN_PASSWORD in the environment
npm run dev:web
npm run typecheck
npm test
```

## 📡 Monitoring real devices

Add a device (Devices, then **+ Add device**) and pick how to check it:

| Method | Gives you | Good for |
|---|---|---|
| **Ping** | Up or down, latency, packet loss | Anything that answers ping |
| **TCP port** | Up or down and connect time | Devices that ignore ping, such as Windows PCs |
| **SNMP v2c / v3** | CPU, memory, disks, network ports with live traffic, top processes, hardware details | Routers, switches, firewalls, access points, NAS, Linux hosts |

- Use **Test connection** on the last step before saving. Unreachable devices go offline after two missed checks, and the offline rule can alert you.
- Prefer **SNMP v3** with authentication and encryption. v2c sends its community string in plain text.
- **What SNMP cannot tell you:** RAM modules, memory speed, BIOS and motherboard details. They live in the machine's hardware table, which SNMP does not expose. Reading them from a Windows PC needs WinRM (planned).
- **Windows PCs:** Microsoft has deprecated the Windows SNMP feature, so use TCP or ping for reachability for now.
- **The PC that runs Docker:** `localhost` means the Pulseboard container itself. Use **host.docker.internal** instead.
- Real readings are written to the time-series table, ready for the history charts.

## 🔐 Security notes

What is in place:
- **Small, locked-down containers:** the web image is Next.js's standalone server and the API is one bundled file, with no dev tools, no npm and no compilers inside. Both run as a non-root user with a read-only filesystem, no Linux capabilities and no privilege escalation. The database publishes no ports.
- **Local by default:** the ports are only reachable from this computer. Set `BIND_ADDRESS=0.0.0.0` in `.env` to allow others, and put HTTPS in front first.
- **Dependencies are audited:** `npm audit` reports zero known vulnerabilities, and Dependabot proposes updates weekly. After upgrading, rebuild with `docker compose build --pull` and scan with `docker scout quickview`.
- **Sign-in limits:** 5 failed attempts on an account from one address, or 30 from one address, lock that key for 15 minutes.
- **Sessions that react:** the API re-checks the user on every request, so disabling an account or changing a role takes effect at once, and changing or resetting a password signs out all older sessions.
- **Passwords:** at least 12 characters, stored as bcrypt hashes.
- **Secrets at rest:** webhook URLs and the SMTP password are encrypted (AES-256-GCM) and never returned by the API. The key is derived from `JWT_SECRET`, so **changing `JWT_SECRET` makes saved secrets unreadable** and you must re-enter them.
- **Outgoing notifications:** loopback, link-local (including cloud metadata) and multicast addresses are blocked, redirects are not followed, Teams, Slack and Discord must use https, and the SMTP password is only sent over an encrypted connection.
- **Least privilege:** roles are enforced on the server for every request. Only owners manage users; owners and admins manage rules and channels.
- **Audit log:** sign-ins (including failures), user and settings changes, and exports are recorded. Secrets are never written to it. CSV export neutralises cells that spreadsheets could run as formulas.
- **No tokens in logs:** live updates use a one-time ticket, and request logs drop query strings.
- **Browser hardening:** clickjacking and content-sniffing protections and a strict referrer policy.

Known gaps (planned):
- The sign-in token is kept in browser storage. Moving it to an HTTP-only cookie is planned, along with a Content Security Policy.
- Two-factor sign-in, and Entra ID and Active Directory single sign-on.
- A webhook hostname is checked just before sending; a hostile DNS server could still change its answer in between.
- Remote actions (reboot, shutdown, Wake-on-LAN, kill process, restart service) are simulated: they check permissions and write an audit entry but contact no machine.
- Run behind HTTPS (a reverse proxy) before exposing it beyond your own network, and then set `TRUST_PROXY=true`.

## 🗺️ What is next

Two-factor sign-in and single sign-on, saving dashboard layouts to your account, the remaining sidebar pages, then the Go agent and SSH and WinRM collectors.

## 🩺 If something does not start

Run `docker compose logs api` (or `db`, `web`). The API prints a plain-English reason when it cannot start.
