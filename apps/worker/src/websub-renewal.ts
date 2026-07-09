/**
 * YouTube WebSub lease renewal (issue #128).
 *
 * Google's PubSubHubbub hub grants a bounded lease (~5 days) on each
 * subscription. Without renewal, YouTube alerts silently stop when the lease
 * lapses. This module periodically finds subscriptions nearing expiry and
 * re-subscribes them (a repeat `hub.mode=subscribe` extends the lease).
 *
 * The core `runYoutubeWebSubRenewal` is pure w.r.t. its dependencies so it is
 * unit-testable; `startYoutubeWebSubRenewal` wires it to a timer for the
 * long-running worker process.
 */

import {
  findExpiringYoutubeSubscriptions,
  provisionYoutubeWebSub,
} from '@multi-stream-alerts/database';

export interface RenewalDeps {
  findExpiring?: typeof findExpiringYoutubeSubscriptions;
  provision?: typeof provisionYoutubeWebSub;
  now?: () => number;
}

export interface RenewalSummary {
  renewed: number;
  failed: number;
}

/**
 * Run a single renewal sweep: re-subscribe every YouTube WebSub subscription
 * whose lease expires within `leadMs`. Never throws — individual failures are
 * counted and logged so one bad channel can't stall the sweep.
 */
export async function runYoutubeWebSubRenewal(
  leadMs: number,
  deps: RenewalDeps = {},
): Promise<RenewalSummary> {
  const findExpiring = deps.findExpiring ?? findExpiringYoutubeSubscriptions;
  const provision = deps.provision ?? provisionYoutubeWebSub;
  const now = deps.now ?? Date.now;

  const due = await findExpiring(leadMs, now);
  const summary: RenewalSummary = { renewed: 0, failed: 0 };

  for (const sub of due) {
    try {
      const result = await provision(sub);
      if (result.ok) {
        summary.renewed += 1;
      } else {
        summary.failed += 1;
      }
    } catch (err) {
      summary.failed += 1;
      console.warn('youtube websub renewal failed', {
        channelId: sub.channelId,
        reason: err instanceof Error ? err.message : 'unknown_error',
      });
    }
  }

  if (due.length > 0) {
    console.info('youtube websub renewal sweep', {
      due: due.length,
      renewed: summary.renewed,
      failed: summary.failed,
    });
  }

  return summary;
}

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000; // hourly sweep
const DEFAULT_LEAD_MS = 24 * 60 * 60 * 1000; // renew within 1 day of expiry

/**
 * Read renewal timing from the environment, with sane defaults.
 * - `YOUTUBE_WEBSUB_RENEWAL_INTERVAL_MS`: how often to sweep.
 * - `YOUTUBE_WEBSUB_RENEWAL_LEAD_MS`: how far ahead of expiry to renew.
 */
export function readRenewalConfig(env: NodeJS.ProcessEnv = process.env): {
  intervalMs: number;
  leadMs: number;
} {
  const intervalMs = positiveInt(env.YOUTUBE_WEBSUB_RENEWAL_INTERVAL_MS, DEFAULT_INTERVAL_MS);
  const leadMs = positiveInt(env.YOUTUBE_WEBSUB_RENEWAL_LEAD_MS, DEFAULT_LEAD_MS);
  return { intervalMs, leadMs };
}

/**
 * Start the periodic renewal timer. Returns the interval handle (unref'd so it
 * never keeps the process alive on its own). Runs an immediate sweep first.
 */
export function startYoutubeWebSubRenewal(
  env: NodeJS.ProcessEnv = process.env,
  deps: RenewalDeps = {},
): NodeJS.Timeout {
  const { intervalMs, leadMs } = readRenewalConfig(env);

  const sweep = () => {
    runYoutubeWebSubRenewal(leadMs, deps).catch((err) => {
      console.error('youtube websub renewal sweep errored', {
        reason: err instanceof Error ? err.message : 'unknown_error',
      });
    });
  };

  sweep();
  const handle = setInterval(sweep, intervalMs);
  handle.unref?.();
  return handle;
}

function positiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
