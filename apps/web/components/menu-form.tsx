"use client";

import { useState, useTransition } from "react";
import { saveMenu } from "@/app/preferences/actions";
import { MENU_MAX, type MenuTopic } from "@/lib/menu";

// "Your sections menu" in My News: which topics the bar under the masthead shows, and in which
// order. Move, remove, add; or go back to the default (followed topics first, then featured).

export function MenuForm({
  topics,
  initial,
  custom,
}: {
  topics: MenuTopic[];
  initial: number[];
  custom: boolean;
}) {
  const byId = new Map(topics.map((t) => [t.id, t]));
  const [menu, setMenu] = useState<number[]>(initial);
  const [isCustom, setIsCustom] = useState(custom);
  const [adding, setAdding] = useState("");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: "saved" | "error"; text: string } | null>(null);

  const change = (next: number[]) => {
    setMenu(next);
    setMessage(null);
  };
  const move = (i: number, by: -1 | 1) => {
    const next = [...menu];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    change(next);
  };
  const available = topics
    .filter((t) => !menu.includes(t.id))
    .sort((a, b) => Number(b.featured) - Number(a.featured) || a.name.localeCompare(b.name));

  const save = (value: number[] | null) =>
    startTransition(async () => {
      const result = await saveMenu(value);
      if (!result.ok) {
        setMessage({ kind: "error", text: result.message });
        return;
      }
      setIsCustom(value !== null);
      setMessage({
        kind: "saved",
        text:
          value === null
            ? "Saved. The menu is back to the default: reload to see it."
            : "Saved. Your menu shows these sections now.",
      });
    });

  return (
    <section aria-labelledby="menu-title" className="border-t border-rule pt-6 pb-8">
      <h2 id="menu-title" className="text-xl">
        Your sections menu
      </h2>
      <p className="meta mt-1">
        The sections in the bar under the masthead, in this order.{" "}
        {isCustom
          ? "You chose these."
          : "Until you change it, the topics you follow come first, then our featured sections."}
      </p>
      <ol className="mt-4 max-w-md">
        {menu.map((id, i) => {
          const name = byId.get(id)?.name ?? "";
          return (
            <li key={id} className="flex items-center gap-2 border-t border-rule py-2">
              <span className="meta w-6 tabular-nums">{i + 1}</span>
              <span className="flex-1">{name}</span>
              <button
                type="button"
                className="quiet-link px-2 disabled:opacity-30"
                aria-label={`Move ${name} up`}
                disabled={i === 0}
                onClick={() => move(i, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                className="quiet-link px-2 disabled:opacity-30"
                aria-label={`Move ${name} down`}
                disabled={i === menu.length - 1}
                onClick={() => move(i, 1)}
              >
                ↓
              </button>
              <button
                type="button"
                className="quiet-link px-2 text-ink-muted"
                aria-label={`Remove ${name}`}
                onClick={() => change(menu.filter((x) => x !== id))}
              >
                Remove
              </button>
            </li>
          );
        })}
      </ol>
      <div className="mt-4 flex max-w-md flex-wrap items-end gap-2">
        <label className="flex-1">
          <span className="block font-semibold">Add a section</span>
          <select
            className="field mt-1 block w-full"
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            disabled={menu.length >= MENU_MAX}
          >
            <option value="">Choose a topic…</option>
            {available.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="button button-secondary"
          disabled={!adding || menu.length >= MENU_MAX}
          onClick={() => {
            change([...menu, Number(adding)]);
            setAdding("");
          }}
        >
          Add
        </button>
      </div>
      {menu.length >= MENU_MAX ? (
        <p className="meta mt-2">The menu holds up to {MENU_MAX} sections.</p>
      ) : null}
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button type="button" className="button" disabled={pending} onClick={() => save(menu)}>
          {pending ? "Saving…" : "Save menu"}
        </button>
        {isCustom ? (
          <button
            type="button"
            className="quiet-link text-sm underline-offset-4 hover:underline"
            disabled={pending}
            onClick={() => save(null)}
          >
            Back to the default
          </button>
        ) : null}
      </div>
      {message ? (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className={
            message.kind === "error"
              ? "mt-4 border-l-2 border-accent pl-4 text-sm"
              : "mt-4 text-sm text-ink-muted"
          }
        >
          {message.text}
        </p>
      ) : null}
    </section>
  );
}
