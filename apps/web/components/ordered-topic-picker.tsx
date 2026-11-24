"use client";

import { useEffect, useId, useRef, useState } from "react";
import { searchTopics, type SearchableTopic } from "@/lib/topic-search";

// Following topics, in order. The topics followed sit at the top, black, in the order they lead
// the sections bar under the masthead; drag one (or Shift + arrow keys) to move it, press it to
// stop following. Under them, a search box and the topics to add: the featured ones, or every
// match while typing. Pressing one adds it at the end.

const DRAG_FROM_PX = 6;

function Grip() {
  return (
    <svg viewBox="0 0 10 16" aria-hidden="true" focusable="false" className="h-3.5 w-2 shrink-0">
      {[3, 8, 13].flatMap((y) =>
        [2.5, 7.5].map((x) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="1.2" fill="currentColor" />
        )),
      )}
    </svg>
  );
}

function Plus() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" className="size-3 shrink-0">
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function OrderedTopicPicker<T extends SearchableTopic>({
  topics,
  chosen,
  onChange,
}: {
  topics: T[];
  chosen: number[];
  onChange: (next: number[]) => void;
}) {
  const byId = new Map(topics.map((t) => [t.id, t]));
  const mine = chosen.map((id) => byId.get(id)).filter((t): t is T => t !== undefined);
  const [query, setQuery] = useState("");
  const [dragging, setDragging] = useState<number | null>(null);
  const [said, setSaid] = useState("");
  const inputId = useId();
  const helpId = useId();
  const press = useRef<{ id: number; x: number; y: number; pointer: number } | null>(null);
  const dragged = useRef(false);
  const chips = useRef(new Map<number, HTMLButtonElement>());
  const refocus = useRef<number | null>(null);

  // After a move by keyboard, the moved topic keeps the focus.
  useEffect(() => {
    if (refocus.current !== null) {
      chips.current.get(refocus.current)?.focus();
      refocus.current = null;
    }
  });

  const searching = query.trim().length > 0;
  const toAdd = (searching ? searchTopics(topics, query) : topics.filter((t) => t.featured)).filter(
    (t) => !chosen.includes(t.id),
  );

  const moveTo = (id: number, index: number) => {
    const rest = chosen.filter((x) => x !== id);
    const at = Math.max(0, Math.min(index, rest.length));
    const next = [...rest.slice(0, at), id, ...rest.slice(at)];
    if (next.some((x, i) => x !== chosen[i])) onChange(next);
    return at;
  };

  const remove = (t: T) => {
    onChange(chosen.filter((x) => x !== t.id));
    setSaid(`${t.name} removed.`);
  };
  const add = (t: T) => {
    onChange([...chosen, t.id]);
    setSaid(`${t.name} added, number ${chosen.length + 1}.`);
  };

  // Dragging with a mouse, pen or finger: past a few pixels the press becomes a drag, and the
  // topic moves to wherever the pointer is over another one (before it in its left half).
  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const p = press.current;
    if (!p || p.pointer !== e.pointerId) return;
    if (!dragged.current) {
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_FROM_PX) return;
      dragged.current = true;
      setDragging(p.id);
    }
    const over = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest<HTMLElement>("[data-topic-id]");
    const overId = Number(over?.dataset.topicId);
    if (!over || !overId || overId === p.id) return;
    const box = over.getBoundingClientRect();
    const target = chosen.filter((x) => x !== p.id).indexOf(overId);
    moveTo(p.id, e.clientX < box.left + box.width / 2 ? target : target + 1);
  };
  const endPress = () => {
    if (dragged.current && press.current) {
      const id = press.current.id;
      setSaid(`${byId.get(id)?.name} is number ${chosen.indexOf(id) + 1} of ${chosen.length}.`);
    }
    press.current = null;
    setDragging(null);
  };

  return (
    <div>
      <div className="border border-rule bg-paper-raised p-3 md:p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 className="font-sans text-sm font-semibold">
            Your topics
            {mine.length ? <span className="meta font-normal"> · {mine.length}</span> : null}
          </h3>
          {mine.length > 1 ? (
            <p id={helpId} className="meta">
              Drag to reorder<span className="hidden md:inline"> (or Shift + arrow keys)</span>.
              Press one to remove it.
            </p>
          ) : null}
        </div>
        {mine.length ? (
          <ol aria-label="Your topics, in order" className="mt-3 flex flex-wrap gap-2">
            {mine.map((t, i) => (
              <li key={t.id} data-topic-id={t.id}>
                <button
                  ref={(el) => {
                    if (el) chips.current.set(t.id, el);
                    else chips.current.delete(t.id);
                  }}
                  type="button"
                  aria-pressed="true"
                  aria-describedby={mine.length > 1 ? helpId : undefined}
                  title={`${i + 1}. ${t.name}: drag to move, press to remove`}
                  className={`chip cursor-grab touch-none select-none active:cursor-grabbing ${
                    dragging === t.id ? "opacity-50" : ""
                  }`}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    press.current = { id: t.id, x: e.clientX, y: e.clientY, pointer: e.pointerId };
                    dragged.current = false;
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }}
                  onPointerMove={onPointerMove}
                  onPointerUp={endPress}
                  onPointerCancel={endPress}
                  onClick={() => {
                    // The click that ends a drag isn't a press.
                    if (dragged.current) {
                      dragged.current = false;
                      return;
                    }
                    remove(t);
                  }}
                  onKeyDown={(e) => {
                    if (!e.shiftKey) return;
                    const by = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
                    if (!by) return;
                    e.preventDefault();
                    const at = moveTo(t.id, i + by);
                    refocus.current = t.id;
                    setSaid(`${t.name} is number ${at + 1} of ${mine.length}.`);
                  }}
                >
                  <Grip />
                  {t.name}
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="meta mt-2">None yet. Pick from the topics below.</p>
        )}
        <p className="meta mt-3">
          They lead the sections bar under the masthead, in this order, and lift their stories on
          your front page.
        </p>
      </div>

      <div className="mt-6">
        <label htmlFor={inputId} className="font-sans text-sm font-semibold">
          Add topics
        </label>
        <div className="relative mt-2 max-w-md">
          <svg
            viewBox="0 0 16 16"
            aria-hidden="true"
            focusable="false"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted"
          >
            <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="m10.5 10.5 3 3"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <input
            id={inputId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${topics.length} topics: football, crypto…`}
            aria-label="Search topics to follow"
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
        <div role="group" aria-label="Topics to follow" className="mt-4 flex flex-wrap gap-2">
          {toAdd.map((t) => (
            <button
              key={t.id}
              type="button"
              className="chip"
              aria-pressed="false"
              onClick={() => add(t)}
            >
              <Plus />
              {t.name}
            </button>
          ))}
        </div>
        <p className="meta mt-3" aria-live="polite">
          {searching
            ? toAdd.length
              ? `${toAdd.length} ${toAdd.length === 1 ? "match" : "matches"} for “${query.trim()}”`
              : `No other topic matches “${query.trim()}”.`
            : "Search to find more topics."}
        </p>
      </div>
      <p className="sr-only" role="status">
        {said}
      </p>
    </div>
  );
}
