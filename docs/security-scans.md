# Security & Code Quality Scans

This document describes the automated checks that protect `multi-stream-alerts`.

## What runs locally

Fast checks only. The full suite runs in CI; locally we optimize for dev-loop speed.

### Pre-commit hook (`.husky/pre-commit`)

Runs on every `git commit`:

- **Prettier** — formats staged JS/TS/JSON/MD/YAML files
- **Gitleaks staged scan** — if the `gitleaks` binary is on your `$PATH`, runs `gitleaks protect --staged --redact`. If not installed, prints a friendly skip message; CI is the real gate.

ESLint `--fix` is intentionally not wired in. This repo has no ESLint config (the `next lint` command was removed in Next.js 16). Prettier handles formatting. If project-specific ESLint rules are needed later, add `eslint.config.js` and a `lint` script that calls `eslint`; then add the `eslint --fix` step to `.lintstagedrc.json`.

### Pre-push hook (none by default)

Heavy local hooks slow down the dev loop. If you want a pre-push `lint + typecheck`, add it manually:

```sh
# .husky/pre-push
corepack pnpm -r lint
corepack pnpm -r typecheck
```

### Format and lint scripts

```sh
corepack pnpm format           # write
corepack pnpm format:check     # verify (used in CI)
corepack pnpm -r lint          # all packages
corepack pnpm -r typecheck     # all packages
corepack pnpm secrets:staged   # Gitleaks (or skip-message)
```

### Installing the hooks

Hooks are installed automatically by `pnpm install` via the `prepare` script (`husky`). To reinstall after a fresh clone:

```sh
corepack pnpm install
```

To install the optional `gitleaks` binary for local staged scanning:

```sh
# macOS
brew install gitleaks
# Linux (Debian/Ubuntu)
sudo apt install gitleaks
# or download a release binary from https://github.com/gitleaks/gitleaks/releases
```

### Bypassing hooks (only when absolutely necessary)

```sh
git commit --no-verify
git push --no-verify
```

Use sparingly. The CI suite will still catch most issues.

## What runs in CI

Every PR and every push to `main` triggers:

| Workflow                 | What it does                                                                                                                     |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `ci.yml`                 | `pnpm install` → `prisma generate` → `lint` → `typecheck` → `build`                                                              |
| `test.yml`               | `pnpm install` → `prisma generate` → `typecheck` → database / web / ingress test suites                                          |
| `gitleaks.yml`           | Secret scanning with the official Gitleaks action                                                                                |
| `trivy.yml`              | Filesystem scan for dependency vulnerabilities, Dockerfile/Compose misconfigurations, and leaked secrets (SARIF → Code Scanning) |
| `codeql.yml`             | CodeQL static analysis for JavaScript/TypeScript (security-extended + security-and-quality queries)                              |
| `osv-scanner.yml`        | OSV database cross-check of `pnpm-lock.yaml`                                                                                     |
| `semgrep.yml`            | Semgrep with `p/typescript`, `p/javascript`, `p/owasp-top-ten`                                                                   |
| `publish-containers.yml` | Publishes Docker images to GHCR (push to `main` only)                                                                            |

### Scheduled scans

- **CodeQL** — weekly, Monday 06:17 UTC
- **OSV-Scanner** — weekly, Monday 06:23 UTC

These catch newly-disclosed vulnerabilities between PRs.

### Dependabot

`.github/dependabot.yml` opens weekly PRs for:

- npm dependencies (production and dev, grouped separately)
- Docker base images in `Dockerfile` and `docker-compose.yml`
- GitHub Actions versions in `.github/workflows/`

Max 5 open PRs per ecosystem. Schedule: Monday 09:00 UTC.

## GitHub repository settings (manual, one-time)

These have to be enabled in the web UI under **Settings → Code security and analysis**:

- [ ] **Dependency graph** — should be on by default for public repos
- [ ] **Dependabot alerts** — enable
- [ ] **Dependabot security updates** — enable (auto-PRs for vulns)
- [ ] **Dependabot version updates** — already configured via `dependabot.yml`
- [ ] **Secret scanning** — enable
- [ ] **Push protection** — enable (blocks pushes that contain secrets)
- [ ] **Code scanning** — CodeQL + Trivy SARIF uploads land here automatically once the workflows run

## Branch protection (manual, one-time)

Under **Settings → Branches → Branch protection rules → `main`**, require status checks:

- `CI / Lint + typecheck + build` (from `ci.yml`)
- `Test / Typecheck + test` (from `test.yml`)
- `Gitleaks / Scan for secrets`
- `CodeQL / Analyze (javascript-typescript)`
- `Trivy / Filesystem scan`
- `OSV Scanner / Scan pnpm-lock.yaml`
- `Semgrep / Semgrep`

You can wait for these to run at least once before requiring them — they need to appear in the check list before you can add them to the required-checks list.

## Future: custom Semgrep rules

`semgrep-rules/` is a placeholder for repo-specific rules. When the auth/webhook helper function names have stabilized, candidate rules are:

- Prevent logging secrets, tokens, or display keys
- Require webhook signature verification helpers in webhook routes
- Require dashboard/admin auth helpers in protected routes

These will be added in a follow-up PR once the helper surface is stable.

## Future: Trivy image scanning

The current `trivy.yml` workflow scans the repo filesystem. Image scanning (scanning the built container images for OS-package CVEs) is a follow-on. The `publish-containers.yml` workflow builds three images (`alerts-web`, `alerts-ingress`, `alerts-worker`) on `push: main`; adding `aquasecurity/trivy-action` as a final step in that workflow would catch OS-level vulnerabilities in the base image. This is intentionally out of scope for the current PR to keep the diff focused on filesystem-level findings.
