import { describe, expect, it } from "vitest";
import { normaliseSource, originLabel, sourceName, statusLine } from "@/lib/own-sources";

const url = (raw: string) => {
  const r = normaliseSource(raw);
  return r.ok ? `${r.kind} ${r.url}` : `refused: ${r.message}`;
};

describe("normaliseSource", () => {
  it("reads Telegram channels however they're written", () => {
    for (const raw of [
      "@HarbourLive",
      "t.me/harbourlive",
      "https://t.me/harbourlive",
      "https://t.me/s/harbourlive",
      "https://t.me/harbourlive/123",
      "telegram.me/harbourlive",
    ]) {
      expect(url(raw)).toBe("telegram https://t.me/s/harbourlive");
    }
  });

  it("refuses private Telegram invites and odd names", () => {
    expect(url("https://t.me/+AbCdEf123")).toMatch(/^refused: Only public/);
    expect(url("t.me/joinchat/AbCd")).toMatch(/^refused: Only public/);
    expect(url("@ab")).toMatch(/^refused/);
  });

  it("reads web addresses, upgrading to https and dropping the fragment", () => {
    expect(url("example.com/feed.xml")).toBe("feed https://example.com/feed.xml");
    expect(url("http://example.com/rss#top")).toBe("feed https://example.com/rss");
    expect(url("  https://news.example.org/  ")).toBe("feed https://news.example.org/");
  });

  it("refuses addresses that aren't public websites", () => {
    for (const raw of [
      "",
      "ftp://example.com/feed",
      "javascript:alert(1)",
      "https://localhost/feed",
      "https://127.0.0.1/feed",
      "https://[::1]/feed",
      "https://192.168.1.10/feed",
      "https://router.lan/feed",
      "https://db.internal/feed",
      "https://intranet/feed",
      "https://user:secret@example.com/feed",
      "https://example.com:8443/feed",
    ]) {
      expect(url(raw), raw).toMatch(/^refused/);
    }
  });
});

describe("labels", () => {
  it("says unverified unless an outlet is confirmed", () => {
    expect(originLabel({ kind: "feed", official: null })).toBe("Unverified · added by you");
    expect(originLabel({ kind: "feed", official: "BBC News" })).toBe("From BBC News’s website");
    expect(originLabel({ kind: "telegram", official: "BBC News" })).toBe(
      "Official channel of BBC News",
    );
  });

  it("names a source by its title, else its channel or host", () => {
    expect(sourceName({ kind: "telegram", title: null, url: "https://t.me/s/harbourlive" })).toBe(
      "@harbourlive",
    );
    expect(sourceName({ kind: "feed", title: null, url: "https://www.example.com/rss" })).toBe(
      "example.com",
    );
    expect(sourceName({ kind: "feed", title: "Harbour Gazette", url: "https://x.example/" })).toBe(
      "Harbour Gazette",
    );
  });
});

describe("statusLine", () => {
  const base = {
    id: 1,
    kind: "feed" as const,
    url: "https://example.com/",
    title: null,
    siteUrl: null,
    lastError: null,
    blockedReason: null,
    official: null,
  };
  it("says a new source is being checked, or why its first read failed", () => {
    expect(statusLine({ ...base, status: "pending" })).toMatch(/^Checking it now/);
    expect(
      statusLine({ ...base, status: "pending", lastError: "no feed found at this address" }),
    ).toBe(
      "Verilo couldn’t read it: no feed found at this address. Check the address; it tries again.",
    );
    expect(statusLine({ ...base, status: "ok" })).toBeNull();
    expect(statusLine({ ...base, status: "blocked", blockedReason: "Spam" })).toBe(
      "Blocked by Verilo’s editors: Spam",
    );
  });
});
