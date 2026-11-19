import "server-only";
import { connection } from "next/server";

// The current time for a request-time render ("5 min ago"). Marks the render as request-time
// first, so Cache Components never bakes a clock reading into a static shell.
export async function requestTime(): Promise<number> {
  await connection();
  return Date.now();
}

// The current time inside a "use cache" scope: cached with the result, so a cached page says
// "5 min ago" as of when it was made (it refreshes every minute or so).
export function cachedTime(): number {
  return Date.now();
}
