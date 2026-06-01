import { prisma } from "@multi-stream-alerts/database";
import { createRedisClient } from "@multi-stream-alerts/database";
import { parseAlertEvent, redisAlertChannel, serializeAlertEvent } from "@multi-stream-alerts/shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const displayKey = url.searchParams.get("displayKey");

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

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(": connected\n\n"));
      await redis.subscribe(redisAlertChannel);

      redis.on("message", (_channel, payload) => {
        try {
          const event = parseAlertEvent(payload);

          if (event.channelId !== profile.channelId) {
            return;
          }

          controller.enqueue(encoder.encode(`event: alert\ndata: ${serializeAlertEvent({ ...event, rawPayload: undefined })}\n\n`));
        } catch (error) {
          console.error("SSE alert parse error", error);
        }
      });
    },
    cancel() {
      redis.disconnect();
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
