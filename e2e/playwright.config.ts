import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E configuration for Stovo testing runner.
 * Supports running inside LXC container, local machine, or CI pipeline.
 */
const BASE_URL = process.env.E2E_BASE_URL || process.env.BASE_URL || 'http://localhost:8081';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  timeout: 30000,
  expect: {
    timeout: 5000,
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      fullPage: true,
    },
  },
  reporter: process.env.CI
    ? [
        ['html', { open: 'never', outputFolder: 'playwright-report' }],
        ['junit', { outputFile: 'test-results/results.xml' }],
        ['github'],
      ]
    : [
        ['html', { open: 'never' }],
        ['list'],
      ],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    headless: true,
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
