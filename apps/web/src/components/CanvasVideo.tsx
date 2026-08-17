'use client';

import { useEffect, useRef } from 'react';

/**
 * Plays canvas video with its configured audio. If browser autoplay policy
 * rejects audible playback, it immediately retries muted so the visual still
 * appears, then restores audio on the viewer's next interaction.
 */
export function CanvasVideo({
  src,
  muted,
  volume,
  className,
}: {
  src: string;
  muted: boolean;
  volume: number;
  className: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const desiredVolume = Math.max(0, Math.min(1, volume / 100));
    video.volume = desiredVolume;
    video.muted = muted;
    let awaitingUnlock = false;

    const unlockAudio = () => {
      if (!awaitingUnlock || muted) return;
      video.muted = false;
      video.volume = desiredVolume;
      void video.play().catch(() => undefined);
      awaitingUnlock = false;
    };

    const play = video.play();
    if (play) {
      void play.catch(() => {
        if (muted) return;
        awaitingUnlock = true;
        video.muted = true;
        void video.play().catch(() => undefined);
      });
    }

    window.addEventListener('pointerdown', unlockAudio);
    window.addEventListener('keydown', unlockAudio);
    return () => {
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  }, [muted, src, volume]);

  return (
    <video ref={videoRef} className={className} src={src} autoPlay loop playsInline muted={muted} />
  );
}
