import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BriefingForm } from "@/components/briefing-form";
import { OwnSourcesForm } from "@/components/own-sources-form";
import { PreferencesForm } from "@/components/preferences-form";
import { SettingsIndex } from "@/components/preferences-index";
import { requireReader } from "@/lib/auth";
import { outlets, topics } from "@/lib/news";
import { settingsFrom, type SettingsRow } from "@/lib/briefing";
import { ownSources } from "@/lib/own-sources-db";
import { loadPreferences } from "@/lib/reader-preferences";
import { trialLine } from "@/lib/trial";
import { createClient } from "@/lib/supabase/server";
import { deleteAccount, signOut } from "./account-actions";

export const metadata: Metadata = {
  title: "Preferences",
  robots: { index: false },
};

// Preferences: the same choices as the welcome wizard, all on one page, then the daily briefing and
// the account.
export default function MyNewsPage() {
  return (
    // Wide screens: the contents in a column on the left that stays in view, the settings on the
    // right. A phone: the title, the contents as a row of links, then the settings.
    <div className="mx-auto max-w-6xl py-6 md:py-10 lg:grid lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-x-16">
      <div className="lg:col-start-2">
        <p className="kicker">Your account</p>
        <h1 className="mt-2 text-2xl md:text-3xl">Preferences</h1>
      </div>
      <Suspense fallback={<p className="meta mt-4 lg:col-start-2">Loading your preferences…</p>}>
        <Settings />
      </Suspense>
    </div>
  );
}

async function Settings() {
  const reader = await requireReader("/preferences");
  const supabase = await createClient();
  const [saved, topicList, outletList, briefing, own] = await Promise.all([
    loadPreferences(reader.id),
    topics(),
    outlets(),
    supabase
      .from("digest_settings")
      .select("user_id, enabled, send_hour, length, time_zone")
      .eq("user_id", reader.id)
      .maybeSingle<SettingsRow>(),
    ownSources(),
  ]);
  return (
    <>
      <aside className="mt-5 border-y border-rule lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:mt-1 lg:border-0">
        <SettingsIndex />
      </aside>
      {/* Explanations keep a readable width however wide the column. */}
      <div className="lg:col-start-2 [&_.meta]:max-w-prose">
        <p className="mt-3 text-ink-muted">
          Signed in as <span className="font-semibold text-ink">{reader.email}</span> ·{" "}
          <Link href="/saved">Saved stories</Link>
        </p>
        {trialLine(reader.trial, settingsFrom(briefing.data).timeZone) ? (
          <p className="meta mt-1" data-testid="trial">
            {trialLine(reader.trial, settingsFrom(briefing.data).timeZone)}
          </p>
        ) : null}
        <div className="mt-10">
          <PreferencesForm
            mode="preferences"
            topics={topicList}
            outlets={outletList}
            initial={saved.input}
          />
        </div>
        {/* Side by side on wide screens: each saves on its own, as soon as it's changed. */}
        <div className="mt-4 grid items-start xl:grid-cols-2 xl:gap-x-12">
          <BriefingForm initial={settingsFrom(briefing.data)} />
          <OwnSourcesForm accepted={own.accepted} sources={own.sources} />
        </div>
        <section
          id="your-data"
          aria-labelledby="your-data-title"
          className="mt-12 scroll-mt-8 border-t border-rule pt-6"
        >
          <h2 id="your-data-title" className="text-xl">
            Your data
          </h2>
          <p className="meta mt-1">
            Verilo keeps your email address, the choices on this page (your own sources too), the
            stories you saved and the dates of the briefings it sent you. Nothing else, and nothing
            is sold or shared for advertising.
          </p>
          <p className="mt-4">
            <a href="/api/account/export" download>
              Download my data
            </a>{" "}
            <span className="meta">(a JSON file)</span>
          </p>
          <details className="mt-4">
            <summary className="cursor-pointer text-ink-muted hover:text-ink">
              Delete my account
            </summary>
            <form action={deleteAccount} className="mt-3">
              <p className="text-sm">
                This deletes your account, your choices and your briefing history at once. It
                can&rsquo;t be undone.
              </p>
              <label htmlFor="confirm-delete" className="mt-3 block text-sm font-semibold">
                Type &ldquo;delete&rdquo; to confirm
              </label>
              <input
                id="confirm-delete"
                name="confirm"
                required
                pattern="[Dd][Ee][Ll][Ee][Tt][Ee]"
                autoComplete="off"
                className="field mt-1 w-48"
              />
              <button type="submit" className="button mt-3 block">
                Delete my account
              </button>
            </form>
          </details>
        </section>
        <form action={signOut} className="mt-12 border-t border-rule pt-6">
          <button type="submit" className="button button-secondary">
            Sign out
          </button>
        </form>
      </div>
    </>
  );
}
