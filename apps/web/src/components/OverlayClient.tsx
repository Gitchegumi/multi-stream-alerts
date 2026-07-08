'use client';

import type { AlertEvent } from '@multi-stream-alerts/shared';
import { useEffect, useRef, useState } from 'react';
import {
  normalizeCanvasSettings,
  renderCanvasText,
  resolveCanvasElementAsset,
  shouldRenderAlertOnCanvas,
  type CanvasElement,
  type CanvasSettings,
  type ResolvedCanvasAsset,
} from '@/lib/canvas-schema';
import { buildAnimationStyle } from '@/lib/canvas-animation';

export function OverlayClient({
  displayKey,
  profile,
  settings: initialSettings,
}: {
  displayKey: string;
  profile: string;
  settings: CanvasSettings;
}) {
  const [activeAlert, setActiveAlert] = useState<AlertEvent | null>(null);
  const [settings, setSettings] = useState(initialSettings);
  const [scale, setScale] = useState(1);
  const queueRef = useRef<AlertEvent[]>([]);
  const activeRef = useRef(false);
  const timeoutRef = useRef<number | null>(null);
  const settingsRef = useRef(settings);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // Scale the fixed-size stage to fit the viewport while preserving aspect
  // ratio, so the browser source matches the editor composition instead of
  // clipping in windows that are not exactly the canvas size (issue #124).
  useEffect(() => {
    function updateScale() {
      if (typeof window === 'undefined') return;
      const scaleX = window.innerWidth / settings.width;
      const scaleY = window.innerHeight / settings.height;
      setScale(Math.min(scaleX, scaleY));
    }

    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, [settings.width, settings.height]);

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

    // Hot-swap the canvas layout when the editor saves, so the browser source
    // reflects edits without reloading the page (which would blank the source
    // and re-run entrance animations mid-stream).
    source.addEventListener('settings', (event) => {
      try {
        const payload: unknown = JSON.parse((event as MessageEvent).data);
        setSettings(normalizeCanvasSettings(payload).settings);
      } catch (error) {
        console.warn('overlay settings update ignored', { displayKey, error });
      }
    });

    // Let EventSource auto-reconnect on transient errors instead of permanently
    // closing the stream. Force-closing here previously left a client silently
    // disconnected — more likely with several overlays open at once — so test
    // alerts stopped arriving on that client (issue #124). The server also emits
    // periodic heartbeats to keep the connection from going idle.
    source.onerror = () => {
      if (source.readyState === EventSource.CLOSED) {
        console.warn('overlay stream closed by server; awaiting reconnect', { displayKey });
      }
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
    <div className="overlay-viewport">
      <main
        className={`overlay-stage overlay-stage-${settings.background}`}
        aria-live="polite"
        style={{
          width: settings.width,
          height: settings.height,
          transform: `scale(${scale})`,
        }}
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
    </div>
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
  const animStyle = buildAnimationStyle(element, 'in');
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
    WebkitTextStroke:
      element.styles.textStrokeWidth && element.styles.textStrokeColor
        ? `${element.styles.textStrokeWidth}px ${element.styles.textStrokeColor}`
        : undefined,
    animationName: animStyle?.animationName,
    animationDuration: animStyle?.animationDuration,
    animationDelay: animStyle?.animationDelay,
    animationFillMode: animStyle?.animationFillMode,
  };

  if (element.type === 'alert-image') {
    const resolved = resolveCanvasElementAsset(element, {
      storedAssetUrl: resolveCanvasAssetUrl(
        element.bindings.assetId,
        element.bindings.assetUrl,
        displayKey,
      ),
      eventVisualUrl: resolveOverlayAssetUrl(alert.visualAssetUrl, displayKey),
    });
    return (
      <div className="overlay-canvas-runtime-element" style={style}>
        <VisualAsset asset={resolved} />
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

function VisualAsset({ asset }: { asset: ResolvedCanvasAsset }) {
  if (!asset) return null;

  if (asset.kind === 'video') {
    return <video className="overlay-runtime-asset" src={asset.url} autoPlay loop playsInline />;
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img className="overlay-runtime-asset" alt="" src={asset.url} />;
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
