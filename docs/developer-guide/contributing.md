# Contributing

## Design rules

Before opening a change:

1. Keep the user-facing canvas workflow intact.
2. Preserve auth and workspace authorization checks on dashboard APIs.
3. Avoid exposing display keys, provider secrets, or encrypted ciphertext in logs or client payloads.
4. Run focused tests for changed packages.
5. Update these docs when routes, environment variables, or deployment behavior changes.

## Pull request workflow

1. Branch from `main` using a descriptive prefix, for example `feat/canvas-audio` or `fix/overlay-parity`.
2. Make focused commits using Conventional Commit messages such as `feat(web): ...`, `fix(overlays): ...`, or `docs: ...`. The scope and type drive automated release notes.
3. Run the quality checks from [Local development](local-development.md): lint, typecheck, tests, and format check.
4. Open a pull request against `main`. Keep the description focused on what changed and why, and reference the related issue.

## Releases

Releases are automated with release-please, which reads Conventional Commit history to compute the next version and update the changelog. See [Release and container versioning](../releases.md) for the maintainer process. Keep commit messages accurate because they become the public release notes.
