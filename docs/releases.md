# Release and Container Versioning

GitchAlerts uses one repo release version and separate container/service release versions.

- Repo release version: `version.json` at the repository root under `release`.
- Service versions: `version.json` under `services`.
- Repo release tags: SemVer-style tags such as `v0.1.0`, `v0.1.1`, and `v0.2.0`.
- Service release tags: component tags such as `alerts-web-v0.1.0`, `alerts-ingress-v0.1.0`, and `alerts-worker-v0.1.0`.
- Production container tags: service release tags and, when a repo release is cut, the repo release tag.
- Traceability tags: `sha-<shortsha>` for every published image.

The repo release increments when the deployable container surface changes. That includes app code, shared package code used by containers, Docker/build files, dependency lockfiles, and deployment files that affect published images. Docs-only and other non-deployable changes should not force a repo release.

Each container also has its own service release. A change isolated to `apps/web` should bump and tag `alerts-web` without forcing unrelated service versions to move. The same model applies to `alerts-ingress` and `alerts-worker`.

## Automated Release Flow

Versioning is automated with Release Please.

After conventional commits are merged to `main`, the `Release Please` workflow opens or updates release pull requests. Release Please tracks these components:

- `gitchalerts` from the repository root, tagged as `vX.Y.Z`.
- `alerts-web` from `apps/web`, tagged as `alerts-web-vX.Y.Z`.
- `alerts-ingress` from `apps/ingress`, tagged as `alerts-ingress-vX.Y.Z`.
- `alerts-worker` from `apps/worker`, tagged as `alerts-worker-vX.Y.Z`.

Release PRs update the relevant version metadata:

- `CHANGELOG.md` for the repo release.
- service changelogs under each app directory for service releases.
- `package.json` files for the affected release component.
- `version.json` for the repo release and affected service versions.
- `.release-please-manifest.json` for Release Please state.

Use conventional commit prefixes so Release Please can calculate the next SemVer version:

- `fix:` creates a patch release.
- `feat:` creates a minor release.
- `feat!:`, `fix!:`, or a commit with `BREAKING CHANGE:` creates a major release.

When a service release PR is merged, Release Please creates that service tag. The `Publish containers` workflow detects the service tag and publishes only the matching image. For example, `alerts-web-v0.2.0` publishes `alerts-web` only.

When a repo release PR is merged, Release Please creates the repo tag. The `Publish containers` workflow detects the repo tag and publishes the full deployable image set with the repo release tag.

## GitHub Actions Token Requirement

The workflow falls back to `secrets.GITHUB_TOKEN`, but production release automation should configure a repository secret named `RELEASE_PLEASE_TOKEN` using a fine-grained PAT or GitHub App token with permission to create pull requests, tags, and releases.

This matters because workflow actions performed with the default `GITHUB_TOKEN` do not reliably trigger follow-on workflows. Using `RELEASE_PLEASE_TOKEN` lets the tag created by Release Please trigger the container publishing workflow.

## Published Images

Service release images are published to GHCR with service-specific tags:

```text
ghcr.io/gitchegumi/multi-stream-alerts/alerts-web:alerts-web-v0.1.0
ghcr.io/gitchegumi/multi-stream-alerts/alerts-ingress:alerts-ingress-v0.1.0
ghcr.io/gitchegumi/multi-stream-alerts/alerts-worker:alerts-worker-v0.1.0
```

Repo releases publish the full deployable set with the repo release tag:

```text
ghcr.io/gitchegumi/multi-stream-alerts/alerts-web:v0.1.0
ghcr.io/gitchegumi/multi-stream-alerts/alerts-ingress:v0.1.0
ghcr.io/gitchegumi/multi-stream-alerts/alerts-worker:v0.1.0
```

Each published image also gets:

```text
sha-<shortsha>
```

Repo release builds also update `latest`. Service-only release builds do not update `latest` unless a repo release tag is also created.

Use the repo `vX.Y.Z` tag for self-hosted production deployments when you want the full deployable set pinned together. Use service tags when debugging or testing a specific image.

Images include OCI labels for `org.opencontainers.image.version`, `org.opencontainers.image.revision`, `org.opencontainers.image.source`, `org.opencontainers.image.title`, `org.opencontainers.image.description`, and `org.opencontainers.image.base.name`.

## Maintainer Release Steps

1. Merge normal feature/fix PRs using conventional commit titles.
2. Let the `Release Please` workflow open or update release PRs.
3. Review the release PR changelog and version changes.
4. Merge the release PR through normal branch protection.
5. Confirm the expected tag was created:
   - repo release: `vX.Y.Z`
   - web release: `alerts-web-vX.Y.Z`
   - ingress release: `alerts-ingress-vX.Y.Z`
   - worker release: `alerts-worker-vX.Y.Z`
6. Confirm the `Publish containers` workflow built the expected image or image set.
7. Update self-hosted deployments by setting `GITCHALERTS_VERSION=vX.Y.Z` for repo releases, or by explicitly pinning a service image tag for targeted testing.

## Manual Escape Hatch

Manual version edits should be rare. Use them only when recovering from a broken release or intentionally overriding Release Please behavior. If this is necessary, update `version.json`, `.release-please-manifest.json`, and affected `package.json` files together so the dashboard, published containers, and release metadata stay consistent.

## Dashboard Update Checks

The dashboard displays the deployed repo release, short commit SHA, and service versions. It checks the public GitHub latest-release endpoint by default and caches the result for one hour.

```env
UPDATE_CHECK_ENABLED=true
UPDATE_CHECK_REPO=Gitchegumi/multi-stream-alerts
```

Set `UPDATE_CHECK_ENABLED=false` for offline or private deployments. Failed checks are shown as unknown and do not block dashboard loading.
