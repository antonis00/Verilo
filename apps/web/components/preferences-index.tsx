"use client";

import { useEffect, useState } from "react";

// The contents of the preferences page. On wide screens a column that stays in view, marking the
// section being read; on a phone a row of links under the title that scrolls sideways.

export const SETTINGS_SECTIONS = [
  { id: "settings-topics", label: "Topics" },
  { id: "settings-places", label: "Places" },
  { id: "settings-outlets", label: "Outlets" },
  { id: "settings-show", label: "What shows" },
  { id: "briefing", label: "Daily briefing" },
  { id: "own-sources", label: "Your own sources" },
  { id: "your-data", label: "Your data" },
] as const;

export function SettingsIndex() {
  const [current, setCurrent] = useState<string>(SETTINGS_SECTIONS[0].id);

  // The section whose top most recently passed the upper third of the window.
  useEffect(() => {
    // Looked up each time: the index shows at once, the sections stream in after it.
    const update = () => {
      const sections = SETTINGS_SECTIONS.map((s) => document.getElementById(s.id)).filter(
        (el): el is HTMLElement => el !== null,
      );
      if (!sections.length) return;
      const line = window.innerHeight / 3;
      let seen = sections[0].id;
      for (const el of sections) if (el.getBoundingClientRect().top <= line) seen = el.id;
      // At the very bottom the last section can't reach the line: it's the one being read.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
        seen = sections[sections.length - 1].id;
      }
      setCurrent(seen);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <nav aria-label="Preferences sections" className="lg:sticky lg:top-8">
      <p className="kicker hidden lg:block">On this page</p>
      <ul className="-mx-1 flex gap-1 overflow-x-auto pb-1 lg:mx-0 lg:mt-3 lg:block lg:overflow-visible lg:border-l lg:border-rule lg:pb-0">
        {SETTINGS_SECTIONS.map((s) => {
          const here = current === s.id;
          return (
            <li key={s.id} className="shrink-0">
              <a
                href={`#${s.id}`}
                aria-current={here ? "location" : undefined}
                className={`quiet-link block px-3 py-2 text-sm whitespace-nowrap lg:-ml-px lg:border-l-2 lg:py-1.5 lg:pl-4 ${
                  here
                    ? "font-semibold text-ink lg:border-accent"
                    : "text-ink-muted hover:text-ink lg:border-transparent"
                }`}
              >
                {s.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
