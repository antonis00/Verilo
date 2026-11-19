import { describe, expect, it } from "vitest";
import { shouldRemind, trialLine, trialState } from "@/lib/trial";

const NOW = Date.parse("2026-11-19T12:00:00Z");
const days = (n: number) => new Date(NOW + n * 86_400_000).toISOString();

describe("trialState", () => {
  it("counts whole days left, a part day counting as one", () => {
    expect(trialState({ trial_ends_at: days(14), subscribed_until: null }, NOW)).toMatchObject({
      kind: "trial",
      daysLeft: 14,
    });
    expect(trialState({ trial_ends_at: days(0.1), subscribed_until: null }, NOW)).toMatchObject({
      kind: "trial",
      daysLeft: 1,
    });
  });

  it("ends at the end time, and a subscription wins over everything", () => {
    expect(trialState({ trial_ends_at: days(-1), subscribed_until: null }, NOW).kind).toBe("ended");
    expect(trialState({ trial_ends_at: days(0), subscribed_until: null }, NOW).kind).toBe("ended");
    expect(trialState({ trial_ends_at: days(-30), subscribed_until: days(5) }, NOW).kind).toBe(
      "subscribed",
    );
    // A subscription that has run out is no subscription.
    expect(trialState({ trial_ends_at: days(-30), subscribed_until: days(-1) }, NOW).kind).toBe(
      "ended",
    );
  });
});

describe("what readers see", () => {
  it("says how long is left and until when, in the reader's time zone", () => {
    const state = trialState(
      { trial_ends_at: "2026-11-21T22:30:00Z", subscribed_until: null },
      NOW,
    );
    expect(trialLine(state, "UTC")).toBe("Free trial: 3 days left (until 21 November).");
    expect(trialLine(state, "Asia/Qatar")).toBe("Free trial: 3 days left (until 22 November).");
    const last = trialState({ trial_ends_at: days(0.5), subscribed_until: null }, NOW);
    expect(trialLine(last, "UTC")).toMatch(/^Free trial: 1 day left/);
  });

  it("reminds on the front page only in the last 3 days and after the end", () => {
    const at = (n: number) => trialState({ trial_ends_at: days(n), subscribed_until: null }, NOW);
    expect(shouldRemind(at(10))).toBe(false);
    expect(shouldRemind(at(3))).toBe(true);
    expect(shouldRemind(at(-2))).toBe(true);
    expect(trialLine(at(-2))).toMatch(/^Your free trial has ended\. .*everything stays open\.$/);
    expect(shouldRemind({ kind: "subscribed" })).toBe(false);
    expect(trialLine({ kind: "subscribed" })).toBeNull();
  });
});
