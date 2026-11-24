"use client";

import { useEffect, useRef } from "react";

// The search box. Rendered once, outside the part of the page that streams in, so nothing typed
// is wiped when the results arrive. After a search it shows the words searched for.
export function SearchForm() {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    if (input.current && !input.current.value && q) input.current.value = q;
  }, []);
  return (
    <form role="search" action="/search" className="mt-4 flex gap-2">
      <label htmlFor="search-q" className="sr-only">
        Search stories
      </label>
      <input
        ref={input}
        id="search-q"
        name="q"
        type="search"
        maxLength={200}
        placeholder="A name, a place, an event…"
        className="field flex-1"
      />
      <button type="submit" className="button">
        Search
      </button>
    </form>
  );
}
