/**
 * Platform icon component for Twitch and YouTube.
 *
 * Uses inline SVGs to avoid extra icon library dependencies.
 */

import React from 'react';

interface PlatformIconProps {
  platform: 'twitch' | 'youtube';
  size?: number;
  className?: string;
}

const PLATFORM_COLORS = {
  twitch: '#9146FF',
  youtube: '#FF0000',
};

export function PlatformIcon({ platform, size = 24, className = '' }: PlatformIconProps) {
  const color = PLATFORM_COLORS[platform];

  if (platform === 'twitch') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={color}
        className={className}
        aria-label="Twitch"
      >
        <path d="M11.64 5.93h1.43v4.28h-1.43m3.93-4.28h1.43v4.28h-1.43M7 2L3.43 5.57V18.43H7.71V22l3.57-3.57h2.86L20.57 12V2M19.14 11.36l-2.86 2.86H12l-2.5 2.5V11.36H5.71V3.43h13.43Z" />
      </svg>
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={color}
      className={className}
      aria-label="YouTube"
    >
      <path d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.38.55A3.02 3.02 0 0 0 .5 6.19 31.5 31.5 0 0 0 0 12a31.5 31.5 0 0 0 .5 5.81 3.02 3.02 0 0 0 2.12 2.14c1.88.55 9.38.55 9.38.55s7.5 0 9.38-.55a3.02 3.02 0 0 0 2.12-2.14A31.5 31.5 0 0 0 24 12a31.5 31.5 0 0 0-.5-5.81ZM9.55 15.5V8.5l6.27 3.5-6.27 3.5Z" />
    </svg>
  );
}
