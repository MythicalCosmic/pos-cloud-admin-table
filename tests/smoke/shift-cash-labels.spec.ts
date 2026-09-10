import { type Page, expect, test } from '@playwright/test'

const listShift = {
  id: 11,
  status: 'ENDED',
  user: { id: 4, name: 'Ruxsora' },
  financial_evidence_available: true,
  cash_to_receive: '2431000.00',
  cash_to_receive_complete: true,
  noncash_to_receive: '217000.00',
  noncash_to_receive_complete: true,
  all_tenders_to_receive: '2648000.00',
  all_tenders_to_receive_complete: true,
  tender_attribution_complete: true,
  unattributed_expected_amount: '0.00',
  unattributed_evidence_count: 0,
}

const summary = {
  live_count: 37,
  awaiting_reconciliation_scope: 'ENDED_WITHOUT_RECONCILIATION',
  awaiting_reconciliation_count: 101,
  awaiting_reconciliation_cash_to_receive: '2431000.00',
  awaiting_reconciliation_cash_to_receive_complete: true,
  awaiting_reconciliation_noncash_to_receive: '217000.00',
  awaiting_reconciliation_noncash_to_receive_complete: true,
  awaiting_reconciliation_all_tenders_to_receive: '2648000.00',
  awaiting_reconciliation_totals_available: true,
  awaiting_reconciliation_unavailable_shift_count: 0,
  confirmed_all_tenders_complete: false,
  total_confirmed_received: null,
}

const detail = {
  ...listShift,
  expected_cash: '2431000.00',
  settlement: [
    {
      method: 'CASH',
      expected: '2431000.00',
      expected_source: 'CANONICAL_DERIVED',
      counted: null,
      cashier_count_status: 'UNCOUNTED',
      status: 'UNCOUNTED',
      confirmed: null,
      manager_confirmed: false,
      reconciled: false,
      difference: null,
    },
    {
      method: 'HUMO',
      expected: '217000.00',
      expected_source: 'CANONICAL_DERIVED',
      counted: null,
      cashier_count_status: 'UNCOUNTED',
      status: 'UNCOUNTED',
      confirmed: null,
      manager_confirmed: false,
      reconciled: false,
      difference: null,
    },
    {
      method: 'PAYME',
      expected: '0.00',
      expected_source: 'CANONICAL_DERIVED',
      counted: null,
      cashier_count_status: 'UNCOUNTED',
      status: 'UNCOUNTED',
      confirmed: null,
      manager_confirmed: false,
      reconciled: false,
      difference: null,
    },
  ],
}

interface ShiftApiOptions {
  detailResponse?: any
  listRows?: any[]
  reconcileSuccess?: boolean
}

const shiftApiOptionsByPage = new WeakMap<Page, ShiftApiOptions>()
const shiftApiRoutedPages = new WeakSet<Page>()

async function mockShiftApi(page: Page, options: ShiftApiOptions = {}) {
  shiftApiOptionsByPage.set(page, options)
  if (shiftApiRoutedPages.has(page))
    return

  shiftApiRoutedPages.add(page)

  await page.route('**/api/admins/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    const activeOptions = shiftApiOptionsByPage.get(page) ?? {}
    const detailResponse = activeOptions.detailResponse ?? detail
    const listRows = activeOptions.listRows ?? [listShift]

    if (path.endsWith('/auth-me') || path.endsWith('/app-settings')) {
      await route.fulfill({ json: { data: {} } })
      return
    }
    if (path.endsWith('/users')) {
      await route.fulfill({ json: { data: { users: [{ id: 4, first_name: 'Ruxsora', last_name: 'A' }] } } })
      return
    }
    if (path.endsWith('/shifts/11') && request.method() === 'GET') {
      await route.fulfill({ json: { data: detailResponse } })
      return
    }
    if (path.endsWith('/shifts/11/reconcile') && request.method() === 'POST') {
      if (activeOptions.reconcileSuccess) {
        await route.fulfill({ json: { data: { treasury_posting: { status: 'posted', account: 'SAFE' } } } })
        return
      }
      await route.fulfill({ status: 422, json: { message: 'A manager confirmation is required.', field_errors: { HUMO: ['Required'] } } })
      return
    }
    if (path.endsWith('/shifts')) {
      await route.fulfill({ json: { data: { shifts: listRows, pagination: { total: 101 }, summary } } })
      return
    }
    await route.fulfill({ json: { data: {} } })
  })
}

