import { type Page, expect, test } from '@playwright/test'

test.setTimeout(45_000)
interface Fixture { fail?: boolean; gate?: Promise<void>; forecastReason?: string }
async function setup(page: Page, state: Fixture = {}) {
  const calls: { path: string; method: string; body: any }[] = []
  await page.addInitScript(() => {
    localStorage.setItem('appLocale', 'en')
    localStorage.setItem('alphapos-theme', 'light')
    localStorage.setItem('accessToken', JSON.stringify('workspace-features-fixture'))
    localStorage.setItem('userData', JSON.stringify({ id: 9, role: 'ADMIN', permissions: ['*'] }))
    localStorage.setItem('userAbilities', JSON.stringify([{ action: 'manage', subject: 'all' }]))
  })
  await page.route('**/api/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname
    calls.push({ path, method: req.method(), body: req.postDataJSON() })
    if (req.method() !== 'GET') {
      if (state.gate) await state.gate
      await route.fulfill({ status: state.fail ? 422 : 200, json: state.fail ? { message: 'Please review these settings.' } : { data: { rendered: 'Hello, Ali' } } })
      return
    }
    let data: any = { items: [], categories: [], products: [], users: [], total: 0, settings: { stock_enabled: true, hr_enabled: true, waiter_enabled: true }, role: 'ADMIN', permissions: ['*'] }
    if (path.endsWith('/forecast/tomorrow')) data = state.forecastReason ? { tomorrow: '2026-09-10', predictions: [], reason: state.forecastReason } : { tomorrow: '2026-09-10', predictions: [{ product_id: 1, product_name: 'Mushroom soup', suggested_qty: 24, reason: 'Recent orders' }, { product_id: 2, product_name: 'Green tea', suggested_qty: 40 }, { product_id: 3, product_name: 'Seasonal special' }] }
    if (path.endsWith('/notifications/settings/')) data = { brand_name: 'Restaurant', bot_configured: true, timeout: 30, chat_ids: ['1001', '1002'], is_enabled: true }
    if (path.endsWith('/notifications/templates/')) data = [{ id: 7, name: 'Daily summary', notification_type: 'DAILY_SUMMARY', language: 'en', template_text: 'Hello, {first_name}', is_enabled: true }]
    if (path.endsWith('/notifications/logs/')) data = { logs: [{ id: 3, created_at: '2026-09-09T11:30:00Z', notification_type: 'DAILY_SUMMARY', recipient: '1001', status: 'SENT', message: 'Sent successfully' }] }
    if (path.endsWith('/licensing/status')) data = { status: 'UNREGISTERED' }
    if (path.endsWith('/licensing/plans')) data = [{ id: 2, name: 'Standard' }]
    await route.fulfill({ json: { data } })
  })
  return calls
}

test('forecast search, missing quantities and export keep real values', async ({ page }) => {
  await setup(page)
  await page.goto('/forecast/tomorrow')
  await expect(page.getByText('Mushroom soup', { exact: true })).toBeVisible()
  await expect(page.locator('.forecast-summary__metric').last()).toContainText('—')
  await page.getByRole('textbox', { name: 'Search products', exact: true }).fill('soup')
  await expect(page.getByText('Green tea', { exact: true })).toHaveCount(0)
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const download = await downloaded
  const file = await download.path()
  const fs = await import('node:fs/promises')
  const text = await fs.readFile(file!, 'utf8')
  expect(text).toContain('Mushroom soup')
  expect(text).toContain('24')
  expect(text).not.toContain('Green tea')
  await page.getByRole('textbox', { name: 'Search products', exact: true }).fill('missing')
  await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeDisabled()
})

test('notification tags can be added and individually removed without losing the remaining values', async ({ page }) => {
  const state: Fixture = { fail: true }
  const calls = await setup(page, state)
  await page.goto('/notifications')
  await page.getByRole('button', { name: 'Chat IDs', exact: true }).click()
  const picker = page.locator('dialog.multi-select__popover[open]')
  await picker.getByRole('checkbox', { name: '1001', exact: true }).click()
  await picker.getByRole('textbox', { name: 'Search', exact: true }).fill('1003')
  await page.keyboard.press('Enter')
  await expect(picker.getByRole('checkbox', { name: '1003', exact: true })).toHaveAttribute('aria-checked', 'true')
  await picker.getByRole('button', { name: 'Done', exact: true }).click()
  let release!: () => void
  state.gate = new Promise(resolve => { release = resolve })
  await page.getByRole('button', { name: 'Save', exact: true }).dblclick()
  expect(calls.filter(call => call.method === 'PUT')).toHaveLength(1)
  expect(calls.find(call => call.method === 'PUT')?.body.chat_ids).toEqual(['1002', '1003'])
  release()
  await expect(page.locator('.alpha-toast').last()).toContainText('Please review these settings.')
  await expect(page.getByRole('button', { name: 'Chat IDs', exact: true })).toContainText('1003')
  await page.getByRole('tab', { name: 'Logs', exact: true }).click()
  await expect(page.getByText('Sent successfully', { exact: true })).toBeVisible()
})

test('license activation preserves a numeric plan and guards failed requests', async ({ page }) => {
  const state: Fixture = { fail: true }
  const calls = await setup(page, state)
  await page.goto('/licensing/setup')
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill('owner@example.test')
  await page.getByRole('combobox', { name: 'Plan', exact: true }).click()
  await page.getByRole('option', { name: 'Standard', exact: true }).click()
  let release!: () => void
  state.gate = new Promise(resolve => { release = resolve })
  await page.getByRole('button', { name: 'Activate', exact: true }).dblclick()
  expect(calls.filter(call => call.method === 'POST')).toHaveLength(1)
  expect(calls.find(call => call.method === 'POST')?.body).toEqual({ email: 'owner@example.test', plan_id: 2 })
  release()
  await expect(page.getByRole('alert')).toContainText('Please review these settings.')
  await expect(page.getByRole('button', { name: 'Activate', exact: true })).toBeEnabled()
})

test('application module saving preserves all flags and failure keeps the draft', async ({ page }) => {
  const state: Fixture = { fail: true }
  const calls = await setup(page, state)
  await page.goto('/app-settings')
  const save = page.getByRole('button', { name: 'Save', exact: true })
  await expect(save).toBeDisabled()
  const first = page.locator('.module-option').first().getByRole('switch')
  await first.click()
  await save.click()
  await expect(page.locator('.alpha-toast').last()).toContainText('Please review these settings.')
  expect(calls.find(call => call.method === 'PUT')?.body).toMatchObject({ hr_enabled: false, stock_enabled: true, waiter_enabled: true })
  await expect(first).toHaveAttribute('aria-checked', 'false')
  await expect(save).toBeEnabled()
})
