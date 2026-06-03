// scripts/gitleaks-staged.mjs
import { spawnSync } from "node:child_process";

const result = spawnSync(
  "gitleaks",
  ["protect", "--staged", "--redact", "--no-banner"],
  {
    stdio: "inherit",
    shell: true,
  }
);

if (result.error) {
  console.log("gitleaks not installed; skipping staged scan. CI catches this.");
  process.exit(0);
}

process.exit(result.status ?? 1);