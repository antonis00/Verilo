import type { Metadata } from "next";
import { Suspense } from "react";
import { PreferencesForm } from "@/components/preferences-form";
import { requireReader } from "@/lib/auth";
import { outlets, topics } from "@/lib/news";
import { loadPreferences } from "@/lib/reader-preferences";
import { signOut } from "./actions";

export const metadata: Metadata = {
  title: "My News",
  robots: { index: false },
};

// Settings: the same choices as the welcome wizard, all on one page, plus the account.
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
  const [saved, topicList, outletList] = await Promise.all([
    loadPreferences(reader.id),
    topics(),
    outlets(),
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
      <form action={signOut} className="mt-12 border-t border-rule pt-6">
        <button type="submit" className="button button-secondary">
          Sign out
        </button>
      </form>
    </>
  );
}
