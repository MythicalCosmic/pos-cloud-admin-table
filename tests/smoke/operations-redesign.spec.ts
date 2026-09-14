import { expect, test, type Page } from '@playwright/test'
import { expectControlsToFit } from './helpers/controlGeometry'

// Transport-only fixtures. No sample records or values enter application code.
const categories = [
  { id: 1, name: 'Kitchen', status: 'ACTIVE', sort_order: 0, product_count: 2, colors: ['#2563eb'], description: 'Main dishes and seasonal specials' },
  { id: 2, name: 'Drinks', status: 'ACTIVE', sort_order: 1, product_count: 1, colors: ['#08766a'] },
]
const products = [
  { id: 11, name: 'Roasted pumpkin with herbs and toasted seeds', description: 'A long product description to verify wrapping in the catalog.', price: 78000, category: categories[0], created_at: '2026-09-01T09:00:00Z', updated_at: '2026-09-10T12:00:00Z' },
  { id: 12, name: 'Garden salad', price: 54000, category: categories[0], created_at: '2026-09-01T09:00:00Z', updated_at: '2026-09-10T12:00:00Z' },
  { id: 13, name: 'Green tea', price: 12000, category: categories[1], is_instant: true, created_at: '2026-09-01T09:00:00Z', updated_at: '2026-09-10T12:00:00Z' },
]
const places = [{ id: 1, name: 'Garden room', place_type: 'HALL', capacity: 30, is_active: true }]
const tables = [
  { id: 1, number: 'G-01', capacity: 4, status: 'AVAILABLE', place: places[0] },
  { id: 2, number: 'G-02', capacity: 6, status: 'OCCUPIED', place: places[0] },
  { id: 3, number: 'G-03', capacity: 2, status: 'RESERVED', place: places[0] },
]

interface State { gate?: Promise<void>; fail?: boolean }

async function setup(page: Page, locale = 'en', theme = 'light', state: State = {}) {
  const calls: { path: string; method: string; body: any }[] = []
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(({ locale, theme }) => {
    localStorage.setItem('appLocale', locale)
    localStorage.setItem('alphapos-theme', theme)
    localStorage.setItem('alphapos-palette', 'blue')
    localStorage.setItem('accessToken', JSON.stringify('operations-design-fixture'))
    localStorage.setItem('userData', JSON.stringify({ id: 9, role: 'ADMIN', permissions: ['*'] }))
    localStorage.setItem('userAbilities', JSON.stringify([{ action: 'manage', subject: 'all' }]))
  }, { locale, theme })
  await page.route('**/api/**', async route => {
    const req = route.request()
    const url = new URL(req.url())
    const path = url.pathname
    calls.push({ path, method: req.method(), body: req.postDataJSON() })
    if (req.method() !== 'GET') {
      if (state.gate) await state.gate
      await route.fulfill({ status: state.fail ? 422 : 200, json: state.fail ? { message: 'Please review the supplied values.' } : { data: {} } })
      return
    }
    let data: any = { items: [], users: [], employees: [], departments: [], categories: [], products: [], tables: [], places: [], orders: [], total: 0, pagination: { total: 0 }, settings: { stock_enabled: true, hr_enabled: true }, role: 'ADMIN', permissions: ['*'] }
    if (path.endsWith('/products')) {
      const query = url.searchParams.get('search')?.toLowerCase() || ''
      const filtered = products.filter(product => product.name.toLowerCase().includes(query))
      data = { products: filtered, pagination: { total_products: filtered.length } }
    }
    if (path.endsWith('/products/stats')) data = { total_products: 3, deleted_products: 0 }
    if (path.endsWith('/categories')) data = { categories, pagination: { total_categories: 2 } }
    if (path.endsWith('/categories/stats')) data = { total_categories: 2, active_categories: 2, deleted_categories: 0 }
    if (path.endsWith('/places')) data = { places }
    if (path.endsWith('/tables')) data = { tables }
    if (path.endsWith('/hr/employees/')) data = { employees: [{ id: 1, user: { first_name: 'Alexandra', last_name: 'Mirzayeva', phone: '+998901234567' }, position: 'Senior restaurant manager', department: { name: 'Restaurant operations' }, contract_type: 'FULL_TIME', payment_frequency: 'MONTHLY', base_salary: 7800000, hire_date: '2025-01-15', is_active: true }], pagination: { total: 1, has_next: false } }
    if (path.endsWith('/hr/employees/stats/')) data = { total: 1, active: 1 }
    if (path.endsWith('/hr/departments/')) data = { departments: [{ id: 1, name: 'Restaurant operations' }], pagination: { total: 1 } }
    if (path.endsWith('/stock/items/')) data = { items: [], pagination: { total_items: 0 } }
    if (path.endsWith('/stock/items/stats/')) data = { total_items: 0, low_stock_count: 0, no_category_count: 0, by_type: {} }
    if (path.endsWith('/stock/categories/')) data = { categories }
    if (path.endsWith('/stock/units/')) data = { units: [{ id: 5, name: 'Kilogram', short_name: 'kg' }] }
    await route.fulfill({ json: { success: true, data } })
  })
  return { calls, errors }
}

