import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "call-ui-regressions.spec.ts",
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5176",
    viewport: { width: 1280, height: 800 },
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE },
  },
  webServer: {
    command: "./node_modules/.bin/vite --configLoader runner --host 127.0.0.1 --port 5176 --strictPort",
    cwd: "../frontend",
    url: "http://127.0.0.1:5176/test-fixtures/call-ui.html",
    reuseExistingServer: !process.env.CI,
  },
});
