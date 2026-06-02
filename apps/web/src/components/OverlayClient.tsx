'use client';

import { overlayMessage, type AlertEvent } from '@multi-stream-alerts/shared';
import { useEffect, useRef, useState } from 'react';

export function OverlayClient({ displayKey, profile }: { displayKey: string; profile: string }) {
  const [activeAlert, setActiveAlert] = useState<AlertEvent | null>(null);
  const queueRef = useRef<AlertEvent[]>([]);
  const activeRef = useRef(false);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const source = new EventSource(
      `/api/events/stream?displayKey=${encodeURIComponent(displayKey)}`,
    );

    source.addEventListener('alert', (event) => {
      queueRef.current.push(JSON.parse((event as MessageEvent).data) as AlertEvent);
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
    if (nextAlert.soundAssetUrl && nextAlert.volume !== 0) {
      const audio = new Audio(nextAlert.soundAssetUrl);
      audio.volume = Math.max(0, Math.min(1, (nextAlert.volume ?? 80) / 100));
      void audio.play().catch((error) => {
        console.warn('alert sound playback failed', {
          eventId: nextAlert.id,
          soundAssetUrl: nextAlert.soundAssetUrl,
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
          {activeAlert.visualAssetUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="alert-asset" alt="" src={activeAlert.visualAssetUrl} />
          ) : null}
          <h1 className="alert-title">{activeAlert.displayName}</h1>
          <p className="alert-message">{overlayMessage(activeAlert)}</p>
        </section>
      ) : null}
    </main>
  );
}
