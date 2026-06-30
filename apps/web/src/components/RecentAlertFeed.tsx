import type { AlertEvent, AlertPlatform, AlertType } from '@multi-stream-alerts/shared';
import { UserLocalTime } from './UserLocalTime';

export function RecentAlertFeed({ events }: { events: AlertEvent[] }) {
  if (events.length === 0) {
    return <p className="muted">No alerts have been received yet.</p>;
  }

  return events.map((event) => (
    <div className="event-row recent-alert-row" key={event.id}>
      <div className="recent-alert-meta">
        <span className={`event-pill platform-pill platform-pill-${event.platform}`}>
          {platformLabel(event.platform)}
        </span>
        <span className={`event-pill action-pill action-pill-${event.type}`}>
          {actionLabel(event.type)}
        </span>
        <strong className="recent-alert-name">from {event.displayName}</strong>
      </div>
      <span className="muted">
        <UserLocalTime value={event.createdAt} />
      </span>
    </div>
  ));
}

function platformLabel(platform: AlertPlatform) {
  const labels: Record<AlertPlatform, string> = {
    generic: 'Generic',
    kofi: 'Ko-fi',
    manual: 'Manual',
    tiktok: 'TikTok',
    twitch: 'Twitch',
    youtube: 'YouTube',
  };
  return labels[platform];
}

function actionLabel(type: AlertType) {
  const labels: Record<AlertType, string> = {
    tip: 'Tip',
    follow: 'Follow',
    subscription: 'Subscribe',
    resubscription: 'Resubscribe',
    membership: 'Member',
    superchat: 'Superchat',
    supersticker: 'Super Sticker',
    raid: 'Raid',
    cheer: 'Cheer',
    gift: 'Gift',
    shop_order: 'Shop Order',
    commission: 'Commission',
    channel_point: 'Channel Point',
    stream_online: 'Online',
    stream_offline: 'Offline',
    test: 'Test',
    widget_event: 'Widget',
    external_purchase: 'Purchase',
    hypechat: 'Hypechat',
    charity_donation: 'Charity',
    redemption: 'Redemption',
  };
  return labels[type];
}
