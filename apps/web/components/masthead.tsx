import Link from "next/link";
import { Suspense } from "react";
import { ThemeSwitch } from "@/components/theme-switch";
import { getReader } from "@/lib/auth";

export function Masthead() {
  return (
    <header className="page pt-4 md:pt-6">
      <div className="flex min-h-11 items-center justify-between gap-4 text-sm">
        <p className="meta hidden sm:block">English edition</p>
        <div className="ml-auto flex items-center gap-1">
          <ThemeSwitch />
          {/* Reading the session is request-time work, so it streams in without holding up the page. */}
          <Suspense fallback={<span aria-hidden="true" className="min-h-11" />}>
            <ReaderLinks />
          </Suspense>
        </div>
      </div>

      <div className="border-b-[3px] border-double border-ink pb-4 text-center md:pb-5">
        <Link
          href="/"
          className="quiet-link font-serif text-3xl font-semibold tracking-tight md:text-4xl"
        >
          Verilo
        </Link>
        <p className="meta mt-1 tracking-wide">Your front page, from sources you trust</p>
      </div>
    </header>
  );
}

async function ReaderLinks() {
  const reader = await getReader();
  return (
    <nav aria-label="Account" className="flex items-center gap-5">
      {reader ? (
        <Link href="/my-news" className="quiet-link font-semibold">
          My News
        </Link>
      ) : (
        <Link href="/sign-in" className="quiet-link font-semibold">
          Sign in
        </Link>
      )}
    </nav>
  );
}