test.describe('shift physical-cash labels', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('appLocale', 'en')
      localStorage.setItem('accessToken', JSON.stringify('test-token'))
      localStorage.setItem('userData', JSON.stringify({ id: 1, name: 'Manager' }))
      localStorage.setItem('userAbilities', JSON.stringify([{ action: 'manage', subject: 'all' }]))
    })
    await mockShiftApi(page)
    await page.goto('/shifts-analytics')
  })

  test('keeps physical cash, non-cash, and all-tender totals visibly separate', async ({ page }) => {
    await expect(page.getByText('Physical cash to receive').first()).toBeVisible()
    await expect(page.getByText('Compare this amount with banknotes in the drawer').first()).toBeVisible()
    await expect(page.getByText('All-tender settlement total').first()).toBeVisible()
    await expect(page.getByText('All payment types — not a physical cash count').first()).toBeVisible()
    await expect(page.getByText('Non-cash settlement').first()).toBeVisible()

    // The primary KPI comes from the complete server summary (101 shifts),
    // not the one row returned on this page.
    await expect(page.getByText('Outstanding handovers')).toBeVisible()
    await expect(page.getByText('101', { exact: true })).toBeVisible()
    await expect(page.getByText('37', { exact: true })).toBeVisible()
  })

  test('does not offer reconciliation for a non-ENDED closed shift', async ({ page }) => {
    await mockShiftApi(page, {
      listRows: [{ ...listShift, status: 'ABANDONED' }],
    })
    await page.reload()

    await expect(page.getByText('Settlement unavailable').first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Receive money' })).toHaveCount(0)
  })

  test('preserves UNCOUNTED nulls and a validation 422 in the reconciliation dialog', async ({ page }) => {
    await page.getByRole('button', { name: 'Receive money' }).click()
    await expect(page.getByText('Cashier count not submitted').first()).toBeVisible()
    await expect(page.getByText('Variance unavailable').first()).toBeVisible()

    const inputs = page.locator('.reconcile-table input')

    await expect(inputs).toHaveCount(3)
    await expect(page.getByRole('textbox', { name: 'Cash: Counted', exact: true })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Card: Counted', exact: true })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Payme: Counted', exact: true })).toBeVisible()
    await expect(page.getByRole('textbox', { name: /Humo: Counted|Uzcard: Counted/i })).toHaveCount(0)
    await inputs.nth(0).fill('2431000')
    await inputs.nth(1).fill('217000')
    await inputs.nth(2).fill('0')
    await page.getByRole('button', { name: 'Confirm settlement' }).click()

    await expect(page.getByText('A manager confirmation is required.')).toBeVisible()
    await expect(inputs.nth(0)).toHaveValue(/2.*431.*000/)
    await expect(inputs.nth(1)).toHaveValue(/217.*000/)
  })

  test('fails closed for an unknown CASH settlement provenance', async ({ page }) => {
    await mockShiftApi(page, {
      detailResponse: {
        ...detail,
        settlement: [
          { ...detail.settlement[0], expected_source: 'FUTURE_UNRECOGNIZED_SOURCE' },
          detail.settlement[1],
          detail.settlement[2],
        ],
      },
    })

    await page.getByRole('button', { name: 'Receive money' }).click()
    await expect(page.getByText('Backend upgrade required for physical cash')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Confirm settlement' })).toBeDisabled()
  })

  test('requires review when cashier counted a tender whose expected amount is zero', async ({ page }) => {
    await mockShiftApi(page, {
      detailResponse: {
        ...detail,
        settlement: [
          detail.settlement[0],
          {
            ...detail.settlement[1],
            expected: '0.00',
            counted: '5000.00',
            cashier_count_status: 'COUNTED',
            status: 'COUNTED',
          },
          detail.settlement[2],
        ],
      },
    })

    await page.getByRole('button', { name: 'Receive money' }).click()

    const inputs = page.locator('.reconcile-table input')

    await inputs.nth(0).fill('2431000')
    await inputs.nth(2).fill('0')
    await expect(page.getByRole('button', { name: 'Confirm settlement' })).toBeDisabled()

    await inputs.nth(1).fill('5000')
    await expect(page.getByRole('button', { name: 'Confirm settlement' })).toBeEnabled()
  })

  test('closes the reconciliation form after a successful settlement', async ({ page }) => {
    await mockShiftApi(page, { reconcileSuccess: true })

    await page.getByRole('button', { name: 'Receive money' }).click()

    const inputs = page.locator('.reconcile-table input')

    await inputs.nth(0).fill('2431000')
    await inputs.nth(1).fill('217000')
    await inputs.nth(2).fill('0')
    const reconciliationRequest = page.waitForRequest(request => request.url().endsWith('/shifts/11/reconcile') && request.method() === 'POST')

    await page.getByRole('button', { name: 'Confirm settlement' }).click()

    expect((await reconciliationRequest).postDataJSON()).toEqual({
      actual_cash: 2431000,
      confirmed: { CASH: 2431000, HUMO: 217000, PAYME: 0 },
    })
    await expect(page.locator('[role="dialog"]')).toHaveCount(0)
  })

  test('opens the read-only handover report without replacing the reconciliation workspace', async ({ page }) => {
    await page.getByRole('button', { name: 'Report', exact: true }).click()
    await expect(page).toHaveURL(/\/analytics\/shift-handover\?shift=11$/)
    await expect(page.getByRole('heading', { name: 'Shift Handover Report' })).toBeVisible()
  })
})
