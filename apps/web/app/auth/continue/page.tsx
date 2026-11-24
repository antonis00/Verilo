import type { Metadata } from "next";
import { Suspense } from "react";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

// Where the sign-in link from the email lands: one button, which signs in (POST /auth/confirm).
export default function ContinuePage({ searchParams }: PageProps<"/auth/continue">) {
  return (
    <div className="mx-auto max-w-prose py-10">
      <p className="kicker">Sign in</p>
      <h1 className="mt-2 text-2xl md:text-3xl">Continue to Verilo</h1>
      <Suspense fallback={null}>
        <ContinueForm searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ContinueForm({ searchParams }: Pick<PageProps<"/auth/continue">, "searchParams">) {
  const q = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  return (
    <form method="post" action="/auth/confirm" className="mt-6">
      <input type="hidden" name="token_hash" value={one(q.token_hash)} />
      <input type="hidden" name="type" value={one(q.type)} />
      <input type="hidden" name="next" value={one(q.next)} />
      <p className="text-ink-muted">You opened your sign-in link. Press the button to sign in.</p>
      <button type="submit" className="button mt-5">
        Sign in to Verilo
      </button>
    </form>
  );
}
