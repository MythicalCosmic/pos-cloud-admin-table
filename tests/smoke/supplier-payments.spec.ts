import { type Page, expect, test } from '@playwright/test'
import { warehousePathAllowed } from '@/navigation/access'
import stockNav from '@/navigation/vertical/stock'

interface CapturedPayment {
  path: string
  body: Record<string, unknown>
  idempotencyKey?: string
}

async function seedSession(page: Page, permissions: string[]) {
  await page.addInitScript(granted => {
    localStorage.setItem('appLocale', 'en')
    localStorage.setItem('numberFormat', 'full')
    localStorage.setItem('alphapos-theme', 'light')
    localStorage.setItem('accessToken', JSON.stringify('supplier-payment-test-token'))
    localStorage.setItem('userData', JSON.stringify({
      id: 41,
      name: 'Stock Manager',
      role: 'MANAGER',
      permissions: granted,
    }))
    localStorage.setItem('userAbilities', JSON.stringify([{ action: 'manage', subject: 'all' }]))
  }, permissions)
}

async function mockSupplierApi(
  page: Page,
  supplierOverride: Record<string, unknown> = {},
  supplierListOverride: Record<string, unknown> = {},
  ledgerTransactions: Array<Record<string, unknown>> = [],
): Promise<CapturedPayment[]> {
  const payments: CapturedPayment[] = []

  await page.route('**/api/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const method = request.method()

    if (method === 'GET' && path.endsWith('/stock/suppliers/')) {
      await route.fulfill({
        json: {
          success: true,
          data: {
            suppliers: [{
              id: 7,
              name: 'Fresh Foods',
              city: 'Tashkent',
              current_balance_uzs: '850000.00',
              rating: 4,
              is_active: true,
              ...supplierListOverride,
            }],
            pagination: { total_suppliers: 1 },
          },
        },
      })
      return
    }

    if (method === 'GET' && path.endsWith('/stock/suppliers/7/')) {
      await route.fulfill({
        json: {
          success: true,
          data: {
            supplier: {
              id: 7,
              name: 'Fresh Foods',
              code: 'SUP-007',
              city: 'Tashkent',
              currency: 'UZS',
              current_balance_uzs: '850000.00',
              credit_limit: '2000000.00',
              payment_terms_days: 7,
              lead_time_days: 2,
              rating: 4,
              is_active: true,
              items: [],
              stats: {},
              ...supplierOverride,
            },
          },
        },
      })
      return
    }

    if (method === 'GET' && path.endsWith('/stock/suppliers/7/ledger/')) {
      const url = new URL(request.url())
      const type = url.searchParams.get('type')
      const sourceAccount = url.searchParams.get('source_account')
      const pageNumber = Number(url.searchParams.get('page') ?? 1)
      const perPage = Number(url.searchParams.get('per_page') ?? 20)
      const filteredTransactions = ledgerTransactions.filter(row =>
        (!type || row.type === type)
        && (!sourceAccount || row.source_account === sourceAccount),
      )
      const start = (pageNumber - 1) * perPage

      await route.fulfill({
        json: {
          success: true,
          data: {
            transactions: filteredTransactions.slice(start, start + perPage),
            pagination: { total: filteredTransactions.length },
          },
        },
      })
      return
    }

    if (method === 'POST' && path.endsWith('/stock/suppliers/7/payments/')) {
      payments.push({
        path,
        body: request.postDataJSON(),
        idempotencyKey: request.headers()['idempotency-key'],
      })
      await route.fulfill({
        status: 201,
        json: { success: true, data: { payment_id: 81 } },
      })
      return
    }

    await route.fulfill({ json: { success: true, data: {} } })
  })

  return payments
}

