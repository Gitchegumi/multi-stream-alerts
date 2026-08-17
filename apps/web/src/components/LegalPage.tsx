import type { ReactNode } from 'react';
import Link from 'next/link';

export function LegalPage({
  title,
  effectiveDate,
  children,
}: {
  title: string;
  effectiveDate: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-4xl px-5 py-12 max-[640px]:py-8">
      <Link className="text-sm text-accent hover:text-accent-strong" href="/">
        ← GitchAlerts home
      </Link>
      <article className="legal-copy mt-5 rounded-xl border border-line bg-panel p-8 shadow-brand max-[640px]:p-5">
        <header className="border-b border-line pb-5">
          <h1 className="m-0 text-[clamp(2rem,6vw,3rem)] leading-tight text-soft-white">{title}</h1>
          <p className="mb-0 text-sm text-muted">Effective and last updated: {effectiveDate}</p>
        </header>
        {children}
      </article>
    </main>
  );
}
