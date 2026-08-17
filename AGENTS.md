# AGENTS.md

This file applies to the entire repository. More specific `AGENTS.md` files may refine these rules for a subtree.

## Project overview

GitchAlerts is a self-hosted stream-alert and overlay platform built as a TypeScript monorepo.

- `apps/web`: Next.js dashboard, authentication, APIs, overlays, and server-sent events.
- `apps/ingress`: public Twitch, YouTube, and Ko-fi webhook ingestion.
- `apps/worker`: background work, Redis subscriptions, and YouTube WebSub renewal.
- `packages/database`: Prisma schema, authorization, credential storage, provider provisioning, and persistence helpers.
- `packages/shared`: shared runtime types, schemas, environment helpers, and encryption utilities.
- `packages/ui`: shared UI code.
- `docs`: user and developer documentation served by the dashboard guide.

Use Node.js 20.19 or newer and pnpm 9. Do not substitute npm or Yarn for workspace operations.

## Working principles

- Inspect the relevant implementation, tests, and nearby documentation before editing.
- Keep changes focused on the request. Preserve unrelated or pre-existing worktree changes.
- Prefer existing helpers, components, design tokens, and dependency-injection seams over parallel implementations.
- Do not expose credentials, OAuth tokens, encryption keys, webhook secrets, display keys, or ciphertext in logs, UI, API responses, fixtures, commits, or PR text.
- Commit only placeholders to `.env.example`. Never commit `.env` or real deployment values.
- Treat provider IDs as internal routing identifiers. User-facing account selectors and settings must prefer recognizable usernames, display names, or channel titles.
- Keep self-hosted deployments in mind: public origins, provider credentials, identity providers, storage backends, and ingress/web routing can differ between installations.

## Git workflow

When a task requires a new manually created branch:

1. Preserve any in-scope working changes.
2. Switch to `main` and run `git pull --ff-only origin main` before branching, unless the user explicitly asks to extend an existing branch or PR.
3. Select the branch category from the primary purpose of the change:
   - `feat/`: backward-compatible user-facing functionality.
   - `fix/`: bug fixes.
   - `docs/`: documentation-only changes.
   - `refactor/`: restructuring without behavior changes.
   - `perf/`: performance improvements.
   - `test/`: test-only changes.
   - `build/`: dependencies, containers, or build tooling.
   - `ci/`: CI/CD changes.
   - `chore/`: maintenance that does not affect application behavior.
   - `revert/`: reverting an earlier change.
4. Follow the category with a short kebab-case description, for example `fix/oauth-account-names`. Do not use literal placeholder text such as `<category>` in a branch name.

Use Conventional Commits with semantic-versioning intent:

```text
<type>(optional-scope): <imperative summary>
```

- Use `feat` for backward-compatible new capability.
- Use `fix`, `perf`, `docs`, `style`, `test`, `build`, `ci`, `chore`, or `refactor` for compatible patch-level work.
- Mark breaking changes with `!` and a `BREAKING CHANGE:` footer.
- Keep subjects under roughly 72 characters and explain behavior, configuration, migration needs, and risk in the body when relevant.
- Push feature branches with upstream tracking and open draft PRs unless the user requests ready-for-review status.

## Commands and validation

Use the narrowest relevant checks while iterating, then broaden validation in proportion to risk.

```bash
pnpm -r typecheck
pnpm -r lint
pnpm --filter @multi-stream-alerts/web test
pnpm --filter @multi-stream-alerts/database test
pnpm --filter @multi-stream-alerts/ingress test
pnpm --filter @multi-stream-alerts/worker test
pnpm -r build
pnpm format:check
```

Notes:

- Package scripts are authoritative. Inspect the target package's `package.json` before inventing a command.
- On Windows, a package test script that uses POSIX shell syntax may need its underlying `node --import tsx --test ...` command run directly from that package.
- Node's test runner may require permission to spawn isolated test processes in a sandboxed environment.
- Run `git diff --check` before committing.
- Commit hooks run formatting and staged secret scanning; do not bypass them.
- Do not claim a check passed unless it completed successfully. Report environmental blockers separately from product failures.

## TypeScript and code style

