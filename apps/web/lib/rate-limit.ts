import "server-only";

// A small in-memory limit per key (a visitor's address, an email): at most `limit` actions in
// `windowMs`. Per server process, so it resets on restart and isn't shared between instances;
// enough to stop a script hammering a form. Hosted with several instances, move it to the
// database or the host's rate limiting.
const hits = new Map<string, number[]>();

export function allow(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 10_000) {
    for (const [k, times] of hits) if (times.every((t) => now - t >= windowMs)) hits.delete(k);
  }
  return true;
}
