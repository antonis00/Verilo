import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BriefingForm } from "@/components/briefing-form";
import { MenuForm } from "@/components/menu-form";
import { PreferencesForm } from "@/components/preferences-form";
import { requireReader } from "@/lib/auth";
import { outlets, topics } from "@/lib/news";
import { settingsFrom, type SettingsRow } from "@/lib/briefing";
import { menuTopics } from "@/lib/menu";
import { loadPreferences } from "@/lib/reader-preferences";
import { trialLine } from "@/lib/trial";
import { createClient } from "@/lib/supabase/server";
import { deleteAccount, signOut } from "./actions";

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
          mode="settings"
          topics={topicList}
          outlets={outletList}
          initial={saved.input}
        />
      </div>
      <div className="mt-12">
        <MenuForm
          topics={topicList.map(({ id, slug, name, featured }) => ({ id, slug, name, featured }))}
          initial={menuTopics(topicList, saved.input.followTopics, saved.menu).map((t) => t.id)}
          custom={saved.menu !== null}
        />
      </div>
      <div className="mt-4">
        <BriefingForm initial={settingsFrom(briefing.data)} />
      </div>
      <section
        id="your-data"
        aria-labelledby="your-data-title"
        className="mt-12 border-t border-rule pt-6"
      >
        <h2 id="your-data-title" className="text-xl">
          Your data
        </h2>
        <p className="meta mt-1">
          Verilo keeps your email address, the choices on this page, the stories you saved and the
          dates of the briefings it sent you. Nothing else, and nothing is sold or shared for
          advertising.
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
    </>
  );
}