test.describe('supplier payments and balance permissions', () => {
  test('Manager pays through the canonical endpoint and SAFE clears a bank fee', async ({ page }) => {
    await seedSession(page, [
      'stock.supplier.view',
      'stock.supplier.balance.view',
      'stock.supplier.pay',
    ])

    const payments = await mockSupplierApi(page)

    await page.goto('/stock/suppliers/7')
    await expect(page.getByRole('heading', { name: 'Fresh Foods', level: 1 })).toBeVisible()
    await page.getByRole('button', { name: 'Pay supplier' }).click()

    const dialog = page.getByRole('dialog', { name: 'Pay supplier' })
    const amount = dialog.getByLabel('Amount')

    await page.keyboard.press('Control+K')
    await expect(page.locator('.cmdk-backdrop')).toHaveCount(0)
    await expect(dialog).toBeVisible()
    await amount.fill('100000')
    await expect(amount).toHaveValue(/100.*000/)

    await dialog.getByRole('combobox', { name: 'Source account' }).click()
    await page.getByRole('option', { name: 'Bank', exact: true }).click()
    await dialog.getByLabel('Bank commission').fill('7500')

    await dialog.getByRole('combobox', { name: 'Source account' }).click()
    await page.getByRole('option', { name: 'Safe', exact: true }).click()
    await expect(dialog.getByLabel('Bank commission')).toHaveCount(0)
    await dialog.getByLabel('Note').fill('  Weekly settlement  ')
    await dialog.getByRole('button', { name: 'Save' }).click()

    await expect.poll(() => payments.length).toBe(1)
    expect(payments[0]).toMatchObject({
      path: '/api/admins/stock/suppliers/7/payments/',
      body: {
        amount_uzs: 100_000,
        fee_uzs: 0,
        source_account: 'SAFE',
        allocation_mode: 'AUTO_OLDEST_DUE',
        note: 'Weekly settlement',
      },
    })
    expect(payments[0].idempotencyKey).toBeTruthy()
  })

  test('supplier-only access hides balances, ledger, and payment controls', async ({ page }) => {
    await seedSession(page, ['stock.supplier.view'])
    await mockSupplierApi(page)

    await page.goto('/stock/suppliers/7')
    await expect(page.getByRole('heading', { name: 'Fresh Foods', level: 1 })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Pay supplier' })).toHaveCount(0)
    await expect(page.getByText('Ledger', { exact: true })).toHaveCount(0)
    await expect(page.getByText('Supplier balance', { exact: true })).toHaveCount(0)
  })

  test('payment permission without balance permission does not expose payment controls', async ({ page }) => {
    await seedSession(page, ['stock.supplier.view', 'stock.supplier.pay'])
    await mockSupplierApi(page)

    await page.goto('/stock/suppliers/7')
    await expect(page.getByRole('heading', { name: 'Fresh Foods', level: 1 })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Pay supplier' })).toHaveCount(0)
    await expect(page.getByText('Ledger', { exact: true })).toHaveCount(0)
    await expect(page.getByText('Supplier balance', { exact: true })).toHaveCount(0)
  })

  test('locks supplier-item currency and rejects non-positive order quantities', async ({ page }) => {
    await seedSession(page, [
      'stock.supplier.view',
      'stock.manage',
      'stock.catalog.view',
    ])

    await mockSupplierApi(page, { currency: 'EUR' })
    const createdItems: Array<Record<string, unknown>> = []

    await page.route('**/api/**', async route => {
      const request = route.request()
      const path = new URL(request.url()).pathname

      if (request.method() === 'GET' && path.endsWith('/stock/items/search/')) {
        await route.fulfill({
          json: {
            success: true,
            data: { items: [{ id: 41, name: 'Flour', base_unit_short: 'kg' }] },
          },
        })
        return
      }

      if (request.method() === 'GET' && path.endsWith('/stock/items/41/')) {
        await route.fulfill({
          json: {
            success: true,
            data: {
              item: {
                id: 41,
                name: 'Flour',
                base_unit_id: 3,
                base_unit: { id: 3, name: 'Kilogram', short_name: 'kg' },
                alternative_units: [],
              },
            },
          },
        })
        return
      }

      if (request.method() === 'POST' && path.endsWith('/stock/suppliers/7/items/')) {
        createdItems.push(request.postDataJSON())
        await route.fulfill({ status: 201, json: { success: true, data: { supplier_item_id: 91 } } })
        return
      }

      await route.fallback()
    })

    await page.goto('/stock/suppliers/7')
    await page.getByRole('tab', { name: 'Items', exact: true }).click()
    await page.getByRole('button', { name: 'Add item', exact: true }).first().click()

    const dialog = page.getByRole('dialog', { name: 'Add item to supplier' })
    const stockItem = dialog.getByRole('combobox', { name: 'Stock item' })

    await stockItem.click()
    await page.getByRole('option', { name: 'Flour', exact: true }).click()

    const currency = dialog.getByRole('combobox', { name: 'Currency' })

    await expect(currency).toHaveAttribute('aria-disabled', 'true')
    await expect(currency).toContainText('EUR')
    await expect(dialog.getByRole('combobox', { name: 'Unit' })).toContainText('Kilogram')

    await dialog.getByLabel('Unit price').fill('0')
    await dialog.getByLabel('Minimum order qty').fill('0')
    await dialog.getByLabel('Pack size').fill('25')
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(dialog).toBeVisible()
    expect(createdItems).toHaveLength(0)

    await dialog.getByLabel('Minimum order qty').fill('1.5')
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()
    await expect.poll(() => createdItems.length).toBe(1)
    expect(createdItems[0]).toMatchObject({
      stock_item_id: 41,
      unit_id: 3,
      price: 0,
      currency: 'EUR',
      min_order_qty: 1.5,
      pack_size: 25,
    })
  })

  test('renders and filters payment reversals in both supplier ledger surfaces', async ({ page }) => {
    await seedSession(page, ['stock.supplier.view', 'stock.supplier.balance.view'])
    await mockSupplierApi(page, {}, {}, [{
      id: 501,
      type: 'PAYMENT_REVERSAL',
      amount_uzs: '100000.00',
      balance_after_uzs: '850000.00',
      source_account: 'BANK',
      fee_uzs: '-7500.00',
      reference_type: 'SupplierPayment',
      reference_id: 88,
      note: 'Incorrect payment reversed',
      created_at: '2026-09-03T10:00:00+05:00',
    }, {
      id: 502,
      type: 'PURCHASE',
      amount_uzs: '250000.00',
      balance_after_uzs: '750000.00',
      fee_uzs: '0.00',
      reference_type: 'Supplier',
      reference_id: 7,
      note: 'Opening supplier balance',
      created_at: '2026-09-02T10:00:00+05:00',
    }, {
      id: 503,
      type: 'PURCHASE',
      amount_uzs: '300000.00',
      balance_after_uzs: '500000.00',
      fee_uzs: '0.00',
      reference_type: 'PurchaseReceiving',
      reference_id: 21,
      note: 'Goods received',
      created_at: '2026-09-01T10:00:00+05:00',
    }, {
      id: 504,
      type: 'ADJUSTMENT',
      amount_uzs: '50000.00',
      balance_after_uzs: '200000.00',
      fee_uzs: '0.00',
      reference_type: 'PurchaseReceivingCorrection',
      reference_id: 22,
      note: 'Receiving corrected',
      created_at: '2026-08-31T10:00:00+05:00',
    }])

    await page.goto('/stock/suppliers/7')
    await page.getByRole('tab', { name: 'Ledger', exact: true }).click()

    const detailLedger = page.locator('.card').filter({ hasText: 'Incorrect payment reversed' })

    await expect(detailLedger.getByText('Payment reversal', { exact: true })).toBeVisible()
    await expect(detailLedger.getByText(/\+.*100.*000/)).toBeVisible()
    await expect(detailLedger.getByText(/-.*7.*500/)).toBeVisible()
    await expect(detailLedger.getByText(/Supplier payment.*#88/)).toBeVisible()
    await expect(detailLedger.getByText(/Supplier.*#7/)).toBeVisible()
    await expect(detailLedger.getByText(/Purchase receiving.*#21/)).toBeVisible()
    await expect(detailLedger.getByText(/Purchase receiving correction.*#22/)).toBeVisible()
    await detailLedger.locator('.ledger-filter').first().getByRole('combobox').click()
    await page.getByRole('option', { name: 'Payment reversal', exact: true }).click()
    await expect(detailLedger.getByText('Incorrect payment reversed', { exact: true })).toBeVisible()

    await page.goto('/stock/suppliers')
    await page.getByRole('row').filter({ hasText: 'Fresh Foods' }).getByTitle('Ledger').click()
    const listLedger = page.getByRole('dialog', { name: /Fresh Foods.*Ledger/ })

    await expect(listLedger.getByText('Payment reversal', { exact: true })).toBeVisible()
    await expect(listLedger.getByText(/\+.*100.*000/)).toBeVisible()
    await expect(listLedger.getByText(/Fee.*-.*7.*500/)).toBeVisible()
    await expect(listLedger.getByText(/Supplier payment.*#88/)).toBeVisible()
    await expect(listLedger.getByText(/Supplier.*#7/)).toBeVisible()
    await expect(listLedger.getByText(/Purchase receiving.*#21/)).toBeVisible()
    await expect(listLedger.getByText(/Purchase receiving correction.*#22/)).toBeVisible()
  })

  test('filters the complete supplier ledger on the server before pagination', async ({ page }) => {
    await seedSession(page, ['stock.supplier.view', 'stock.supplier.balance.view'])

    const firstPagePurchases = Array.from({ length: 20 }, (_, index) => ({
      id: 600 + index,
      type: 'PURCHASE',
      amount_uzs: '1000.00',
      balance_after_uzs: String(20_000 - index * 1_000),
      source_account: null,
      fee_uzs: '0.00',
      note: `Purchase row ${index + 1}`,
      created_at: `2026-08-${String(30 - index).padStart(2, '0')}T10:00:00+05:00`,
    }))

    await mockSupplierApi(page, {}, {}, [
      ...firstPagePurchases,
      {
        id: 699,
        type: 'PAYMENT_REVERSAL',
        amount_uzs: '100000.00',
        balance_after_uzs: '120000.00',
        source_account: 'BANK',
        fee_uzs: '-2500.00',
        note: 'Reversal beyond first unfiltered page',
        created_at: '2026-07-01T10:00:00+05:00',
      },
    ])

    await page.goto('/stock/suppliers/7')
    await page.getByRole('tab', { name: 'Ledger', exact: true }).click()

    const detailLedger = page.locator('.card').filter({ has: page.locator('.ledger-filter') })

    await expect(detailLedger.getByText('Reversal beyond first unfiltered page')).toHaveCount(0)
    await detailLedger.locator('.ledger-filter').first().getByRole('combobox').click()
    await page.getByRole('option', { name: 'Payment reversal', exact: true }).click()
    await expect(detailLedger.getByText('Reversal beyond first unfiltered page', { exact: true })).toBeVisible()
    await expect(detailLedger.getByText(/-.*2.*500/)).toBeVisible()
  })

  test('supplier list uses the same canonical BANK payment contract', async ({ page }) => {
    await seedSession(page, [
      'stock.supplier.view',
      'stock.supplier.balance.view',
      'stock.supplier.pay',
    ])

    const payments = await mockSupplierApi(page)

    await page.goto('/stock/suppliers')

    const row = page.getByRole('row').filter({ hasText: 'Fresh Foods' })

    await expect(row).toBeVisible()
    await row.getByTitle('Pay supplier').click()

    const dialog = page.getByRole('dialog', { name: 'Pay supplier' })

    await dialog.getByLabel('Amount').fill('250000')
    await dialog.getByLabel('Commission / fee (optional)').fill('5000')
    await dialog.getByLabel('Note').fill('Invoice 007')
    await dialog.getByRole('button', { name: 'Pay', exact: true }).click()

    await expect.poll(() => payments.length).toBe(1)

    expect(payments[0].body).toEqual({
      amount_uzs: 250_000,
      fee_uzs: 5_000,
      source_account: 'BANK',
      allocation_mode: 'AUTO_OLDEST_DUE',
      note: 'Invoice 007',
    })
    expect(payments[0].idempotencyKey).toBeTruthy()
  })

  test('always preflights list payments against fresh supplier detail', async ({ page }) => {
    await seedSession(page, [
      'stock.supplier.view',
      'stock.supplier.balance.view',
      'stock.supplier.pay',
    ])

    await mockSupplierApi(page, {}, { current_balance_uzs: '0.00' })
    await page.goto('/stock/suppliers')

    const row = page.getByRole('row').filter({ hasText: 'Fresh Foods' })

    await expect(row).toContainText('Settled')
    await expect(row.getByTitle('Pay supplier')).toBeVisible()
    await row.getByTitle('Pay supplier').click()
    await expect(page.getByRole('dialog', { name: 'Pay supplier' }).getByLabel('Amount')).toBeVisible()
  })

  test('blocks supplier edits until a valid detail response has loaded', async ({ page }) => {
    await seedSession(page, ['stock.supplier.view', 'stock.manage'])

    let detailAttempts = 0
    const updates: Array<Record<string, unknown>> = []

    await page.route('**/api/**', async route => {
      const request = route.request()
      const path = new URL(request.url()).pathname

      if (request.method() === 'GET' && path.endsWith('/stock/suppliers/')) {
        await route.fulfill({
          json: {
            success: true,
            data: {
              suppliers: [{ id: 7, name: 'Sparse Supplier', city: 'Tashkent', is_active: true }],
              pagination: { total_suppliers: 1 },
            },
          },
        })
        return
      }

      if (request.method() === 'GET' && path.endsWith('/stock/suppliers/7/')) {
        detailAttempts += 1
        if (detailAttempts === 1) {
          await route.fulfill({ status: 500, json: { success: false, message: 'Unavailable' } })
          return
        }
        if (detailAttempts === 2) {
          await route.fulfill({ json: { success: true, data: { supplier: { name: 'Missing identity' } } } })
          return
        }

        await route.fulfill({
          json: {
            success: true,
            data: {
              supplier: {
                id: 7,
                name: 'Complete Supplier',
                contact_person: 'Warehouse contact',
                city: 'Tashkent',
                rating: 4,
                payment_terms_days: 14,
                lead_time_days: 3,
              },
            },
          },
        })
        return
      }

      if (request.method() === 'PUT' && path.endsWith('/stock/suppliers/7/')) {
        updates.push(request.postDataJSON())
        await route.fulfill({ json: { success: true, data: { supplier: { id: 7 } } } })
        return
      }

      await route.fulfill({ json: { success: true, data: {} } })
    })

    await page.goto('/stock/suppliers')
    const row = page.getByRole('row').filter({ hasText: 'Sparse Supplier' })

    await row.getByTitle('Edit').click()
    const dialog = page.getByRole('dialog', { name: 'Edit Supplier' })

    await expect(dialog.getByText('Failed to load supplier', { exact: true })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0)

    await dialog.getByRole('button', { name: 'Retry', exact: true }).click()
    await expect.poll(() => detailAttempts).toBe(2)
    await expect(dialog.getByText('Failed to load supplier', { exact: true })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0)

    await dialog.getByRole('button', { name: 'Retry', exact: true }).click()
    await expect(dialog.getByLabel('Name')).toHaveValue('Complete Supplier')
    await dialog.getByLabel('Name').fill('Updated Complete Supplier')
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()

    await expect.poll(() => updates.length).toBe(1)
    expect(updates[0]).toMatchObject({
      name: 'Updated Complete Supplier',
      contact_person: 'Warehouse contact',
      payment_terms_days: 14,
      lead_time_days: 3,
    })
  })

  test('blocks overpayment before it reaches the supplier ledger', async ({ page }) => {
    await seedSession(page, [
      'stock.supplier.view',
      'stock.supplier.balance.view',
      'stock.supplier.pay',
    ])

    const payments = await mockSupplierApi(page)

    await page.goto('/stock/suppliers/7')
    await page.getByRole('button', { name: 'Pay supplier' }).click()

    const dialog = page.getByRole('dialog', { name: 'Pay supplier' })

    await dialog.getByLabel('Amount').fill('900000')
    await expect(dialog.getByLabel('Amount')).toHaveAttribute('aria-invalid', 'true')
    await expect(dialog.getByText('Amount cannot exceed the outstanding supplier balance')).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(payments).toHaveLength(0)
  })

  test('explains and blocks a non-UZS supplier payment', async ({ page }) => {
    await seedSession(page, [
      'stock.supplier.view',
      'stock.supplier.balance.view',
      'stock.supplier.pay',
    ])
    await mockSupplierApi(page, { name: 'Euro Produce', currency: 'EUR' })

    await page.goto('/stock/suppliers/7')

    await expect(page.getByText('Supplier payments currently support UZS only')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Pay supplier' })).toBeDisabled()
  })

  test('keeps the newest status filter result when an older inactive request finishes late', async ({ page }) => {
    await seedSession(page, ['stock.supplier.view', 'stock.supplier.balance.view'])

    let releaseInactivePage!: () => void
    const inactivePageGate = new Promise<void>(resolve => { releaseInactivePage = resolve })
    let falsePageOneRequests = 0
    let inactivePageTwoStarted = false
    let inactivePageTwoCompleted = false

    await page.route('**/api/**', async route => {
      const request = route.request()
      const url = new URL(request.url())
      if (request.method() === 'GET' && url.pathname.endsWith('/stock/suppliers/')) {
        const activeOnly = url.searchParams.get('active_only')
        const requestedPage = Number(url.searchParams.get('page') ?? 1)

        if (activeOnly === 'true') {
          await route.fulfill({
            json: {
              success: true,
              data: {
                suppliers: [{ id: 31, name: 'Active latest supplier', is_active: true }],
                pagination: { total_suppliers: 1, total_pages: 1 },
              },
            },
          })
          return
        }

        if (requestedPage === 1) {
          falsePageOneRequests += 1
          const isInitialLoad = falsePageOneRequests === 1

          await route.fulfill({
            json: {
              success: true,
              data: {
                suppliers: [{
                  id: isInitialLoad ? 30 : 32,
                  name: isInitialLoad ? 'Initial supplier' : 'Inactive old page one',
                  is_active: isInitialLoad,
                }],
                pagination: {
                  total_suppliers: isInitialLoad ? 1 : 2,
                  total_pages: isInitialLoad ? 1 : 2,
                },
              },
            },
          })
          return
        }

        inactivePageTwoStarted = true
        await inactivePageGate
        await route.fulfill({
          json: {
            success: true,
            data: {
              suppliers: [{ id: 33, name: 'Inactive old page two', is_active: false }],
              pagination: { total_suppliers: 2, total_pages: 2 },
            },
          },
        })
        inactivePageTwoCompleted = true
        return
      }

      await route.fulfill({ json: { success: true, data: {} } })
    })

    await page.goto('/stock/suppliers')
    await expect(page.getByText('Initial supplier', { exact: true })).toBeVisible()

    const status = page.locator('.toolbar__status').getByRole('combobox')

    await status.click()
    await page.getByRole('option', { name: 'Inactive', exact: true }).click()
    await expect.poll(() => inactivePageTwoStarted).toBe(true)

    await status.click()
    await page.getByRole('option', { name: 'Active', exact: true }).click()
    await expect(page.getByText('Active latest supplier', { exact: true })).toBeVisible()

    releaseInactivePage()
    await expect.poll(() => inactivePageTwoCompleted).toBe(true)
    await page.waitForTimeout(100)
    await expect(page.getByText('Active latest supplier', { exact: true })).toBeVisible()
    await expect(page.getByText(/Inactive old page/)).toHaveCount(0)
  })

  test('keeps late detail and ledger responses under their original supplier', async ({ page }) => {
    await seedSession(page, ['stock.supplier.view', 'stock.supplier.balance.view'])

    let releaseDetailA!: () => void
    let releaseLedgerA!: () => void
    const detailAGate = new Promise<void>(resolve => { releaseDetailA = resolve })
    const ledgerAGate = new Promise<void>(resolve => { releaseLedgerA = resolve })
    let detailAStarted = false
    let detailACompleted = false
    let ledgerAStarted = false
    let ledgerACompleted = false

    await page.route('**/api/**', async route => {
      const request = route.request()
      const path = new URL(request.url()).pathname

      if (request.method() === 'GET' && path.endsWith('/stock/suppliers/')) {
        await route.fulfill({
          json: {
            success: true,
            data: {
              suppliers: [
                { id: 7, name: 'Supplier A', is_active: true, current_balance_uzs: '100000.00' },
                { id: 8, name: 'Supplier B', is_active: true, current_balance_uzs: '200000.00' },
              ],
              pagination: { total_suppliers: 2 },
            },
          },
        })
        return
      }

      if (request.method() === 'GET' && path.endsWith('/stock/suppliers/7/')) {
        detailAStarted = true
        await detailAGate
        await route.fulfill({
          json: { success: true, data: { supplier: { id: 7, name: 'Supplier A', contact_person: 'Late A detail' } } },
        })
        detailACompleted = true
        return
      }

      if (request.method() === 'GET' && path.endsWith('/stock/suppliers/8/')) {
        await route.fulfill({
          json: { success: true, data: { supplier: { id: 8, name: 'Supplier B', contact_person: 'Current B detail' } } },
        })
        return
      }

      if (request.method() === 'GET' && path.endsWith('/stock/suppliers/7/ledger/')) {
        ledgerAStarted = true
        await ledgerAGate
        await route.fulfill({
          json: {
            success: true,
            data: {
              transactions: [{ id: 71, type: 'PURCHASE', amount_uzs: 1000, note: 'Late A ledger row' }],
              pagination: { total: 1 },
            },
          },
        })
        ledgerACompleted = true
        return
      }

      if (request.method() === 'GET' && path.endsWith('/stock/suppliers/8/ledger/')) {
        await route.fulfill({
          json: {
            success: true,
            data: {
              transactions: [{ id: 81, type: 'PURCHASE', amount_uzs: 2000, note: 'Current B ledger row' }],
              pagination: { total: 1 },
            },
          },
        })
        return
      }

      await route.fulfill({ json: { success: true, data: {} } })
    })

    await page.goto('/stock/suppliers')
    const rowA = page.getByRole('row').filter({ hasText: 'Supplier A' })
    const rowB = page.getByRole('row').filter({ hasText: 'Supplier B' })

    await rowA.getByTitle('View').click()
    await expect.poll(() => detailAStarted).toBe(true)
    await page.getByRole('dialog', { name: 'Supplier A' }).getByTitle('Close').click()
    await rowB.getByTitle('View').click()
    const detailB = page.getByRole('dialog', { name: 'Supplier B' })

    await expect(detailB.getByText('Current B detail', { exact: true })).toBeVisible()
    releaseDetailA()
    await expect.poll(() => detailACompleted).toBe(true)
    await expect(detailB.getByText('Current B detail', { exact: true })).toBeVisible()
    await expect(detailB.getByText('Late A detail', { exact: true })).toHaveCount(0)
    await detailB.getByTitle('Close').click()

    await rowA.getByTitle('Ledger').click()
    await expect.poll(() => ledgerAStarted).toBe(true)
    await page.getByRole('dialog', { name: /Supplier A.*Ledger/ }).getByTitle('Close').click()
    await rowB.getByTitle('Ledger').click()
    const ledgerB = page.getByRole('dialog', { name: /Supplier B.*Ledger/ })

    await expect(ledgerB.getByText('Current B ledger row', { exact: true })).toBeVisible()
    releaseLedgerA()
    await expect.poll(() => ledgerACompleted).toBe(true)
    await expect(ledgerB.getByText('Current B ledger row', { exact: true })).toBeVisible()
    await expect(ledgerB.getByText('Late A ledger row', { exact: true })).toHaveCount(0)
  })

  test('resets supplier detail state and ignores an old refresh after a route-id change', async ({ page }) => {
    await seedSession(page, ['stock.supplier.view', 'stock.manage'])

    let supplierARequests = 0
    let releaseSupplierARefresh!: () => void
    const supplierARefreshGate = new Promise<void>(resolve => { releaseSupplierARefresh = resolve })
    let supplierARefreshStarted = false
    let supplierARefreshCompleted = false

    await page.route('**/api/**', async route => {
      const request = route.request()
      const path = new URL(request.url()).pathname

      if (request.method() === 'GET' && path.endsWith('/stock/suppliers/7/')) {
        supplierARequests += 1
        if (supplierARequests > 1) {
          supplierARefreshStarted = true
          await supplierARefreshGate
          supplierARefreshCompleted = true
        }
        await route.fulfill({
          json: {
            success: true,
            data: { supplier: { id: 7, name: 'Supplier A', currency: 'UZS', is_active: true } },
          },
        })
        return
      }

      if (request.method() === 'GET' && path.endsWith('/stock/suppliers/8/')) {
        await route.fulfill({
          json: {
            success: true,
            data: { supplier: { id: 8, name: 'Supplier B', currency: 'UZS', is_active: true } },
          },
        })
        return
      }

      await route.fulfill({ json: { success: true, data: {} } })
    })

    await page.goto('/stock/suppliers/7')
    await expect(page.getByRole('heading', { name: 'Supplier A', level: 1 })).toBeVisible()

    await page.getByRole('button', { name: 'Refresh' }).click()
    await expect.poll(() => supplierARefreshStarted).toBe(true)
    await page.getByRole('button', { name: 'Edit supplier' }).click()
    await expect(page.getByRole('dialog', { name: 'Edit supplier' })).toBeVisible()

    await page.evaluate(async () => {
      const app = (document.querySelector('#app') as any)?.__vue_app__
      await app.config.globalProperties.$router.push('/stock/suppliers/8')
    })

    await expect(page).toHaveURL(/\/stock\/suppliers\/8$/)
    await expect(page.getByRole('heading', { name: 'Supplier B', level: 1 })).toBeVisible()
    await expect(page.getByRole('dialog', { name: 'Edit supplier' })).toHaveCount(0)

    releaseSupplierARefresh()
    await expect.poll(() => supplierARefreshCompleted).toBe(true)
    await expect(page.getByRole('heading', { name: 'Supplier B', level: 1 })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Supplier A', level: 1 })).toHaveCount(0)
  })

  test('ignores a late supplier detail response after switching payment targets', async ({ page }) => {
    await seedSession(page, [
      'stock.supplier.view',
      'stock.supplier.balance.view',
      'stock.supplier.pay',
    ])

    let releaseFirstDetail!: () => void
    const firstDetailGate = new Promise<void>(resolve => { releaseFirstDetail = resolve })
    let firstDetailStarted = false
    let firstDetailCompleted = false
    const paymentPaths: string[] = []

    await page.route('**/api/**', async route => {
      const request = route.request()
      const path = new URL(request.url()).pathname

      if (request.method() === 'GET' && path.endsWith('/stock/suppliers/')) {
        await route.fulfill({
          json: {
            success: true,
            data: {
              suppliers: [
                { id: 7, name: 'Slow Supplier', current_balance_uzs: '100000.00', is_active: true },
                { id: 8, name: 'Current Supplier', current_balance_uzs: '200000.00', is_active: true },
              ],
              pagination: { total_suppliers: 2 },
            },
          },
        })
        return
      }

      if (request.method() === 'GET' && path.endsWith('/stock/suppliers/7/')) {
        firstDetailStarted = true
        await firstDetailGate
        await route.fulfill({
          json: {
            success: true,
            data: { supplier: { id: 7, name: 'Slow Supplier', currency: 'EUR', current_balance_uzs: '100000.00' } },
          },
        })
        firstDetailCompleted = true
        return
      }

      if (request.method() === 'GET' && path.endsWith('/stock/suppliers/8/')) {
        await route.fulfill({
          json: {
            success: true,
            data: { supplier: { id: 8, name: 'Current Supplier', currency: 'UZS', current_balance_uzs: '200000.00' } },
          },
        })
        return
      }

      if (request.method() === 'POST' && path.endsWith('/stock/suppliers/8/payments/')) {
        paymentPaths.push(path)
        await route.fulfill({ status: 201, json: { success: true, data: { payment_id: 88 } } })
        return
      }

      await route.fulfill({ json: { success: true, data: {} } })
    })

    await page.goto('/stock/suppliers')
    await page.getByRole('row').filter({ hasText: 'Slow Supplier' }).getByTitle('Pay supplier').click()
    await expect.poll(() => firstDetailStarted).toBe(true)
    await page.keyboard.press('Escape')

    await page.getByRole('row').filter({ hasText: 'Current Supplier' }).getByTitle('Pay supplier').click()
    const dialog = page.getByRole('dialog', { name: 'Pay supplier' })

    await expect(dialog.getByText('Current Supplier', { exact: true })).toBeVisible()
    await expect(dialog.getByLabel('Amount')).toBeVisible()
    releaseFirstDetail()
    await expect.poll(() => firstDetailCompleted).toBe(true)
    await expect(dialog.getByText('Current Supplier', { exact: true })).toBeVisible()
    await expect(dialog.getByText('Supplier payments currently support UZS only')).toHaveCount(0)

    await dialog.getByLabel('Amount').fill('50000')
    await dialog.getByRole('button', { name: 'Pay', exact: true }).click()
    await expect.poll(() => paymentPaths).toEqual(['/api/admins/stock/suppliers/8/payments/'])
  })

  test('direct adjustments carry the approval permission in routing and commands', () => {
    const granted = new Set([
      'stock.adjustment.approve',
      'stock.catalog.view',
      'stock.level.view',
    ])
    const access = {
      hasAny: (required: string[]) => required.some(permission => granted.has(permission)),
      hasAll: (required: string[]) => required.every(permission => granted.has(permission)),
    } as Parameters<typeof warehousePathAllowed>[1]

    const items = stockNav as Array<{ to?: string; anyPermission?: string[]; allPermissions?: string[] }>
    const adjustmentItem = items.find(item => item.to === 'stock-adjustments')

    expect(warehousePathAllowed('/stock/adjustments', access)).toBe(true)
    expect(adjustmentItem?.allPermissions)
      .toEqual(['stock.adjustment.approve', 'stock.catalog.view'])
    expect(adjustmentItem?.anyPermission)
      .toEqual(['stock.level.view', 'stock.inventory_control.view'])
  })
})
