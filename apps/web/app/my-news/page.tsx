import type { Metadata } from "next";
import { Suspense } from "react";
import { BriefingForm } from "@/components/briefing-form";
import { PreferencesForm } from "@/components/preferences-form";
import { requireReader } from "@/lib/auth";
import { outlets, topics } from "@/lib/news";
import { settingsFrom, type SettingsRow } from "@/lib/briefing";
import { loadPreferences } from "@/lib/reader-preferences";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";

export const metadata: Metadata = {
  title: "My News",
  robots: { index: false },
};

// Settings: the same choices as the welcome wizard, all on one page, then the daily briefing and
// the account.
export default function MyNewsPage() {
  return (
    <div className="mx-auto max-w-prose py-6 md:py-10">
      <p className="kicker">Settings</p>
      <h1 className="mt-2 text-2xl md:text-3xl">My News</h1>
      <Suspense fallback={<p className="meta mt-4">Loading your settings…</p>}>
        <Settings />
      </Suspense>
    </div>
  );
}

async function Settings() {
  const reader = await requireReader("/my-news");
  const supabase = await createClient();
  const [saved, topicList, outletList, briefing] = await Promise.all([
    loadPreferences(reader.id),
    topics(),
    outlets(),
    supabase
      .from("digest_settings")
      .select("user_id, enabled, send_hour, length, time_zone")
      .eq("user_id", reader.id)
      .maybeSingle<SettingsRow>(),
  ]);
  return (
    <>
      <p className="mt-3 text-ink-muted">
        Signed in as <span className="font-semibold text-ink">{reader.email}</span>
      </p>
      <div className="mt-10">
        <PreferencesForm
          mode="settings"
          topics={topicList}
          outlets={outletList}
          initial={saved.input}
        />
      </div>
      <div className="mt-12">
        <BriefingForm initial={settingsFrom(briefing.data)} />
      </div>
      <form action={signOut} className="mt-12 border-t border-rule pt-6">
        <button type="submit" className="button button-secondary">
          Sign out
        </button>
      </form>
    </>
  );
}
