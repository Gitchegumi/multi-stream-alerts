import type { AlertEvent, AlertPlatform, AlertType } from '@multi-stream-alerts/shared';
import { UserLocalTime } from './UserLocalTime';

const eventPillClass =
  'inline-flex min-h-6 w-fit items-center rounded-full border px-2.5 py-[3px] text-xs font-extrabold leading-none';

const platformPillClasses: Record<AlertPlatform, string> = {
  twitch: 'border-[rgba(145,70,255,0.46)] bg-[rgba(145,70,255,0.2)] text-[#d9c4ff]',
  youtube: 'border-[rgba(255,0,0,0.42)] bg-[rgba(255,0,0,0.18)] text-[#ffb4b4]',
  kofi: 'border-[rgba(255,91,121,0.44)] bg-[rgba(255,91,121,0.18)] text-[#ffc0cc]',
  tiktok: 'border-[rgba(0,242,234,0.38)] bg-[rgba(0,242,234,0.14)] text-[#a8fffb]',
  manual: 'border-[rgba(204,219,220,0.34)] bg-[rgba(204,219,220,0.12)] text-platinum',
  generic: 'border-[rgba(204,219,220,0.34)] bg-[rgba(204,219,220,0.12)] text-platinum',
};

const actionPillGroups: [AlertType[], string][] = [
  [
    ['follow', 'membership', 'redemption', 'channel_point'],
    'border-[rgba(175,224,206,0.44)] bg-[rgba(175,224,206,0.16)] text-soft-white',
  ],
  [
    ['subscription', 'resubscription', 'gift', 'raid'],
    'border-[rgba(65,102,245,0.52)] bg-[rgba(65,102,245,0.2)] text-soft-white',
  ],
  [
    ['tip', 'superchat', 'supersticker', 'cheer', 'hypechat', 'charity_donation'],
    'border-[rgba(252,163,17,0.48)] bg-[rgba(252,163,17,0.18)] text-soft-white',
  ],
  [
    ['shop_order', 'commission', 'external_purchase'],
    'border-[rgba(175,224,206,0.36)] bg-[rgba(175,224,206,0.1)] text-accent',
  ],
  [
    ['test', 'widget_event', 'stream_online', 'stream_offline'],
    'border-[rgba(204,219,220,0.34)] bg-[rgba(204,219,220,0.12)] text-platinum',
  ],
];

const actionPillClasses = Object.fromEntries(
  actionPillGroups.flatMap(([types, classes]) => types.map((type) => [type, classes])),
) as Record<AlertType, string>;

export function RecentAlertFeed({ events }: { events: AlertEvent[] }) {
  if (events.length === 0) {
    return <p className="muted">No alerts have been received yet.</p>;
  }

  return events.map((event) => (
    <div className="grid gap-2 border-b border-line py-3 last:border-b-0" key={event.id}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`${eventPillClass} ${platformPillClasses[event.platform]}`}>
          {platformLabel(event.platform)}
        </span>
        <span className={`${eventPillClass} ${actionPillClasses[event.type]}`}>
          {actionLabel(event.type)}
        </span>
        <strong className="[overflow-wrap:anywhere]">from {event.displayName}</strong>
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
