import { sweepTestData } from "./supabase-admin";

// Before every run: remove test outlets, stories, topics and accounts a failed cleanup left behind.
export default async function globalSetup() {
  await sweepTestData();
}
