"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";
import { quickSearch, type QuickResult } from "@/app/search/actions";
import { ago } from "@/lib/sources";
import { useReady } from "@/lib/use-ready";

// The masthead's search: a magnifier at the left of the top bar that opens a box across the top
// of the page (also with "/"). Stories that match appear under it as the reader types; Enter opens
// the one chosen, or every result at /search. Before the page's script has run, the magnifier is
// a plain link to /search.

const PAUSE_MS = 220;

function SearchIcon({ className }: { className: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
    >
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2" />
    </svg>
  );
}

export function SearchBar() {
  const ready = useReady();
  const router = useRouter();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<QuickResult[] | null>(null);
  const [searched, setSearched] = useState("");
  const [answeredAt, setAnsweredAt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(-1);
  const [, startTransition] = useTransition();
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLAnchorElement>(null);
  const asked = useRef(0);

  const close = useCallback((refocus = true) => {
    setOpen(false);
    setActive(-1);
    if (refocus) requestAnimationFrame(() => trigger.current?.focus());
  }, []);

  // "/" opens it from anywhere that isn't a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      setOpen(true);
    };
    // Back and forward close it, like any other way of leaving the page.
    const onPop = () => setOpen(false);
    document.addEventListener("keydown", onKey);
    window.addEventListener("popstate", onPop);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("popstate", onPop);
    };
  }, []);

  // Open: the field takes focus; a click outside closes.
  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    input.current?.select();
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open, close]);

  // Ask after a short pause in typing; only the latest answer is shown.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const id = ++asked.current;
    const timer = setTimeout(() => {
      setBusy(true);
      startTransition(async () => {
        const found = await quickSearch(q);
        if (id !== asked.current) return;
        setBusy(false);
        setResults(found);
        setSearched(q);
        setAnsweredAt(Date.now());
        setActive(-1);
      });
    }, PAUSE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const q = query.trim();
  const shown = q.length >= 2 && searched === q ? (results ?? []) : [];
  const allHref = `/search?q=${encodeURIComponent(q)}`;
  // The options: each story, then "All results".
  const count = q.length >= 2 ? shown.length + 1 : 0;
  const go = (href: string) => {
    close(false);
    router.push(href);
  };
  const optionId = (i: number) => `${listId}-${i}`;

  if (!open) {
    return (
      <Link
        ref={trigger}
        href="/search"
        aria-label="Search"
        title="Search (/)"
        aria-expanded={false}
        data-ready={ready}
        className="quiet-link inline-flex size-11 items-center justify-center"
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
          e.preventDefault();
          setOpen(true);
        }}
      >
        <SearchIcon className="size-[1.5rem]" />
      </Link>
    );
  }

  return (
    <div ref={box} className="absolute -inset-x-2 top-0 z-30 bg-paper px-2 pb-2">
      <form
        role="search"
        action="/search"
        className="flex min-h-11 items-center gap-2 border-b border-ink"
        onSubmit={(e) => {
          e.preventDefault();
          if (active >= 0 && active < shown.length) go(`/story/${shown[active].id}`);
          else if (q) go(allHref);
        }}
      >
        <span className="inline-flex size-11 shrink-0 items-center justify-center text-ink-muted">
          <SearchIcon className="size-[1.5rem]" />
        </span>
        <label htmlFor={`${listId}-q`} className="sr-only">
          Search stories
        </label>
        <input
          ref={input}
          id={`${listId}-q`}
          name="q"
          type="search"
          role="combobox"
          aria-expanded={count > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? optionId(active) : undefined}
          autoComplete="off"
          spellCheck={false}
          maxLength={200}
          placeholder="Search stories: a name, a place, an event…"
          className="min-w-0 flex-1 bg-transparent py-2 font-serif text-lg text-ink outline-none placeholder:text-ink-muted md:text-xl [&::-webkit-search-cancel-button]:hidden"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              close();
            } else if (e.key === "ArrowDown" && count) {
              e.preventDefault();
              setActive((a) => (a + 1) % count);
            } else if (e.key === "ArrowUp" && count) {
              e.preventDefault();
              setActive((a) => (a <= 0 ? count - 1 : a - 1));
            }
          }}
        />
        <button
          type="button"
          aria-label="Close search"
          title="Close (Esc)"
          className="inline-flex size-11 shrink-0 items-center justify-center text-ink-muted hover:text-ink"
          onClick={() => close()}
        >
          <svg
            aria-hidden="true"
            focusable="false"
            viewBox="0 0 24 24"
            className="size-[1.25rem]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          >
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </form>

      {q.length >= 2 ? (
        <div className="border-b border-rule bg-paper-raised">
          <p className="sr-only" role="status">
            {busy
              ? "Searching"
              : searched === q
                ? `${shown.length} ${shown.length === 1 ? "story" : "stories"}`
                : ""}
          </p>
          <ul id={listId} role="listbox" aria-label="Matching stories">
            {shown.map((r, i) => (
              <li
                key={r.id}
                id={optionId(i)}
                role="option"
                aria-selected={active === i}
                className={`cursor-pointer border-t border-rule px-3 py-3 first:border-t-0 md:px-11 ${active === i ? "bg-paper" : ""}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(`/story/${r.id}`)}
              >
                <span
                  className={`block font-serif leading-snug ${active === i ? "underline" : ""}`}
                >
                  {r.title}
                </span>
                <span className="meta block">
                  {r.outletCount} {r.outletCount === 1 ? "outlet" : "outlets"} · updated{" "}
                  {ago(r.lastPublishedAt, answeredAt)}
                </span>
              </li>
            ))}
            <li
              id={optionId(shown.length)}
              role="option"
              aria-selected={active === shown.length}
              className={`cursor-pointer border-t border-rule px-3 py-3 text-sm md:px-11 ${active === shown.length ? "bg-paper" : ""} ${shown.length ? "" : "border-t-0"}`}
              onMouseEnter={() => setActive(shown.length)}
              onClick={() => go(allHref)}
            >
              {searched === q && !busy && !shown.length ? (
                <span className="text-ink-muted">
                  No stories for “{q}” yet. Try fewer or other words.{" "}
                </span>
              ) : null}
              <span className="underline">All results for “{q}”</span>
            </li>
          </ul>
        </div>
      ) : null}
    </div>
  );
}
