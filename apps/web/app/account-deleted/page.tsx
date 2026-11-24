import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Account deleted", robots: { index: false } };

export default function AccountDeletedPage() {
  return (
    <div className="mx-auto max-w-prose py-10">
      <p className="kicker">Your account</p>
      <h1 className="mt-2 text-2xl md:text-3xl">Your account is deleted</h1>
      <p className="mt-4 text-ink-muted">
        Your email address, your choices and your briefing history are gone. You won’t get any more
        emails from Verilo.
      </p>
      <p className="mt-6">
        <Link href="/">Read today’s front page</Link>
      </p>
    </div>
  );
}
