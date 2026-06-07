'use client';

import type { AlertEvent } from '@multi-stream-alerts/shared';
import { useEffect, useRef, useState } from 'react';
import {
  renderCanvasText,
  shouldRenderAlertOnCanvas,
  type CanvasElement,
  type CanvasSettings,
} from '@/lib/canvas-schema';

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
  const settingsRef = useRef(settings);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    const source = new EventSource(
      `/api/events/stream?displayKey=${encodeURIComponent(displayKey)}`,
    );

    source.addEventListener('alert', (event) => {
      const alert = JSON.parse((event as MessageEvent).data) as AlertEvent;
      if (!shouldRenderAlertOnCanvas(settingsRef.current, alert)) {
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
    const soundAssetUrl =
      resolveCanvasAssetUrl(
        settingsRef.current.audioAssetId,
        settingsRef.current.audioAssetUrl,
        displayKey,
      ) ?? resolveOverlayAssetUrl(nextAlert.soundAssetUrl, displayKey);
    const volume =
      settingsRef.current.audioAssetId || settingsRef.current.audioAssetUrl
        ? settingsRef.current.volume
        : nextAlert.volume;
    if (soundAssetUrl && volume !== 0) {
      const audio = new Audio(soundAssetUrl);
      audio.volume = Math.max(0, Math.min(1, (volume ?? 80) / 100));
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
      nextAlert.durationMs ?? (profile === 'test' ? 3500 : settingsRef.current.defaultDurationMs),
    );
  }

  return (
    <main
      className={`overlay-stage overlay-stage-${settings.background}`}
      aria-live="polite"
      style={{ width: settings.width, height: settings.height }}
    >
      {activeAlert
        ? settings.elements
            .filter((element) => !element.hidden)
            .sort((a, b) => a.zIndex - b.zIndex)
            .map((element) => (
              <CanvasRuntimeElement
                displayKey={displayKey}
                element={element}
                alert={activeAlert}
                key={element.id}
              />
            ))
        : null}
    </main>
  );
}

function CanvasRuntimeElement({
  displayKey,
  element,
  alert,
}: {
  displayKey: string;
  element: CanvasElement;
  alert: AlertEvent;
}) {
  const style = {
    left: element.x,
    top: element.y,
    width: element.width,
    height: element.height,
    zIndex: element.zIndex,
    opacity: element.opacity,
    transform: `rotate(${element.rotation}deg)`,
    color: element.styles.color,
    background: element.styles.backgroundColor,
    borderRadius: element.styles.borderRadius,
    fontFamily: element.styles.fontFamily,
    fontSize: element.styles.fontSize,
    fontWeight: element.styles.fontWeight,
    textShadow: element.styles.textShadow,
    animationName: animationName(element.animation.in),
    animationDuration: '520ms',
  };

  if (element.type === 'alert-image') {
    const assetUrl =
      resolveCanvasAssetUrl(element.bindings.assetId, element.bindings.assetUrl, displayKey) ??
      resolveOverlayAssetUrl(alert.visualAssetUrl, displayKey);
    return (
      <div className="overlay-canvas-runtime-element" style={style}>
        <VisualAsset kind={element.bindings.assetType} url={assetUrl} />
      </div>
    );
  }

  if (element.type === 'shape') {
    return <div className="overlay-canvas-runtime-element" style={style} />;
  }

  return (
    <div className="overlay-canvas-runtime-element overlay-canvas-runtime-text" style={style}>
      {renderCanvasText(element.bindings.textTemplate ?? element.name, alert)}
    </div>
  );
}

function VisualAsset({
  kind,
  url,
}: {
  kind?: CanvasElement['bindings']['assetType'];
  url?: string;
}) {
  if (!url) return null;

  if (kind === 'video' || /\.(mp4|webm)(\?|$)/i.test(url)) {
    return <video className="overlay-runtime-asset" src={url} autoPlay loop playsInline />;
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img className="overlay-runtime-asset" alt="" src={url} />;
}

function resolveOverlayAssetUrl(url: string | undefined, displayKey: string) {
  if (!url) return undefined;
  if (!url.startsWith('/api/assets/')) return url;

  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}displayKey=${encodeURIComponent(displayKey)}`;
}

function resolveCanvasAssetUrl(
  assetId: string | undefined | null,
  assetUrl: string | undefined | null,
  displayKey: string,
) {
  if (assetId) {
    return `/api/assets/${encodeURIComponent(assetId)}/content?displayKey=${encodeURIComponent(displayKey)}`;
  }
  return resolveOverlayAssetUrl(assetUrl ?? undefined, displayKey);
}

function animationName(value: CanvasElement['animation']['in']) {
  if (value === 'pop') return 'alert-pop';
  if (value === 'slide-up') return 'alert-slide-up';
  return 'alert-fade';
}
