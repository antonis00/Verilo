// Where a reader stands with the free trial (Phase 5). Pure, so the rules are unit-tested.
// Nothing is locked on any of these yet: the app shows the state, and payments come later.

export const TRIAL_DAYS = 14;
const DAY = 86_400_000;

export type TrialState =
  | { kind: "subscribed" }
  | { kind: "trial"; daysLeft: number; endsAt: string }
  | { kind: "ended"; endedAt: string };

export function trialState(
  profile: { trial_ends_at: string | null; subscribed_until: string | null },
  now: number,
): TrialState {
  if (profile.subscribed_until && Date.parse(profile.subscribed_until) > now) {
    return { kind: "subscribed" };
  }
  const ends = profile.trial_ends_at ? Date.parse(profile.trial_ends_at) : now;
  if (ends > now) {
    // Whole days, counting a part day as a day: "1 day left" until the very end.
    return {
      kind: "trial",
      daysLeft: Math.ceil((ends - now) / DAY),
      endsAt: profile.trial_ends_at!,
    };
  }
  return { kind: "ended", endedAt: profile.trial_ends_at ?? new Date(now).toISOString() };
}

export function endDate(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone }).format(
    new Date(iso),
  );
}

// The quiet line readers see (My News, and the front page near the end of the trial).
export function trialLine(state: TrialState, timeZone?: string): string | null {
  switch (state.kind) {
    case "subscribed":
      return null;
    case "trial":
      return `Free trial: ${state.daysLeft} ${state.daysLeft === 1 ? "day" : "days"} left (until ${endDate(state.endsAt, timeZone)}).`;
    case "ended":
      return "Your free trial has ended. Subscriptions are coming soon; until then, everything stays open.";
  }
}

// Shown on the front page only when it matters: the last 3 days, and after the end.
export const REMIND_FROM_DAYS = 3;
export function shouldRemind(state: TrialState): boolean {
  return state.kind === "ended" || (state.kind === "trial" && state.daysLeft <= REMIND_FROM_DAYS);
}
