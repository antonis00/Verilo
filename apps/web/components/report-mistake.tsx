"use client";

import { useActionState } from "react";
import { reportMistake, type ReportState } from "@/app/story/[id]/actions";

// "Report a mistake": a closed fold under the story, so it's always there but never in the way.
export function ReportMistake({ storyId }: { storyId: number }) {
  const [state, action, pending] = useActionState<ReportState, FormData>(reportMistake, null);
  if (state?.ok) {
    return (
      <p role="status" className="meta">
        {state.message}
      </p>
    );
  }
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-ink-muted hover:text-ink">Report a mistake</summary>
      <form action={action} className="mt-3 max-w-prose">
        <input type="hidden" name="story" value={storyId} />
        {/* Left empty by people; filled in by simple bots. */}
        <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" />
        <label htmlFor="report-note" className="font-semibold">
          What is wrong?
        </label>
        <p id="report-note-hint" className="meta mt-1">
          A fact in the summary, a story that mixes two events, a wrong label… An editor reads every
          report.
        </p>
        <textarea
          id="report-note"
          name="note"
          required
          minLength={3}
          maxLength={1000}
          rows={4}
          aria-describedby="report-note-hint"
          className="field mt-2 block w-full"
        />
        <button type="submit" className="button button-secondary mt-3" disabled={pending}>
          {pending ? "Sending…" : "Send report"}
        </button>
        {state && !state.ok ? (
          <p role="alert" className="mt-3 border-l-2 border-accent pl-3">
            {state.message}
          </p>
        ) : null}
      </form>
    </details>
  );
}
