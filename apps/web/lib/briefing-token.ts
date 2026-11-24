import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// The token in a briefing's "Stop these emails" link: an HMAC of the reader's id with
// UNSUBSCRIBE_SECRET, so the link works without signing in but can't be made up for someone else.
// Its own secret, apart from BRIEFING_SECRET (which lets the pipeline run the briefings): one
// leaking or being changed doesn't affect the other. Changing it breaks links already sent.
function secret(): string {
  const s = process.env.UNSUBSCRIBE_SECRET;
  if (!s || s.length < 16) throw new Error("UNSUBSCRIBE_SECRET is not set (16+ characters).");
  return s;
}

export function unsubscribeToken(userId: string): string {
  return createHmac("sha256", secret()).update(`unsubscribe:${userId}`).digest("base64url");
}

export function validUnsubscribe(userId: unknown, token: unknown): userId is string {
  if (typeof userId !== "string" || typeof token !== "string") return false;
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return false;
  const expected = Buffer.from(unsubscribeToken(userId));
  const given = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
