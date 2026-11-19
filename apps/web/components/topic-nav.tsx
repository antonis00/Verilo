"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

export type NavItem = { href: string; label: string };

// The section menu under the masthead: "Top stories" and every topic. It scrolls sideways within
// itself (never the page) with no visible scrollbar; a thin chevron at either edge appears only
// when there's more that way. The current section is marked for screen readers (aria-current)
// and underlined in the accent.
export function NavList({
  items,
  active,
  listRef,
}: {
  items: NavItem[];
  active: string | null;
  listRef?: RefObject<HTMLUListElement | null>;
}) {
  return (
    <ul ref={listRef} className="no-scrollbar -mx-1 flex gap-x-1 overflow-x-auto whitespace-nowrap">
      {items.map((item) => {
        const current = item.href === active;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={current ? "page" : undefined}
              className={`inline-flex min-h-11 items-center border-b-2 px-2 text-sm no-underline ${
                current
                  ? "border-accent font-semibold text-ink"
                  : "border-transparent text-ink-muted hover:text-ink"
              }`}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function SectionsFrame({ children }: { children: React.ReactNode }) {
  return (
    <nav aria-label="Sections" className="relative border-b border-rule">
      {children}
    </nav>
  );
}

function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true" focusable="false">
      <path
        d={direction === "left" ? "M10 3 5 8l5 5" : "M6 3l5 5-5 5"}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// A mouse wheel over the menu slides it sideways. Only while the menu can still move that way:
// at either end the wheel scrolls the page as usual, so the menu never traps it. Sideways
// gestures (trackpads, touch) are left to the browser.
function wheel(event: WheelEvent) {
  const el = event.currentTarget as HTMLElement;
  if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
  const max = el.scrollWidth - el.clientWidth;
  if (max <= 0) return;
  const canMove = event.deltaY > 0 ? el.scrollLeft < max - 1 : el.scrollLeft > 1;
  if (!canMove) return;
  event.preventDefault();
  // Lines (some mice) are about 40px each; pages are the menu's width.
  const unit = event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? el.clientWidth : 1;
  el.scrollLeft += event.deltaY * unit;
}

export function TopicNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const active = items.find((i) => i.href === pathname)?.href ?? null;
  const listRef = useRef<HTMLUListElement>(null);
  const [more, setMore] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    setMore({
      left: el.scrollLeft > 2,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2,
    });
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    // Bring the current section into view when it's further along the menu.
    const current = el.querySelector<HTMLElement>('[aria-current="page"]');
    if (current) {
      const left = current.offsetLeft - el.offsetLeft;
      if (left + current.offsetWidth > el.clientWidth) el.scrollLeft = left - 48;
    }
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    el.addEventListener("wheel", wheel, { passive: false });
    const resize = new ResizeObserver(measure);
    resize.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      el.removeEventListener("wheel", wheel);
      resize.disconnect();
    };
  }, [measure, active]);

  const slide = (direction: 1 | -1) => {
    const el = listRef.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: direction * el.clientWidth * 0.7, behavior: reduce ? "auto" : "smooth" });
  };

  // The chevrons are for pointers; keyboard users move through the links, which scroll into view.
  const edge =
    "absolute top-0 bottom-0 flex w-11 cursor-pointer items-center bg-paper text-ink-muted hover:text-ink";
  return (
    <SectionsFrame>
      <NavList items={items} active={active} listRef={listRef} />
      {more.left ? (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          onClick={() => slide(-1)}
          className={`${edge} -left-1 justify-start pl-1`}
        >
          <Chevron direction="left" />
        </button>
      ) : null}
      {more.right ? (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          onClick={() => slide(1)}
          className={`${edge} -right-1 justify-end pr-1`}
        >
          <Chevron direction="right" />
        </button>
      ) : null}
    </SectionsFrame>
  );
}
