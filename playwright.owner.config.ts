import { defineConfig, devices } from '@playwright/test'

/**
 * Owner mobile app smoke tests (src/owner, vite.owner.config.ts).
 * Every spec mocks the API; the app runs in a 390x844 phone viewport.
 *   `yarn smoke:owner` (starts the owner dev server on 5182 automatically).
 */
export default defineConfig({
  testDir: './tests/owner',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  timeout: 120_000,
  expect: { timeout: 7_000 },

  use: {
    baseURL: process.env.PW_OWNER_BASE_URL || 'http://localhost:5182',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'phone',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        hasTouch: true,
        isMobile: false,
      },
    },
  ],

  webServer: process.env.PW_NO_SERVER
    ? undefined
    : {
      command: 'node node_modules/vite/bin/vite.js --config vite.owner.config.ts --mode owner-dev --port 5182 --strictPort',
      url: 'http://localhost:5182',
      reuseExistingServer: true,
      timeout: 120_000,
    },
})
