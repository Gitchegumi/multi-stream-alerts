# Local Development

## Prerequisites

- Node.js 20.19+ (see `engines` in `package.json`).
- pnpm 9+ (`npm install -g pnpm@9.15.4`).
- Running PostgreSQL and Redis instances. The simplest option is Docker Compose, which also provisions both backing services.
- A `.env` file at the repository root. Copy `.env.example` and fill in local values. See [Environment variables](environment-variables.md).

## Run the web app

Install dependencies, generate the Prisma client, apply migrations, then start the web app from the repository root:

```bash
pnpm install
pnpm prisma:generate
pnpm prisma:migrate
pnpm dev
```

`pnpm dev` runs the Next.js dashboard and overlay app on port 3000. The Guide route at `/dashboard/<channel>/guide` reads the markdown files in this `docs/` directory directly from disk, so edits here appear on the next request.

## Full stack with Docker Compose

When you want the app plus PostgreSQL, Redis, ingress, and worker to resemble a deployed environment:

```bash
docker compose up --build
```

## Quality checks

Run these before opening a pull request:

```bash
pnpm -r lint
pnpm -r typecheck
pnpm --filter @multi-stream-alerts/web test
pnpm format:check
```

`lint` and `typecheck` run per package. The web package uses `tsc --noEmit` for its lint step and a Node test runner for unit tests.
