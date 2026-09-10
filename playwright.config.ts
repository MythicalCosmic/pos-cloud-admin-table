import { defineConfig, devices } from '@playwright/test'

/**
 * Smart POS admin smoke test config.
 *
 * Most specs intercept API requests with fixtures. login.spec.ts additionally
 * needs a real backend and explicitly supplied credentials:
 *   PW_BASE_URL   — frontend URL (default http://localhost:5181)
 *   PW_EMAIL      — test account email (no default)
 *   PW_PASSWORD   — test account password (no default)
 *
 * Usage:
 *   `yarn smoke:install`, then `yarn smoke` (starts Vite automatically).
 *   Set PW_NO_SERVER=1 when PW_BASE_URL points at an existing frontend.
 */
export default defineConfig({
  testDir: './tests/smoke',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  timeout: 180_000,
  expect: { timeout: 5_000 },

  use: {
    baseURL: process.env.PW_BASE_URL || 'http://localhost:5181',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Spawn `yarn dev` if no server is up yet. Reuses an existing one if found.
  webServer: process.env.PW_NO_SERVER
    ? undefined
    : {
      command: 'yarn dev',
      url: 'http://localhost:5181',
      reuseExistingServer: true,
      timeout: 120_000,
    },
})
