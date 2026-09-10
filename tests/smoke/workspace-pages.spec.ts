import { type Page, expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { expectControlsToFit } from './helpers/controlGeometry'

test.setTimeout(45_000)
const source = path.resolve(process.cwd(), 'src/pages')
function routeFiles(dir: string): string[] { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? routeFiles(path.join(dir, entry.name)) : entry.name.endsWith('.vue') ? [path.join(dir, entry.name)] : []) }
const routes = routeFiles(source).map(file => `/${path.relative(source, file).replace(/\.vue$/, '').replace(/(^|\/)index$/, '').replace(/\[id\]/g, '1').replace('[...all]', 'missing-workspace-page')}`.replace(/\/$/, '') || '/')
const collectionNames = ['items', 'users', 'categories', 'products', 'orders', 'places', 'tables', 'discounts', 'types', 'employees', 'departments', 'salaries', 'contracts', 'documents', 'goals', 'events', 'reviews', 'expenses', 'leaves', 'balances', 'accounts', 'transactions', 'suppliers', 'locations', 'levels', 'batches', 'units', 'recipes', 'transfers', 'counts', 'alerts', 'adjustments', 'reservations', 'requests', 'purchase_orders', 'purchase_invoices', 'production_orders', 'product_links', 'sessions', 'templates', 'logs', 'queue', 'payments', 'predictions', 'roles', 'permissions', 'rules', 'cases', 'attendance', 'anomalies', 'records', 'reports', 'notifications', 'plans', 'shifts', 'results']
async function installFixture(page: Page, locale: string, theme: string, palette: string) {
  await page.addInitScript(({ locale, theme, palette }) => {
    localStorage.setItem('appLocale', locale)
    localStorage.setItem('alphapos-theme', theme)
    localStorage.setItem('alphapos-palette', palette)
    localStorage.setItem('numberFormat', 'full')
    localStorage.setItem('accessToken', JSON.stringify('workspace-route-fixture'))
    localStorage.setItem('userData', JSON.stringify({ id: 9, name: 'Workspace test', role: 'ADMIN', permissions: ['*'] }))
    localStorage.setItem('userAbilities', JSON.stringify([{ action: 'manage', subject: 'all' }]))
  }, { locale, theme, palette })
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname.includes('/analytics/comparison')) { await route.fulfill({ status: 404, json: { message: 'Comparison endpoint unavailable in fixture' } }); return }
    const data: any = Object.fromEntries(collectionNames.map(name => [name, []]))
    Object.assign(data, { total: 0, count: 0, total_items: 0, pagination: { total: 0, total_items: 0, page: 1, per_page: 20 }, summary: {}, stats: {}, overview: {}, settings: { hr_enabled: true, stock_enabled: true, waiter_enabled: true }, id: 1, name: 'Test record', status: 'ACTIVE' })
    if (url.pathname.endsWith('/stock/settings/')) Object.assign(data, { stock_enabled: true, costing_method: 'FIFO' })
    if (url.pathname.endsWith('/licensing/status')) Object.assign(data, { status: 'UNREGISTERED', is_blocked: false })
    if (url.pathname.endsWith('/auth-me')) Object.assign(data, { id: 9, role: 'ADMIN', permissions: ['*'] })
    await route.fulfill({ json: { success: true, data, suggestions: [], actions: [], chats: [] } })
  })
}

// Every route keeps its real component, field bindings and permissions. Only transport data is a fixture.
for (const route of routes.filter(route => !['/login'].includes(route))) {
  test(`workspace route ${route} fits its empty state and mobile layout`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    await installFixture(page, process.env.QA_LOCALE || 'ru', process.env.QA_THEME || 'dark', process.env.QA_PALETTE || 'blue')
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto(route)
    await expect(page.locator('#app-loader')).toHaveCount(0)
    await expect(page.locator('main, .page, .app-main, .public-state').first()).toBeVisible()
    await page.screenshot({ path: `/tmp/smart-pos-route-${route.replace(/\W/g, '-') || 'root'}-desktop.png`, animations: 'disabled' })
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 })
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      const native = await page.locator('main select, main input[type="date"], main input[type="month"], main input[type="time"], main input[type="datetime-local"]').count()
      expect(native).toBe(0)
      await expectControlsToFit(page)
    }
    expect(errors).toEqual([])
    await page.screenshot({ path: `/tmp/smart-pos-route-${route.replace(/\W/g, '-') || 'root'}-mobile.png`, animations: 'disabled' })
  })
}
