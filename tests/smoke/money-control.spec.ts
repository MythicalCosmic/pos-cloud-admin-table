import { type Page, expect, test } from '@playwright/test'

const admin = {
  id: 'money-control-admin',
  name: 'Money Control Admin',
  email: 'money.control@example.test',
  role: 'ADMIN',
  status: 'ACTIVE',
  permissions: ['money.control.view'],
}

async function seedAdminSession(page: Page) {
  await page.addInitScript(user => {
    localStorage.setItem('appLocale', 'en')
    localStorage.setItem('numberFormat', 'full')
    localStorage.setItem('alphapos-theme', 'light')
    localStorage.setItem('accessToken', JSON.stringify('money-control-test-token'))
    localStorage.setItem('userData', JSON.stringify(user))
    localStorage.setItem('userAbilities', JSON.stringify([{ action: 'manage', subject: 'all' }]))
  }, admin)
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

interface MockIntegrityStatuses {
  overview?: 'COMPLETE' | 'PARTIAL' | 'UNSAFE'
  reconciliation?: 'BALANCED' | 'WARNING' | 'INCOMPLETE'
  inventory?: 'COMPLETE' | 'PARTIAL' | 'UNSAFE'
}

async function mockPopulatedMoneyControlApi(page: Page, statuses: MockIntegrityStatuses = {}) {
  const overviewStatus = statuses.overview ?? 'COMPLETE'
  const reconciliationStatus = statuses.reconciliation ?? 'BALANCED'
  const inventoryStatus = statuses.inventory ?? 'COMPLETE'

  const statusIssue = {
    code: 'SOURCE_REVIEW_REQUIRED',
    severity: 'WARNING',
    title: 'Source review required',
    message: 'A source needs review before every total can be trusted.',
    entity_type: null,
    entity_id: null,
    amount_uzs: null,
    details: {},
  }

  await page.route('**/api/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname

    if (request.method() === 'GET' && path.endsWith('/money-control/overview')) {
      await route.fulfill({
        json: {
          success: true,
          data: {
            as_of: '2026-08-31T14:25:00+05:00',
            period: {
              date_from: '2026-08-01',
              date_to: '2026-08-31',
              timezone: 'Asia/Tashkent',
            },
            completeness: {
              status: overviewStatus,
              issues: overviewStatus === 'COMPLETE' ? [] : [statusIssue],
            },
            treasury: {
              drawer_unreconciled_uzs: '1250000.00',
              safe_uzs: '12500000.00',
              bank_uzs: '31250000.00',
              liquid_total_uzs: '45000000.00',
            },
            suppliers: {
              payable_uzs: '8400000.00',
              credit_uzs: '600000.00',
              overdue_payable_uzs: '1400000.00',
              count_with_balance: 2,
              top_balances: [
                {
                  supplier_id: 'supplier-flour',
                  supplier_name: 'Samarkand Flour Co.',
                  balance_uzs: '8400000.00',
                  payable_uzs: '8400000.00',
                  credit_uzs: '0.00',
                  overdue_payable_uzs: '1400000.00',
                  currency: 'UZS',
                },
                {
                  supplier_id: 'supplier-dairy',
                  supplier_name: 'Tashkent Dairy',
                  balance_uzs: '-600000.00',
                  payable_uzs: '0.00',
                  credit_uzs: '600000.00',
                  overdue_payable_uzs: '0.00',
                  currency: 'UZS',
                },
              ],
            },
            inventory: {
              raw_material_value_uzs: '15600000.00',
              raw_available_value_uzs: '14950000.00',
              raw_item_count: 2,
              low_stock_count: 1,
              out_of_stock_count: 0,
              valuation_method: 'WEIGHTED_AVERAGE',
            },
            expenses: {
              paid_uzs: '3750000.00',
              pending_uzs: '450000.00',
              approved_unpaid_uzs: '300000.00',
              by_category: [
                {
                  category_id: 'expense-supplies',
                  category_name: 'Supplies',
                  paid_uzs: '2250000.00',
                  transaction_count: 4,
                },
                {
                  category_id: 'expense-repairs',
                  category_name: 'Repairs',
                  paid_uzs: '1500000.00',
                  transaction_count: 2,
                },
              ],
            },
            working_capital: {
              amount_uzs: '52200000.00',
              formula: 'SAFE + BANK + RAW_INVENTORY - SUPPLIER_PAYABLE',
            },
            reconciliation: {
              status: reconciliationStatus,
              issues: reconciliationStatus === 'BALANCED' ? [] : [statusIssue],
            },
          },
        },
      })
      return
    }

    if (request.method() === 'GET' && path.endsWith('/stock/inventory-control/')) {
      await route.fulfill({
        json: {
          success: true,
          data: {
            summary: {
              inventory_value_uzs: '15600000.00',
              available_value_uzs: '14950000.00',
              raw_item_count: 2,
              low_stock_count: 1,
              out_of_stock_count: 0,
              supplier_payable_uzs: '8400000.00',
              supplier_credit_uzs: '600000.00',
              valuation_method: 'WEIGHTED_AVERAGE',
              as_of: '2026-08-31T14:25:00+05:00',
            },
            completeness: {
              status: inventoryStatus,
              issues: inventoryStatus === 'COMPLETE' ? [] : [statusIssue],
            },
            issues: inventoryStatus === 'COMPLETE' ? [] : [statusIssue],
            items: [
              {
                stock_item: { id: 'raw-flour', name: 'Premium flour', code: 'RAW-FLOUR' },
                category: { id: 'dry-goods', name: 'Dry goods' },
                base_unit: { id: 'kg', name: 'Kilogram', code: 'kg' },
                location: { id: 'central', name: 'Central warehouse' },
                quantity: '420.000',
                reserved_quantity: '20.000',
                available_quantity: '400.000',
                pending_in_quantity: '100.000',
                pending_out_quantity: '0.000',
                avg_cost_uzs: '24000.00',
                inventory_value_uzs: '10080000.00',
                available_value_uzs: '9600000.00',
                reorder_point: '150.000',
                is_low_stock: false,
                is_out_of_stock: false,
                preferred_supplier: {
                  supplier_id: 'supplier-flour',
                  supplier_name: 'Samarkand Flour Co.',
                  price: '23500.00',
                  currency: 'UZS',
                  current_balance_uzs: '5400000.00',
                  lead_time_days: 2,
                },
              },
              {
                stock_item: { id: 'raw-milk', name: 'Whole milk', code: 'RAW-MILK' },
                category: { id: 'chilled', name: 'Chilled goods' },
                base_unit: { id: 'litre', name: 'Litre', code: 'L' },
                location: { id: 'central', name: 'Central warehouse' },
                quantity: '230.000',
                reserved_quantity: '10.000',
                available_quantity: '220.000',
                pending_in_quantity: '80.000',
                pending_out_quantity: '0.000',
                avg_cost_uzs: '24000.00',
                inventory_value_uzs: '5520000.00',
                available_value_uzs: '5280000.00',
                reorder_point: '250.000',
                is_low_stock: true,
                is_out_of_stock: false,
                preferred_supplier: {
                  supplier_id: 'supplier-dairy',
                  supplier_name: 'Tashkent Dairy',
                  price: '23000.00',
                  currency: 'UZS',
                  current_balance_uzs: '-600000.00',
                  lead_time_days: 1,
                },
              },
            ],
            pagination: { total: 2, page: 1, per_page: 20, total_pages: 1 },
          },
        },
      })
      return
    }

    if (request.method() === 'GET' && path.endsWith('/stock/locations/')) {
      await route.fulfill({
        json: {
          success: true,
          data: {
            locations: [{ id: 'central', name: 'Central warehouse' }],
          },
        },
      })
      return
    }

    // Isolate the page from optional shell hydration without creating
    // unrelated live-looking business records.
    await route.fulfill({ json: { success: true, data: {} } })
  })
}

