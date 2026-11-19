import { NextResponse, type NextRequest } from "next/server";
import { stopBriefing } from "@/lib/briefing-run";
import { validUnsubscribe } from "@/lib/briefing-token";

// One-click unsubscribe (RFC 8058): the mail app POSTs here from the List-Unsubscribe header. A
// GET (someone opening the link) goes to the page that asks first, since link scanners in mail
// systems open links without anyone clicking.
export async function POST(request: NextRequest) {
  const u = request.nextUrl.searchParams.get("u");
  const t = request.nextUrl.searchParams.get("t");
  if (!validUnsubscribe(u, t)) return new NextResponse(null, { status: 404 });
  return (await stopBriefing(u))
    ? new NextResponse(null, { status: 204 })
    : new NextResponse(null, { status: 500 });
}

export function GET(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = "/briefing/stop";
  return NextResponse.redirect(url);
}
