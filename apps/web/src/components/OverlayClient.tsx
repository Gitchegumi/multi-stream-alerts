'use client';

import { overlayMessage, type AlertEvent } from '@multi-stream-alerts/shared';
import { useEffect, useRef, useState } from 'react';

type CanvasSettings = {
  alertEventKeys: string[];
};

export function OverlayClient({
  displayKey,
  profile,
  settings,
}: {
  displayKey: string;
  profile: string;
  settings: CanvasSettings;
}) {
  const [activeAlert, setActiveAlert] = useState<AlertEvent | null>(null);
  const queueRef = useRef<AlertEvent[]>([]);
  const activeRef = useRef(false);
  const timeoutRef = useRef<number | null>(null);
  const assignedKeysRef = useRef(new Set(settings.alertEventKeys));

  useEffect(() => {
    assignedKeysRef.current = new Set(settings.alertEventKeys);
  }, [settings.alertEventKeys]);

  useEffect(() => {
    const source = new EventSource(
      `/api/events/stream?displayKey=${encodeURIComponent(displayKey)}`,
    );

    source.addEventListener('alert', (event) => {
      const alert = JSON.parse((event as MessageEvent).data) as AlertEvent;
      const assignedKeys = assignedKeysRef.current;
      if (assignedKeys.size > 0 && (!alert.eventKey || !assignedKeys.has(alert.eventKey))) {
        return;
      }

      queueRef.current.push(alert);
      drainQueue();
    });

    source.onerror = () => {
      source.close();
    };

    return () => {
      source.close();
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, [displayKey]);

  function drainQueue() {
    if (activeRef.current) {
      return;
    }

    const nextAlert = queueRef.current.shift();
    if (!nextAlert) {
      return;
    }

    activeRef.current = true;
    setActiveAlert(nextAlert);
    const soundAssetUrl = resolveOverlayAssetUrl(nextAlert.soundAssetUrl, displayKey);
    if (soundAssetUrl && nextAlert.volume !== 0) {
      const audio = new Audio(soundAssetUrl);
      audio.volume = Math.max(0, Math.min(1, (nextAlert.volume ?? 80) / 100));
      void audio.play().catch((error) => {
        console.warn('alert sound playback failed', {
          eventId: nextAlert.id,
          soundAssetUrl,
          error,
        });
      });
    }

    timeoutRef.current = window.setTimeout(
      () => {
        setActiveAlert(null);
        activeRef.current = false;
        drainQueue();
      },
      nextAlert.durationMs ?? (profile === 'test' ? 3500 : 6500),
    );
  }

  return (
    <main className="overlay-stage" aria-live="polite">
      {activeAlert ? (
        <section className={`alert-card alert-card-${activeAlert.layoutStyle ?? 'vertical'}`}>
          <VisualAsset url={resolveOverlayAssetUrl(activeAlert.visualAssetUrl, displayKey)} />
          <h1 className="alert-title">{activeAlert.displayName}</h1>
          <p className="alert-message">{overlayMessage(activeAlert)}</p>
        </section>
      ) : null}
    </main>
  );
}

function VisualAsset({ url }: { url?: string }) {
  if (!url) return null;

  if (/\.(mp4|webm)(\?|$)/i.test(url)) {
    return <video className="alert-asset" src={url} autoPlay muted loop playsInline />;
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img className="alert-asset" alt="" src={url} />;
}

function resolveOverlayAssetUrl(url: string | undefined, displayKey: string) {
  if (!url) return undefined;
  if (!url.startsWith('/api/assets/')) return url;

  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}displayKey=${encodeURIComponent(displayKey)}`;
}
