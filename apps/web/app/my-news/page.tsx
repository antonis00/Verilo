import type { Metadata } from "next";
import { Suspense } from "react";
import { requireReader } from "@/lib/auth";
import { signOut } from "./actions";

export const metadata: Metadata = {
  title: "My News",
  robots: { index: false },
};

export default function MyNewsPage() {
  return (
    <div className="mx-auto max-w-prose py-6 md:py-10">
      <p className="kicker">Settings</p>
      <h1 className="mt-2 text-2xl md:text-3xl">My News</h1>
      <Suspense fallback={<p className="meta mt-4">Loading your account…</p>}>
        <Account />
      </Suspense>
    </div>
  );
}

async function Account() {
  const reader = await requireReader("/my-news");
  return (
    <>
      <p className="mt-3 text-ink-muted">
        Signed in as <span className="font-semibold text-ink">{reader.email}</span>
      </p>

      <section aria-labelledby="interests-title" className="mt-10 border-t border-rule pt-6">
        <h2 id="interests-title" className="text-xl">
          Your interests and sources
        </h2>
        <p className="mt-3 text-ink-muted">
          Choosing topics, outlets and your digest time comes with onboarding. Until then there’s
          nothing to set here.
        </p>
      </section>

      <form action={signOut} className="mt-10 border-t border-rule pt-6">
        <button type="submit" className="button button-secondary">
          Sign out
        </button>
      </form>
    </>
  );
}
