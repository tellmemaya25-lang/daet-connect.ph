import { defineConfig } from "@playwright/test";

/**
 * Tours E2E + accessibility suite (F12), at phone width against a mock
 * Supabase (e2e/mock-supabase.cjs). Run: npm run test:e2e:tours
 * Set PW_CHROMIUM_PATH to use a preinstalled Chromium.
 */
const port = 3101;
const mockPort = 54329;
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    viewport: { width: 375, height: 812 },
    isMobile: true,
    hasTouch: true,
    trace: "retain-on-failure",
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  webServer: [
    {
      command: "node e2e/mock-supabase.cjs",
      url: `http://127.0.0.1:${mockPort}/rest/v1/tours_packages`,
      reuseExistingServer: !process.env.CI,
      env: { MOCK_SUPABASE_PORT: String(mockPort), MOCK_COVERS: "1" },
    },
    {
      command: `npx next dev --port ${port}`,
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${mockPort}`,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "e2e-anon-key",
        SUPABASE_SERVICE_ROLE_KEY: "",
        QR_SIGNING_SECRET: "e2e-only-qr-signing-secret-0123456789abcdef",
        NEXT_TELEMETRY_DISABLED: "1",
      },
    },
  ],
});
