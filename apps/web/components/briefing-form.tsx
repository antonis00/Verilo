"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { saveBriefing } from "@/app/preferences/actions";
import type { BriefingSettings } from "@/lib/briefing";
import { useReady } from "@/lib/use-ready";

// "Daily briefing" in Preferences: on or off, the hour and the length, each saved as soon as it's
// changed. The hour is in the reader's own time zone, which the browser knows; it's saved too.

const noSubscription = () => () => {};

const HOURS = Array.from({ length: 24 }, (_, h) => h);

function hourLabel(h: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "numeric",
    hour12: true,
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2026, 0, 1, h)));
}

export function BriefingForm({ initial }: { initial: BriefingSettings }) {
  const [settings, setSettings] = useState(initial);
  const [pending, setPending] = useState(false);
  // Saves go one after another, so the last change is the one kept.
  const queue = useRef<Promise<void>>(Promise.resolve());
  const latest = useRef(0);
  const ready = useReady();
  const [message, setMessage] = useState<{ kind: "saved" | "error"; text: string } | null>(null);

  // The browser's time zone; null while rendering on the server, which can't know it.
  const browserZone = useSyncExternalStore(
    noSubscription,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => null,
  );
  const zone = browserZone ?? settings.timeZone;

  const update = (patch: Partial<BriefingSettings>) => {
    const next = { ...settings, ...patch, timeZone: zone };
    setSettings(next);
    setMessage(null);
    setPending(true);
    const id = ++latest.current;
    queue.current = queue.current.then(async () => {
      const result = await saveBriefing(next);
      if (id !== latest.current) return;
      setPending(false);
      setMessage(
        !result.ok
          ? { kind: "error", text: result.message }
          : {
              kind: "saved",
              text: next.enabled
                ? `Saved. Your briefing comes at ${hourLabel(next.sendHour)}, ${zone.replace(/_/g, " ")} time.`
                : "Saved. You won’t get the daily briefing.",
            },
      );
    });
  };

  return (
    <form
      id="briefing"
      aria-labelledby="briefing-title"
      data-ready={ready}
      className="scroll-mt-8 border-t border-rule pt-6 pb-8"
      onSubmit={(e) => e.preventDefault()}
    >
      <h2 id="briefing-title" className="text-xl">
        Daily briefing
      </h2>
      <p className="meta mt-1">
        A short email each morning: your top stories, and one or two everyone should know.
      </p>
      <label className="mt-4 flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          role="switch"
          className="mt-1 size-5 accent-[var(--ink)]"
          checked={settings.enabled}
          onChange={(e) => update({ enabled: e.target.checked })}
        />
        <span>
          <span className="font-semibold">Send me the daily briefing</span>
          <span className="meta block">By email, once a day. Stop any time.</span>
        </span>
      </label>
      <fieldset
        disabled={!settings.enabled}
        className="mt-5 grid gap-5 disabled:opacity-60 sm:grid-cols-2 xl:grid-cols-1"
      >
        <div>
          <label htmlFor="briefing-hour" className="font-semibold">
            Time
          </label>
          <select
            id="briefing-hour"
            aria-describedby="briefing-zone"
            className="field mt-1 block w-full xl:max-w-56"
            value={settings.sendHour}
            onChange={(e) => update({ sendHour: Number(e.target.value) })}
          >
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {hourLabel(h)}
              </option>
            ))}
          </select>
          <p id="briefing-zone" className="meta mt-1">
            Your time ({zone.replace(/_/g, " ")})
          </p>
        </div>
        <fieldset>
          <legend className="font-semibold">Length</legend>
          {(
            [
              ["short", "Short", "5 stories, about 3 minutes"],
              ["full", "Full", "10 stories, about 5 minutes"],
            ] as const
          ).map(([value, label, help]) => (
            <label key={value} className="mt-1 flex cursor-pointer items-start gap-2">
              <input
                type="radio"
                name="briefing-length"
                className="mt-1 accent-[var(--ink)]"
                checked={settings.length === value}
                onChange={() => update({ length: value })}
              />
              <span>
                {label} <span className="meta">· {help}</span>
              </span>
            </label>
          ))}
        </fieldset>
      </fieldset>
      <div className="mt-5 min-h-6">
        {pending ? <p className="text-sm text-ink-muted">Saving…</p> : null}
        {message ? (
          <p
            role={message.kind === "error" ? "alert" : "status"}
            className={
              message.kind === "error"
                ? "border-l-2 border-accent pl-4 text-sm"
                : "text-sm text-ink-muted"
            }
          >
            {message.text}
          </p>
        ) : null}
      </div>
    </form>
  );
}
