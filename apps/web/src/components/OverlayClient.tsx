"use client";

import { overlayMessage, type AlertEvent } from "@multi-stream-alerts/shared";
import { useEffect, useRef, useState } from "react";

export function OverlayClient({ displayKey, profile }: { displayKey: string; profile: string }) {
  const [activeAlert, setActiveAlert] = useState<AlertEvent | null>(null);
  const queueRef = useRef<AlertEvent[]>([]);
  const activeRef = useRef(false);

  useEffect(() => {
    const source = new EventSource(`/api/events/stream?displayKey=${encodeURIComponent(displayKey)}`);

    source.addEventListener("alert", (event) => {
      queueRef.current.push(JSON.parse((event as MessageEvent).data) as AlertEvent);
      drainQueue();
    });

    source.onerror = () => {
      source.close();
    };

    return () => source.close();
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

    window.setTimeout(() => {
      setActiveAlert(null);
      activeRef.current = false;
      drainQueue();
    }, profile === "test" ? 3500 : 6500);
  }

  return (
    <main className="overlay-stage" aria-live="polite">
      {activeAlert ? (
        <section className="alert-card">
          <h1 className="alert-title">{activeAlert.displayName}</h1>
          <p className="alert-message">{overlayMessage(activeAlert)}</p>
        </section>
      ) : null}
    </main>
  );
}