async function mockInventoryEvidenceWithoutOverview(page: Page) {
  const stockIssue = {
    code: 'STOCK_COST_MISSING',
    severity: 'ERROR',
    title: 'Stock cost is missing',
    message: 'This material cannot be valued until its cost is corrected.',
    entity_type: 'StockItem',
    entity_id: 'raw-unverified',
    amount_uzs: null,
    details: { location_id: 'central' },
  }

  await page.route('**/api/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname

    if (request.method() === 'GET' && path.endsWith('/money-control/overview')) {
      await route.fulfill({
        status: 500,
        json: { success: false, code: 'OVERVIEW_FAILED', message: 'Overview is unavailable.' },
      })
      return
    }

    if (request.method() === 'GET' && path.endsWith('/stock/inventory-control/')) {
      await route.fulfill({
        json: {
          success: true,
          data: {
            summary: {
              inventory_value_uzs: null,
              available_value_uzs: null,
              raw_item_count: 1,
              low_stock_count: null,
              out_of_stock_count: null,
              supplier_payable_uzs: null,
              supplier_credit_uzs: null,
              valuation_method: 'WEIGHTED_AVERAGE',
              as_of: '2026-08-31T14:25:00+05:00',
            },
            completeness: { status: 'UNSAFE', issues: [stockIssue] },

            // The deployed endpoint intentionally includes the top-level list too.
            // The page must preserve it without rendering a duplicate issue.
            issues: [stockIssue],
            items: [
              {
                stock_item: { id: 'raw-unverified', name: 'Unverified flour', code: 'RAW-UNVERIFIED' },
                category: { id: 'dry-goods', name: 'Dry goods' },
                base_unit: { id: 'kg', name: 'Kilogram', code: 'kg' },
                location: { id: 'central', name: 'Central warehouse' },
                quantity: null,
                reserved_quantity: null,
                available_quantity: null,
                pending_in_quantity: null,
                pending_out_quantity: null,
                avg_cost_uzs: null,
                inventory_value_uzs: null,
                available_value_uzs: null,
                reorder_point: '25.000',
                is_low_stock: true,
                is_out_of_stock: true,
                preferred_supplier: null,
              },
            ],
            pagination: { total: 1, page: 1, per_page: 20, total_pages: 1 },
          },
        },
      })
      return
    }

    if (request.method() === 'GET' && path.endsWith('/stock/locations/')) {
      await route.fulfill({ json: { success: true, data: { locations: [] } } })
      return
    }

    await route.fulfill({ json: { success: true, data: {} } })
  })
}

