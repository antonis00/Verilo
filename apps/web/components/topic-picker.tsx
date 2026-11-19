"use client";

import { useId, useState } from "react";
import { searchTopics, visibleTopics, type SearchableTopic } from "@/lib/topic-search";

// Topic chips with a search box: the featured topics (and any already chosen) as chips; typing
// shows matching topics from the whole catalog instead. Used to follow topics and, in
// settings, to leave topics out.
export function TopicPicker<T extends SearchableTopic>({
  topics,
  chosen,
  onToggle,
  label,
  small = false,
}: {
  topics: T[];
  chosen: number[];
  onToggle: (id: number) => void;
  label: string;
  small?: boolean;
}) {
  const [query, setQuery] = useState("");
  const inputId = useId();
  const searching = query.trim().length > 0;
  const shown = searching ? searchTopics(topics, query) : visibleTopics(topics, chosen);
  return (
    <div>
      <label htmlFor={inputId} className="sr-only">
        Search {label.toLowerCase()}
      </label>
      <div className="relative max-w-md">
        <svg
          viewBox="0 0 16 16"
          aria-hidden="true"
          focusable="false"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted"
        >
          <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          id={inputId}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${topics.length} topics: football, crypto…`}
          autoComplete="off"
          className="field no-native-clear pr-10 pl-9"
        />
        {searching ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear the search"
            className="absolute top-1/2 right-0 inline-flex size-11 -translate-y-1/2 cursor-pointer items-center justify-center text-ink-muted hover:text-ink"
          >
            <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true" focusable="false">
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        ) : null}
      </div>
      <div role="group" aria-label={label} className="mt-4 flex flex-wrap gap-2">
        {shown.map((t) => (
          <button
            key={t.id}
            type="button"
            className={small ? "chip chip-small" : "chip"}
            aria-pressed={chosen.includes(t.id)}
            onClick={() => onToggle(t.id)}
          >
            <svg className="chip-check" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="1.8" />
            </svg>
            {t.name}
          </button>
        ))}
      </div>
      <p className="meta mt-3" aria-live="polite">
        {searching
          ? shown.length
            ? `${shown.length} ${shown.length === 1 ? "match" : "matches"} for “${query.trim()}”`
            : `No topic matches “${query.trim()}” yet.`
          : `${chosen.length} chosen · search to find more topics`}
      </p>
    </div>
  );
}
