import { type Page, expect, test } from '@playwright/test'

interface AdjustmentRequest {
  path?: string
  body: Record<string, unknown>
  idempotencyKey?: string
}

interface StockApiOptions {
  transactions?: Array<Record<string, any>>
  itemTransactions?: Array<Record<string, any>>
  itemTotalTransactions?: number
  alreadyReversedIds?: number[]
}

const adjustmentApprover = {
  id: 71,
  name: 'Stock Approver',
  email: 'stock.approver@example.test',
  role: 'MANAGER',
  status: 'ACTIVE',
  permissions: ['stock.adjustment.approve', 'stock.catalog.view', 'stock.level.view', 'stock.batch.view'],
}

async function seedSession(page: Page, permissions = adjustmentApprover.permissions) {
  const user = { ...adjustmentApprover, permissions }

  await page.addInitScript(sessionUser => {
    localStorage.setItem('appLocale', 'en')
    localStorage.setItem('numberFormat', 'full')
    localStorage.setItem('alphapos-theme', 'light')
    localStorage.setItem('accessToken', JSON.stringify('stock-adjustment-test-token'))
    localStorage.setItem('userData', JSON.stringify(sessionUser))
    localStorage.setItem('userAbilities', JSON.stringify([{ action: 'manage', subject: 'all' }]))
  }, user)
}

