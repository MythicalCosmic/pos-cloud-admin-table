import { type Page, expect, test } from '@playwright/test'

const base = { start_time: '2026-09-08T07:00:00+05:00', end_time: '2026-09-08T17:00:00+05:00', duration_minutes: 600, total_orders: 54, total_revenue: '2648000', cash_collected: '2431000', cash_to_receive: '2431000', cash_to_receive_complete: true, noncash_to_receive: '217000', noncash_to_receive_complete: true, all_tenders_to_receive: '2648000', all_tenders_to_receive_complete: true, tender_attribution_complete: true, financial_evidence_available: true, unattributed_expected_amount: '0', unattributed_evidence_count: 0 }
const records = [
  { ...base, id: 11, status: 'ENDED', user: { id: 4, name: 'Александра Константиновна Мирзаева' }, shift_template: { name: 'Evening service and terrace' }, units_sold: 95, avg_prep_seconds: 420, peak_hour: { hour: 13, orders: 24 }, net_revenue: '2600000', expenses_total: '48000', payment_mix: { CASH: { amount: '2431000' }, HUMO: { amount: '217000' } } },
  { ...base, id: 12, status: 'OPEN', user: { id: 5, name: 'Aziza Karimova' }, end_time: null, total_revenue: '750000' },
  { ...base, id: 10, status: 'COMPLETED', user: { id: 6, name: 'Sardor Mirzayev' }, reconciliation: { id: 3, expected_cash: '2431000', actual_cash: '2430000', difference: '-1000', reconciled_by: { name: 'Manager' }, notes: 'Count verified with the cashier.', created_at: '2026-09-08T17:30:00+05:00' } },
]
const summary = { awaiting_reconciliation_scope: 'ENDED_WITHOUT_RECONCILIATION', awaiting_reconciliation_unavailable_shift_count: 0, live_count: 2, awaiting_reconciliation_count: 4, awaiting_reconciliation_cash_to_receive: '2431000', awaiting_reconciliation_cash_to_receive_complete: true, awaiting_reconciliation_noncash_to_receive: '217000', awaiting_reconciliation_noncash_to_receive_complete: true, awaiting_reconciliation_all_tenders_to_receive: '2648000', awaiting_reconciliation_totals_available: true }
interface State { fail?: boolean, empty?: boolean, endGate?: Promise<void> }

async function setup(page: Page, state: State = {}, locale = 'en', theme = 'light') {
  await page.addInitScript(({ locale, theme }) => {
    localStorage.setItem('appLocale', locale)
    localStorage.setItem('alphapos-theme', theme)
    localStorage.setItem('accessToken', JSON.stringify('shifts-workspace-test-token'))
    localStorage.setItem('userData', JSON.stringify({ id: 9, name: 'Manager', role: 'ADMIN', permissions: ['*'] }))
    localStorage.setItem('userAbilities', JSON.stringify([{ action: 'manage', subject: 'all' }]))
  }, { locale, theme })
  const requests: URL[] = []
  page.on('pageerror', error => { throw error })
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url())
    requests.push(url)
    if (url.pathname.endsWith('/shifts')) {
      let rows = state.empty ? [] : records
      if (url.searchParams.get('status')) rows = rows.filter(row => row.status === url.searchParams.get('status'))
      if (url.searchParams.get('live_only') === 'true') rows = rows.filter(row => row.status === 'OPEN')
      if (url.searchParams.get('page') === '2') rows = [{ ...base, id: 9, status: 'ENDED', user: { id: 7, name: 'Historical shift' } }]
      await route.fulfill({ status: state.fail ? 500 : 200, json: { data: { shifts: rows, summary: state.empty ? {} : summary, pagination: { total: 4 } } } })
    }
    else if (url.pathname.endsWith('/end')) {
      if (state.endGate) await state.endGate
      await route.fulfill({ status: 422, json: { message: 'Finish the open orders before ending this shift.' } })
    }
    else if (url.pathname.endsWith('/users')) await route.fulfill({ json: { data: { users: records.map(row => row.user) } } })
    else await route.fulfill({ json: { data: {} } })
  })
  await page.goto('/shifts-analytics')
  await page.locator('.shift-register__view button').last().click()
  return requests
}

async function noOverflow(page: Page) {
  const result = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
    clips: [...document.querySelectorAll<HTMLElement>('.shift-overview__amount, .shift-overview__totals, .shift-overview__variance, .shift-record__amount, .shift-record__head, .shift-record__timeline, .shift-record__actions')].filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.className),
  }))
  expect(result.scroll).toBeLessThanOrEqual(result.width + 1)
  expect(result.clips).toEqual([])
}

