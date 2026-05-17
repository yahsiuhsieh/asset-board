import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";
const shouldStartWebServer = !process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45_000,
  expect: {
    timeout: 10_000
  },
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never" }]]
    : [["list"]],
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  },
  webServer: shouldStartWebServer
    ? {
        command: "npm run dev -- --hostname 127.0.0.1 --port 3100",
        env: {
          BANK_TRANSACTION_PROVIDER: "mock",
          NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN: "",
          PROPERTY_VALUATION_PROVIDER: "mock",
          WEALTHVIBE_E2E_FIXTURES: "1"
        },
        reuseExistingServer: false,
        timeout: 120_000,
        url: baseURL
      }
    : undefined,
  projects: [
    {
      name: "chromium-desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: {
          height: 1000,
          width: 1440
        }
      }
    },
    {
      name: "chromium-mobile",
      use: {
        ...devices["Pixel 5"]
      }
    }
  ]
});