- Keep strict TypeScript types; avoid `any` and unsafe casts unless an external boundary requires a narrowly documented cast.
- Use existing path aliases and package exports rather than deep cross-package imports.
- Preserve dependency-injection seams around network, database, time, randomness, and environment access so provider flows remain unit-testable.
- Add or update tests for behavior changes and regressions. Tests live beside their domain under `__tests__` and use `node:test`.
- Use Prettier for supported source and documentation files.
- Comments should explain invariants, security constraints, or non-obvious decisions rather than restating code.

## Web application

- The app uses Next.js App Router and React. Keep server-only secrets and database work out of client components.
- Reuse global palette tokens and existing component primitives in `apps/web/src/app/globals.css`.
- Tailwind is configured without preflight. Do not assume Tailwind's browser reset is present.
- Preserve responsive behavior and keyboard-visible focus states.
- Public browser-source routes under `/overlay` must remain free of dashboard navigation, footers, opaque page backgrounds, and authenticated-page chrome.
- Public legal and OAuth-verification pages must remain accessible while signed out and must not depend on a workspace existing.
- Authorization must be enforced in API/server code even when the UI hides an action. Use the existing `canViewChannel`, `canManageChannel`, and `canManageChannelCredentials` helpers as appropriate.

## Authentication and integrations

Keep these layers distinct:

- Dashboard authentication uses Auth.js/NextAuth with OIDC and optional local credentials.
- Twitch and YouTube account linking are separate OAuth grants scoped to a GitchAlerts user and workspace.
- Ko-fi uses a per-workspace manual verification token.
- Instance OAuth client credentials belong in deployment environment variables, not workspace forms or linked-account records.

Provider invariants:

- Encrypt linked-account OAuth tokens with the shared token-encryption utility.
- Encrypt per-workspace webhook secrets through the database credential helpers.
- Disconnecting an account must stop its provider subscriptions and remove locally stored OAuth token material.
- Twitch supports multiple linked broadcaster accounts per workspace. They share the workspace EventSub webhook secret; adding one broadcaster must not remove existing broadcasters' subscriptions, and disconnecting one must preserve or rebuild subscriptions for the remaining active accounts.
- YouTube settings should display the YouTube channel title, not a Google subject ID. Twitch settings should display the Twitch username/display name, not the numeric broadcaster ID.
- Keep callback construction aligned with `NEXTAUTH_URL`, `PUBLIC_BASE_URL`, and `INGRESS_PUBLIC_BASE_URL`. OAuth callbacks belong to the web app; provider webhooks belong to ingress.
- Provider calls are best-effort only where the existing flow explicitly treats them that way. Surface actionable status without leaking provider response secrets.

## Database and security

- Change `packages/database/prisma/schema.prisma` through additive, reviewable migrations. Do not edit or reorder old migrations.
- Preserve tenant/workspace scoping in every query. A valid identifier alone is not authorization.
- Maintain cascade and retention behavior deliberately when changing relationships or deletion flows.
- Never return encrypted token fields or credential secret rows from browser-facing APIs.
- Use constant-time verification and existing signature helpers for webhook authentication.
- Keep overlay asset access scoped to the matching channel and display key or an authorized dashboard session.
- Avoid destructive data operations unless the user explicitly requests them and the exact target has been verified.

## Documentation and configuration

Update documentation whenever behavior, setup, callbacks, scopes, environment variables, deployment steps, or user-visible flows change.

- User workflows belong in `docs/user-guide`.
- Architecture, deployment, auth, OAuth provider setup, webhooks, and environment details belong in `docs/developer-guide`.
- Keep `README.md`, `.env.example`, and `docs/developer-guide/environment-variables.md` consistent for important configuration.
- Spell out provider-console steps and exact callback URL shapes; do not assume self-hosting administrators already know Twitch or Google consoles.
- Legal-policy templates must describe actual application behavior. Remind deployers to set their operator identity/contact and review jurisdiction-specific language rather than presenting generic text as tailored legal advice.

## Completion checklist

Before handing off a change:

- Review the final diff and working-tree status.
- Confirm no provider IDs, tokens, secrets, or unrelated files were introduced.
- Run the relevant focused tests and type checks.
- Run formatting/diff checks for touched files.
- Mention migrations, environment changes, reconnect requirements, or deployment steps in the PR and final summary.
- Provide the branch, commit, PR link, and validation results when publishing was requested.
