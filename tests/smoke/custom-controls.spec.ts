import { type Page, expect, test } from '@playwright/test'

test.setTimeout(45_000)

interface State { fail?: boolean; gate?: Promise<void> }
async function setup(page: Page, locale = 'en', theme = 'light', state: State = {}) {
  await page.addInitScript(({ locale, theme }) => {
    localStorage.setItem('appLocale', locale)
    localStorage.setItem('alphapos-theme', theme)
    localStorage.setItem('accessToken', JSON.stringify('custom-controls-fixture'))
    localStorage.setItem('userData', JSON.stringify({ id: 9, name: 'Design review', role: 'ADMIN', permissions: ['*'] }))
    localStorage.setItem('userAbilities', JSON.stringify([{ action: 'manage', subject: 'all' }]))
  }, { locale, theme })
  const calls: { path: string, method: string, body: any }[] = []
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.route('**/api/**', async route => {
    const req = route.request()
    const path = new URL(req.url()).pathname
    calls.push({ path, method: req.method(), body: req.postDataJSON() })
    if (req.method() !== 'GET') {
      if (state.gate) await state.gate
      await route.fulfill({ status: state.fail ? 422 : 200, json: state.fail ? { message: 'Review the supplied values.' } : { data: {} } })
      return
    }
    let data: any = { items: [], total: 0, users: [], employees: [], departments: [], salaries: [], contracts: [], accounts: [], types: [], discounts: [], products: [], categories: [], places: [], tables: [], permissions: [], settings: { hr_enabled: true, stock_enabled: true, waiter_enabled: true } }
    if (path.endsWith('/stock/settings/')) data = { stock_enabled: true, costing_method: 'FIFO' }
    if (path.endsWith('/places')) data.places = [{ id: 1, name: 'Garden room', place_type: 'HALL', capacity: 30 }]
    if (path.endsWith('/categories')) data.categories = [{ id: 1, name: 'Kitchen' }, { id: 2, name: 'Drinks' }]
    await route.fulfill({ json: { data } })
  })
  return { calls, errors }
}

async function cleanGeometry(page: Page) {
  const result = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, native: document.querySelectorAll('main select, main input[type="date"], main input[type="time"], main input[type="month"], main input[type="datetime-local"]').length,
    popupOverflow: [...document.querySelectorAll<HTMLElement>('dialog[open]')].filter(el => { const box = el.getBoundingClientRect(); return box.left < 0 || box.right > innerWidth + 1 || box.bottom > innerHeight + 1 }).length }))
  expect(result.scroll).toBeLessThanOrEqual(result.width + 1)
  expect(result.native).toBe(0)
  expect(result.popupOverflow).toBe(0)
}

test('custom settings switches and select preserve values, search, keyboard and guarded saving', async ({ page }) => {
  const state: State = { fail: true }
  const { calls, errors } = await setup(page, 'en', 'light', state)
  await page.goto('/stock/settings')
  const saves = page.getByRole('button', { name: 'Save Settings', exact: true })
  await expect(saves.first()).toBeDisabled()
  const stock = page.getByRole('switch', { name: 'Stock Enabled', exact: true })
  await stock.focus()
  await page.keyboard.press('Space')
  await expect(stock).toHaveAttribute('aria-checked', 'false')
  await page.getByRole('combobox', { name: 'Costing Method', exact: true }).click()
  await page.locator('.search-select__search input').fill('Average')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('combobox', { name: 'Costing Method', exact: true })).toContainText('Average')
  let release!: () => void
  state.gate = new Promise(resolve => { release = resolve })
  await saves.first().dblclick()
  expect(calls.filter(c => c.method === 'PUT')).toHaveLength(1)
  expect(calls.find(c => c.method === 'PUT')?.body).toMatchObject({ stock_enabled: false, costing_method: 'AVERAGE' })
  release()
  await expect(page.locator('.alpha-toast').last()).toContainText('Review the supplied values.')
  await expect(saves.first()).toBeEnabled()
  await expect(stock).toHaveAttribute('aria-checked', 'false')
  state.fail = false
  state.gate = undefined
  await saves.first().click()
  await expect(saves.first()).toBeDisabled()
  expect(errors).toEqual([])
  await cleanGeometry(page)
})

