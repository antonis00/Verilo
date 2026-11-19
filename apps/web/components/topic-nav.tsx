"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string };

// The section menu under the masthead: "Top stories" and every topic. Scrolls sideways within
// itself on narrow screens (never the page). The current section is marked for screen readers
// (aria-current) and underlined in the accent.
export function NavList({ items, active }: { items: NavItem[]; active: string | null }) {
  return (
    <nav aria-label="Sections" className="border-b border-rule">
      <ul className="-mx-1 flex gap-x-1 overflow-x-auto whitespace-nowrap [scrollbar-width:thin]">
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
    </nav>
  );
}

export function TopicNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const active = items.find((i) => i.href === pathname)?.href ?? null;
  return <NavList items={items} active={active} />;
}
