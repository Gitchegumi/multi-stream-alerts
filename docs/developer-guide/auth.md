# Auth

The web app uses NextAuth for dashboard sessions. Route handlers that manage workspace state require a dashboard session and then call database authorization helpers such as `canViewChannel`, `canManageChannel`, or `canManageChannelCredentials`.

Browser-source overlay URLs do not require dashboard auth. They are authorized by the canvas display key and active status.
