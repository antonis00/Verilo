"use client";

import { useActionState } from "react";
import { requestSignInLink, type SignInState } from "./actions";

const INITIAL: SignInState = { status: "idle" };

export function SignInForm() {
  const [state, action, pending] = useActionState(requestSignInLink, INITIAL);

  if (state.status === "sent") {
    return (
      <div role="status" className="border-t border-rule pt-6">
        <h2 className="text-xl">Check your inbox</h2>
        <p className="mt-3">
          We sent a sign-in link to <strong className="font-semibold">{state.email}</strong>. It
          works once and expires in an hour.
        </p>
        <p className="meta mt-3">Nothing there after a few minutes? Check your spam folder.</p>
      </div>
    );
  }

  const error = state.status === "error" ? state.message : null;

  return (
    <form action={action} noValidate className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-semibold">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          defaultValue={state.status === "error" ? state.email : ""}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "email-error" : undefined}
          className="field mt-2"
        />
        <p id="email-error" aria-live="polite" className="mt-2 min-h-5 text-sm text-accent">
          {error}
        </p>
      </div>
      <button type="submit" className="button w-full" disabled={pending}>
        {pending ? "Sending…" : "Email me a sign-in link"}
      </button>
    </form>
  );
}
