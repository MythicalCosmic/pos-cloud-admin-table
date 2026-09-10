import { type Page, expect, test } from '@playwright/test'

async function setup(page: Page, locale = 'en', theme = 'light') {
  await page.addInitScript(({ locale, theme }) => {
    localStorage.setItem('appLocale', locale)
    localStorage.setItem('alphapos-theme', theme)
    localStorage.setItem('accessToken', JSON.stringify('sidebar-fixture'))
    localStorage.setItem('userData', JSON.stringify({ id: 9, role: 'ADMIN', permissions: ['*'] }))
    localStorage.setItem('userAbilities', JSON.stringify([{ action: 'manage', subject: 'all' }]))
  }, { locale, theme })
  await page.route('**/api/**', route => route.fulfill({ json: { data: { items: [], products: [], categories: [], users: [], discounts: [], total: 0, settings: { hr_enabled: true, stock_enabled: true }, role: 'ADMIN', permissions: ['*'] } } }))
}

test('sidebar search exposes grouped destinations and restores the current route', async ({ page }) => {
  await setup(page)
  await page.goto('/discounts/secret-word')
  const sidebar = page.locator('#primary-navigation')
  await expect(sidebar.locator('[aria-current="page"]')).toHaveCount(1)
  await expect(sidebar.locator('[aria-current="page"]')).toHaveAttribute('href', '/discounts/secret-word')
  await sidebar.locator('a[href="/discounts"]').click()
  await expect(page).toHaveURL(/\/discounts$/)
  await page.keyboard.press('/')
  const search = sidebar.getByRole('textbox', { name: 'Find a page…' })
  await expect(search).toBeFocused()
  await search.fill('supplier')
  await expect(sidebar.locator('a[href="/stock/suppliers"]')).toBeVisible()
  await search.fill('no matching workspace')
  await expect(sidebar.getByText('No results', { exact: true })).toBeVisible()
  await search.press('Escape')
  await expect(search).toHaveValue('')
  await expect(sidebar.locator('a[aria-current="page"]')).toBeVisible()
  const finance = sidebar.getByRole('button', { name: 'Finance', exact: true })
  await expect(finance).toHaveAttribute('aria-expanded', 'false')
  await finance.click()
  await expect(sidebar.locator('a[href="/treasury"]')).toBeVisible()
  await page.reload()
  await expect(sidebar.getByRole('button', { name: 'Finance', exact: true })).toHaveAttribute('aria-expanded', 'true')
})

test('compact navigation keeps accessible labels and expands correctly on mobile', async ({ page }) => {
  await setup(page)
  await page.goto('/users')
  const sidebar = page.locator('#primary-navigation')
  await sidebar.getByRole('button', { name: 'Collapse sidebar', exact: true }).first().click()
  await expect(sidebar).toHaveClass(/is-collapsed/)
  await expect(sidebar.getByRole('link', { name: 'Users', exact: true })).toHaveAttribute('aria-current', 'page')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('.mobile-tabbar [aria-controls="primary-navigation"]').click()
  await expect(sidebar).not.toHaveClass(/is-collapsed/)
  await expect(sidebar.locator('.nav-item__label').filter({ hasText: /^Users$/ })).toBeVisible()
  await sidebar.getByRole('textbox', { name: 'Find a page…' }).focus()
  await page.keyboard.press('Escape')
  await expect(sidebar).toHaveAttribute('aria-hidden', 'true')
  await expect(page.locator('.mobile-tabbar [aria-controls="primary-navigation"]')).toBeFocused()
})

for (const locale of ['en', 'ru', 'uz']) for (const theme of ['light', 'dark']) {
  test(`sidebar spacing and full labels in ${locale}, ${theme}`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await setup(page, locale, theme)
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto('/users')
    const sidebar = page.locator('#primary-navigation')
    await page.screenshot({ path: `/tmp/smart-pos-sidebar-${locale}-${theme}-desktop.png`, animations: 'disabled' })
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 780 })
      await page.locator('.mobile-tabbar [aria-controls="primary-navigation"]').click()
      await expect(sidebar).toHaveClass(/is-open/)
      await expect.poll(() => sidebar.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
      const clipping = await sidebar.locator('.nav-item__label:visible').evaluateAll(elements => elements.filter(el => el.scrollWidth > el.clientWidth + 1).length)
      expect(clipping).toBe(0)
      if (width === 320) await page.screenshot({ path: `/tmp/smart-pos-sidebar-${locale}-${theme}-mobile.png`, animations: 'disabled' })
      await page.keyboard.press('Escape')
    }
    expect(errors).toEqual([])
  })
}
