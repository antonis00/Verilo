// The reader's theme. With nothing stored the page follows the system; the theme button stores
// "light" or "dark" and sets data-theme on <html>. localStorage lets THEME_SCRIPT apply it
// before the first paint.

export type Theme = "light" | "dark";

export const THEME_KEY = "verilo-theme";

// Runs in <head> before the page paints, so a reader who chose dark never sees a light flash.
// Storage can be blocked (private windows, strict settings): then the page just follows the system.
export const THEME_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

const DARK_QUERY = "(prefers-color-scheme: dark)";

export function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

// The theme on screen: the reader's choice, else the system's.
export function shownTheme(): Theme {
  const set = document.documentElement.dataset.theme;
  if (set === "light" || set === "dark") return set;
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Storage blocked: the choice lasts for this page only.
  }
}

export function watchSystemTheme(onChange: () => void): () => void {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
