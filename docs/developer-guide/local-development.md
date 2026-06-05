# Local Development

Install dependencies with pnpm and run the web app from the repository root.

```bash
pnpm install
pnpm prisma:generate
pnpm dev
```

Common checks:

```bash
pnpm -r lint
pnpm -r typecheck
pnpm --filter @multi-stream-alerts/web test
```

Use Docker Compose when you want the app plus backing services to resemble a deployed environment.
