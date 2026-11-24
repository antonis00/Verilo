"use server";

import { revalidatePath } from "next/cache";
import { getReader } from "@/lib/auth";
import { MAX_OWN_SOURCES, normaliseSource } from "@/lib/own-sources";
import { allow } from "@/lib/rate-limit";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type OwnResult = { ok: true; message?: string } | { ok: false; message: string };

const SIGNED_OUT: OwnResult = { ok: false, message: "You’re signed out. Sign in again." };
const FAILED: OwnResult = {
  ok: false,
  message: "That couldn’t be saved just now. Try again in a moment.",
};

function refresh() {
  revalidatePath("/my-news");
  revalidatePath("/your-sources");
  revalidatePath("/");
}

// The reader read the notice (these sources aren't checked by Verilo) and agreed. Kept with the
// date, before the first source can be added.
export async function acceptOwnSources(): Promise<OwnResult> {
  const reader = await getReader();
  if (!reader) return SIGNED_OUT;
  const db = await createClient();
  const { error } = await db
    .from("reader_preferences")
    .upsert(
      { user_id: reader.id, own_sources_accepted_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
  if (error) {
    console.error("accepting own sources failed", { code: error.code });
    return FAILED;
  }
  refresh();
  return { ok: true };
}

// Adds a feed, website or public Telegram channel to the reader's own list. The source row is
// shared (one fetch however many readers add it) and written with the secret key, since readers
// can't write it; the link between reader and source is written as the reader.
export async function addOwnSource(raw: unknown): Promise<OwnResult> {
  const reader = await getReader();
  if (!reader) return SIGNED_OUT;
  if (!allow(`own-source:${reader.id}`, 20, 3_600_000)) {
    return { ok: false, message: "That’s a lot of sources in an hour. Try again later." };
  }
  const checked = normaliseSource(raw);
  if (!checked.ok) return checked;

  const db = await createClient();
  const [prefs, count] = await Promise.all([
    db.from("reader_preferences").select("own_sources_accepted_at").maybeSingle(),
    db.from("reader_own_sources").select("source_id", { count: "exact", head: true }),
  ]);
  if (!prefs.data?.own_sources_accepted_at) {
    return { ok: false, message: "Read and accept the note above first." };
  }
  if ((count.count ?? 0) >= MAX_OWN_SOURCES) {
    return {
      ok: false,
      message: `You can follow up to ${MAX_OWN_SOURCES} of your own sources. Remove one first.`,
    };
  }

  const admin = adminClient();
  const inserted = await admin
    .from("own_sources")
    .upsert({ kind: checked.kind, url: checked.url }, { onConflict: "url", ignoreDuplicates: true })
    .select("id");
  if (inserted.error) {
    console.error("adding an own source failed", { code: inserted.error.code });
    return FAILED;
  }
  const { data: source } = await admin
    .from("own_sources")
    .select("id, status, blocked_reason")
    .eq("url", checked.url)
    .maybeSingle();
  if (!source) return FAILED;
  if (source.status === "blocked") {
    return {
      ok: false,
      message: `Verilo’s editors have blocked this source${source.blocked_reason ? `: ${source.blocked_reason}` : "."}`,
    };
  }
  const { error } = await db
    .from("reader_own_sources")
    .upsert(
      { user_id: reader.id, source_id: source.id },
      { onConflict: "user_id,source_id", ignoreDuplicates: true },
    );
  if (error) {
    console.error("following an own source failed", { code: error.code });
    return FAILED;
  }
  refresh();
  return {
    ok: true,
    message:
      checked.kind === "telegram"
        ? "Added. Its latest posts appear within a few minutes."
        : "Added. Its latest items appear within a few minutes.",
  };
}

export async function removeOwnSource(id: unknown): Promise<OwnResult> {
  const reader = await getReader();
  if (!reader) return SIGNED_OUT;
  if (typeof id !== "number" || !Number.isInteger(id)) return FAILED;
  const db = await createClient();
  const { error } = await db
    .from("reader_own_sources")
    .delete()
    .eq("user_id", reader.id)
    .eq("source_id", id);
  if (error) {
    console.error("removing an own source failed", { code: error.code });
    return FAILED;
  }
  refresh();
  return { ok: true };
}