test('date-only field uses calendar navigation, commits ISO date, and returns focus', async ({ page }) => {
  const { errors } = await setup(page)
  await page.goto('/hr-employees')
  await page.locator('.page__head-actions').getByRole('button', { name: 'New Employee', exact: true }).click()
  const modal = page.getByRole('dialog', { name: 'New Employee', exact: true })
  const trigger = modal.locator('.date-input__trigger').first()
  await trigger.click()
  const calendar = page.locator('dialog.calendar-popover[open]')
  await expect(calendar).toBeVisible()
  await page.keyboard.press('ArrowLeft')
  const iso = await page.locator(':focus').getAttribute('data-date')
  await page.keyboard.press('Enter')
  await expect(calendar).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await expect(modal.locator('.date-input input[type="hidden"]').first()).toHaveValue(iso!)
  await trigger.click()
  await calendar.getByRole('button', { name: 'Next month', exact: true }).click()
  await page.keyboard.press('Tab')
  await expect(calendar.locator('[data-date][tabindex="0"]')).toHaveCount(1)
  await expect(calendar.locator('[data-date][tabindex="0"]')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(modal).toBeVisible()
  await expect(trigger).toBeFocused()
  expect(errors).toEqual([])
})

test('a month with a mid-month minimum remains selectable and focuses an allowed date', async ({ page }) => {
  const { errors } = await setup(page)
  await page.clock.setFixedTime(new Date('2026-09-20T07:00:00Z'))
  await page.goto('/money-control')
  await page.getByRole('button', { name: 'From', exact: true }).click()
  const calendar = page.locator('dialog.calendar-popover[open]')
  await calendar.locator('[data-date="2026-09-10"]').click()
  await page.getByRole('button', { name: 'To', exact: true }).click()
  await calendar.locator('.calendar-popover__month-switch').click()
  await expect(calendar.getByRole('button', { name: 'September', exact: true })).toBeEnabled()
  await calendar.getByRole('button', { name: 'September', exact: true }).click()
  await expect(calendar.locator('[data-date="2026-09-09"]')).toBeDisabled()
  await expect(calendar.locator('[data-date="2026-09-10"]')).toBeEnabled()
  await expect(calendar.locator('[data-date][tabindex="0"]')).toBeFocused()
  expect(errors).toEqual([])
})

test('month picker and date-time picker have custom controls and exact model values', async ({ page }) => {
  const { errors } = await setup(page)
  await page.goto('/hr-salaries')
  await page.locator('.date-input__trigger').first().click()
  const month = page.locator('dialog.calendar-popover[open]')
  await month.getByRole('button', { name: 'January', exact: true }).click()
  await expect(page.locator('.date-input input[type="hidden"]').first()).toHaveValue(/-01$/)
  await page.goto('/discounts')
  await page.getByRole('button', { name: 'New Discount', exact: true }).click()
  const modal = page.getByRole('dialog', { name: 'New Discount', exact: true })
  await modal.locator('.date-input__trigger').first().click()
  const calendar = page.locator('dialog.calendar-popover[open]')
  const day = calendar.locator('[data-date]:not(:disabled)').nth(10)
  const iso = await day.getAttribute('data-date')
  await day.click()
  await calendar.getByRole('textbox', { name: 'Hours', exact: true }).fill('25')
  await expect(calendar.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled()
  await calendar.getByRole('textbox', { name: 'Hours', exact: true }).fill('09')
  await calendar.getByRole('textbox', { name: 'Minutes', exact: true }).fill('35')
  await calendar.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(modal.locator('.date-input input[type="hidden"]').first()).toHaveValue(`${iso}T09:35`)
  expect(errors).toEqual([])
})

test('custom dialog select preserves numeric IDs and guards duplicate create requests', async ({ page }) => {
  const state: State = { fail: true }
  const { calls, errors } = await setup(page, 'en', 'light', state)
  await page.goto('/places')
  await page.getByRole('button', { name: 'Add Table', exact: true }).click()
  const modal = page.getByRole('dialog', { name: 'New Table', exact: true })
  await modal.getByRole('textbox', { name: 'Number', exact: true }).fill('G-2')
  await modal.getByRole('combobox', { name: 'Place', exact: true }).click()
  await page.getByRole('option', { name: 'Garden room', exact: true }).click()
  let release!: () => void
  state.gate = new Promise(resolve => { release = resolve })
  await modal.getByRole('button', { name: 'Save', exact: true }).dblclick()
  await expect(modal.getByRole('button', { name: 'Close', exact: true })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(modal).toBeVisible()
  expect(calls.filter(c => c.method === 'POST')).toHaveLength(1)
  expect(calls.find(c => c.method === 'POST')?.body).toMatchObject({ place_id: 1, number: 'G-2', capacity: 4 })
  release()
  await expect(page.locator('.alpha-toast').last()).toContainText('Review the supplied values.')
  await expect(modal.getByRole('textbox', { name: 'Number', exact: true })).toHaveValue('G-2')
  expect(errors).toEqual([])
})

for (const locale of ['en', 'ru', 'uz']) for (const theme of ['light', 'dark']) {
  test(`custom inputs fit desktop and mobile in ${locale}, ${theme}`, async ({ page }) => {
    const { errors } = await setup(page, locale, theme)
    await page.goto('/stock/settings')
    await expect(page.locator('.settings-section__fields')).toHaveCount(6)
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 })
      await cleanGeometry(page)
      if ([1440, 390].includes(width)) await page.screenshot({ path: `/tmp/smart-pos-settings-${locale}-${theme}-${width}.png`, animations: 'disabled' })
    }
    await page.goto('/hr-employees')
    await page.locator('.page__head-actions .btn--primary').click()
    await page.locator('.modal .date-input__trigger').first().click()
    await cleanGeometry(page)
    await page.screenshot({ path: `/tmp/smart-pos-calendar-${locale}-${theme}-320.png`, animations: 'disabled' })
    expect(errors).toEqual([])
  })
}

