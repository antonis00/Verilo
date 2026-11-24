import { sweepTestData } from "./supabase-admin";

// After every run too: the tests share the local database with the site, so nothing they made
// (outlets, stories, topics, accounts) should stay on it until the next run.
export default async function globalTeardown() {
  await sweepTestData();
}
