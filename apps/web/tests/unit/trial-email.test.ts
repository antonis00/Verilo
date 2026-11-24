import { describe, expect, it } from "vitest";
import { renderTrialEmail, soFarLine } from "@/lib/trial-email";

const none = { briefings: 0, topics: 0, outlets: 0, saved: 0 };

describe("trial reminder emails", () => {
  it("say when the trial ends, and that nothing is charged", () => {
    const four = renderTrialEmail("4-days", "28 November", none, "https://v.example");
    expect(four.subject).toBe("Your Verilo free trial ends in 4 days");
    expect(four.text).toContain("Your free trial ends on 28 November.");
    expect(four.text).toContain("nothing is charged");
    expect(four.html).toContain('href="https://v.example/my-news"');
    expect(renderTrialEmail("1-day", "28 November", none, "x").subject).toBe(
      "Your Verilo free trial ends tomorrow",
    );
  });

  it("sum up the reader's trial, leaving out what they didn't use", () => {
    expect(soFarLine(none)).toBeNull();
    expect(soFarLine({ ...none, briefings: 1 })).toBe(
      "So far in your trial: 1 daily briefing sent to you.",
    );
    expect(soFarLine({ briefings: 9, topics: 5, outlets: 0, saved: 2 })).toBe(
      "So far in your trial: 9 daily briefings sent to you, 5 topics followed and 2 stories saved.",
    );
  });
});
