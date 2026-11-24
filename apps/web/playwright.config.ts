import { execSync } from "node:child_process";
import { defineConfig, devices } from "@playwright/test";
import { TEST_BRIEFING_SECRET, TEST_REVALIDATE_SECRET } from "./tests/e2e/constants";

// End-to-end tests against a production build and the local Supabase (`npm run db:start` at the
// repo root). The installed Google Chrome is used, so no browser download is needed.
const PORT = 3100;

// Tests that need to set up data (an editor account, a test outlet) use the local Supabase's
// secret key, read once from `supabase status`. It's the well-known local development key and
// never leaves this machine; process.env passes it on to the test workers.
if (!process.env.SUPABASE_SECRET_KEY) {
  try {
    const out = execSync("npx supabase status -o json", {
      cwd: "../..",
      stdio: ["ignore", "pipe", "ignore"],
    }).toString();
    process.env.SUPABASE_SECRET_KEY = JSON.parse(out.slice(out.indexOf("{"))).SECRET_KEY;
  } catch {
    // Supabase isn't running: the tests that need it will fail with a clear message.
  }
}

export default defineConfig({
  globalSetup: "./tests/e2e/global-setup.ts",
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel: "chrome" } },
    { name: "phone", use: { ...devices["Pixel 7"], channel: "chrome" } },
  ],
  webServer: {
    command: `npx next start --port ${PORT}`,
    // Tests refresh the app's cached stories after seeding them (tests/e2e/supabase-admin.ts).
    // The briefing sends through Mailpit, where the tests read it.
    env: {
      ...(process.env as Record<string, string>),
      REVALIDATE_SECRET: TEST_REVALIDATE_SECRET,
      BRIEFING_SECRET: TEST_BRIEFING_SECRET,
      BRIEFING_TEST_MODE: "1",
      UNSUBSCRIBE_SECRET: "test-unsubscribe-secret-0123",
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: "54325",
      // Every test signs in from this one machine.
      SIGN_IN_PER_VISITOR_HOUR: "1000",
    },
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
