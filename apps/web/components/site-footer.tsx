import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="page pb-8">
      <div className="flex flex-col gap-3 border-t border-rule pt-8 text-sm text-ink-muted md:flex-row md:items-baseline md:justify-between">
        <p>
          <span className="font-serif text-base font-semibold text-ink">Verilo</span>
          <span className="mx-2" aria-hidden="true">
            ·
          </span>
          AI summaries are labelled and link to every source they use.
        </p>
        <nav aria-label="Footer" className="flex gap-5">
          <Link href="/about" className="quiet-link">
            How Verilo works
          </Link>
          <Link href="/corrections" className="quiet-link">
            Corrections
          </Link>
        </nav>
      </div>
    </footer>
  );
}
