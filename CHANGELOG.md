# Changelog

All notable changes to Pulseboard are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Once the project is on GitHub, this file is
maintained by release-please from [Conventional Commit](https://www.conventionalcommits.org/en/v1.0.0/) messages (see CONTRIBUTING.md).

Versions 0.1.0 to 0.5.0 were development builds handed over as archives, so they have no release dates.

## [0.6.0]

### Added
- **Monitoring computers over SSH (Windows and Linux).** Agentless: a read-only collector script and a key that belongs to one device. It reports hardware details (CPU model, RAM modules with size, speed, type, manufacturer, part number and serial, BIOS, motherboard, graphics, drives with serial numbers, OS build, installed applications), real services, and live CPU use per process.
- **Services** and **Processes** pages, fleet-wide and sortable, with search and filters.
- SSH setup inside the Add and Edit device form: generate a key, download the collector, copy the `authorized_keys` line, and a Test connection step that shows the device's host key fingerprint for you to confirm.
- Version shown on the sign-in page, in the sidebar, and at `/health`. One product version, kept in the root `package.json`.
- Release automation for GitHub: release-please (next version and changelog from commit messages), a semantic pull-request title check, and a workflow that builds, scans and publishes the Docker images tagged with the version.
- CONTRIBUTING.md (versioning policy, commit convention, branching, releasing) and SECURITY.md.
- Migration `005_ssh.sql`.

### Changed
- The service alert rule now covers failed services on computers monitored over SSH. A service is failed when it is set to start automatically, is stopped, and last stopped with an error.
- CI now also fails on any high or critical dependency vulnerability, and checks that the API bundles and the web app builds.

### Security
- SSH uses key authentication only. Each device has its own key, stored encrypted and never returned by the API. The key is restricted by the device to one read-only script: no shell, no forwarding.
- The device's SSH host key is pinned at setup. A different key later stops the connection and is reported, which protects against impersonation.
- Everything a collector returns is validated and size-limited before use.

## [0.5.0]

### Added
- **Performance**, **Storage**, **Network** and **Remote Devices** pages. Every data table has sortable column headers.
- History for 24 hours, 7 days and 30 days, kept for 90 days by default (`RETENTION_DAYS`); availability from a log of status changes.
- Temperature and drive-health alert rules for devices that report them (Synology NAS over SNMP).
- Check now, and Pause and Resume monitoring, per device.
- Migration `004_history.sql`.

### Changed
- Growth and days-until-full appear only after about 6 hours of readings.
- The temperature rule default is 60 °C if it had not been changed.

## [0.4.1]

### Fixed
- Memory no longer counts the file cache as used, so healthy Linux hosts and NAS units stop showing about 98% and a false Warning.
- Storage lists real volumes only, with sizes. Uptime is the machine's own. Virtual network ports are hidden behind a toggle.
- Clearer SNMPv3 error messages; usernames are trimmed.

## [0.4.0]

### Added
- Real monitoring: ping, TCP port and SNMP (v2c, and v3 with SHA-256 or SHA-512 and AES). CPU, memory, disks, network ports with live traffic, top processes, and hardware details (CPU model, total RAM, drives, serial, firmware).
- Device types, an Add and Edit form with Test connection, delete, and a visible label on simulated demo data.
- Migration `003_monitoring.sql`.

### Security
- Dependency upgrades that remove every known vulnerability reported by `npm audit`, including a critical one in the token library.
- Much smaller web and API images with no development tools, non-root read-only containers, ports bound to this computer by default.

## [0.3.0]

### Added
- Settings: alert rules with a live rule engine, notification channels (email, Teams, Slack, Discord, webhook), user and role management, a searchable audit log with CSV export, and password change.
- Migration `002_settings.sql`.

### Security
- Sign-in throttling, 12-character passwords, role and disable changes that apply immediately, session revocation on password change, secrets encrypted at rest, blocked internal targets for notifications, CSV formula protection, browser security headers.

## [0.2.0]

### Added
- Device detail page, Add Device wizard, drag-and-drop dashboard widgets, and NOC mode.

### Security
- WebSocket one-time tickets instead of the sign-in token in the URL; request logs drop query strings.

### Fixed
- Acknowledging an alert failed because the client sent a JSON content type with no body.

## [0.1.0]

### Added
- Foundation: monorepo, Docker Compose stack, self-migrating TimescaleDB schema, sign-in with roles, audit log, a live dashboard with simulated metrics, and light and dark themes.

[0.6.0]: https://github.com/OWNER/REPO/releases/tag/v0.6.0
