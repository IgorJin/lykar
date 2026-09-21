import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  globalSetup: './tests/e2e/global-setup.ts',
  reporter: [
    ['line'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  outputDir: 'test-results',
  use: {
    channel: 'chromium',
    headless: true,
    // Playwright disables popup blocking by default; keep real user activation rules.
    launchOptions: { ignoreDefaultArgs: ['--disable-popup-blocking'] },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    // fixtures.ts records all explicit owner/visitor contexts and retains failures.
  },
});
