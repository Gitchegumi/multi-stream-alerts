import Redis from 'ioredis';
import {
  redisAlertChannel,
  redisOverlaySettingsChannel,
  serializeAlertEvent,
  serializeOverlaySettingsUpdate,
  type AlertEvent,
  type OverlaySettingsUpdate,
} from '@multi-stream-alerts/shared';

export function createRedisClient() {
  return new Redis(process.env.REDIS_URL ?? 'redis://alerts-redis:6379', {
    maxRetriesPerRequest: null,
  });
}

export async function publishAlertEvent(event: AlertEvent) {
  const redis = createRedisClient();

  try {
    await redis.publish(redisAlertChannel, serializeAlertEvent(event));
  } finally {
    redis.disconnect();
  }
}

export async function publishOverlaySettingsUpdate(update: OverlaySettingsUpdate) {
  const redis = createRedisClient();

  try {
    await redis.publish(redisOverlaySettingsChannel, serializeOverlaySettingsUpdate(update));
  } finally {
    redis.disconnect();
  }
}
