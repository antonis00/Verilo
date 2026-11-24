import type { Metadata } from "next";
import { Suspense } from "react";
import { PreferencesForm } from "@/components/preferences-form";
import { requireReader } from "@/lib/auth";
import { outlets, topics } from "@/lib/news";
import { loadPreferences } from "@/lib/reader-preferences";

export const metadata: Metadata = {
  title: "Set up your front page",
  robots: { index: false },
};

export default function WelcomePage() {
  return (
    <div className="mx-auto max-w-prose py-4 md:py-8">
      <p className="kicker">Welcome to Verilo</p>
      <h1 className="mt-2 text-3xl md:text-4xl">Make the front page yours</h1>
      <p className="mt-3 text-lg text-ink-muted">
        Five quick questions. Skip any of them: you’ll get today’s top stories until you choose.
      </p>
      <p className="meta mt-2">
        Your 14-day free trial has started: everything is open, and there’s nothing to pay.
      </p>
      <div className="mt-10">
        <Suspense fallback={<p className="meta">Loading…</p>}>
          <Wizard />
        </Suspense>
      </div>
    </div>
  );
}

async function Wizard() {
  const reader = await requireReader("/welcome");
  const [saved, topicList, outletList] = await Promise.all([
    loadPreferences(reader.id),
    topics(),
    outlets(),
  ]);
  return (
    <PreferencesForm mode="wizard" topics={topicList} outlets={outletList} initial={saved.input} />
  );
}
