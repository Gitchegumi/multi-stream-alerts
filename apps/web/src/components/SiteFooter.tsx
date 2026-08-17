import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-[rgba(24,25,29,0.88)] px-5 py-5 text-sm text-muted">
      <div className="mx-auto flex max-w-[1920px] flex-wrap items-center justify-between gap-3">
        <span>© {new Date().getFullYear()} GitchAlerts</span>
        <nav className="flex items-center gap-5" aria-label="Legal">
          <Link className="hover:text-accent" href="/privacy">
            Privacy Policy
          </Link>
          <Link className="hover:text-accent" href="/terms">
            Terms &amp; Conditions
          </Link>
        </nav>
      </div>
    </footer>
  );
}
