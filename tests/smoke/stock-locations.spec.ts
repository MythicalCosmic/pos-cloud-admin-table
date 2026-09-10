import { type Page, expect, test } from '@playwright/test'

interface CapturedRequest {
  method: string
  path: string
  body?: Record<string, unknown>
}

const locations = [
  {
    id: 1,
    name: 'Main warehouse',
    type: 'WAREHOUSE',
    parent_id: null,
    is_default: true,
    is_production_area: false,
    is_active: true,
    sort_order: 1,
    created_at: '2026-09-03T09:00:00+05:00',
  },
  {
    id: 2,
    name: 'Kitchen store',
    type: 'KITCHEN',
    parent_id: 1,
    is_default: false,
    is_production_area: true,
    is_active: true,
    sort_order: 2,
    created_at: '2026-09-03T09:00:00+05:00',
  },
]

async function seedSession(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('appLocale', 'en')
    localStorage.setItem('numberFormat', 'full')
    localStorage.setItem('alphapos-theme', 'light')
    localStorage.setItem('accessToken', JSON.stringify('stock-location-test-token'))
    localStorage.setItem('userData', JSON.stringify({
      id: 51,
      name: 'Warehouse Manager',
      role: 'MANAGER',
      permissions: ['stock.manage', 'stock.level.view'],
    }))
    localStorage.setItem('userAbilities', JSON.stringify([{ action: 'manage', subject: 'all' }]))
  })
}

function deferred() {
  let release!: () => void
  const promise = new Promise<void>(resolve => { release = resolve })

  return { promise, release }
}

async function installApiMock(page: Page, captured: CapturedRequest[], gates: Map<string, ReturnType<typeof deferred>>) {
  await page.route('**/api/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const method = request.method()

    if (method === 'GET' && path.endsWith('/stock/locations/')) {
      await route.fulfill({
        json: { success: true, data: { locations } },
      })
      return
    }

    const isLocationMutation = (
      (method === 'POST' && path.endsWith('/stock/locations/'))
      || (method === 'PUT' && /\/stock\/locations\/\d+\/$/.test(path))
      || (method === 'DELETE' && /\/stock\/locations\/\d+\/$/.test(path))
      || (method === 'POST' && /\/stock\/locations\/\d+\/set-default\/$/.test(path))
    )

    if (isLocationMutation) {
      captured.push({
        method,
        path,
        body: request.postData() ? request.postDataJSON() : undefined,
      })
      const gate = gates.get(`${method} ${path}`)
      if (gate)
        await gate.promise
      await route.fulfill({ status: method === 'POST' ? 201 : 200, json: { success: true, data: {} } })
      return
    }

    await route.fulfill({ json: { success: true, data: {} } })
  })
}

test.describe('stock location mutations', () => {
  test('omits default state from generic writes and sends null when detaching a child', async ({ page }) => {
    await seedSession(page)
    const captured: CapturedRequest[] = []
    const putGate = deferred()
    const gates = new Map([[`PUT /api/admins/stock/locations/2/`, putGate]])
    await installApiMock(page, captured, gates)

    await page.goto('/stock/locations')
    await expect(page.getByRole('heading', { name: 'Locations & Stock by Location' })).toBeVisible()

    await page.getByRole('button', { name: 'Add Location' }).click()
    const createDialog = page.getByRole('dialog', { name: 'Create Location' })
    await expect(createDialog.getByText('Default Location', { exact: true })).toHaveCount(0)
    await createDialog.getByLabel('Name').fill('Dry store')
    await createDialog.getByRole('button', { name: 'Save' }).click()
    await expect(createDialog).toHaveCount(0)

    expect(captured[0]).toMatchObject({
      method: 'POST',
      path: '/api/admins/stock/locations/',
      body: {
        name: 'Dry store',
        type: 'WAREHOUSE',
        parent_id: null,
        is_production_area: false,
        sort_order: 0,
      },
    })
    expect(captured[0].body).not.toHaveProperty('is_default')
    expect(captured[0].body).not.toHaveProperty('is_active')

    const childRow = page.getByRole('row').filter({ hasText: 'Kitchen store' })
    await childRow.getByTitle('Edit').click()
    const editDialog = page.getByRole('dialog', { name: 'Edit Location' })
    await editDialog.getByRole('combobox', { name: 'Parent Location' }).click()
    await page.getByRole('option', { name: 'Optional. Leave empty for root level', exact: true }).click()
    await editDialog.getByRole('button', { name: 'Save' }).click()

    await expect.poll(() => captured.length).toBe(2)
    expect(captured[1]).toMatchObject({
      method: 'PUT',
      path: '/api/admins/stock/locations/2/',
      body: {
        name: 'Kitchen store',
        type: 'KITCHEN',
        parent_id: null,
        is_production_area: true,
        sort_order: 2,
      },
    })
    expect(captured[1].body).not.toHaveProperty('is_default')
    expect(captured[1].body).not.toHaveProperty('is_active')

    await expect(editDialog.getByLabel('Name')).toBeDisabled()
    await editDialog.getByTitle('Close').click()
    await expect(editDialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(editDialog).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add Location' })).toBeDisabled()
    await expect(page.getByTitle('Edit').first()).toBeDisabled()

    putGate.release()
    await expect(editDialog).toHaveCount(0)
  })

  test('keeps default and deactivate targets locked until their canonical requests finish', async ({ page }) => {
    await seedSession(page)
    const captured: CapturedRequest[] = []
    const defaultGate = deferred()
    const deleteGate = deferred()
    const gates = new Map([
      [`POST /api/admins/stock/locations/2/set-default/`, defaultGate],
      [`DELETE /api/admins/stock/locations/2/`, deleteGate],
    ])
    await installApiMock(page, captured, gates)

    await page.goto('/stock/locations')
    const childRow = page.getByRole('row').filter({ hasText: 'Kitchen store' })

    await childRow.getByTitle('Set as Default').click()
    const defaultDialog = page.getByRole('dialog', { name: 'Set as Default Location?' })
    await defaultDialog.getByRole('button', { name: 'Set as Default' }).click()
    await expect.poll(() => captured.length).toBe(1)
    expect(captured[0]).toMatchObject({
      method: 'POST',
      path: '/api/admins/stock/locations/2/set-default/',
    })
    await defaultDialog.getByTitle('Close').click()
    await expect(defaultDialog).toBeVisible()
    await expect(page.getByTitle('Edit').first()).toBeDisabled()
    defaultGate.release()
    await expect(defaultDialog).toHaveCount(0)

    await childRow.getByTitle('Deactivate').click()
    const deleteDialog = page.getByRole('dialog', { name: 'Deactivate Location?' })
    await deleteDialog.getByRole('button', { name: 'Deactivate' }).click()
    await expect.poll(() => captured.length).toBe(2)
    expect(captured[1]).toMatchObject({
      method: 'DELETE',
      path: '/api/admins/stock/locations/2/',
    })
    await deleteDialog.getByTitle('Close').click()
    await expect(deleteDialog).toBeVisible()
    await expect(page.getByTitle('Edit').first()).toBeDisabled()
    deleteGate.release()
    await expect(deleteDialog).toHaveCount(0)
  })
})
