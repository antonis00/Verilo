"use client";

import { useSyncExternalStore } from "react";
import { applyTheme, shownTheme, watchSystemTheme, type Theme } from "@/lib/theme";

// One button: a moon on the light page (switch to night), a sun on the dark page (switch to day).
// Which icon shows is decided by CSS from data-theme and the system setting (globals.css,
// `.theme-toggle`), so the server render is already right and nothing flickers while loading.
// Only the spoken label needs JavaScript, and it starts neutral until the page has loaded.

const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  const stopWatching = watchSystemTheme(listener);
  return () => {
    listeners.delete(listener);
    stopWatching();
  };
}

function toggle() {
  applyTheme(shownTheme() === "dark" ? "light" : "dark");
  for (const listener of listeners) listener();
}

const LABEL: Record<Theme | "unknown", string> = {
  light: "Switch to dark theme",
  dark: "Switch to light theme",
  unknown: "Switch theme",
};

export function ThemeSwitch() {
  const shown = useSyncExternalStore(subscribe, shownTheme, () => "unknown" as const);

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={LABEL[shown]}
      title={LABEL[shown]}
      className="theme-toggle"
    >
      <svg
        className="theme-icon theme-icon-moon"
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M19.5 14.6A7.6 7.6 0 0 1 9.4 4.5a7.6 7.6 0 1 0 10.1 10.1Z" />
      </svg>
      <svg
        className="theme-icon theme-icon-sun"
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="12" cy="12" r="3.6" />
        <path d="M12 3v1.8M12 19.2V21M3 12h1.8M19.2 12H21M5.6 5.6l1.3 1.3M17.1 17.1l1.3 1.3M5.6 18.4l1.3-1.3M17.1 6.9l1.3-1.3" />
      </svg>
    </button>
  );
}
