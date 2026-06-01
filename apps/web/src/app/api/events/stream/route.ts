import { prisma } from "@multi-stream-alerts/database";
import { createRedisClient } from "@multi-stream-alerts/database";
import { parseAlertEvent, redisAlertChannel, serializeAlertEvent } from "@multi-stream-alerts/shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const rateLimitWindowMs = 60_000;
const maxAttemptsPerWindow = 30;
const streamRateLimits = new Map<string, { count: number; resetAt: number }>();

export async function GET(request: Request) {
  const url = new URL(request.url);
  const displayKey = url.searchParams.get("displayKey");
  const clientIp = getClientIp(request);

  if (isRateLimited(clientIp)) {
    return new Response("Too many stream attempts", { status: 429 });
  }

  if (!displayKey) {
    return new Response("Missing displayKey", { status: 401 });
  }

  const profile = await prisma.overlayProfile.findUnique({
    where: { displayKey },
    include: { channel: true }
  });

  if (!profile?.isActive) {
    return new Response("Invalid displayKey", { status: 403 });
  }

  const encoder = new TextEncoder();
  const redis = createRedisClient();
  let closed = false;

  const cleanup = () => {
    if (closed) {
      return;
    }

    closed = true;
    request.signal.removeEventListener("abort", cleanup);
    redis.disconnect();
  };

  const stream = new ReadableStream({
    async start(controller) {
      const fail = (error: unknown) => {
        cleanup();
        controller.error(error);
      };

      request.signal.addEventListener("abort", cleanup, { once: true });
      redis.on("error", fail);

      redis.on("message", (_channel, payload) => {
        try {
          if (closed) {
            return;
          }

          const event = parseAlertEvent(payload);

          if (event.channelId !== profile.channelId) {
            return;
          }

          controller.enqueue(encoder.encode(`event: alert\ndata: ${serializeAlertEvent({ ...event, rawPayload: undefined })}\n\n`));
        } catch (error) {
          console.error("SSE alert parse error", error);
          cleanup();
          controller.error(error);
        }
      });

      try {
        controller.enqueue(encoder.encode(": connected\n\n"));
        await redis.subscribe(redisAlertChannel);
      } catch (error) {
        fail(error);
      }
    },
    cancel() {
      cleanup();
    }
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no"
    }
  });
}

function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || request.headers.get("x-real-ip") || "unknown";
}

function isRateLimited(clientIp: string) {
  const now = Date.now();
  const existing = streamRateLimits.get(clientIp);

  if (!existing || existing.resetAt <= now) {
    streamRateLimits.set(clientIp, { count: 1, resetAt: now + rateLimitWindowMs });
    cleanupExpiredRateLimits(now);
    return false;
  }

  existing.count += 1;
  return existing.count > maxAttemptsPerWindow;
}

function cleanupExpiredRateLimits(now: number) {
  for (const [clientIp, limit] of streamRateLimits) {
    if (limit.resetAt <= now) {
      streamRateLimits.delete(clientIp);
    }
  }
}
