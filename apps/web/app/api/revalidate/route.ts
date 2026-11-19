import { revalidateTag } from "next/cache";
import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { REFERENCE_TAG, STORIES_TAG } from "@/lib/news";

// Tells the app its cached stories (and, if asked, topics and outlets) changed, so the next visit
// fetches fresh ones. Called by the pipeline after each round that changed something, and by
// the end-to-end tests after seeding. Needs REVALIDATE_SECRET; without it the endpoint is off.
const TAGS = new Set([STORIES_TAG, REFERENCE_TAG]);

function authorised(request: NextRequest): boolean {
  const secret = process.env.REVALIDATE_SECRET;
  const given = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret || secret.length < 16 || given.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(secret));
}

export async function POST(request: NextRequest) {
  if (!authorised(request)) return new NextResponse(null, { status: 404 });

  let tags = [STORIES_TAG];
  try {
    const body = (await request.json()) as { tags?: unknown };
    if (Array.isArray(body.tags))
      tags = body.tags.filter((t): t is string => TAGS.has(t as string));
  } catch {
    // No body: stories only.
  }
  // expire: 0 means the next request waits for fresh data rather than seeing the old stories.
  for (const tag of tags) revalidateTag(tag, { expire: 0 });
  return NextResponse.json({ revalidated: tags });
}
