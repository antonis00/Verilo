"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { rememberTimeZone, saveBriefing, savePreferences } from "@/app/preferences/actions";
import { OrderedTopicPicker } from "@/components/ordered-topic-picker";
import { TopicPicker } from "@/components/topic-picker";
import type { Outlet, Topic } from "@/lib/news";
import { type PreferencesInput } from "@/lib/preferences";
import { REGION_LABEL, REGIONS } from "@/lib/regions";
import { COUNTRY_LABEL, LEAN_LABEL, TIER_LABEL } from "@/lib/sources";
import { useReady } from "@/lib/use-ready";

type Props = {
  mode: "wizard" | "settings";
  topics: Topic[];
  outlets: Outlet[];
  initial: PreferencesInput;
};

const STEPS = [
  {
    anchor: "topics",
    title: "What do you want to follow?",
    hint: "Pick five or more for a good start, or search for anything more specific. Drag them into the order you want.",
  },
  {
    anchor: "places",
    title: "Which parts of the world matter to you?",
    hint: "Stories about these parts of the world are lifted on your front page.",
  },
  {
    anchor: "outlets",
    title: "Any outlets you prefer, or want to skip?",
    hint: "Followed outlets lead your stories when they cover them. Hidden ones never appear.",
  },
  {
    anchor: "show",
    title: "What should your front page include?",
    hint: "Whatever you choose, opinion pieces are never used to write summaries.",
  },
];

// The wizard's last question; in My News the briefing has its own form.
const BRIEFING_STEP = {
  title: "Would you like a morning briefing?",
  hint: "A short email once a day: your top stories, and one or two everyone should know. Off unless you turn it on; stop any time.",
};

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const hourLabel = (h: number) =>
  new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: true, timeZone: "UTC" }).format(
    new Date(Date.UTC(2026, 0, 1, h)),
  );

const toggle = (list: number[], id: number) =>
  list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