function collectRuntimeErrors(page: Page) {
  const errors: string[] = []

  page.on('console', message => {
    if (message.type() === 'error')
      errors.push(`console: ${message.text()}`)
  })
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`))

  return errors
}

async function mockStockApi(page: Page, requests: AdjustmentRequest[], options: StockApiOptions = {}) {
  const reversedIds = new Set<number>()
  const getResponses: Record<string, unknown> = {
    '/stock/items/': {
      success: true,
      data: {
        items: [
          { id: 901, name: 'Brown rice', track_batches: false, base_unit_short: 'kg' },
          { id: 902, name: 'Lot-tracked cheese', track_batches: true, base_unit_short: 'kg' },
        ],
      },
    },
    '/stock/items/901/': {
      success: true,
      data: {
        item: {
          id: 901,
          name: 'Brown rice',
          track_batches: false,
          base_unit_id: 11,
          base_unit: { id: 11, name: 'Kilogram', short_name: 'kg' },
          alternative_units: [{ id: 91, unit_id: 12, unit_name: 'Bag', short_name: 'bag', conversion_to_base: '25.0000' }],
        },
      },
    },
    '/stock/items/902/': {
      success: true,
      data: { item: { id: 902, name: 'Lot-tracked cheese', track_batches: true } },
    },
    '/stock/locations/': {
      success: true,
      data: { locations: [{ id: 501, name: 'Main warehouse', type: 'WAREHOUSE', is_active: true }] },
    },
    '/stock/units/': {
      success: true,
      data: { units: [{ id: 11, name: 'Kilogram', short_name: 'kg' }] },
    },
    '/stock/categories/': { success: true, data: { categories: [] } },
    '/stock/levels/': {
      success: true,
      data: {
        levels: [
          {
            id: 801,
            stock_item_id: 901,
            location_id: 501,
            stock_item: { id: 901, name: 'Brown rice', sku: 'RAW-901', unit: 'kg' },
            location: { id: 501, name: 'Main warehouse' },
            quantity: '10.5001',
            reserved_quantity: '1.0000',
            available_quantity: '9.5001',
            pending_in_quantity: '0.0000',
            last_movement_at: '2026-09-03T09:00:00+05:00',
          },
          {
            id: 802,
            stock_item_id: 902,
            location_id: 501,
            stock_item: { id: 902, name: 'Lot-tracked cheese', sku: 'RAW-902', unit: 'kg' },
            location: { id: 501, name: 'Main warehouse' },
            quantity: '4.0000',
            reserved_quantity: '0.0000',
            available_quantity: '4.0000',
            pending_in_quantity: '0.0000',
            last_movement_at: '2026-09-03T09:00:00+05:00',
          },
        ],
        pagination: { page: 1, per_page: 10, total: 2, total_pages: 1 },
      },
    },
    '/stock/levels/item/901/': {
      success: true,
      data: {
        levels: [{
          stock_item_id: 901,
          location_id: 501,
          quantity: '10.5001',
          reserved_quantity: '1.0000',
          available_quantity: '9.5001',
        }],
      },
    },
    '/stock/levels/location/501/': {
      success: true,
      data: {
        levels: [{
          stock_item: { id: 901, name: 'Brown rice', sku: 'RAW-901', unit: 'kg' },
          quantity: '10.5001',
          reserved_quantity: '1.0001',
          available_quantity: '9.5000',
          last_movement_at: '2026-09-03T09:00:00+05:00',
        }],
      },
    },
    '/stock/transactions/item/901/': {
      success: true,
      data: {
        transactions: options.itemTransactions ?? [],
        total_transactions: options.itemTotalTransactions ?? options.itemTransactions?.length ?? 0,
        summary: [],
      },
    },
    '/stock/transactions/': {
      success: true,
      data: { transactions: [], pagination: { page: 1, per_page: 10, total: 0 } },
    },
    '/stock/variance-codes/': { success: true, data: { codes: [] } },
  }

  await page.route('**/api/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const method = request.method()

    if (method === 'POST' && path.endsWith('/stock/adjust/')) {
      requests.push({
        path,
        body: request.postDataJSON(),
        idempotencyKey: request.headers()['idempotency-key'],
      })
      await route.fulfill({
        json: {
          success: true,
          data: { transaction_id: 7001, quantity_before: '10.5000', quantity_after: '8.2500' },
        },
      })
      return
    }

    const reverseMatch = path.match(/\/stock\/adjust\/(\d+)\/reverse\/$/)
    if (method === 'POST' && reverseMatch) {
      const transactionId = Number(reverseMatch[1])

      requests.push({
        path,
        body: request.postDataJSON(),
        idempotencyKey: request.headers()['idempotency-key'],
      })
      if (options.alreadyReversedIds?.includes(transactionId)) {
        await route.fulfill({
          status: 409,
          json: {
            success: false,
            code: 'STOCK_ADJUSTMENT_ALREADY_REVERSED',
            message: 'This stock adjustment has already been reversed.',
          },
        })
        return
      }
      reversedIds.add(transactionId)
      await route.fulfill({
        json: { success: true, data: { transaction_id: 9000 + transactionId } },
      })
      return
    }

    if (method === 'GET' && path.endsWith('/stock/transactions/') && options.transactions) {
      const type = new URL(request.url()).searchParams.get('type')
      const transactions = [
        ...options.transactions,
        ...[...reversedIds].map(id => ({
          id: 9000 + id,
          transaction_number: `TRX-REV-${id}`,
          movement_type: 'ADJUSTMENT_PLUS',
          reference_type: 'StockAdjustmentReversal',
          reference_id: id,
          stock_item_name: 'Brown rice',
          location_name: 'Main warehouse',
          quantity: '1.0000',
          notes: 'Correction',
          created_at: '2026-09-03T12:00:00+05:00',
        })),
      ].filter(row => row.movement_type === type)

      await route.fulfill({
        json: {
          success: true,
          data: { transactions, pagination: { page: 1, per_page: 100, total: transactions.length } },
        },
      })
      return
    }

    const matchingResponse = method === 'GET'
      ? Object.entries(getResponses).find(([suffix]) => path.endsWith(suffix))?.[1]
      : undefined

    if (matchingResponse) {
      await route.fulfill({ json: matchingResponse })
      return
    }

    await route.fulfill({ json: { success: true, data: {} } })
  })
}

async function chooseOption(page: Page, comboboxName: string | RegExp, optionName: string) {
  await page.getByRole('combobox', { name: comboboxName }).click()
  await page.getByRole('option', { name: optionName, exact: true }).click()
}

test.describe('secure stock adjustments', () => {
  test('submits only the canonical contract with a stable idempotency key', async ({ page }) => {
    await seedSession(page)

    const runtimeErrors = collectRuntimeErrors(page)
    const requests: AdjustmentRequest[] = []

    await mockStockApi(page, requests)
    await page.goto('/stock/adjustments')

    await expect(page.getByRole('heading', { name: 'Stock Adjustment' })).toBeVisible()
    await chooseOption(page, 'Stock Item', 'Brown rice')
    const unit = page.getByRole('combobox', { name: 'Unit' })

    await unit.click()
    await expect(page.getByRole('option', { name: 'kg · Base unit', exact: true })).toBeVisible()
    await expect(page.getByRole('option', { name: 'bag · ×25.0000', exact: true })).toBeVisible()
    await expect(page.getByRole('option', { name: /liter/i })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await chooseOption(page, 'Location', 'Main warehouse')

    const movement = page.getByRole('combobox', { name: 'Movement Type' })

    await movement.click()
    await expect(page.getByRole('listbox').getByRole('option')).toHaveText([
      'Select movement type',
      'Adjustment +',
      'Adjustment −',
      'Waste',
      'Spoilage',
    ])
    await page.getByRole('option', { name: 'Waste', exact: true }).click()
    await expect(page.getByText('Available (unreserved): 9.5001')).toBeVisible()

    await page.getByLabel('Quantity').fill('2.2500')
    await page.getByRole('button', { name: 'Submit Adjustment' }).click()
    await expect(page.getByLabel('Reason')).toHaveAttribute('aria-invalid', 'true')
    expect(requests).toHaveLength(0)

    await page.getByLabel('Reason').fill('Damaged packaging')
    await page.getByLabel('Quantity').fill('9.5002')
    await page.getByRole('button', { name: 'Submit Adjustment' }).click()
    await expect(page.getByText('Quantity cannot exceed the available (unreserved) stock of 9.5001.')).toBeVisible()
    expect(requests).toHaveLength(0)

    await page.getByLabel('Quantity').fill('2.25001')
    await page.getByRole('button', { name: 'Submit Adjustment' }).click()
    await expect(page.getByLabel('Quantity')).toHaveAttribute('aria-invalid', 'true')
    expect(requests).toHaveLength(0)

    await page.getByLabel('Quantity').fill('2.2500')
    await page.getByRole('button', { name: 'Submit Adjustment' }).click()
    await expect.poll(() => requests.length).toBe(1)

    expect(requests[0].idempotencyKey).toBeTruthy()
    expect(requests[0].body).toEqual({
      stock_item_id: 901,
      location_id: 501,
      movement_type: 'WASTE',
      quantity: '2.2500',
      reason: 'Damaged packaging',
    })

    await chooseOption(page, 'Stock Item', 'Lot-tracked cheese')
    await expect(page.getByText(/Direct adjustments are temporarily unavailable for batch-tracked items/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Submit Adjustment' })).toBeDisabled()
    expect(runtimeErrors).toEqual([])
  })

  test('shows an honest permission state without loading adjustment lookups', async ({ page }) => {
    await seedSession(page, ['stock.level.view', 'stock.batch.view'])

    const requests: AdjustmentRequest[] = []
    let lookupRequests = 0

    await mockStockApi(page, requests)
    page.on('request', request => {
      const path = new URL(request.url()).pathname
      if (['/stock/items/', '/stock/locations/', '/stock/units/'].some(suffix => path.endsWith(suffix)))
        lookupRequests += 1
    })

    await page.goto('/stock/adjustments')

    await expect(page).toHaveURL(/\/not-authorized$/)
    await expect(page.getByText('You are not authorized', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Submit Adjustment' })).toHaveCount(0)
    expect(lookupRequests).toBe(0)
    expect(requests).toHaveLength(0)
  })

  test('does not request protected history or variance-code data for an adjustment-only approver', async ({ page }) => {
    await seedSession(page, ['stock.adjustment.approve', 'stock.catalog.view', 'stock.level.view'])

    const requests: AdjustmentRequest[] = []
    const protectedReads: string[] = []

    await mockStockApi(page, requests)
    page.on('request', request => {
      const path = new URL(request.url()).pathname
      if (path.endsWith('/stock/transactions/') || path.endsWith('/stock/variance-codes/'))
        protectedReads.push(path)
    })

    await page.goto('/stock/adjustments')

    await expect(page.getByRole('button', { name: 'Submit Adjustment' })).toBeVisible()
    await expect(page.getByText('You don\'t have permission for this action', { exact: true })).toHaveCount(2)
    await expect(page.getByRole('button', { name: 'Seed Defaults' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'New Code' })).toHaveCount(0)
    expect(protectedReads).toEqual([])
  })

  test('keeps reservations Admin-only and projects outgoing stock correctly', async ({ page }) => {
    await seedSession(page)

    const runtimeErrors = collectRuntimeErrors(page)
    const requests: AdjustmentRequest[] = []

    await mockStockApi(page, requests)
    await page.goto('/stock/levels')

    const riceRow = page.locator('tbody tr').filter({ hasText: 'Brown rice' })
    const batchRow = page.locator('tbody tr').filter({ hasText: 'Lot-tracked cheese' })

    await expect(riceRow).toBeVisible()
    await expect(riceRow).toContainText('10.5001')
    await expect(riceRow.getByTitle('Adjust quantity')).toBeVisible()
    await expect(page.getByTitle('Reserve stock')).toHaveCount(0)
    await expect(page.getByTitle('Release reservation')).toHaveCount(0)
    await expect(batchRow.getByTitle('Adjust quantity')).toBeEnabled()

    await riceRow.getByTitle('Adjust quantity').click()

    const dialog = page.getByRole('dialog', { name: 'Adjust quantity' })

    await expect(dialog).toBeVisible()
    await chooseOption(page, /Movement type/i, 'Waste')
    await dialog.getByLabel('Quantity').fill('2.2500')
    await dialog.getByLabel('Reason').fill('Expired during storage')
    await expect(dialog.locator('.lvl-projection')).toContainText('8.2501')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect.poll(() => requests.length).toBe(1)

    expect(requests[0].idempotencyKey).toBeTruthy()
    expect(requests[0].body).toEqual({
      stock_item_id: 901,
      location_id: 501,
      quantity: '2.2500',
      movement_type: 'WASTE',
      reason: 'Expired during storage',
    })

    await batchRow.getByTitle('Adjust quantity').click()
    await expect(page.getByText(/Direct adjustments are temporarily unavailable for batch-tracked items/)).toBeVisible()
    await expect(page.getByRole('dialog', { name: 'Adjust quantity' })).toHaveCount(0)
    expect(requests).toHaveLength(1)
    expect(runtimeErrors).toEqual([])
  })

  test('edits a variance code through the deployed detail endpoint', async ({ page }) => {
    await seedSession(page, [
      'stock.adjustment.approve',
      'stock.catalog.view',
      'stock.level.view',
      'stock.count.view',
      'stock.manage',
    ])

    const requests: AdjustmentRequest[] = []
    const updates: Record<string, unknown>[] = []

    await mockStockApi(page, requests)
    await page.route('**/api/admins/stock/variance-codes/**', async route => {
      const request = route.request()
      const path = new URL(request.url()).pathname

      if (request.method() === 'GET' && path.endsWith('/stock/variance-codes/')) {
        await route.fulfill({
          json: {
            success: true,
            data: {
              codes: [{
                id: 61,
                code: 'COUNT_ERR',
                name: 'Count error',
                description: 'Original description',
                requires_approval: true,
                is_active: true,
              }],
            },
          },
        })
        return
      }

      if (request.method() === 'PUT' && path.endsWith('/stock/variance-codes/61/')) {
        updates.push(request.postDataJSON())
        await route.fulfill({ json: { success: true, data: { code: { id: 61 } } } })
        return
      }

      await route.fallback()
    })

    await page.goto('/stock/adjustments')

    const row = page.locator('tbody tr').filter({ hasText: 'COUNT_ERR' })

    await expect(row).toBeVisible()
    await row.getByTitle('Edit').click()

    const dialog = page.getByRole('dialog', { name: 'Edit' })

    await expect(dialog.getByRole('button', { name: 'Cancel' })).toHaveCount(0)
    await dialog.getByLabel('Name').fill('Inventory count mismatch')
    await dialog.getByLabel('Description').fill('Reviewed count difference')
    await dialog.getByRole('button', { name: 'Save' }).click()

    await expect.poll(() => updates.length).toBe(1)
    expect(updates[0]).toEqual({
      name: 'Inventory count mismatch',
      description: 'Reviewed count difference',
      requires_approval: true,
      is_active: true,
    })
  })

  test('loads every capped stock-item page and bounds recent adjustment history', async ({ page }) => {
    await seedSession(page)

    const requests: AdjustmentRequest[] = []
    const itemPages: number[] = []
    const historyTypes: string[] = []

    await mockStockApi(page, requests)
    await page.route('**/api/admins/stock/items/**', async route => {
      const request = route.request()
      const url = new URL(request.url())
      if (request.method() !== 'GET' || !url.pathname.endsWith('/stock/items/')) {
        await route.fallback()
        return
      }

      const requestedPage = Number(url.searchParams.get('page') ?? 1)

      itemPages.push(requestedPage)
      await route.fulfill({
        json: {
          success: true,
          data: {
            items: requestedPage === 1
              ? Array.from({ length: 100 }, (_, index) => ({ id: index + 1, name: `Item ${index + 1}` }))
              : [{ id: 101, name: 'Tail item' }],
            pagination: { page: requestedPage, per_page: 100, total: 101, total_pages: 2 },
          },
        },
      })
    })
    await page.route('**/api/admins/stock/transactions/**', async route => {
      const url = new URL(route.request().url())
      const type = String(url.searchParams.get('type'))
      const index = ['ADJUSTMENT_PLUS', 'ADJUSTMENT_MINUS', 'WASTE', 'SPOILAGE'].indexOf(type)

      historyTypes.push(type)
      await route.fulfill({
        json: {
          success: true,
          data: {
            transactions: [{
              id: 1000 + index,
              movement_type: type,
              stock_item_name: `History item ${index + 1}`,
              location_name: 'Main warehouse',
              quantity: '0.0001',
              notes: `History sentinel ${index + 1}`,
              created_at: `2026-09-03T0${index + 1}:00:00+05:00`,
            }],
            pagination: { page: 1, per_page: 100, total: type === 'WASTE' ? 101 : 1, total_pages: type === 'WASTE' ? 2 : 1 },
          },
        },
      })
    })

    await page.goto('/stock/adjustments')

    await expect.poll(() => [...new Set(itemPages)].sort()).toEqual([1, 2])
    await page.getByRole('combobox', { name: 'Stock Item' }).click()
    await expect(page.getByRole('option', { name: 'Tail item', exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect.poll(() => [...new Set(historyTypes)].sort()).toEqual([
      'ADJUSTMENT_MINUS',
      'ADJUSTMENT_PLUS',
      'SPOILAGE',
      'WASTE',
    ])
    expect(historyTypes).toHaveLength(4)
    await expect(page.getByText('Showing up to the latest 100 records for each adjustment type.')).toBeVisible()
    for (let index = 1; index <= 4; index += 1)
      await expect(page.getByText(`History sentinel ${index}`)).toBeVisible()
  })

  test('reverses eligible outgoing adjustments and handles already-reversed evidence', async ({ page }) => {
    await seedSession(page)

    const requests: AdjustmentRequest[] = []
    const transaction = (
      id: number,
      movement_type: string,
      reference_type: string,
      created_at: string,
      reference_id?: number,
    ) => ({
      id,
      transaction_number: `TRX-${id}`,
      movement_type,
      reference_type,
      reference_id,
      stock_item_id: 901,
      stock_item_name: 'Brown rice',
      location_name: 'Main warehouse',
      quantity: '1.0000',
      unit: 'kg',
      base_quantity: '1.0000',
      notes: `Adjustment ${id}`,
      created_at,
    })

    await mockStockApi(page, requests, {
      alreadyReversedIds: [113],
      transactions: [
        transaction(110, 'WASTE', 'StockWaste', '2026-09-03T11:00:00+05:00'),
        transaction(111, 'ADJUSTMENT_PLUS', 'StockAdjustment', '2026-09-03T10:00:00+05:00'),
        transaction(112, 'ADJUSTMENT_MINUS', 'StockAdjustment', '2026-09-03T09:00:00+05:00'),
        transaction(912, 'ADJUSTMENT_PLUS', 'StockAdjustmentReversal', '2026-09-03T09:30:00+05:00', 112),
        transaction(113, 'SPOILAGE', 'StockWaste', '2026-09-03T08:00:00+05:00'),
        { ...transaction(114, 'WASTE', 'StockWaste', '2026-09-03T07:00:00+05:00'), batch_id: 44 },
        {
          ...transaction(115, 'WASTE', 'StockWaste', '2026-09-03T06:00:00+05:00'),
          quantity: '1.0000',
          unit: 'bag',
          base_quantity: '25.0000',
        },
      ],
    })

    await page.goto('/stock/adjustments')

    const wasteRow = page.getByRole('row').filter({ hasText: 'Adjustment 110' })
    const incomingRow = page.getByRole('row').filter({ hasText: 'Adjustment 111' })
    const reversedRow = page.getByRole('row').filter({ hasText: 'Adjustment 112' })
    const reversalRow = page.getByRole('row').filter({ hasText: 'Adjustment 912' })
    const batchRow = page.getByRole('row').filter({ hasText: 'Adjustment 114' })
    const alternativeUnitRow = page.getByRole('row').filter({ hasText: 'Adjustment 115' })

    await expect(wasteRow.getByTitle('Reverse adjustment')).toBeEnabled()
    await expect(incomingRow.getByTitle(/locked until the server atomically protects/i)).toBeDisabled()
    await expect(batchRow.getByTitle(/locked until the server atomically protects/i)).toBeDisabled()
    await expect(alternativeUnitRow).toContainText(/1\s+bag/)
    await expect(alternativeUnitRow).toContainText(/25\s+kg/)
    await expect(alternativeUnitRow.getByTitle(/locked until the server atomically protects/i)).toBeDisabled()
    await expect(reversedRow.getByText('Reversed', { exact: true })).toBeVisible()
    await expect(reversalRow.getByText('Reversal', { exact: true })).toBeVisible()

    await wasteRow.getByTitle('Reverse adjustment').click()
    const dialog = page.getByRole('dialog', { name: 'Reverse stock adjustment' })

    await expect(dialog).toContainText('TRX-110')
    await dialog.getByRole('button', { name: 'Reverse adjustment' }).click()
    await expect(dialog.getByLabel('Reason')).toHaveAttribute('aria-invalid', 'true')
    await dialog.getByLabel('Reason').fill('Wrong spoilage posting')
    await dialog.getByRole('button', { name: 'Reverse adjustment' }).click()

    await expect.poll(() => requests.filter(request => request.path?.includes('/reverse/')).length).toBe(1)
    const firstReverse = requests.find(request => request.path?.endsWith('/110/reverse/'))

    expect(firstReverse).toMatchObject({
      path: '/api/admins/stock/adjust/110/reverse/',
      body: { reason: 'Wrong spoilage posting' },
    })
    expect(firstReverse?.idempotencyKey).toBeTruthy()
    await expect(wasteRow.getByText('Reversed', { exact: true })).toBeVisible()

    const conflictRow = page.getByRole('row').filter({ hasText: 'Adjustment 113' })

    await conflictRow.getByTitle('Reverse adjustment').click()
    const conflictDialog = page.getByRole('dialog', { name: 'Reverse stock adjustment' })

    await conflictDialog.getByLabel('Reason').fill('Retry after uncertain response')
    await conflictDialog.getByRole('button', { name: 'Reverse adjustment' }).click()
    await expect(conflictRow.getByText('Reversed', { exact: true })).toBeVisible()
  })

  test('shows transaction and base units truthfully in item history', async ({ page }) => {
    await seedSession(page)

    const requests: AdjustmentRequest[] = []

    await mockStockApi(page, requests, {
      itemTransactions: [{
        id: 720,
        transaction_number: 'TRX-ALT-720',
        movement_type: 'ADJUSTMENT_PLUS',
        location_name: 'Main warehouse',
        quantity: '1.0000',
        unit: 'bag',
        base_quantity: '25.0000',
        quantity_before: '75.0000',
        quantity_after: '100.0000',
        unit_cost: '8000.00',
        total_cost: '200000.00',
        notes: 'Received one full bag',
        created_at: '2026-09-03T10:00:00+05:00',
      }],
    })

    await page.goto('/stock/items/901')

    const row = page.getByRole('row').filter({ hasText: 'Received one full bag' })

    await expect(row).toContainText(/1\s+bag/)
    await expect(row).toContainText(/25\s+kg/)
    await expect(row).toContainText(/75\s+kg/)
    await expect(row).toContainText(/100\s+kg/)
  })

  test('keeps the transacted base unit out of item updates and clears nullable fields explicitly', async ({ page }) => {
    await seedSession(page, [...adjustmentApprover.permissions, 'stock.manage'])

    const requests: AdjustmentRequest[] = []
    const updates: Array<Record<string, unknown>> = []

    await mockStockApi(page, requests)
    await page.route('**/api/admins/stock/items/901/', async route => {
      if (route.request().method() !== 'PUT') {
        await route.fallback()
        return
      }

      updates.push(route.request().postDataJSON())
      await route.fulfill({ json: { success: true, data: { item: { id: 901 } } } })
    })

    await page.goto('/stock/items/901')
    await page.getByRole('button', { name: 'Edit', exact: true }).click()

    const dialog = page.getByRole('dialog', { name: 'Edit' })

    await expect(dialog.getByRole('combobox', { name: 'Base unit' })).toHaveAttribute('aria-disabled', 'true')
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()

    await expect.poll(() => updates.length).toBe(1)
    expect(updates[0]).not.toHaveProperty('base_unit_id')
    expect(updates[0]).toMatchObject({
      category_id: null,
      max_stock_level: null,
      default_expiry_days: null,
    })
  })

  test('discloses when item history is capped before local filtering', async ({ page }) => {
    await seedSession(page)

    const requests: AdjustmentRequest[] = []

    await mockStockApi(page, requests, {
      itemTransactions: [{
        id: 721,
        transaction_number: 'TRX-LIMIT-721',
        movement_type: 'ADJUSTMENT_PLUS',
        location_name: 'Main warehouse',
        quantity: '1.0000',
        unit: 'kg',
        base_quantity: '1.0000',
        quantity_before: '10.0000',
        quantity_after: '11.0000',
        notes: 'Newest capped row',
        created_at: '2026-09-03T10:00:00+05:00',
      }],
      itemTotalTransactions: 145,
    })

    await page.goto('/stock/items/901')

    await expect(page.getByText('Showing the newest 1 of 145 movements. Filters apply only to the loaded rows.')).toBeVisible()
    await expect(page.getByText('1 of 145', { exact: true })).toBeVisible()
  })

  test('keeps warehouse locations available when edit-only lookups are not permitted', async ({ page }) => {
    await seedSession(page, [
      'stock.adjustment.approve',
      'stock.catalog.view',
      'stock.level.view',
      'stock.batch.view',
    ])

    const requests: AdjustmentRequest[] = []
    let categoryRequests = 0

    await mockStockApi(page, requests)
    await page.route('**/api/admins/stock/categories/**', async route => {
      categoryRequests += 1
      await route.fulfill({ status: 403, json: { success: false, message: 'Forbidden' } })
    })

    await page.goto('/stock/items/901')
    await page.getByRole('button', { name: 'Adjust stock' }).click()

    const dialog = page.getByRole('dialog', { name: 'Adjust stock' })

    await expect(dialog.getByRole('combobox', { name: 'Location' })).toContainText('Main warehouse')
    expect(categoryRequests).toBe(0)
  })

  test('keeps list filters and hierarchy truthful when locations switch views', async ({ page }) => {
    await seedSession(page)

    const requests: AdjustmentRequest[] = []
    const locationQueries: string[] = []

    await mockStockApi(page, requests)
    await page.route('**/api/admins/stock/locations/**', async route => {
      const url = new URL(route.request().url())
      const includeInactive = url.searchParams.get('include_inactive') === 'true'

      locationQueries.push(url.search)
      await route.fulfill({
        json: {
          success: true,
          data: {
            locations: [
              { id: 501, name: 'Main warehouse', type: 'WAREHOUSE', is_active: true, sort_order: 1 },
              { id: 502, name: 'Prep room', type: 'PREP', parent_id: 501, is_active: true, sort_order: 1 },
              ...(includeInactive
                ? [{ id: 503, name: 'Old storage', type: 'STORAGE', is_active: false, sort_order: 2 }]
                : []),
            ],
          },
        },
      })
    })

    await page.goto('/stock/locations')
    await expect(page.getByText('Prep room', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Tree View' }).click()
    await expect(page.getByRole('button', { name: 'List View' })).toBeVisible()
    await page.getByText('Include Inactive', { exact: true }).click()
    await expect(page.getByText('Old storage', { exact: true })).toBeVisible()
    expect(locationQueries.some(query => query.includes('tree=true'))).toBe(false)
    expect(locationQueries.some(query => query.includes('include_inactive=true'))).toBe(true)
  })

  test('keeps four decimal places in the location stock modal', async ({ page }) => {
    await seedSession(page)

    const requests: AdjustmentRequest[] = []

    await mockStockApi(page, requests)
    await page.goto('/stock/locations')

    const row = page.getByRole('row').filter({ hasText: 'Main warehouse' })

    await row.getByTitle('View Stock at Location').click()
    const dialog = page.getByRole('dialog', { name: /Stock at Location: Main warehouse/ })

    await expect(dialog.getByText('10.5001', { exact: true })).toBeVisible()
    await expect(dialog.getByText('1.0001', { exact: true })).toBeVisible()
    await expect(dialog.getByText('9.5', { exact: true })).toBeVisible()
  })

  test('maps All and Inactive variance filters to the backend all-codes contract', async ({ page }) => {
    await seedSession(page, [
      'stock.adjustment.approve',
      'stock.catalog.view',
      'stock.level.view',
      'stock.count.view',
    ])

    const requests: AdjustmentRequest[] = []
    const activeQueries: string[] = []

    await mockStockApi(page, requests)
    await page.route('**/api/admins/stock/variance-codes/**', async route => {
      const request = route.request()
      const url = new URL(request.url())
      if (request.method() !== 'GET' || !url.pathname.endsWith('/stock/variance-codes/')) {
        await route.fallback()
        return
      }

      const active = url.searchParams.get('active') ?? ''

      activeQueries.push(active)
      await route.fulfill({
        json: {
          success: true,
          data: {
            codes: [
              { id: 1, code: 'ACTIVE_CODE', name: 'Active code', is_active: true },
              ...(active === 'false'
                ? [{ id: 2, code: 'INACTIVE_CODE', name: 'Inactive code', is_active: false }]
                : []),
            ],
          },
        },
      })
    })

    await page.goto('/stock/adjustments')

    const varianceCard = page.locator('.card').filter({ hasText: 'Variance Codes' })
    const status = varianceCard.getByRole('combobox', { name: 'Status' })

    await status.click()
    await page.getByRole('option', { name: 'Inactive', exact: true }).click()
    await expect(varianceCard.getByText('INACTIVE_CODE')).toBeVisible()
    await expect(varianceCard.getByText('ACTIVE_CODE', { exact: true })).toHaveCount(0)

    await status.click()
    await page.getByRole('option', { name: 'All', exact: true }).click()
    await expect(varianceCard.getByText('ACTIVE_CODE', { exact: true })).toBeVisible()
    await expect(varianceCard.getByText('INACTIVE_CODE', { exact: true })).toBeVisible()
    expect(activeQueries).toContain('false')
  })
})
