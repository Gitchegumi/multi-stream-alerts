import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { APP_NAME } from '@/lib/app-identity';

export const metadata: Metadata = {
  title: `${APP_NAME} | Self-hosted stream alerts and overlays`,
  description:
    'GitchAlerts connects Twitch, YouTube, and Ko-fi activity to customizable stream alerts and self-hosted browser-source overlays.',
};

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-20 px-5 py-12 max-[640px]:gap-14 max-[640px]:py-8">
      <section className="grid items-center gap-12 rounded-2xl border border-line bg-panel p-10 shadow-brand md:grid-cols-[1.15fr_0.85fr] max-[640px]:p-6">
        <div>
          <Image src="/logo.svg" alt={`${APP_NAME} logo`} width={320} height={80} priority />
          <p className="mb-2 mt-8 text-sm font-bold uppercase tracking-[0.18em] text-accent">
            Self-hosted stream alerts and overlays
          </p>
          <h1 className="mt-2 text-[clamp(2.4rem,7vw,5rem)] leading-[0.98] tracking-[-0.04em] text-soft-white">
            {APP_NAME}
          </h1>
          <p className="max-w-2xl text-2xl font-semibold leading-9 text-soft-white">
            Stream alerts that belong to you.
          </p>
          <p className="max-w-2xl text-lg leading-8 text-muted">
            {APP_NAME} gives creators one place to connect their streaming channels, choose which
            events should trigger an alert, design visual and audio alert layouts, and add those
            layouts to OBS or another streaming tool as browser sources. Each deployment runs on
            infrastructure controlled by its operator.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link className="button no-underline" href="/signin">
              Sign in
            </Link>
            <Link className="button-secondary no-underline" href="/register">
              Register with an invite
            </Link>
            <a className="button-secondary no-underline" href="#workflow">
              See how it works
            </a>
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-panel-soft p-7">
          <p className="m-0 text-sm font-bold uppercase tracking-[0.16em] text-attention">
            One connected workflow
          </p>
          <ol className="m-0 mt-6 grid list-none gap-6 p-0">
            {[
              ['01', 'Connect', 'Link Twitch and YouTube with OAuth, or add Ko-fi.'],
              ['02', 'Compose', 'Arrange text, images, video, and audio on a visual canvas.'],
              ['03', 'Go live', 'Copy the protected browser-source URL into OBS or Meld.'],
            ].map(([number, title, body]) => (
              <li key={number} className="grid grid-cols-[2.5rem_1fr] gap-3">
                <span className="font-bold text-accent">{number}</span>
                <div>
                  <h2 className="m-0 text-lg text-soft-white">{title}</h2>
                  <p className="mb-0 mt-1 text-sm leading-6 text-muted">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="workflow" aria-labelledby="workflow-title">
        <div className="mx-auto mb-8 max-w-3xl text-center">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-accent">
            Design in the browser
          </p>
          <h2 id="workflow-title" className="text-4xl text-soft-white">
            Build the alert you want viewers to remember
          </h2>
          <p className="text-lg leading-8 text-muted">
            Work on a true 1920 × 1080 canvas, layer text and media, preview event data, tune
            animation and timing, and test the result before it reaches your stream.
          </p>
        </div>
        <figure className="m-0 overflow-hidden rounded-2xl border border-line bg-panel shadow-brand">
          <Image
            className="block h-auto w-full"
            src="/screenshots/canvas-editor.png"
            alt="GitchAlerts canvas editor showing layers, a live alert preview, layout controls, and text styling"
            width={1920}
            height={820}
            sizes="(max-width: 1200px) 100vw, 1152px"
          />
          <figcaption className="border-t border-line px-6 py-4 text-sm leading-6 text-muted">
            The canvas editor keeps layers, the live composition, and detailed styling controls in
            one workspace.
          </figcaption>
        </figure>
      </section>

      <section className="grid items-center gap-10 md:grid-cols-[0.8fr_1.2fr]">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-attention">
            Bring your own creative work
          </p>
          <h2 className="text-4xl text-soft-white">Your assets, your layout, your voice</h2>
          <p className="text-lg leading-8 text-muted">
            Reuse images, animated media, sound effects, and music from the workspace asset library.
            Bind each canvas to the events that matter, then keep the browser source stable while
            the design evolves.
          </p>
        </div>
        <figure className="m-0 overflow-hidden rounded-2xl border border-line bg-panel shadow-brand">
          <Image
            className="block h-auto w-full"
            src="/screenshots/canvas-assets.png"
            alt="GitchAlerts canvas editor with the reusable audio and video asset library open"
            width={1920}
            height={820}
            sizes="(max-width: 768px) 100vw, 60vw"
          />
          <figcaption className="border-t border-line px-5 py-3 text-sm leading-6 text-muted">
            Workspace assets stay close to the canvas where they are used.
          </figcaption>
        </figure>
      </section>

      <section className="rounded-2xl border border-line bg-panel p-10 max-[640px]:p-6">
        <div className="grid gap-10 md:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-accent">
              Why self-hosted?
            </p>
            <h2 className="text-4xl text-soft-white">Because the stream is yours</h2>
          </div>
          <div className="text-lg leading-8 text-muted">
            <p className="mt-0">
              Creator tools often ask you to trade control for convenience. {APP_NAME} was built
              around a different idea: the service, credentials, assets, and alert history should
              live on infrastructure chosen by the people operating it.
            </p>
            <p>
              Self-hosting makes the system inspectable and adaptable. You decide when to upgrade,
              where data is stored, who can manage a workspace, and how the alert pipeline fits into
              the rest of your production setup. The goal is practical ownership—not isolation—so
              Twitch, YouTube, Ko-fi, OBS, and Meld still connect through the workflows creators
              already use.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl rounded-2xl border border-line bg-panel-soft p-8 max-[640px]:p-6">
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-accent">
          YouTube connection
        </p>
        <h2 className="text-3xl text-soft-white">Read-only access, explained plainly</h2>
        <p className="leading-7 text-muted">
          When you choose <strong>Connect YouTube</strong>, {APP_NAME} asks you to sign in with
          Google and grant read-only YouTube access. It uses that access to identify the YouTube
          channel you selected, show its channel title in your workspace, and subscribe to its
          public upload and live-stream feed so those events can trigger the alerts you configure.
        </p>
        <ul className="grid gap-3 pl-6 leading-7 text-muted">
          <li>{APP_NAME} does not upload, edit, or delete your YouTube videos or channel.</li>
          <li>Your connection tokens are encrypted and are not shown to other users.</li>
          <li>
            You can disconnect YouTube and end the application&apos;s use of the grant at any time.
          </li>
        </ul>
        <p className="mb-0 leading-7 text-muted">
          Read the{' '}
          <Link className="text-accent" href="/privacy">
            Privacy Policy
          </Link>{' '}
          for full details about Google user data access, storage, sharing, retention, and deletion.
          The{' '}
          <Link className="text-accent" href="/terms">
            Terms &amp; Conditions
          </Link>{' '}
          describe the rules for using this service.
        </p>
      </section>
    </main>
  );
}
