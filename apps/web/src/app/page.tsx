import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'GitchAlerts | Self-hosted stream alerts and overlays',
  description:
    'Connect Twitch, YouTube, and Ko-fi to create self-hosted stream alerts and browser-source overlays.',
};

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-5 py-12 max-[640px]:py-8">
      <section className="grid items-center gap-10 rounded-2xl border border-line bg-panel p-10 shadow-brand md:grid-cols-[1.3fr_0.7fr] max-[640px]:p-6">
        <div>
          <Image src="/logo.svg" alt="GitchAlerts" width={320} height={80} priority />
          <h1 className="mt-8 text-[clamp(2.4rem,7vw,5rem)] leading-[0.98] tracking-[-0.04em] text-soft-white">
            Your stream alerts. Your server. Your control.
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-muted">
            GitchAlerts is a self-hosted alert and overlay system for creators. Connect Twitch,
            YouTube, and Ko-fi, route events to custom canvases, and use those canvases as browser
            sources in OBS and other streaming tools.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link className="button no-underline" href="/signin">
              Sign in
            </Link>
            <Link className="button-secondary no-underline" href="/register">
              Register with an invite
            </Link>
          </div>
        </div>
        <div className="grid gap-3" aria-label="Product highlights">
          {[
            [
              'Connect accounts',
              'OAuth linking for Twitch and YouTube; simple webhook setup for Ko-fi.',
            ],
            [
              'Design alerts',
              'Build reusable alert layouts with your own visual and audio assets.',
            ],
            [
              'Own the workflow',
              'Keep workspace configuration and stream tools on infrastructure you control.',
            ],
          ].map(([title, body]) => (
            <div key={title} className="rounded-xl border border-line bg-panel-soft p-5">
              <h2 className="m-0 text-lg text-soft-white">{title}</h2>
              <p className="mb-0 text-sm leading-6 text-muted">{body}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="mx-auto max-w-3xl text-center">
        <h2 className="text-3xl text-soft-white">Provider access stays focused</h2>
        <p className="leading-7 text-muted">
          GitchAlerts requests only the provider permissions needed to identify the channel and
          deliver the alerts you enable. You can disconnect an account at any time. Read our{' '}
          <Link className="text-accent" href="/privacy">
            Privacy Policy
          </Link>{' '}
          and{' '}
          <Link className="text-accent" href="/terms">
            Terms &amp; Conditions
          </Link>{' '}
          for details.
        </p>
      </section>
    </main>
  );
}
