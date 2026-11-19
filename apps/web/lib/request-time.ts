import "server-only";
import { connection } from "next/server";

// The current time for a request-time render ("5 min ago"). Marks the render as request-time
// first, so Cache Components never bakes a clock reading into a static shell.
export async function requestTime(): Promise<number> {
  await connection();
  return Date.now();
}
