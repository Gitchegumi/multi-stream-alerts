/**
 * Lightweight in-memory rate limiter.
 *
 * Uses a sliding window with per-key counters. No external dependencies
 * (Redis, etc.) so it works in edgeless node containers and local dev.
 *
 * Caveat: memory is shared per process. In a multi-process / container
 * deployment requests can be handled by different workers, so a truly
 * determined actor could bypass limits by spreading across processes.
 * For this project's scale a single Next.js node process or a small
 * replica count is the expected deployment shape, so in-memory is fine.
 */

export interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export class MemoryRateLimiter {
  private store = new Map<string, RateLimitEntry>();

  constructor(
    private maxAttempts: number,
    private windowMs: number
  ) {}

  /**
   * Records an attempt for the given key and returns whether the key
   * is currently over the limit. Also returns the remaining attempts
   * and the number of seconds until the window resets.
   */
  attempt(key: string): { limited: boolean; remaining: number; retryAfterSeconds: number } {
    const now = Date.now();
    const existing = this.store.get(key);

    if (!existing || existing.resetAt <= now) {
      // New window
      const resetAt = now + this.windowMs;
      this.store.set(key, { count: 1, resetAt });
      this.cleanup(now);
      return { limited: false, remaining: this.maxAttempts - 1, retryAfterSeconds: Math.ceil(this.windowMs / 1000) };
    }

    existing.count += 1;
    const limited = existing.count > this.maxAttempts;
    const remaining = Math.max(0, this.maxAttempts - existing.count);
    const retryAfterSeconds = Math.ceil((existing.resetAt - now) / 1000);

    return { limited, remaining, retryAfterSeconds };
  }

  /**
   * Reset a key (e.g. on successful action).
   */
  reset(key: string) {
    this.store.delete(key);
  }

  private cleanup(now: number) {
    for (const [key, entry] of this.store) {
      if (entry.resetAt <= now) {
        this.store.delete(key);
      }
    }
  }
}

/**
 * Extract the best-effort client IP from a Request.
 */
export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || request.headers.get("x-real-ip") || "unknown";
}
