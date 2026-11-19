"use server";

import { redirect } from "next/navigation";
import { stopBriefing } from "@/lib/briefing-run";
import { validUnsubscribe } from "@/lib/briefing-token";

export async function confirmStop(formData: FormData) {
  const u = formData.get("u");
  const t = formData.get("t");
  if (!validUnsubscribe(u, t)) redirect("/briefing/stop?result=invalid");
  redirect(`/briefing/stop?result=${(await stopBriefing(u)) ? "stopped" : "error"}`);
}
