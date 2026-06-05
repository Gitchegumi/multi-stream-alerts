# Architecture

GitchAlerts is a TypeScript monorepo.

- `apps/web`: Next.js dashboard, browser-source overlay routes, API routes, auth, and asset delivery.
- `apps/ingress`: webhook ingestion for providers such as Ko-fi, Twitch, and YouTube.
- `apps/worker`: background processing entrypoint.
- `packages/database`: Prisma schema, database client, authz, alert catalog, bootstrap, Redis helpers, and storage metadata.
- `packages/shared`: shared alert event types, serialization, validation, environment helpers, and version helpers.

PostgreSQL stores users, channels, alert events, alert configs, layouts, canvas profiles, assets, credentials metadata, and deduplication keys. Redis carries live alert events to connected browser sources. Object storage or local storage holds uploaded assets.
