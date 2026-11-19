import { execSync } from "node:child_process";
import { defineConfig, devices } from "@playwright/test";

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
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
