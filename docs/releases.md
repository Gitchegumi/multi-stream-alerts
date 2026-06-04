# Release and Container Versioning

GitchAlerts uses one project release version and explicit service versions.

- Project release version: `version.json` at the repository root.
- Service versions: `version.json` under `services`.
- Git release tags: SemVer-style tags such as `v0.1.0`, `v0.1.1`, and `v0.2.0`.
- Production container tags: the project release tag, for example `v0.2.0`.
- Traceability tags: `sha-<shortsha>` for every published image.

The project release increments whenever any deployable service changes. Service
versions may increment independently when it helps explain which container
changed, but release images are still tagged with the project release.

## Published Images

Release images are published to GHCR:

```text
ghcr.io/gitchegumi/multi-stream-alerts/alerts-web:v0.1.0
ghcr.io/gitchegumi/multi-stream-alerts/alerts-ingress:v0.1.0
ghcr.io/gitchegumi/multi-stream-alerts/alerts-worker:v0.1.0
```

Each image also gets:

```text
0.1.0
sha-<shortsha>
latest
```

Use the `vX.Y.Z` tag for self-hosted production deployments. `latest` is only a
convenience tag.

Images include OCI labels for `org.opencontainers.image.version`,
`org.opencontainers.image.revision`, `org.opencontainers.image.source`,
`org.opencontainers.image.title`, and `org.opencontainers.image.description`.

## Release Steps

1. Update `version.json` with the next project release and any service version
   changes.
2. Update `package.json` and affected workspace package versions when the
   release should also be reflected in package metadata.
3. Add release notes or changelog text summarizing user-facing changes, upgrade
   notes, and operational risk.
4. Commit the version and release-note changes.
5. Create and push a signed or annotated Git tag:

```bash
git tag -a v0.2.0 -m "Release v0.2.0"
git push origin v0.2.0
```

6. Confirm the `Publish containers` workflow builds all service images.
7. Publish a GitHub release from the tag and paste the release notes.
8. Update self-hosted deployments by setting `GITCHALERTS_VERSION=v0.2.0` and
   pulling the new Compose images.

## Dashboard Update Checks

The dashboard displays the deployed project release, short commit SHA, and
service versions. It checks the public GitHub latest-release endpoint by default
and caches the result for one hour.

```env
UPDATE_CHECK_ENABLED=true
UPDATE_CHECK_REPO=Gitchegumi/multi-stream-alerts
```

Set `UPDATE_CHECK_ENABLED=false` for offline or private deployments. Failed
checks are shown as unknown and do not block dashboard loading.
