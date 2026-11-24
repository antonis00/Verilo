import Link from "next/link";
import type { Metadata } from "next";
import { Suspense } from "react";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to Verilo with a link sent to your email. No password needed.",
};

export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return (
    <div className="mx-auto max-w-form py-6 md:py-10">
      <p className="kicker">Your account</p>
      <h1 className="mt-2 text-2xl md:text-3xl">Sign in or create an account</h1>
      <p className="mt-3 text-ink-muted">
        We’ll email you a link. There’s no password to remember.
      </p>
      <p className="meta mt-2">
        New here? Your first 14 days are free, with everything included and no card needed.
      </p>
      <p className="meta mt-1">
        We keep only your email address and the choices you make.{" "}
        <Link href="/privacy">Privacy</Link>
      </p>
      <Suspense>
        <LinkProblem searchParams={searchParams} />
      </Suspense>
      <div className="mt-8">
        <SignInForm />
      </div>
    </div>
  );
}

async function LinkProblem({ searchParams }: Pick<PageProps<"/sign-in">, "searchParams">) {
  const { error } = await searchParams;
  if (error !== "link") return null;
  return (
    <p role="alert" className="mt-6 border-l-2 border-accent pl-4 text-sm">
      That sign-in link has expired or was already used. Ask for a new one below.
    </p>
  );
}
