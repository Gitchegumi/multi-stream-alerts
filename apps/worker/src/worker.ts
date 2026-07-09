import { createRedisClient } from '@multi-stream-alerts/database';
import { parseAlertEvent, redisAlertChannel } from '@multi-stream-alerts/shared';
import { startYoutubeWebSubRenewal } from './websub-renewal';

const redis = createRedisClient();

redis.on('error', (error) => {
  console.error('worker redis error', error);
});

await redis.subscribe(redisAlertChannel);

console.log(`alerts-worker subscribed to ${redisAlertChannel}`);

// Periodically renew YouTube WebSub leases before they expire so alerts keep
// flowing without user intervention (issue #128).
const renewalTimer = startYoutubeWebSubRenewal();

redis.on('message', (_channel, payload) => {
  try {
    const event = parseAlertEvent(payload);
    console.log('normalized alert event', {
      id: event.id,
      channelId: event.channelId,
      platform: event.platform,
      type: event.type,
      rawEventId: event.rawEventId,
    });
  } catch (error) {
    console.error('failed to parse alert event', error);
  }
});

process.on('SIGTERM', () => {
  clearInterval(renewalTimer);
  redis.disconnect();
  process.exit(0);
});
