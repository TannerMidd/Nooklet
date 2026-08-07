import { defineConfig, devices } from "@playwright/test";

const defaultPort = 42121;
const baseURL = process.env.NOOKLET_E2E_BASE_URL ?? `http://127.0.0.1:${defaultPort}`;
const baseUrl = new URL(baseURL);
const port = baseUrl.port || String(defaultPort);
const databaseUrl = `file:./.codex-tmp/e2e-${process.pid}/nooklet.db`;
const externalServer = process.env.NOOKLET_E2E_EXTERNAL_SERVER === "1";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  // Bootstrap mutates the single-use database by design. Retrying against the
  // same live server would test a different state and hide the original fault.
  retries: 0,
  reporter: process.env.NOOKLET_E2E_COMPLETION_FILE
    ? [[process.env.CI ? "github" : "list"], ["./e2e/completion-reporter.ts"]]
    : process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: externalServer ? undefined : {
    // This flow exercises the web boundary only. Starting Next directly keeps
    // Playwright responsible for exactly one child process and makes teardown
    // reliable on Windows; worker behavior is covered by its integration suite.
    command: `node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port ${port}`,
    url: `${baseURL}/bootstrap`,
    timeout: 120_000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 15_000 },
    reuseExistingServer: false,
    env: {
      APP_URL: baseURL,
      DATABASE_URL: databaseUrl,
      AUTH_SECRET: "e2e-auth-secret-generated-only-for-tests-0000000000001",
      SECRET_BOX_KEY: "e2e-box-secret-generated-only-for-tests-00000000000002",
      BOOTSTRAP_TOKEN: "e2e-bootstrap-token-generated-only-for-tests-0000003",
      OPERATIONAL_RETENTION_DAYS: "365",
    },
  },
});
