// The daily briefing: who is due, what goes in it, and the email itself. Pure functions, no I/O,
// so every rule is unit-tested; lib/briefing-run.ts does the reading and sending.
//
// A briefing is the reader's own front page, cut short: their top stories (5, or 10 for "full"),
// then 1–2 widely covered stories outside their interests ("everyone should know"), as the design
// says (docs/design.md, "Daily digest"). Each story gets its first checked-summary point when it
// has one, else the lead outlet's excerpt, and a link to its page.

import type { FrontPage, Ranked } from "@/lib/feed";

export type BriefingLength = "short" | "full";

export type BriefingSettings = {
  enabled: boolean;
  sendHour: number;
  length: BriefingLength;
  timeZone: string;
};

// Off until the reader turns it on (opt-in, with consent recorded).
export const DEFAULT_BRIEFING: BriefingSettings = {
  enabled: false,
  sendHour: 7,
  length: "short",
  timeZone: "UTC",
};

export type SettingsRow = {
  user_id: string;
  enabled: boolean;
  send_hour: number;
  length: "short" | "full";
  time_zone: string;
};

export function settingsFrom(row: SettingsRow | null | undefined): BriefingSettings {
  if (!row) return DEFAULT_BRIEFING;
  return {
    enabled: row.enabled,
    sendHour: row.send_hour,
    length: row.length,
    timeZone: isTimeZone(row.time_zone) ? row.time_zone : "UTC",
  };
}

// Who is due is worked out in the database (due_briefings, migration 16): opted in, onboarded,
// their local hour from send_hour to 3 hours after (later than that, the day is skipped, so a
// briefing never arrives in the afternoon), and not yet sent that local day.

export const STORY_COUNT: Record<BriefingLength, number> = { short: 5, full: 10 };
export const EVERYONE_COUNT: Record<BriefingLength, number> = { short: 1, full: 2 };
const LINE_MAX = 240;

export function isTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !value || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export type BriefItem = {
  id: number;
  headline: string;
  kicker: string | null;
  line: string;
  fromSummary: boolean;
  outlets: number;
};

export type Briefing = { stories: BriefItem[]; everyone: BriefItem[] };

function clip(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= LINE_MAX) return t;
  const cut = t.slice(0, LINE_MAX);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), LINE_MAX - 40))}…`;
}

function item(r: Ranked, topicNames: Map<number, string>): BriefItem {
  const topic = r.card.topic_ids[0];
  const point = r.card.summary?.bullets[0]?.text;
  return {
    id: r.card.id,
    headline: r.headline,
    kicker: topic !== undefined ? (topicNames.get(topic) ?? null) : null,
    line: clip(point ?? r.lead.snippet ?? ""),
    fromSummary: Boolean(point),
    outlets: r.outlets,
  };
}

export function buildBriefing(
  page: FrontPage,
  length: BriefingLength,
  topicNames: Map<number, string>,
): Briefing {
  const stories = page.top.slice(0, STORY_COUNT[length]);
  const shown = new Set(stories.map((r) => r.card.id));
  const everyone = page.alsoImportant
    .filter((r) => !shown.has(r.card.id))
    .slice(0, EVERYONE_COUNT[length]);
  return {
    stories: stories.map((r) => item(r, topicNames)),
    everyone: everyone.map((r) => item(r, topicNames)),
  };
}

// --- The email ---------------------------------------------------------------------------------

export type EmailLinks = {
  site: string; // https://… without a trailing slash
  unsubscribe: string;
};

export type Email = { subject: string; html: string; text: string };

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

// Email clients ignore stylesheets and web fonts: inline styles, a table for width, and fonts
// every device has (Georgia for headlines, the system sans for text). The light theme's colours.
const C = {
  paper: "#faf8f3",
  ink: "#151413",
  muted: "#5e5b55",
  rule: "#dcd6ca",
  accent: "#a6261c",
};
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function storyHtml(s: BriefItem, site: string): string {
  const url = `${site}/story/${s.id}`;
  return `<tr><td style="padding:18px 0;border-top:1px solid ${C.rule}">
