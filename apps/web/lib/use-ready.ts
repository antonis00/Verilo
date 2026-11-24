"use client";

import { useSyncExternalStore } from "react";

const noSubscription = () => () => {};

// False while a page is rendered on the server and hydrated, true once the component's script
// runs. Interactive forms put it in `data-ready`, so tests act on them only once a change will
// stick (a click before that is undone by hydration).
export function useReady(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
}
