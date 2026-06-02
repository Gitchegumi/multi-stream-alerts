# Semgrep custom rules (placeholder)

This directory is reserved for future repo-specific Semgrep rules. The
generic `p/typescript`, `p/javascript`, and `p/owasp-top-ten` rules are
run in CI from the public registry; this directory is not yet wired into
the scan.

When the auth/webhook helper function names have stabilized, custom rules
can be added here and wired into `.github/workflows/semgrep.yml` via
`--config semgrep-rules/`. Candidate future rules:

- Prevent logging secrets, tokens, or display keys
- Require webhook signature verification helpers in webhook routes
- Require dashboard/admin auth helpers in protected routes
