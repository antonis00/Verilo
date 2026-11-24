"use client";

import { useState, useTransition } from "react";
import { toggleSaved } from "@/app/story/[id]/actions";

// "Save" on a story page: keeps it in the reader's Saved list (linked from Preferences).
export function SaveStory({ storyId, saved }: { storyId: number; saved: boolean }) {
  const [isSaved, setSaved] = useState(saved);
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      aria-pressed={isSaved}
      disabled={pending}
      className="quiet-link text-sm font-semibold underline-offset-4 hover:underline"
      onClick={() =>
        startTransition(async () => {
          if (await toggleSaved(storyId, !isSaved)) setSaved(!isSaved);
        })
      }
    >
      {isSaved ? "Saved" : "Save for later"}
    </button>
  );
}
