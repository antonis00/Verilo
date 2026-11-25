import Link from "next/link";
import { Suspense } from "react";
import { PreferencesLink } from "@/components/preferences-link";
import { SearchBar } from "@/components/search-bar";
import { ThemeSwitch } from "@/components/theme-switch";
import { NavList, SectionsFrame, TopicNav, type NavItem } from "@/components/topic-nav";
import { getReader } from "@/lib/auth";
import { menuTopics } from "@/lib/menu";
import { topics } from "@/lib/news";
import { loadPreferences } from "@/lib/reader-preferences";

export function Masthead() {
  return (
    <header className="page pt-4 md:pt-6">
      {/* The top bar: search on the left (it opens across the bar), theme and account on the right. */}
      <div className="relative flex min-h-11 items-center justify-between gap-4 text-sm">
        <SearchBar />
        <div className="flex items-center gap-1">
          <ThemeSwitch />
          {/* Reading the session is request-time work, so it streams in without holding up the page. */}
          <Suspense fallback={<span aria-hidden="true" className="min-h-11" />}>
            <ReaderLinks />
          </Suspense>
        </div>
      </div>

      <div className="mt-3 border-b-[3px] border-double border-ink pb-4 text-center md:pb-5">
        <Link
          href="/"
          className="peer quiet-link font-serif text-3xl font-semibold tracking-tight md:text-4xl"
        >
          Verilo
        </Link>
        {/* What Verilo is; pointing at the name (or focusing it) shows the motto in its place.
            Both share one grid cell, so the line doesn't jump. Capitals are by style, so screen
            readers say the words. */}
        <p className="meta mt-1 grid">
          <span className="col-start-1 row-start-1 transition-opacity duration-300 motion-reduce:transition-none [.peer:hover~p_&]:opacity-0 [.peer:focus-visible~p_&]:opacity-0">
            Your news. Verified. Zero distractions.
          </span>
          <span
            lang="la"
            aria-hidden="true"
            className="col-start-1 row-start-1 tracking-[0.25em] uppercase opacity-0 transition-opacity duration-300 motion-reduce:transition-none [.peer:focus-visible~p_&]:opacity-100 [.peer:hover~p_&]:opacity-100"
          >
            Lux veritatis
          </span>
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
  return (
    <TopicNav items={navItems(menuTopics(all, saved.input.followTopics, saved.input.muteTopics))} />
  );
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
        <PreferencesLink />
      ) : (
        <Link href="/sign-in" className="quiet-link font-semibold">
          Sign in
        </Link>
      )}
    </nav>
  );
}
