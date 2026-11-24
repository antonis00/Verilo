import "server-only";
import { headers } from "next/headers";

// The visitor's address as the host reports it (first hop of x-forwarded-for), for rate limits.
// Never stored.
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "unknown";
}
