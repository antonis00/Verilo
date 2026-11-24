// The trial reminder emails: 4 days left, and 1 day left. Pure, so they're unit-tested. They say
// when the trial ends and what the reader's trial has been, and plainly that nothing is charged
// and everything stays open until subscriptions exist (lib/trial.ts). Same look as the briefing.

import { C, escapeHtml, SANS, SERIF } from "@/lib/briefing";
import type { Email } from "@/lib/briefing";

export type TrialReminderKind = "4-days" | "1-day";

export type TrialSoFar = {
  briefings: number;
  topics: number;
  outlets: number;
  saved: number;
};

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

// The reader's trial in a sentence, leaving out what they haven't used.
export function soFarLine(s: TrialSoFar): string | null {
  const parts = [
    s.briefings ? `${plural(s.briefings, "daily briefing", "daily briefings")} sent to you` : null,
    s.topics ? `${plural(s.topics, "topic", "topics")} followed` : null,
    s.outlets ? `${plural(s.outlets, "outlet", "outlets")} followed` : null,
    s.saved ? `${plural(s.saved, "story", "stories")} saved` : null,
  ].filter((p): p is string => p !== null);
  if (!parts.length) return null;
  const list =
    parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
  return `So far in your trial: ${list}.`;
}

export function renderTrialEmail(
  kind: TrialReminderKind,
  endsOn: string, // "28 November"
  soFar: TrialSoFar,
  site: string,
): Email {
  const when = kind === "1-day" ? "tomorrow" : "in 4 days";
  const subject = `Your Verilo free trial ends ${when}`;
  const lines = [
    `Your free trial ends on ${endsOn}.`,
    soFarLine(soFar),
    "Subscriptions are coming soon. Until then, everything stays open, and nothing is charged: you don’t need to do anything.",
  ].filter((l): l is string => l !== null);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:${C.paper}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.paper}"><tr><td align="center" style="padding:24px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
<tr><td style="text-align:center;padding-bottom:14px;border-bottom:3px double ${C.ink}">
<p style="margin:0;font:700 34px ${SERIF};color:${C.ink}">Verilo</p>
</td></tr>
<tr><td style="padding:24px 0 0">
<h1 style="margin:0;font:700 24px/1.25 ${SERIF};color:${C.ink}">${escapeHtml(subject)}</h1>
${lines.map((l) => `<p style="margin:14px 0 0;font:400 16px/1.55 ${SANS};color:${C.ink}">${escapeHtml(l)}</p>`).join("\n")}
<p style="margin:22px 0 0;font:400 15px ${SANS}"><a href="${site}/" style="color:${C.accent}">Read today’s front page</a></p>
</td></tr>
<tr><td style="padding:28px 0 0;margin-top:28px;border-top:1px solid ${C.rule};font:400 12px/1.6 ${SANS};color:${C.muted}">
You’re getting this because you have a Verilo account. <a href="${site}/preferences" style="color:${C.muted}">Preferences</a>, where you can also delete your account.
</td></tr>
</table></td></tr></table></body></html>`;
  const text = [
    subject,
    "",
    ...lines,
    "",
    `Read today’s front page: ${site}/`,
    `Preferences (and deleting your account): ${site}/preferences`,
  ].join("\n");
  return { subject, html, text };
}
