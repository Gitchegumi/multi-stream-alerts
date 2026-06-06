'use client';

import { useEffect, useState } from 'react';

export function UserLocalTime({ value }: { value: string }) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    setLabel(
      new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
      }).format(new Date(value)),
    );
  }, [value]);

  return <time dateTime={value}>{label ?? 'checking...'}</time>;
}
