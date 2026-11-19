import "server-only";
import { timingSafeEqual } from "node:crypto";

// A request carrying `Authorization: Bearer <secret>`, compared in constant time. A secret that
// isn't set, or is shorter than 16 characters, turns the endpoint off.
export function hasBearer(headers: Headers, secret: string | undefined): boolean {
  const given = headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret || secret.length < 16 || given.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(secret));
}