test('custom confirmation can be dismissed and only the chosen place is deleted', async ({ page }) => {
  const { calls, errors } = await setup(page)
  await page.goto('/places')
  const trigger = page.getByRole('button', { name: 'Delete: Garden room', exact: true })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: 'Delete this place?', exact: true })
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(trigger).toBeFocused()
  expect(calls.filter(call => call.method === 'DELETE')).toHaveLength(0)
  await trigger.click()
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect.poll(() => calls.filter(call => call.method === 'DELETE')).toHaveLength(1)
  expect(calls.find(call => call.method === 'DELETE')?.path).toBe('/api/admins/places/1')
  expect(errors).toEqual([])
})

test('a nested discard dialog traps focus and Escape preserves the unsaved form', async ({ page }) => {
  const { calls, errors } = await setup(page)
  await page.goto('/categories')
  await page.getByRole('button', { name: 'Add Category', exact: true }).first().click()
  const form = page.getByRole('dialog', { name: 'Add Category', exact: true })
  await form.getByRole('textbox', { name: 'Name', exact: true }).fill('Unsaved category')
  const close = form.getByRole('button', { name: 'Close', exact: true })
  await close.click()
  const confirmation = page.getByRole('dialog', { name: 'Discard changes?', exact: true })
  await expect(confirmation).toBeVisible()
  const confirmLayer = await confirmation.locator('..').evaluate(el => Number(getComputedStyle(el).zIndex))
  const formLayer = await form.locator('..').evaluate(el => Number(getComputedStyle(el).zIndex))
  expect(confirmLayer).toBeGreaterThan(formLayer)
  await confirmation.getByRole('button', { name: 'Discard changes', exact: true }).focus()
  await page.keyboard.press('Tab')
  await expect(confirmation.getByRole('button', { name: 'Close', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(confirmation).toHaveCount(0)
  await expect(form.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Unsaved category')
  await expect(close).toBeFocused()
  await close.click()
  await confirmation.getByRole('button', { name: 'Discard changes', exact: true }).click()
  await expect(form).toHaveCount(0)
  expect(calls.filter(call => call.method !== 'GET')).toHaveLength(0)
  expect(errors).toEqual([])
})
