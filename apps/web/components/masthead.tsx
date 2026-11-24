import Link from "next/link";
import { Suspense } from "react";
import { ThemeSwitch } from "@/components/theme-switch";
import { NavList, SectionsFrame, TopicNav, type NavItem } from "@/components/topic-nav";
import { getReader } from "@/lib/auth";
import { menuTopics } from "@/lib/menu";
import { topics } from "@/lib/news";
import { loadPreferences } from "@/lib/reader-preferences";

export function Masthead() {
  return (
    <header className="page pt-4 md:pt-6">
      <div className="flex min-h-11 items-center justify-end gap-4 text-sm">
        <div className="flex items-center gap-1">
          <Link
            href="/search"
            aria-label="Search"
            title="Search"
            className="quiet-link inline-flex size-11 items-center justify-center"
          >
            <svg
              aria-hidden="true"
              focusable="false"
              viewBox="0 0 24 24"
              className="size-[1.1rem]"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            >
              <circle cx="11" cy="11" r="6.5" />
              <path d="m20 20-4.2-4.2" />
            </svg>
          </Link>
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
        {/* The motto, in capitals by style so screen readers say it as words. */}
        <p lang="la" className="meta mt-1 tracking-[0.25em] uppercase">
          Lux veritatis
        </p>
      </div>
      <Sections />
    </header>
  );
}

// The topic list is cached (it changes rarely), so the default menu is part of the static shell.
// A signed-in reader's own menu (lib/menu.ts) and the current section stream in; the fallback is
// the default menu unmarked.
async function Sections() {
  const all = await topics();
  const items = navItems(menuTopics(all));
  return (
    <Suspense
      fallback={
        <SectionsFrame>
          <NavList items={items} active={null} />
        </SectionsFrame>
      }
    >
      <ReaderSections defaults={items} />
    </Suspense>
  );
}

function navItems(list: { slug: string; name: string }[]): NavItem[] {
  return [
    { href: "/", label: "Top stories" },
    ...list.map((t) => ({ href: `/topic/${t.slug}`, label: t.name })),
  ];
}

async function ReaderSections({ defaults }: { defaults: NavItem[] }) {
  const reader = await getReader();
  if (!reader) return <TopicNav items={defaults} />;
  const [saved, all] = await Promise.all([loadPreferences(reader.id), topics()]);
  return <TopicNav items={navItems(menuTopics(all, saved.input.followTopics, saved.menu))} />;
}

async function ReaderLinks() {
  const reader = await getReader();
  return (
    <nav aria-label="Account" className="flex items-center gap-5">
      {reader?.isEditor ? (
        <Link href="/desk" className="quiet-link">
          Desk
        </Link>
      ) : null}
      {reader ? (
        // A quiet cog: settings are where the front page, the menu and the briefing are chosen.
        <Link
          href="/my-news"
          aria-label="Settings"
          title="Settings"
          className="quiet-link inline-flex size-11 items-center justify-center"
        >
          <svg
            aria-hidden="true"
            focusable="false"
            viewBox="0 0 24 24"
            className="size-[1.15rem]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
          </svg>
        </Link>
      ) : (
        <Link href="/sign-in" className="quiet-link font-semibold">
          Sign in
        </Link>
      )}
    </nav>
  );
}
