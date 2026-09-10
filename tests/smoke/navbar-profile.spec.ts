import { type Page, expect, test } from '@playwright/test'

const admin = {
  id: 1,
  first_name: 'Ada',
  last_name: 'Lovelace',
  email: 'ada.lovelace@example.test',
  role: 'ADMIN',
  status: 'ACTIVE',
  permissions: ['*'],
}

async function seedAdminSession(page: Page) {
  await page.addInitScript(user => {
    localStorage.setItem('appLocale', 'en')
    localStorage.setItem('accessToken', JSON.stringify('navbar-profile-test-token'))
    localStorage.setItem('userData', JSON.stringify(user))
    localStorage.setItem('userAbilities', JSON.stringify([{ action: 'manage', subject: 'all' }]))
  }, admin)
}

async function mockApi(page: Page, options: { logoutStatus?: number } = {}) {
  const requests: Array<{ method: string; path: string }> = []

  await page.route('**/api/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname

    requests.push({ method: request.method(), path })

    if (path.endsWith('/auth-logout') && request.method() === 'POST' && options.logoutStatus) {
      await route.fulfill({
        status: options.logoutStatus,
        json: { success: false },
      })

      return
    }

    if (path.endsWith('/auth-sessions') && request.method() === 'GET') {
      await route.fulfill({ json: { data: { sessions: [] } } })

      return
    }

    await route.fulfill({ json: { success: true, data: {} } })
  })

  return requests
}

test('profile menu exposes the signed-in identity and logs out safely', async ({ page }) => {
  await seedAdminSession(page)

  // Local logout must succeed even if server-side session revocation is unavailable.
  const apiRequests = await mockApi(page, { logoutStatus: 500 })

  await page.goto('/sessions')

  const trigger = page.getByRole('button', { name: 'Account menu' })

  await expect(trigger).toBeVisible()
  await trigger.click()

  const menu = page.getByRole('menu')

  await expect(menu).toBeVisible()
  await expect(menu.getByText('Ada Lovelace', { exact: true })).toBeVisible()
  await expect(menu.getByText('ada.lovelace@example.test', { exact: true })).toBeVisible()
  await expect(menu.getByText('Admin', { exact: true })).toBeVisible()
  await expect(menu.getByRole('menuitem', { name: 'Logout' })).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await expect(trigger).toBeFocused()

  await trigger.click()
  await menu.getByRole('menuitem', { name: 'Logout' }).click()

  await expect(page).toHaveURL(/\/login(?:\?|$)/)
  await expect.poll(() => apiRequests.filter(request =>
    request.method === 'POST' && request.path.endsWith('/api/admins/auth-logout'),
  )).toHaveLength(1)

  const storedSession = await page.evaluate(() => ({
    accessToken: localStorage.getItem('accessToken'),
    userData: localStorage.getItem('userData'),
    userAbilities: localStorage.getItem('userAbilities'),
  }))

  expect(storedSession).toEqual({
    accessToken: null,
    userData: null,
    userAbilities: null,
  })
})

test('profile menu remains inside a compact viewport in light and dark themes', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await seedAdminSession(page)
  await page.addInitScript(() => localStorage.setItem('alphapos-theme', 'dark'))
  await mockApi(page)
  await page.goto('/sessions')

  const trigger = page.getByRole('button', { name: 'Account menu' })
  const menu = page.getByRole('menu', { name: 'Account menu' })

  async function expectMenuInsideViewport() {
    await trigger.click()
    await expect(menu).toBeVisible()

    const box = await menu.boundingBox()

    if (!box)
      throw new Error('Account menu did not produce a visible bounding box')

    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(320)
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.y + box.height).toBeLessThanOrEqual(640)
    await page.keyboard.press('Escape')
  }

  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark')
  await expectMenuInsideViewport()

  await page.getByRole('button', { name: 'Toggle theme' }).click()
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('light')
  await expectMenuInsideViewport()
})
