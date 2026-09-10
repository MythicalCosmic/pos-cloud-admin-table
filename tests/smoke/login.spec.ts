import { expect, test } from '@playwright/test'

// A route smoke test against a real environment must receive a deliberately
// provisioned account. Do not ship a guessed/default production credential.
const EMAIL = process.env.PW_EMAIL
const PASSWORD = process.env.PW_PASSWORD

/** Top-level nav routes we expect to load without console errors. */
const NAV_ROUTES = [
  '/',
  '/ai-assistant',
  '/categories',
  '/products',
  '/orders',
  '/places',
  '/discounts',
  '/shifts',
  '/users',
  '/hr-departments',
  '/hr-salaries',
  '/hr-expenses',
  '/hr-attendance',
  '/hr-leaves',
  '/hr-contracts',
  '/notifications',
  '/app-settings',
]

test.describe('smoke', () => {
  test('login + every top-level nav loads without console errors', async ({ page }) => {
    if (!EMAIL || !PASSWORD) {
      test.skip(true, 'Set PW_EMAIL and PW_PASSWORD to run authenticated browser smoke.')
      return
    }

    // Collect console errors across the whole run; assert at the end.
    const consoleErrors: string[] = []

    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text()

        // Filter out the noisy CASL localStorage warning — known + intentional.
        if (text.includes('localStorage'))
          return

        // Filter Vue HMR / Vite messages.
        if (text.includes('[vite]') || text.includes('[hmr]'))
          return
        consoleErrors.push(text)
      }
    })
    page.on('pageerror', err => consoleErrors.push(`pageerror: ${err.message}`))

    // 1. Login page renders. The app starts in Uzbek, so its visible labels
    // are localized. Input types and the form submit button remain stable in
    // every supported language.
    await page.goto('/login')
    const email = page.locator('input[type="email"]')
    const password = page.locator('input[type="password"]')
    await expect(email).toBeVisible()

    // 2. Login
    await email.fill(EMAIL)
    await password.fill(PASSWORD)
    await page.locator('form button[type="submit"]').click()

    // 3. Should land on dashboard
    await page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 10_000 })
    expect(page.url()).not.toContain('/login')

    // 4. Visit every top-level route and verify no console error fires per route.
    for (const route of NAV_ROUTES) {
      const before = consoleErrors.length

      await page.goto(route)

      // Wait for the page to settle — networkidle is flaky in Vue 3 dev mode,
      // so just wait for either a card to appear or 1.5s, whichever comes first.
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1500)

      const errsForRoute = consoleErrors.slice(before)

      expect(errsForRoute, `console errors on ${route}: ${errsForRoute.join(' | ')}`).toHaveLength(0)
    }
  })
})