function Check() {
  return (
    <svg className="chip-check" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

export function PreferencesForm({ mode, topics, outlets, initial }: Props) {
  const router = useRouter();
  const [prefs, setPrefs] = useState<PreferencesInput>(initial);
  // What's saved, to tell whether anything has changed since (settings only).
  const [saved, setSaved] = useState<PreferencesInput>(initial);
  const dirty = mode === "settings" && JSON.stringify(prefs) !== JSON.stringify(saved);
  const ready = useReady();
  const [step, setStep] = useState(0);
  const [briefing, setBriefing] = useState({ enabled: false, sendHour: 7 });
  const [message, setMessage] = useState<{ kind: "error" | "saved"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  // Move focus to the new step's question, so keyboard and screen-reader users start there.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  const save = (then?: () => Promise<void> | void) =>
    startTransition(async () => {
      setMessage(null);
      const sent = prefs;
      const result = await savePreferences(sent);
      if (!result.ok) {
        setMessage({ kind: "error", text: result.message });
        return;
      }
      setSaved(sent);
      if (then) await then();
      else setMessage({ kind: "saved", text: "Saved. Your front page uses these choices now." });
    });

  // The save bar mustn't cover the end of the page.
  const barShown = dirty || message !== null;
  useEffect(() => {
    if (mode !== "settings" || !barShown) return;
    document.body.style.paddingBottom = "5rem";
    return () => {
      document.body.style.paddingBottom = "";
    };
  }, [barShown, mode]);

  // "Saved" goes by itself after a few seconds.
  useEffect(() => {
    if (mode !== "settings" || message?.kind !== "saved") return;
    const timer = setTimeout(() => setMessage(null), 5000);
    return () => clearTimeout(timer);
  }, [message, mode]);

  // Leaving with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const finish = () =>
    save(async () => {
      // The briefing's hour is in the reader's own time zone; the first comes the next morning.
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (briefing.enabled) {
        await saveBriefing({ ...briefing, length: "short", timeZone });
      } else {
        await rememberTimeZone(timeZone);
      }
      router.push("/");
      router.refresh();
    });

  const sections = [
    <TopicsStep key="topics" topics={topics} prefs={prefs} setPrefs={setPrefs} mode={mode} />,
    <PlacesStep key="places" prefs={prefs} setPrefs={setPrefs} />,
    <OutletsStep key="outlets" outlets={outlets} prefs={prefs} setPrefs={setPrefs} mode={mode} />,
    <ShowStep key="show" prefs={prefs} setPrefs={setPrefs} />,
  ];
  const steps = mode === "wizard" ? [...STEPS, BRIEFING_STEP] : STEPS;
  if (mode === "wizard") {
    sections.push(<BriefingStep key="briefing" value={briefing} onChange={setBriefing} />);
  }

  const status = message ? (
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
  ) : null;

  if (mode === "settings") {
    return (
      <form
        data-ready={ready}
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        {sections.map((section, i) => (
          <section
            key={i}
            id={`settings-${STEPS[i].anchor}`}
            aria-labelledby={`pref-${i}`}
            className="scroll-mt-8 border-t border-rule pt-6 pb-8"
          >
            <h2 id={`pref-${i}`} className="text-xl">
              {steps[i].title}
            </h2>
            <p className="meta mt-1">{steps[i].hint}</p>
            <div className="mt-4">{section}</div>
          </section>
        ))}
        {/* One save for the choices above, at the foot of the screen while anything is unsaved. */}
        {dirty || message ? (
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-ink bg-paper-raised">
            <div
              className={`page flex min-h-16 items-center justify-between gap-x-6 gap-y-2 py-3 ${dirty ? "flex-wrap" : ""}`}
            >
              {dirty ? (
                <p className="text-sm font-semibold">You have unsaved changes.</p>
              ) : (
                <div className="min-w-0 flex-1 [&>p]:mt-0">{status}</div>
              )}
              {dirty ? (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className="button button-secondary"
                    disabled={pending}
                    onClick={() => {
                      setPrefs(saved);
                      setMessage(null);
                    }}
                  >
                    Undo
                  </button>
                  <button type="submit" className="button" disabled={pending}>
                    {pending ? "Saving…" : "Save changes"}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="quiet-link text-sm text-ink-muted hover:text-ink"
                  onClick={() => setMessage(null)}
                >
                  Close
                </button>
              )}
            </div>
            {dirty && message?.kind === "error" ? <div className="page pb-3">{status}</div> : null}
          </div>
        ) : null}
      </form>
    );
  }

  const last = step === steps.length - 1;
  return (
    <div data-testid="wizard" data-ready={ready}>
      <div className="flex items-baseline justify-between gap-4">
        <p className="meta">
          Step {step + 1} of {steps.length}
        </p>
        <button
          type="button"
          className="quiet-link meta cursor-pointer underline-offset-4 hover:underline"
          onClick={finish}
          disabled={pending}
        >
          Skip for now
        </button>
      </div>
      <div
        className="progress mt-2"
        role="progressbar"
        aria-label="Setup progress"
        aria-valuemin={1}
        aria-valuemax={steps.length}
        aria-valuenow={step + 1}
      >
        <span style={{ width: `${((step + 1) / steps.length) * 100}%` }} />
      </div>

      <h2 ref={headingRef} tabIndex={-1} className="mt-8 text-2xl outline-none md:text-3xl">
        {steps[step].title}
      </h2>
      <p className="mt-2 text-ink-muted">{steps[step].hint}</p>
      <div className="mt-6">{sections[step]}</div>

      <div className="mt-10 flex flex-wrap items-center gap-3 border-t border-rule pt-6">
        {step > 0 ? (
          <button
            type="button"
            className="button button-secondary"
            onClick={() => setStep(step - 1)}
            disabled={pending}
          >
            Back
          </button>
        ) : null}
        <button
          type="button"
          className="button"
          onClick={() => (last ? finish() : setStep(step + 1))}
          disabled={pending}
        >
          {last ? (pending ? "Saving…" : "Show my front page") : "Next"}
        </button>
      </div>
      {status}
    </div>
  );
}

type StepProps = {
  prefs: PreferencesInput;
  setPrefs: React.Dispatch<React.SetStateAction<PreferencesInput>>;
};

function TopicsStep({
  topics,
  prefs,
  setPrefs,
  mode,
}: StepProps & { topics: Topic[]; mode: Props["mode"] }) {
  if (!topics.length) return <p className="text-ink-muted">Topics aren’t available yet.</p>;
  return (
    <>
      <OrderedTopicPicker
        topics={topics}
        chosen={prefs.followTopics}
        onChange={(next) =>
          setPrefs((p) => ({
            ...p,
            followTopics: next,
            muteTopics: p.muteTopics.filter((x) => !next.includes(x)),
          }))
        }
      />
      {mode === "settings" ? (
        <div className="mt-8">
          <h3 className="font-sans text-sm font-semibold">Topics to leave out</h3>
          <p className="meta mt-1 mb-3">
            Stories mainly about these won’t appear on your front page.
          </p>
          <TopicPicker
            topics={topics.filter((t) => !prefs.followTopics.includes(t.id))}
            chosen={prefs.muteTopics}
            label="Topics to leave out"
            small
            onToggle={(id) => setPrefs((p) => ({ ...p, muteTopics: toggle(p.muteTopics, id) }))}
          />
        </div>
      ) : null}
    </>
  );
}

function PlacesStep({ prefs, setPrefs }: StepProps) {
  return (
    <div role="group" aria-label="Places" className="flex flex-wrap gap-2">
      {REGIONS.map((p) => (
        <button
          key={p.code}
          type="button"
          className="chip"
          aria-pressed={prefs.regions.includes(p.code)}
          onClick={() =>
            setPrefs((s) => ({
              ...s,
              regions: s.regions.includes(p.code)
                ? s.regions.filter((c) => c !== p.code)
                : [...s.regions, p.code],
            }))
          }
        >
          <Check />
          {p.label}
        </button>
      ))}
    </div>
  );
}

// Well-known outlets from across the spectrum, offered first in the welcome wizard so the step
// takes seconds; every outlet is in the full list below them, and in settings.
const POPULAR_OUTLETS = [
  "BBC News",
  "The New York Times",
  "The Guardian",
  "Fox News",
  "NPR",
  "The Wall Street Journal",
  "Financial Times",
  "The Economist",
  "The Telegraph",
  "CNN",
  "Al Jazeera English",
  "DW (Deutsche Welle)",
];

// How much Verilo relies on an outlet: three bars for the fact base, two for reputable, one for
// a weaker record. The words go to screen readers and show on hover.
function Reliability({ tier }: { tier: Outlet["tier"] }) {
  const filled = 4 - tier;
  return (
    <span className="inline-flex items-end gap-[2px]" title={TIER_LABEL[tier]}>
      {[1, 2, 3].map((n) => (
        <span
          key={n}
          aria-hidden="true"
          className={`w-[3px] ${n <= filled ? "bg-ink" : "bg-rule"}`}
          style={{ height: `${4 + n * 3}px` }}
        />
      ))}
      <span className="sr-only">{TIER_LABEL[tier]}</span>
    </span>
  );
}

const LEANS = ["left", "lean_left", "center", "lean_right", "right"] as const;

// Where an outlet leans, as a dot on a short scale from left to right.
function LeanMark({ lean }: { lean: Outlet["lean"] }) {
  const at = LEANS.indexOf(lean);
  return (
    <span className="inline-flex items-center gap-[3px]" title={LEAN_LABEL[lean]}>
      {LEANS.map((l, i) => (
        <span
          key={l}
          aria-hidden="true"
          className={i === at ? "size-[7px] bg-ink" : "h-[3px] w-[5px] bg-rule"}
        />
      ))}
      <span className="sr-only">{LEAN_LABEL[lean]}</span>
    </span>
  );
}

// The key to the marks, above the list of outlets.
function MarksKey() {
  return (
    <p className="meta flex flex-wrap items-center gap-x-5 gap-y-1">
      <span className="inline-flex items-center gap-1.5">
        <Reliability tier={1} />
        <span aria-hidden="true">fact base</span>
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Reliability tier={2} />
        <span aria-hidden="true">reputable</span>
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Reliability tier={3} />
        <span aria-hidden="true">weaker record</span>
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span>left</span>
        <LeanMark lean="center" />
        <span>right</span>
      </span>
    </p>
  );
}

function OutletRow({
  outlet: o,
  prefs,
  set,
}: {
  outlet: Outlet;
  prefs: PreferencesInput;
  set: (id: number, choice: "follow" | "hide") => void;
}) {
  return (
    // The same shape everywhere: the name with its labels under it, the two buttons on the right.
    <li className="flex items-center justify-between gap-4 py-2">
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{o.name}</span>
        <span className="meta flex items-center gap-2.5">
          <span>{COUNTRY_LABEL[o.country] ?? o.country}</span>
          <Reliability tier={o.tier} />
          <LeanMark lean={o.lean} />
        </span>
      </span>
      <span className="flex shrink-0 gap-2">
        <button
          type="button"
          className="chip chip-small"
          aria-pressed={prefs.followSources.includes(o.id)}
          aria-label={`Follow ${o.name}`}
          onClick={() => set(o.id, "follow")}
        >
          <Check />
          Follow
        </button>
        <button
          type="button"
          className="chip chip-small"
          aria-pressed={prefs.hideSources.includes(o.id)}
          aria-label={`Hide ${o.name}`}
          onClick={() => set(o.id, "hide")}
        >
          <Check />
          Hide
        </button>
      </span>
    </li>
  );
}

function OutletsStep({
  outlets,
  prefs,
  setPrefs,
  mode,
}: StepProps & { outlets: Outlet[]; mode: Props["mode"] }) {
  // Grouped by region, in the order regions are offered.
  const byRegion = useMemo(() => {
    const order: string[] = [...REGIONS.map((r) => r.code), "international"];
    const groups = new Map<string, Outlet[]>();
    for (const o of outlets) groups.set(o.region, [...(groups.get(o.region) ?? []), o]);
    return [...groups.entries()].sort(([a], [b]) => order.indexOf(a) - order.indexOf(b));
  }, [outlets]);
  // Which regions are unfolded: the reader's chosen regions to start with, or all of them.
  const [open, setOpen] = useState<Set<string>>(
    () =>
      new Set(
        byRegion
          .map(([region]) => region)
          .filter((r) => prefs.regions.length === 0 || prefs.regions.includes(r)),
      ),
  );
  const allOpen = byRegion.length > 0 && byRegion.every(([region]) => open.has(region));
  if (!outlets.length) return <p className="text-ink-muted">Outlets aren’t available yet.</p>;
  const set = (id: number, choice: "follow" | "hide") =>
    setPrefs((p) => {
      const follow = p.followSources.filter((x) => x !== id);
      const hide = p.hideSources.filter((x) => x !== id);
      const was = choice === "follow" ? p.followSources : p.hideSources;
      if (!was.includes(id)) (choice === "follow" ? follow : hide).push(id);
      return { ...p, followSources: follow, hideSources: hide };
    });
  const popular = POPULAR_OUTLETS.map((name) => outlets.find((o) => o.name === name)).filter(
    (o): o is Outlet => o !== undefined,
  );
  const full = (
    <>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="meta">
            Each outlet shows how much we rely on it and where it leans, the same for every reader.
          </p>
          <div className="mt-2">
            <MarksKey />
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(allOpen ? new Set() : new Set(byRegion.map(([region]) => region)))}
          className="meta inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 hover:text-ink"
        >
          <svg
            viewBox="0 0 12 12"
            aria-hidden="true"
            focusable="false"
            className={`size-2.5 transition-transform ${allOpen ? "" : "-rotate-90"}`}
          >
            <path d="M1.5 3.5h9L6 9z" fill="currentColor" />
          </svg>
          {allOpen ? "Collapse all" : "Expand all"}
        </button>
      </div>
      {byRegion.map(([region, list]) => (
        <details
          key={region}
          open={open.has(region)}
          onToggle={(e) => {
            const isOpen = e.currentTarget.open;
            setOpen((current) => {
              if (current.has(region) === isOpen) return current;
              const next = new Set(current);
              if (isOpen) next.add(region);
              else next.delete(region);
              return next;
            });
          }}
          className="border-t border-rule py-3"
        >
          <summary className="cursor-pointer font-semibold">
            {REGION_LABEL[region] ?? region}{" "}
            <span className="meta font-normal">({list.length})</span>
          </summary>
          <ul className="mt-2 xl:grid xl:grid-cols-2 xl:gap-x-10">
            {list.map((o) => (
              <OutletRow key={o.id} outlet={o} prefs={prefs} set={set} />
            ))}
          </ul>
        </details>
      ))}
    </>
  );
  if (mode !== "wizard" || !popular.length) return full;
  return (
    <>
      <p className="meta mb-3">
        Optional: every outlet is included unless you hide it. Here are some of the best known.
      </p>
      <ul className="border-t border-rule pt-2">
        {popular.map((o) => (
          <OutletRow key={o.id} outlet={o} prefs={prefs} set={set} />
        ))}
      </ul>
      <details className="mt-4 border-t border-rule pt-3">
        <summary className="cursor-pointer font-semibold">
          All {outlets.length} outlets, by region
        </summary>
        <div className="mt-3">{full}</div>
      </details>
    </>
  );
}

function BriefingStep({
  value,
  onChange,
}: {
  value: { enabled: boolean; sendHour: number };
  onChange: (v: { enabled: boolean; sendHour: number }) => void;
}) {
  return (
    <div className="space-y-5">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          role="switch"
          className="mt-1 size-5 accent-[var(--ink)]"
          checked={value.enabled}
          onChange={(e) => onChange({ ...value, enabled: e.target.checked })}
        />
        <span>
          <span className="font-semibold">Yes, email me a daily briefing</span>
          <span className="meta block">The first one comes tomorrow morning.</span>
        </span>
      </label>
      <div className={value.enabled ? "" : "opacity-60"}>
        <label htmlFor="wizard-briefing-hour" className="font-semibold">
          Time
        </label>
        <select
          id="wizard-briefing-hour"
          className="field mt-1 block w-full max-w-48"
          disabled={!value.enabled}
          value={value.sendHour}
          onChange={(e) => onChange({ ...value, sendHour: Number(e.target.value) })}
        >
          {HOURS.map((h) => (
            <option key={h} value={h}>
              {hourLabel(h)}
            </option>
          ))}
        </select>
        <p className="meta mt-1">In your own time zone.</p>
      </div>
    </div>
  );
}

function ShowStep({ prefs, setPrefs }: StepProps) {
  const options = [
    {
      key: "showOpinion" as const,
      label: "Opinion pieces",
      help: "Columns, editorials and reviews, always marked Opinion.",
    },
    {
      key: "showTier3" as const,
      label: "Outlets with a weaker record",
      help: "Outlets with a weaker accuracy record. Always marked, never used for summaries.",
    },
  ];
  return (
    <div className="space-y-4">
      {options.map((o) => (
        <label key={o.key} className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            role="switch"
            className="mt-1 size-5 accent-[var(--ink)]"
            checked={prefs[o.key]}
            onChange={(e) => setPrefs((p) => ({ ...p, [o.key]: e.target.checked }))}
          />
          <span>
            <span className="font-semibold">{o.label}</span>
            <span className="meta block">{o.help}</span>
          </span>
        </label>
      ))}
    </div>
  );
}
