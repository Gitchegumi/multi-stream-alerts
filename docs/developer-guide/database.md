# Database

Prisma models live in `packages/database/prisma/schema.prisma`.

Key models:

- `Channel`: workspace owned by a creator or team.
- `OverlayProfile`: canvas/browser-source profile with a slug, display key, active flag, and JSON settings.
- `AlertEventType`: normalized alert type catalog.
- `WorkspaceAlertConfig`: per-channel alert type enablement and layout fallback.
- `WorkspaceAlertLayout`: visual and audio configuration for alert rendering.
- `AlertEvent`: stored alert events after ingestion and routing.
- `WorkspaceAsset`: uploaded or external media metadata.
- `IntegrationCredential`: provider configuration metadata plus encrypted secret rows.

Migrations are stored under `packages/database/prisma/migrations`.
