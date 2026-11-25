# Changelog

## 0.4.1
- Memory no longer counts the file cache and buffers as used, so healthy Linux hosts and NAS units stop showing 98% memory and a false Warning.
- Storage lists real volumes only: system mounts (`/dev/shm`, `/run`, `/tmp`) and duplicate mounts of the same filesystem are hidden, and volume sizes are shown.
- Uptime is the machine's uptime, not the SNMP service's.
- Hardware: Synology drives show type, temperature and status; the system temperature and manufacturer appear where reported.
- Network ports: container and virtual ports are hidden behind a toggle, real ports sort first.
- Clearer SNMPv3 error messages, and usernames are trimmed.

## 0.4.0
- Real monitoring: ping, TCP port and SNMP (v2c, and v3 with SHA-256/512 and AES) for routers, switches, firewalls, access points, NAS and Linux hosts. CPU, memory, disks, network ports with live traffic, top processes, and a Hardware section (CPU model, total RAM, drives, serial, firmware, location) where the device reports them.
- Device types, an Add and Edit device form with a **Test connection** button, delete device, and a visible "Simulated data" label on demo devices.
- Time-series metrics are now written to the metrics table.
- Security: dependency upgrades that remove every known vulnerability reported by `npm audit` (including a critical one in the token library), much smaller web and API images with no dev tooling, non-root read-only containers, ports bound to this computer by default, ping and SNMP targets validated (no command-option or loopback targets).
- New migration `003_monitoring.sql`. New optional settings `BIND_ADDRESS` and `POLL_SECONDS`.

## 0.3.0
- Settings: alert rules (limit, duration, severity, on/off) with a live rule engine that opens and resolves alerts and notifies channels; notification channels (email, Teams, Slack, Discord, webhook) with test button; user and role management; searchable audit log with CSV export; change your own password.
- Security: sign-in throttling, 12-character minimum passwords, immediate effect of role and disable changes, session revocation on password change, encrypted secrets at rest, blocked internal targets for notifications, CSV formula protection, browser security headers.
- New migration `002_settings.sql` (applies automatically). `ADMIN_PASSWORD` now needs 12 characters. New optional `TRUST_PROXY` setting.

## 0.2.0
- Device detail page: CPU, memory, storage, network, processes and services, with reboot, shutdown, Wake-on-LAN, kill process and service start, stop and restart (simulated, confirmed, audited).
- Add Device wizard (owner and admin only).
- Drag-and-drop dashboard widgets with keyboard-accessible arrow buttons; layout saved in the browser.
- NOC mode (`/noc`): full-screen tiles sorted worst first, Esc to exit.
- Security: WebSocket now uses one-time tickets instead of the sign-in token in the URL; request logs drop query strings.
- Fix: acknowledging an alert failed because the client sent a JSON content type with no body.

## 0.1.0 (unreleased)
- Foundation: monorepo, Docker Compose stack, auto-migrating TimescaleDB schema.
- API: sign-in, role-based permissions, audit log, devices, alerts, live WebSocket feed (simulated metrics).
- Web: app shell, light and dark themes with accent colour, Dashboard, Devices, Alerts.
