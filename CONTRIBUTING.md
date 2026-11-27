# Contributing to Pulseboard

## 📌 Summary

Pulseboard follows **Semantic Versioning 2.0.0**, writes commits as **Conventional Commits 1.0.0**, keeps a **Keep a Changelog** file, and releases from tags (`vX.Y.Z`). The next version number and the changelog are produced by automation from commit messages, so nobody edits a version by hand. The product version lives in one place: the root `package.json`.

## 🔢 Versioning

Versions look like `MAJOR.MINOR.PATCH`.

| Bump | When | Examples in this project |
|---|---|---|
| **MAJOR** | A breaking change to something people rely on | Removing or renaming a REST endpoint or `.env` setting; a migration that drops data; changing the collector JSON `schema` number |
| **MINOR** | A new feature that does not break anything | A new page, monitoring method, notification channel or alert rule |
| **PATCH** | A fix that changes no behaviour people rely on | A bug fix, a clearer message, a dependency security update |

While the major number is `0` (before 1.0), anything may change. This project then uses the common rule that **breaking changes bump MINOR** and features and fixes bump PATCH.

**What counts as the public interface:** the REST API under `/api/v1`, the WebSocket messages, the settings in `.env`, the database migrations, the collector scripts and their JSON `schema`, and the Docker image tags.

**Database migrations** are numbered files in `apps/api/migrations`. Never edit one that has been released; add a new one. Prefer additive changes. A migration that removes or rewrites data is a breaking change and needs upgrade notes in the changelog.

## ✍️ Commit messages

Write `type(scope): summary`, in the imperative, for example `feat(ssh): pin the host key at setup`.

| Type | Meaning | Release effect |
|---|---|---|
| `feat` | A new feature | MINOR |
| `fix` | A bug fix (use `fix(security): …` for security fixes) | PATCH |
| `perf` | A performance improvement | PATCH |
| `docs`, `test`, `refactor`, `style`, `build`, `ci`, `chore` | No change in behaviour | none |
| `feat!` / `fix!`, or a `BREAKING CHANGE:` footer | A breaking change | MAJOR (MINOR before 1.0) |

Pull requests are squash-merged, so **the pull request title is the commit message**. CI rejects a title that is not in this format.

## 🌿 Branching and pull requests

- `main` is always releasable. Work happens on short-lived branches such as `feat/ssh-collector` or `fix/host-key-check`.
- Open a pull request early. It needs a passing CI run (typecheck, tests, `npm audit`, the API bundle and the web build) and, where possible, a review.
- Recommended settings for `main`: require a pull request, require CI to pass, require a linear history, and disallow force pushes.

## 🚀 Releasing

1. Merge pull requests into `main`.
2. **release-please** keeps a pull request titled `chore(main): release X.Y.Z` open. It contains the new version and the changelog entries gathered from the commits.
3. Merge that pull request when you want to release. This creates the `vX.Y.Z` tag and a GitHub release.
4. The **docker** workflow builds the web and API images, scans them (it fails on any fixable critical or high finding), and publishes them to GitHub Container Registry tagged `X.Y.Z`, `X.Y` and `latest`.

To support an older line, branch from its tag (for example `release/0.6`), apply the fix there, and release a patch from that branch.

## 🧪 Before you open a pull request

```
npm install
npm run typecheck
npm test
npm audit --audit-level=high
npm run bundle --workspace apps/api
npm run build --workspace apps/web
```

## 🔐 Security

Never commit secrets, keys or `.env` files. Report vulnerabilities as described in [SECURITY.md](SECURITY.md).
