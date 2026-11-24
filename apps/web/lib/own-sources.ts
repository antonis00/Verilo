// Readers' own sources: feeds, websites and public Telegram channels a reader adds for themselves
// (migration 29, fetched by workers/verilo_workers/own). Verilo doesn't rate them: they're never
// in summaries, outlet counts or anyone else's page, and every item says where it came from.

export const MAX_OWN_SOURCES = 20;

export type OwnKind = "feed" | "telegram";

export type Normalised = { ok: true; kind: OwnKind; url: string } | { ok: false; message: string };

const CHANNEL = /^[A-Za-z][A-Za-z0-9_]{3,31}$/;
const TELEGRAM_HOSTS = new Set(["t.me", "telegram.me", "www.t.me", "www.telegram.me"]);

function telegram(name: string): Normalised {
  if (name.startsWith("+") || name.toLowerCase() === "joinchat") {
    return { ok: false, message: "Only public Telegram channels can be added, not invite links." };
  }
  if (!CHANNEL.test(name)) {
    return { ok: false, message: "That doesn't look like a Telegram channel's name." };
  }
  return { ok: true, kind: "telegram", url: `https://t.me/s/${name.toLowerCase()}` };
}

// What a reader typed, as the address the fetcher will read: a Telegram channel (`@name`,
// `t.me/name`, a link to one of its posts) becomes its public page; anything else a web address
// (https; the fetcher finds a website's feed itself). Addresses inside a network are refused
// here and again, after looking the name up, by the fetcher.
export function normaliseSource(raw: unknown): Normalised {
  const text = String(raw ?? "").trim();
  if (!text) return { ok: false, message: "Type a feed’s or website’s address, or a channel." };
  if (text.length > 2000) return { ok: false, message: "That address is too long." };
  if (/^@[^/\s]+$/.test(text)) return telegram(text.slice(1));

  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return { ok: false, message: "That isn't an address Verilo can read." };
  }
  if (url.protocol === "http:") url.protocol = "https:";
  if (url.protocol !== "https:") return { ok: false, message: "Only web addresses can be added." };
  if (url.username || url.password) {
    return { ok: false, message: "Addresses with a password in them can’t be added." };
  }
  if (url.port && url.port !== "443") {
    return { ok: false, message: "Only addresses on the usual web port can be added." };
  }
  const host = url.hostname.toLowerCase();
  if (TELEGRAM_HOSTS.has(host)) {
    const parts = url.pathname.split("/").filter(Boolean);
    const name = parts[0] === "s" ? parts[1] : parts[0];
    if (!name) return { ok: false, message: "Add the channel’s name after t.me/." };
    return telegram(name);
  }
  if (
    !host.includes(".") ||
    /^[\d.]+$/.test(host) ||
    host.startsWith("[") ||
    host === "localhost" ||
    /\.(localhost|local|internal|lan|home)$/.test(host)
  ) {
    return { ok: false, message: "Only public websites can be added." };
  }
  url.hash = "";
  return { ok: true, kind: "feed", url: url.toString() };
}

export type OwnSource = {
  id: number;
  kind: OwnKind;
  url: string;
  title: string | null;
  siteUrl: string | null;
  status: "pending" | "ok" | "failing" | "blocked";
  lastError: string | null;
  blockedReason: string | null;
  official: string | null; // the rated outlet it officially comes from
};

export type OwnItem = {
  id: number;
  sourceId: number;
  url: string;
  title: string;
  snippet: string;
  publishedAt: string;
};

// Where an item comes from, said plainly beside it.
export function originLabel(s: Pick<OwnSource, "kind" | "official">): string {
  if (s.official) {
    return s.kind === "telegram"
      ? `Official channel of ${s.official}`
      : `From ${s.official}’s website`;
  }
  return "Unverified · added by you";
}

export function sourceName(s: Pick<OwnSource, "kind" | "title" | "url">): string {
  if (s.title) return s.title;
  if (s.kind === "telegram") return `@${s.url.split("/").pop()}`;
  try {
    return new URL(s.url).hostname.replace(/^www\./, "");
  } catch {
    return s.url;
  }
}

export function statusLine(s: OwnSource): string | null {
  switch (s.status) {
    case "pending":
      return s.lastError
        ? `Verilo couldn’t read it: ${s.lastError}. Check the address; it tries again.`
        : "Checking it now: its latest items appear within a few minutes.";
    case "failing":
      return `Verilo couldn’t read it lately${s.lastError ? ` (${s.lastError})` : ""}. It keeps trying.`;
    case "blocked":
      return `Blocked by Verilo’s editors${s.blockedReason ? `: ${s.blockedReason}` : "."}`;
    default:
      return null;
  }
}