async function mockUnavailableMoneyControlApi(page: Page) {
  await page.route('**/api/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname

    if (
      request.method() === 'GET'
      && (path.endsWith('/money-control/overview') || path.endsWith('/stock/inventory-control/'))
    ) {
      await route.fulfill({
        status: 404,
        json: { success: false, code: 'ENDPOINT_NOT_DEPLOYED', message: 'Endpoint is not deployed.' },
      })
      return
    }

    if (request.method() === 'GET' && path.endsWith('/stock/locations/')) {
      await route.fulfill({ json: { success: true, data: { locations: [] } } })
      return
    }

    await route.fulfill({ json: { success: true, data: {} } })
  })
}

test.describe('Money Control', () => {
  test.beforeEach(async ({ page }) => {
    await seedAdminSession(page)
  })

  test('renders verified money, supplier, expense, and raw-material data', async ({ page }) => {
    const runtimeErrors = collectRuntimeErrors(page)

    await mockPopulatedMoneyControlApi(page)
    await page.goto('/money-control')

    await expect(page.getByRole('heading', { name: 'Money Control' })).toBeVisible()
    await expect(page.getByText('Safe balance', { exact: true })).toBeVisible()
    await expect(page.getByText('Bank balance', { exact: true })).toBeVisible()
    await expect(page.getByText('Supplier payable', { exact: true })).toBeVisible()
    await expect(page.getByText('Raw material value', { exact: true })).toBeVisible()

    // Full-format mode must show grouped UZS figures rather than abbreviations.
    await expect(page.getByText(/12,500,000/).first()).toBeVisible()
    await expect(page.getByText(/31,250,000/).first()).toBeVisible()
    await expect(page.getByText(/8,400,000/).first()).toBeVisible()
    await expect(page.getByText(/15,600,000/).first()).toBeVisible()

    const rawMaterials = page.locator('.raw-materials-card')

    await expect(rawMaterials.getByText('Premium flour', { exact: true })).toBeVisible()
    await expect(rawMaterials.getByText('Whole milk', { exact: true })).toBeVisible()
    await expect(rawMaterials.getByRole('link', { name: 'Tashkent Dairy' })).toHaveAttribute(
      'href',
      '/stock/suppliers/supplier-dairy',
    )

    const supplierBalances = page.locator('.summary-table-card').filter({ hasText: 'Supplier balances' })
    const expenseCategories = page.locator('.summary-table-card').filter({ hasText: 'Expenses by category' })

    await expect(supplierBalances.getByRole('link', { name: 'Samarkand Flour Co.' })).toBeVisible()
    await expect(supplierBalances.getByRole('link', { name: 'Tashkent Dairy' })).toBeVisible()
    await expect(
      supplierBalances.locator('tbody tr').filter({ hasText: 'Tashkent Dairy' }),
    ).toContainText(/-600,000/)
    await expect(expenseCategories.getByText('Supplies', { exact: true })).toBeVisible()
    await expect(expenseCategories.getByText('Repairs', { exact: true })).toBeVisible()
    await expect(page.getByText('This section isn\'t available yet')).toHaveCount(0)

    const reconciliation = page.locator('.reconciliation-card')

    await expect(reconciliation.locator('.badge.t-success').filter({ hasText: 'Complete' })).toHaveCount(2)
    await expect(reconciliation.locator('.badge.t-success').filter({ hasText: 'Balanced' })).toBeVisible()

    expect(runtimeErrors, runtimeErrors.join('\n')).toHaveLength(0)
  })

  test('maps partial, warning, and unsafe backend states to deliberate badges', async ({ page }) => {
    await mockPopulatedMoneyControlApi(page, {
      overview: 'PARTIAL',
      reconciliation: 'WARNING',
      inventory: 'UNSAFE',
    })
    await page.goto('/money-control')

    const reconciliation = page.locator('.reconciliation-card')

    await expect(reconciliation.locator('.badge.t-warning').filter({ hasText: 'Partial' })).toBeVisible()
    await expect(reconciliation.locator('.badge.t-warning').filter({ hasText: 'Needs review' })).toBeVisible()
    await expect(reconciliation.locator('.badge.t-error').filter({ hasText: 'Unsafe' })).toBeVisible()
  })

  test('prevents choosing a start date beyond the end date', async ({ page }) => {
    await mockPopulatedMoneyControlApi(page)
    await page.goto('/money-control')

    await expect(page.getByText(/12,500,000/).first()).toBeVisible()

    await page.locator('.money-control-filters').getByRole('button', { name: 'From', exact: true }).click()
    const calendar = page.locator('dialog.calendar-popover[open]')
    await calendar.locator('.calendar-popover__month-switch').click()
    await calendar.getByRole('textbox', { name: 'Year', exact: true }).fill('2099')
    await calendar.getByRole('textbox', { name: 'Year', exact: true }).press('Tab')
    await expect(calendar.getByRole('button', { name: 'December', exact: true })).toBeDisabled()
    await page.keyboard.press('Escape')
    await expect(page.locator('.money-control-summary')).toBeVisible()
    await expect(page.getByText(/12,500,000/).first()).toBeVisible()

  })

  test('keeps inventory integrity evidence visible when the overview fails', async ({ page }) => {
    await mockInventoryEvidenceWithoutOverview(page)
    await page.goto('/money-control')

    await expect(page.getByText('Money Control could not be loaded', { exact: true })).toBeVisible()

    const reconciliation = page.locator('.reconciliation-card')

    await expect(reconciliation.getByText('Inventory data completeness', { exact: true })).toBeVisible()
    await expect(reconciliation.locator('.badge.t-error').filter({ hasText: 'Unsafe' })).toBeVisible()
    await expect(
      reconciliation.getByText('This material cannot be valued until its cost is corrected.', { exact: true }),
    ).toHaveCount(1)

    const rawMaterialRow = page.locator('.raw-materials-card tbody tr').filter({ hasText: 'Unverified flour' })

    await expect(rawMaterialRow).toBeVisible()
    await expect(rawMaterialRow.locator('.badge.t-neutral')).toHaveText('Unknown')
    await expect(rawMaterialRow.getByText('Out of stock', { exact: true })).toHaveCount(0)
  })

  test('shows an honest integration state when the backend endpoints are not deployed', async ({ page }) => {
    await mockUnavailableMoneyControlApi(page)
    await page.goto('/money-control')

    await expect(page.getByRole('heading', { name: 'Money Control' })).toBeVisible()
    await expect(page.getByText('This section isn\'t available yet', { exact: true })).toBeVisible()
    await expect(page.getByText(/Figures will appear here once this feature is enabled/)).toBeVisible()

    // No successful business response means no fabricated KPI cards or tables.
    await expect(page.locator('.money-control-summary')).toHaveCount(0)
    await expect(page.locator('.raw-materials-card')).toHaveCount(0)
    await expect(page.locator('.money-control-table-grid')).toHaveCount(0)
    await expect(page.locator('.kpi-card')).toHaveCount(0)
    await expect(page.getByText(/\d,\d{3},\d{3}\s*UZS/)).toHaveCount(0)
  })

  test('keeps the populated workspace usable on mobile in light and dark themes', async ({ page }) => {
    const runtimeErrors = collectRuntimeErrors(page)

    await page.setViewportSize({ width: 390, height: 844 })
    await mockPopulatedMoneyControlApi(page)
    await page.goto('/money-control')

    await expect(page.getByRole('heading', { name: 'Money Control' })).toBeVisible()
    await expect(page.locator('.money-control-filters')).toBeVisible()
    await page.locator('.money-control-filters').getByRole('button', { name: 'Search & filters', exact: true }).click()
    await expect(page.locator('.money-control-filters').getByRole('button', { name: 'From', exact: true })).toBeVisible()
    await expect(page.locator('.money-control-summary')).toBeVisible()
    await expect(page.getByText('Safe balance', { exact: true })).toBeVisible()
    await expect(page.getByText('Quick actions', { exact: true })).toBeVisible()

    async function expectThemeAndDocumentFit(theme: 'light' | 'dark') {
      await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe(theme)

      const dimensions = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }))

      expect(
        dimensions.scrollWidth,
        `${theme} theme document width ${dimensions.scrollWidth}px exceeds its ${dimensions.clientWidth}px viewport`,
      ).toBeLessThanOrEqual(dimensions.clientWidth)
    }

    await expectThemeAndDocumentFit('light')

    await page.getByRole('button', { name: 'Toggle theme' }).click()
    await expectThemeAndDocumentFit('dark')

    expect(runtimeErrors, runtimeErrors.join('\n')).toHaveLength(0)
  })
})