${s.kicker ? `<p style="margin:0 0 6px;font:700 11px ${SANS};letter-spacing:.09em;text-transform:uppercase;color:${C.accent}">${escapeHtml(s.kicker)}</p>` : ""}
<h3 style="margin:0;font:700 20px/1.25 ${SERIF};color:${C.ink}"><a href="${url}" style="color:${C.ink};text-decoration:none">${escapeHtml(s.headline)}</a></h3>
${s.line ? `<p style="margin:8px 0 0;font:400 15px/1.5 ${SANS};color:${C.muted}">${escapeHtml(s.line)}</p>` : ""}
<p style="margin:8px 0 0;font:400 12px ${SANS};color:${C.muted}">${s.outlets} ${s.outlets === 1 ? "outlet" : "outlets"}${s.fromSummary ? " · AI summary, checked against the reports" : ""} · <a href="${url}" style="color:${C.accent}">Read the story</a></p>
</td></tr>`;
}

function storyText(s: BriefItem, site: string): string {
  return [
    s.kicker ? s.kicker.toUpperCase() : null,
    s.headline,
    s.line || null,
    `${s.outlets} ${s.outlets === 1 ? "outlet" : "outlets"}${s.fromSummary ? " · AI summary, checked against the reports" : ""}`,
    `${site}/story/${s.id}`,
  ]
    .filter(Boolean)
    .join("\n");
}

// The day: "Tuesday 24 November" and "Tuesday".
export type BriefingDay = { label: string; weekday: string };

export function renderEmail(b: Briefing, day: BriefingDay, links: EmailLinks): Email {
  const lead = b.stories[0] ?? b.everyone[0];
  const more = b.stories.length + b.everyone.length - 1;
  // The day and the top story, and how many more: what an inbox shows before opening.
  const subject = lead
    ? `Your ${day.weekday} briefing: ${lead.headline}${more > 0 ? ` + ${more} more` : ""}`
    : "Your Verilo briefing";
  const dateLabel = day.label;
  const section = (title: string, items: BriefItem[]) =>
    items.length
      ? `<tr><td style="padding:28px 0 4px;font:700 13px ${SANS};letter-spacing:.06em;text-transform:uppercase;color:${C.ink}">${title}</td></tr>${items.map((s) => storyHtml(s, links.site)).join("")}`
      : "";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:${C.paper}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.paper}"><tr><td align="center" style="padding:24px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
<tr><td style="text-align:center;padding-bottom:14px;border-bottom:3px double ${C.ink}">
<p style="margin:0;font:700 34px ${SERIF};color:${C.ink}">Verilo</p>
<p style="margin:6px 0 0;font:400 13px ${SANS};color:${C.muted}">Your briefing for ${escapeHtml(dateLabel)}</p>
</td></tr>
${section("For you", b.stories)}
${section("Everyone should know", b.everyone)}
<tr><td style="padding:28px 0 0;border-top:1px solid ${C.rule};font:400 12px/1.6 ${SANS};color:${C.muted}">
Stories are grouped from many outlets; summaries are written by an AI model and checked against the outlets’ reports before they are shown. Each story page links to every report.<br>
<a href="${links.site}/my-news" style="color:${C.muted}">Change your briefing</a> · <a href="${escapeHtml(links.unsubscribe)}" style="color:${C.muted}">Stop these emails</a>
</td></tr>
</table></td></tr></table></body></html>`;
  const text = [
    `Verilo: your briefing for ${dateLabel}`,
    b.stories.length
      ? `\nFOR YOU\n\n${b.stories.map((s) => storyText(s, links.site)).join("\n\n")}`
      : "",
    b.everyone.length
      ? `\nEVERYONE SHOULD KNOW\n\n${b.everyone.map((s) => storyText(s, links.site)).join("\n\n")}`
      : "",
    `\nChange your briefing: ${links.site}/my-news`,
    `Stop these emails: ${links.unsubscribe}`,
  ]
    .filter(Boolean)
    .join("\n");
  return { subject, html, text };
}