test('shift records preserve amounts, statuses, report actions, breakdowns and loaded-page search', async ({ page }) => {
  await setup(page)
  await expect(page.locator('.shift-record')).toHaveCount(3)
  const record = page.getByRole('article', { name: 'Shift #11 · Александра Константиновна Мирзаева' })
  await expect(record).toContainText('2\u202F648\u202F000')
  await expect(record).toContainText('95')
  await expect(record).toContainText('13:00 (24)')
  await record.getByRole('button', { name: 'Show per-method breakdown' }).click()
  await expect(record.locator('.shift-record__breakdown dl')).toContainText('217\u202F000')
  const active = page.getByRole('article', { name: 'Shift #12 · Aziza Karimova' })
  await expect(active.getByRole('button', { name: 'End shift', exact: true })).toBeVisible()
  await expect(active.locator('.shift-record__numbers div').filter({ hasText: 'Net' })).toContainText('—')
  await page.getByRole('searchbox').fill('Aziza')
  await expect(page.locator('.shift-record')).toHaveCount(1)
  await page.getByRole('searchbox').fill('')
  await page.getByRole('button', { name: 'Card view', exact: true }).click()
  await expect(page.locator('.shift-record-grid')).toHaveClass(/is-cards/)
  await expect(page.locator('.shift-record')).toHaveCount(3)
  await noOverflow(page)
})

test('shift pagination, live filter, errors and retries remain functional', async ({ page }) => {
  const state: State = {}
  const requests = await setup(page, state)
  await page.getByRole('button', { name: 'Load more shifts', exact: true }).click()
  await expect(page.locator('.shift-record')).toHaveCount(4)
  expect(requests.some(url => url.pathname.endsWith('/shifts') && url.searchParams.get('page') === '2')).toBeTruthy()
  await expect(page.getByRole('button', { name: 'Load more shifts' })).toHaveCount(0)
  await page.getByRole('switch', { name: 'Live only' }).focus()
  await page.keyboard.press('Space')
  await expect(page.locator('.shift-record')).toHaveCount(1)
  expect(requests.some(url => url.searchParams.get('live_only') === 'true')).toBeTruthy()
  state.fail = true
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(page.locator('.shift-results-state')).toContainText('Failed to load shifts')
  await expect(page.locator('.shift-overview__amount')).toContainText('—')
  state.fail = false
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(page.locator('.shift-record')).toHaveCount(1)
})

test('ending a shift is guarded against double submits and preserves backend errors', async ({ page }) => {
  let release!: () => void
  const requests = await setup(page, { endGate: new Promise<void>(resolve => { release = resolve }) })
  const active = page.getByRole('article', { name: 'Shift #12 · Aziza Karimova' })
  await active.getByRole('button', { name: 'End shift', exact: true }).click()
  const modal = page.getByRole('dialog', { name: 'End this shift?' })
  await modal.getByRole('button', { name: 'End shift', exact: true }).dblclick()
  await expect(modal.getByRole('button', { name: 'Close', exact: true })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(modal).toBeVisible()
  release()
  await expect(page.getByText('Finish the open orders before ending this shift.')).toBeVisible()
  expect(requests.filter(url => url.pathname.endsWith('/end'))).toHaveLength(1)
  await page.keyboard.press('Escape')
  await expect(modal).toHaveCount(0)
  await expect(active.getByRole('button', { name: 'End shift', exact: true })).toBeFocused()
})

for (const locale of ['en', 'ru', 'uz']) {
  for (const theme of ['light', 'dark']) {
    test(`shifts are readable on desktop and mobile in ${locale} ${theme}`, async ({ page }) => {
      const state: State = {}
      await setup(page, state, locale, theme)
      await expect(page.locator('.shift-record')).toHaveCount(3)
      for (const width of [1440, 1100, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 900 })
        await noOverflow(page)
        await expect(page.locator('main')).not.toContainText('shifts_workspace_')
        if ([1440, 390].includes(width)) await page.screenshot({ path: `/tmp/smart-pos-shifts-${locale}-${theme}-${width}.png`, animations: 'disabled' })
      }
      state.empty = true
      await page.reload()
      await expect(page.locator('.shift-results-state')).toBeVisible()
      await expect(page.locator('.shift-overview__amount')).toContainText('—')
      await noOverflow(page)
    })
  }
}


test('compact shift ledger retains reports and full details on desktop and phones', async ({ page }) => {
  await setup(page)
  await page.getByRole('button', { name: 'List view', exact: true }).click()
  await expect(page.locator('.shift-ledger tbody tr')).toHaveCount(3)
  await expect(page.locator('.shift-ledger')).toContainText('2\u202F648\u202F000')
  await page.locator('.shift-ledger tbody tr').first().getByRole('button', { name: 'Expand', exact: true }).click()
  await expect(page.locator('.shift-ledger .shift-record')).toContainText('Evening service and terrace')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('.shift-ledger .mobile-record')).toHaveCount(3)
  await expect(page.locator('.shift-ledger .tablewrap')).toHaveCount(0)
  await expect(page.locator('.shift-ledger .mobile-record').first()).toContainText('Александра')
  await page.screenshot({ path: '/tmp/alpha-shift-ledger-phone.png', fullPage: true })
  await noOverflow(page)
})