test('catalog cards preserve keyboard/range selection, the original table, details and guarded editing', async ({ page }) => {
  const state: State = { fail: true }
  const { calls, errors } = await setup(page, 'en', 'light', state)
  await page.goto('/products')
  const cards = page.locator('.product-tile')
  await expect(cards).toHaveCount(3)
  await cards.first().getByRole('checkbox').focus()
  await page.keyboard.press('Space')
  await expect(cards.first().getByRole('checkbox')).toHaveAttribute('aria-checked', 'true')
  await cards.nth(2).getByRole('checkbox').click({ modifiers: ['Shift'] })
  await expect(cards.filter({ has: page.locator('[aria-checked="true"]') })).toHaveCount(3)
  await cards.first().locator('summary').click()
  await expect(cards.first()).toContainText('Updated')
  await page.getByRole('tab', { name: 'Table', exact: true }).click()
  await expect(page.getByRole('columnheader', { name: 'Updated', exact: true })).toBeVisible()
  await page.getByRole('tab', { name: 'Cards', exact: true }).click()
  await cards.first().getByRole('button', { name: products[0].name, exact: true }).click()
  const editor = page.getByRole('dialog', { name: 'Edit Product', exact: true })
  await expect(editor.locator('.modal__symbol')).toBeVisible()
  await page.screenshot({ path: '/tmp/alpha-workspace-redesign/product-editor-desktop.png', animations: 'disabled' })
  await editor.getByRole('textbox', { name: 'Name', exact: true }).fill('Updated dish')
  await editor.getByRole('button', { name: 'Close', exact: true }).click()
  const discard = page.getByRole('dialog', { name: 'Discard changes?', exact: true })
  await expect(discard).toBeVisible()
  await expect(discard.locator('.modal__symbol')).toBeVisible()
  await page.screenshot({ path: '/tmp/alpha-workspace-redesign/discard-dialog-desktop.png', animations: 'disabled' })
  await page.keyboard.press('Escape')
  await expect(discard).toHaveCount(0)
  await expect(editor.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Updated dish')
  let release!: () => void
  state.gate = new Promise(resolve => { release = resolve })
  await editor.getByRole('button', { name: 'Save', exact: true }).dblclick()
  await expect.poll(() => calls.filter(call => call.method === 'PATCH')).toHaveLength(1)
  await expect(editor.getByRole('button', { name: 'Close', exact: true })).toBeDisabled()
  release()
  await expect(page.locator('.alpha-toast').last()).toContainText('Please review the supplied values.')
  await expect(editor.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Updated dish')
  expect(errors).toEqual([])
})

test('category keyboard reordering guards the request and restores server order after rejection', async ({ page }) => {
  const state: State = { fail: true }
  const { calls, errors } = await setup(page, 'en', 'light', state)
  await page.goto('/categories')
  const cards = page.locator('.category-card')
  await expect(cards).toHaveCount(2)
  let release!: () => void
  state.gate = new Promise(resolve => { release = resolve })
  const down = cards.first().getByRole('button', { name: 'Move down', exact: true })
  await down.focus()
  await page.keyboard.press('Enter')
  await expect(cards.first()).toContainText(categories[1].name)
  await expect(cards.first().getByRole('button', { name: 'Move down', exact: true })).toBeDisabled()
  expect(calls.filter(call => call.path.endsWith('/categories/reorder'))).toHaveLength(1)
  expect(calls.find(call => call.path.endsWith('/categories/reorder'))?.body).toEqual({ orders: [{ id: categories[1].id, sort_order: 0 }, { id: categories[0].id, sort_order: 1 }] })
  release()
  await expect(page.locator('.alpha-toast').last()).toContainText('Please review the supplied values.')
  await expect(cards.first()).toContainText(categories[0].name)
  await expect(cards.first().getByRole('button', { name: 'Move down', exact: true })).toBeEnabled()
  expect(errors).toEqual([])
})

test('category editor keeps color selection compact on phones', async ({ page }) => {
  const { errors } = await setup(page, 'en', 'dark')
  await page.goto('/categories')
  const trigger = page.getByRole('button', { name: 'Add Category', exact: true })

  await trigger.click()
  const dialog = page.getByRole('dialog', { name: 'Add Category', exact: true })

  await dialog.locator('.category-color-picker__presets button[title="#2563EB"]').click()
  await expect(dialog.locator('.category-color-picker__value')).not.toContainText('No Color')
  await page.setViewportSize({ width: 320, height: 844 })
  await expect.poll(() => dialog.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
  await expectControlsToFit(page)
  await page.screenshot({ path: '/tmp/alpha-workspace-redesign/category-editor-320.png', animations: 'disabled' })
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  const discard = page.getByRole('dialog', { name: 'Discard changes?', exact: true })

  await expect(discard).toBeVisible()
  await discard.getByRole('button', { name: 'Discard changes', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(trigger).toBeFocused()
  expect(errors).toEqual([])
})

test('phone creation actions stay reachable while their filters are collapsed', async ({ page }) => {
  await setup(page)
  await page.setViewportSize({ width: 320, height: 844 })
  for (const [route, label] of [['/stock/units', 'Add Unit'], ['/stock/product-links', 'Link Product'], ['/stock/adjustments', 'New Code']]) {
    await page.goto(route)
    await expect(page.locator('.workspace-tools__fields').first()).toBeHidden()
    const trigger = page.getByRole('button', { name: label, exact: true })
    await expect(trigger).toBeVisible()
    await trigger.click()
    const dialog = page.getByRole('dialog', { name: label, exact: true })
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('.modal__symbol')).toBeVisible()
    await expectControlsToFit(page)
    await page.screenshot({ path: `/tmp/alpha-workspace-redesign/action-${route.split('/').pop()}-modal-320.png`, animations: 'disabled' })
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(trigger).toBeFocused()
  }
})

test('phone workspace rails reveal the current route even when it is last', async ({ page }) => {
  await setup(page, 'ru', 'dark')
  await page.setViewportSize({ width: 320, height: 900 })

  for (const route of ['/users', '/notification-settings']) {
    await page.goto(route)
    const nav = page.locator('.workspace-heading__nav')
    const active = nav.locator('.is-current')

    await expect(active).toHaveAttribute('aria-current', 'page')
    await expect.poll(async () => {
      const [navBox, activeBox] = await Promise.all([nav.boundingBox(), active.boundingBox()])
      if (!navBox || !activeBox)
        return false

      return activeBox.x >= navBox.x - 1 && activeBox.x + activeBox.width <= navBox.x + navBox.width + 1
    }).toBe(true)
  }
})

test('stock item editor is a responsive task sheet with guarded submission', async ({ page }) => {
  const state: State = {}
  const { calls, errors } = await setup(page, 'en', 'dark', state)
  await page.goto('/stock/items')
  await page.getByRole('button', { name: 'Add Item', exact: true }).first().click()

  const dialog = page.getByRole('dialog', { name: 'Add Stock Item', exact: true })
  await expect(dialog.locator('.stock-item-form__section')).toHaveCount(4)
  await page.screenshot({ path: '/tmp/alpha-workspace-redesign/stock-item-editor-desktop.png', animations: 'disabled' })
  await page.setViewportSize({ width: 320, height: 844 })
  await expect.poll(() => dialog.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
  await expectControlsToFit(page)
  await page.screenshot({ path: '/tmp/alpha-workspace-redesign/stock-item-editor-320.png', animations: 'disabled' })

  await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill('Roasted pumpkin')
  await dialog.getByRole('combobox', { name: 'Base Unit *', exact: true }).click()
  await page.getByRole('option', { name: 'Kilogram (kg)', exact: true }).click()
  let release!: () => void
  state.gate = new Promise(resolve => { release = resolve })
  await dialog.getByRole('button', { name: 'Save', exact: true }).dblclick()
  await expect.poll(() => calls.filter(call => call.method === 'POST' && call.path.endsWith('/stock/items/'))).toHaveLength(1)
  release()
  await expect(dialog).toHaveCount(0)
  expect(calls.find(call => call.method === 'POST' && call.path.endsWith('/stock/items/'))?.body).toMatchObject({ name: 'Roasted pumpkin', base_unit_id: 5, item_type: 'RAW' })
  expect(errors).toEqual([])
})

test('phone filters preserve their values and employee records expose every column', async ({ page }) => {
  const { errors } = await setup(page)
  await page.setViewportSize({ width: 320, height: 900 })
  await page.goto('/hr-employees')
  const record = page.locator('.mobile-record').first()
  await expect(record).toContainText('Alexandra')
  await record.getByRole('button', { name: 'Details', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(record).toContainText('7\u202f800\u202f000')
  await expect(record).toContainText('2025')
  await expect(record.locator('.mobile-record__fields > div')).toHaveCount(8)
  await page.getByRole('button', { name: 'Search & filters', exact: true }).click()
  const search = page.locator('.workspace-tools input').first()
  await search.fill('Alexandra')
  await page.getByRole('button', { name: 'Search & filters', exact: true }).click()
  await expect(search).toBeHidden()
  await page.getByRole('button', { name: 'Search & filters', exact: true }).click()
  await expect(search).toHaveValue('Alexandra')
  await expectControlsToFit(page)
  expect(errors).toEqual([])
})

test('dining status changes stay single-flight and display server rejection', async ({ page }) => {
  const state: State = { fail: true }
  const { calls, errors } = await setup(page, 'en', 'light', state)
  await page.goto('/places')
  await expect(page.locator('.dining-table')).toHaveCount(3)
  let release!: () => void
  state.gate = new Promise(resolve => { release = resolve })
  const status = page.getByRole('combobox', { name: 'Change Status: G-01' })
  await status.click()
  await page.getByRole('option', { name: 'Occupied', exact: true }).click()
  await expect.poll(() => calls.filter(call => call.method === 'PATCH')).toHaveLength(1)
  await expect(status).toBeDisabled()
  expect(calls.find(call => call.method === 'PATCH')?.body).toEqual({ status: 'OCCUPIED' })
  release()
  await expect(page.locator('.alpha-toast').last()).toContainText('Please review the supplied values.')
  await expect(status).toContainText('Available')
  await expect(status).toBeEnabled()
  expect(errors).toEqual([])
})

for (const locale of ['en', 'ru', 'uz']) for (const theme of ['light', 'dark']) {
  test(`populated workspaces fit in ${locale} ${theme}`, async ({ page }) => {
    const { errors } = await setup(page, locale, theme)
    for (const route of ['/products', '/categories', '/places', '/warehouse', '/hr-employees']) {
      await page.setViewportSize({ width: 1440, height: 1000 })
      await page.goto(route)
      await expect(page.locator('.operations-workspace')).toBeVisible()
      await expect(page.locator('#app-loader')).toHaveCount(0)
      await expect(page.locator('.sk-box, .skel').first()).not.toBeVisible()
      if (route === '/hr-employees')
        await expect(page.locator('.hr-emp__kpis .kpi__value').filter({ hasText: /^1$/ })).toHaveCount(3)
      for (const width of [1440, 390, 320]) {
        await page.setViewportSize({ width, height: 1000 })
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await expectControlsToFit(page)
        if (width !== 390) await page.screenshot({ path: `/tmp/alpha-workspace-redesign/${route.slice(1)}-${locale}-${theme}-${width}.png`, animations: 'disabled' })
      }
    }
    expect(errors).toEqual([])
  })
}
