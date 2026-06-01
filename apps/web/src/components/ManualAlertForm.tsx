"use client";

import { useState, useTransition } from "react";

export function ManualAlertForm({ channelId }: { channelId: string }) {
  const [message, setMessage] = useState("This is a manual test alert.");
  const [isPublic, setIsPublic] = useState(true);
  const [result, setResult] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className="stack"
      onSubmit={(event) => {
        event.preventDefault();
        setResult(null);
        startTransition(async () => {
          const response = await fetch("/api/test-alert", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ channelId, message, isPublic })
          });

          setResult(response.ok ? "Test alert sent." : "Could not send test alert.");
        });
      }}
    >
      <textarea
        className="input"
        maxLength={500}
        rows={3}
        value={message}
        onChange={(event) => setMessage(event.target.value)}
      />
      <span className="muted">{message.length}/500</span>
      <label>
        <input type="checkbox" checked={isPublic} onChange={(event) => setIsPublic(event.target.checked)} /> Public
        message
      </label>
      <button className="button" type="submit" disabled={isPending}>
        {isPending ? "Sending..." : "Send test alert"}
      </button>
      {result ? <p className="muted">{result}</p> : null}
    </form>
  );
}
