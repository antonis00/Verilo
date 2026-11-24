import { sweepTestData } from "./supabase-admin";

// Before every run: remove test outlets, stories and topics a failed cleanup left behind.
export default async function globalSetup() {
  await sweepTestData();
}
