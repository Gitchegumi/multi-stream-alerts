# Environment Variables

Important variables include:

- `DATABASE_URL`: PostgreSQL connection string.
- `REDIS_URL`: Redis connection string.
- `NEXTAUTH_SECRET`: NextAuth signing secret.
- `NEXTAUTH_URL`: canonical dashboard URL for auth callbacks.
- `PUBLIC_BASE_URL`: public URL used when generating browser-source links.
- `NEXT_PUBLIC_DOCS_URL`: optional documentation URL shown in dashboard navigation.
- `DEFAULT_CHANNEL_SLUG`: bootstrap channel slug.
- `DEFAULT_CHANNEL_NAME`: bootstrap channel display name.
- `INITIAL_DISPLAY_KEY`: initial display key for the default main canvas.
- `INSTANCE_ENCRYPTION_KEY`: base64 encryption key for stored provider secrets.

Provider-specific variables and credentials should be configured through Settings where possible.
