"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { rememberTimeZone, saveBriefing, savePreferences } from "@/app/preferences/actions";
import { TopicPicker } from "@/components/topic-picker";
import type { Outlet, Topic } from "@/lib/news";
import { type PreferencesInput } from "@/lib/preferences";
import { REGION_LABEL, REGIONS } from "@/lib/regions";
import { COUNTRY_LABEL, LEAN_LABEL, TIER_LABEL } from "@/lib/sources";

type Props = {
  mode: "wizard" | "settings";
  topics: Topic[];
  outlets: Outlet[];
  initial: PreferencesInput;
};

const STEPS = [
  {
    title: "What do you want to follow?",
    hint: "Pick five or more for a good start, or search for anything more specific.",
  },
  {
    title: "Which parts of the world matter to you?",
    hint: "Stories about these parts of the world are lifted on your front page.",
  },
  {
    title: "Any outlets you prefer, or want to skip?",
    hint: "Followed outlets lead your stories when they cover them. Hidden ones never appear.",
  },
  {
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
      const result = await savePreferences(prefs);
      if (!result.ok) {
        setMessage({ kind: "error", text: result.message });
        return;
      }
      if (then) await then();
      else setMessage({ kind: "saved", text: "Saved. Your front page uses these choices now." });
    });

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
    <OutletsStep key="outlets" outlets={outlets} prefs={prefs} setPrefs={setPrefs} />,
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
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        {sections.map((section, i) => (
          <section key={i} aria-labelledby={`pref-${i}`} className="border-t border-rule pt-6 pb-8">
            <h2 id={`pref-${i}`} className="text-xl">
              {steps[i].title}
            </h2>
            <p className="meta mt-1">{steps[i].hint}</p>
            <div className="mt-4">{section}</div>
          </section>
        ))}
        <div className="border-t border-rule pt-6">
          <button type="submit" className="button" disabled={pending}>
            {pending ? "Saving…" : "Save changes"}
          </button>
          {status}
        </div>
      </form>
    );
  }

  const last = step === steps.length - 1;
  return (
    <div>
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
      <TopicPicker
        topics={topics}
        chosen={prefs.followTopics}
        label="Topics to follow"
        onToggle={(id) =>
          setPrefs((p) => ({
            ...p,
            followTopics: toggle(p.followTopics, id),
            muteTopics: p.muteTopics.filter((x) => x !== id),
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

function OutletsStep({ outlets, prefs, setPrefs }: StepProps & { outlets: Outlet[] }) {
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
  return (
    <>
      <div className="mb-4 flex items-start justify-between gap-4">
        <p className="meta">
          Each outlet shows how much we rely on it (fact base, reputable, labelled) and where it
          leans. Those labels are the same for every reader.
        </p>
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
          <ul className="mt-2">
            {list.map((o) => (
              <li
                key={o.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-1.5"
              >
                <span>
                  <span className="text-sm font-semibold">{o.name}</span>
                  <span className="meta ml-2">
                    {COUNTRY_LABEL[o.country] ?? o.country} · {TIER_LABEL[o.tier]} ·{" "}
                    {LEAN_LABEL[o.lean]}
                  </span>
                </span>
                <span className="flex gap-2">
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
            ))}
          </ul>
        </details>
      ))}
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
