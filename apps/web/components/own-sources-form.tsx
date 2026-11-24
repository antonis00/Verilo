"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  acceptOwnSources,
  addOwnSource,
  removeOwnSource,
  type OwnResult,
} from "@/app/my-news/own-sources-actions";
import {
  MAX_OWN_SOURCES,
  originLabel,
  sourceName,
  statusLine,
  type OwnSource,
} from "@/lib/own-sources";
import { useReady } from "@/lib/use-ready";

// "Your own sources" in My News: the notice to accept first, then a field to add a feed,
// website or Telegram channel, and the list with each one's origin and state. The list comes
// from the server; each action refreshes it.
export function OwnSourcesForm({ accepted, sources }: { accepted: boolean; sources: OwnSource[] }) {
  const ready = useReady();
  const [pending, startTransition] = useTransition();
  const [address, setAddress] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const run = (action: () => Promise<OwnResult>, after?: () => void) =>
    startTransition(async () => {
      setMessage(null);
      const result = await action();
      if (result.ok) after?.();
      if (!result.ok || result.message) setMessage({ ok: result.ok, text: result.message ?? "" });
    });

  return (
    <section
      id="own-sources"
      aria-labelledby="own-sources-title"
      data-ready={ready}
      className="scroll-mt-8 border-t border-rule pt-6 pb-8"
    >
      <h2 id="own-sources-title" className="text-xl">
        Your own sources
      </h2>
      <p className="meta mt-1">
        Follow feeds, websites or public Telegram channels Verilo doesn’t carry. They get a section
        of their own, <Link href="/your-sources">From your sources</Link>, and each item says where
        it came from.
      </p>

      {!accepted ? (
        <div className="mt-4 border-l-2 border-accent pl-4" data-testid="own-sources-notice">
          <p className="font-semibold">Before you add one</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            <li>
              Verilo doesn’t check or rate these sources. What they publish may be wrong, one-sided
              or made to mislead, and a channel can pretend to be someone it isn’t.
            </li>
            <li>
              They’re kept apart: never in Verilo’s summaries, outlet counts or anyone else’s page.
              Where Verilo can confirm a source is an outlet’s own (a feed on its website), it says
              so; everything else is marked unverified.
            </li>
            <li>
              Verilo’s servers read them for you, so the sites never see you until you open a link.
              Then their own privacy rules apply.
            </li>
            <li>
              No one else sees which sources you follow. Verilo’s editors can see the addresses
              readers add, never who added them, and block one that breaks the law or the{" "}
              <Link href="/terms">terms</Link>.
            </li>
          </ul>
          <button
            type="button"
            className="button button-secondary mt-4"
            disabled={pending}
            onClick={() => run(acceptOwnSources)}
          >
            I understand, let me add sources
          </button>
        </div>
      ) : (
        <>
          <form
            className="mt-4"
            onSubmit={(e) => {
              e.preventDefault();
              run(
                () => addOwnSource(address),
                () => setAddress(""),
              );
            }}
          >
            <label htmlFor="own-source-address" className="font-semibold">
              Add a source
            </label>
            <div className="mt-1 flex flex-wrap gap-3">
              <input
                id="own-source-address"
                className="field min-w-0 flex-1"
                placeholder="example.com/feed, a website, or @channel"
                autoComplete="off"
                spellCheck={false}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                aria-describedby="own-source-help"
              />
              <button
                type="submit"
                className="button button-secondary"
                disabled={pending || !address.trim() || sources.length >= MAX_OWN_SOURCES}
              >
                {pending ? "Adding…" : "Add"}
              </button>
            </div>
            <p id="own-source-help" className="meta mt-1">
              A feed’s address, a website (Verilo finds its feed), or a public Telegram channel
              (t.me/name or @name). Up to {MAX_OWN_SOURCES}.
            </p>
          </form>
          {sources.length ? (
            <ul
              className="mt-5 divide-y divide-rule border-y border-rule"
              aria-label="Your sources"
            >
              {sources.map((s) => (
                <li key={s.id} className="flex items-start justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="font-semibold break-words">{sourceName(s)}</p>
                    <p className="meta break-all">
                      {s.kind === "telegram" ? "Telegram channel" : "Feed"} · {originLabel(s)}
                    </p>
                    {statusLine(s) ? <p className="meta mt-1">{statusLine(s)}</p> : null}
                  </div>
                  <button
                    type="button"
                    className="text-sm text-ink-muted underline hover:text-ink"
                    disabled={pending}
                    aria-label={`Remove ${sourceName(s)}`}
                    onClick={() => run(() => removeOwnSource(s.id))}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
      {message?.text ? (
        <p
          role={message.ok ? "status" : "alert"}
          className={
            message.ok
              ? "mt-4 text-sm text-ink-muted"
              : "mt-4 border-l-2 border-accent pl-4 text-sm"
          }
        >
          {message.text}
        </p>
      ) : null}
    </section>
  );
}
