import { type Page, expect, test } from '@playwright/test'

const employee = {
  id: 7,
  user: { id: 60, first_name: 'Abbrorbek', last_name: 'Fast food', email: 'abbrorbek.staff@local', role: 'USER' },
  department: null,
  position: 'Fast food',
  hire_date: '2026-07-01',
  contract_type: 'FULL_TIME',
  base_salary: '5900000.00',
  payment_frequency: 'MONTHLY',
  phone: '',
  is_active: true,
}

const salaries = [
  {
    id: 71, employee_id: 7, period_year: 2026, period_month: 7, base_amount: '2245000.00', bonus: '0.00',
    deduction: '0.00', net_amount: '2245000.00', status: 'PAID', paid_at: '2026-07-31T23:00:00+05:00',
    notes: '[AUGUST-2026 CLEANUP 2026-09-16] July salary paid from the safe in August (07.08 2,245,000).',
  },
  {
    id: 72, employee_id: 7, period_year: 2026, period_month: 8, base_amount: '6050000.00', bonus: '0.00',
    deduction: '115000.00', net_amount: '5935000.00', status: 'PAID', paid_at: '2026-08-31T23:00:00+05:00',
    notes: '[AUGUST-2026 CLEANUP 2026-09-16] Advances from the tills: 800,000. Paid on payday: 3,135,000.',
  },
]

async function setup(page: Page, { treasury = 'ok' }: { treasury?: 'ok' | 'forbidden' } = {}) {
  await page.addInitScript(() => {
    localStorage.setItem('appLocale', 'en')
    localStorage.setItem('numberFormat', 'full')
    localStorage.setItem('accessToken', JSON.stringify('employee-history-token'))
    localStorage.setItem('userData', JSON.stringify({ id: 1, role: 'ADMIN', permissions: ['*'] }))
    localStorage.setItem('userAbilities', JSON.stringify([{ action: 'manage', subject: 'all' }]))
  })

  const salaryQueries: URL[] = []

  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/hr/employees/')) {
      await route.fulfill({ json: { success: true, data: { employees: [employee], pagination: { total: 1, has_next: false } } } })
      return
    }
    if (url.pathname.endsWith('/hr/salaries/')) {
      salaryQueries.push(url)
      await route.fulfill({ json: { success: true, data: { salaries, pagination: { total: 2, has_next: false } } } })
      return
    }
    if (url.pathname.endsWith('/treasury/history')) {
      if (treasury === 'forbidden') {
        await route.fulfill({ status: 403, json: { success: false, message: 'Forbidden' } })
        return
      }
      const id = Number(url.searchParams.get('reference_id'))
      await route.fulfill({
        json: {
          success: true,
          data: {
            transactions: [{
              id: id * 10, account: 'SAFE', type: 'SALARY_PAYMENT', delta: '-2000000.00', delta_uzs: -2_000_000,
              description: `[AUGUST-2026 SAFE 2026-09-16] Salary payment for record ${id}.`,
              reference_type: 'SalaryPayment', reference_id: id, created_at: '2026-09-16T15:30:00+05:00',
            }],
          },
        },
      })
      return
    }
    await route.fulfill({ json: { success: true, data: {} } })
  })

  return salaryQueries
}

test('staff pages are reachable and a worker shows salary and payment history', async ({ page }) => {
  const salaryQueries = await setup(page)

  await page.goto('/hr-employees')
  await expect(page.locator('aside').getByRole('link', { name: 'Employees' })).toBeVisible()
  await expect(page.locator('aside').getByRole('link', { name: 'Salaries' })).toBeVisible()

  await expect(page.getByText('abbrorbek.staff@local')).toHaveCount(0)
  await expect(page.getByText('No sign-in', { exact: true })).toBeVisible()
  await page.getByText('Abbrorbek', { exact: true }).click()

  const dialog = page.getByRole('dialog', { name: 'Abbrorbek', exact: true })

  await expect(dialog).toBeVisible()
  expect(salaryQueries.at(-1)?.searchParams.get('employee_id')).toBe('7')
  await expect(dialog.getByText('08.2026', { exact: true })).toBeVisible()
  await expect(dialog.getByText('07.2026', { exact: true })).toBeVisible()
  await expect(dialog.getByText(/8,180,000/)).toBeVisible()
  await expect(dialog.getByText('Salary payment for record 72.')).toBeVisible()
  await expect(dialog.getByText('[AUGUST-2026')).toHaveCount(0)
  await page.screenshot({ path: '/tmp/alpha-employee-history.png', animations: 'disabled' })

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(dialog).toBeVisible()
  await page.screenshot({ path: '/tmp/alpha-employee-history-mobile.png', animations: 'disabled' })
})

test('salary history still shows when Safe & Bank history is not permitted', async ({ page }) => {
  await setup(page, { treasury: 'forbidden' })

  await page.goto('/hr-employees')
  await expect(page.getByText('abbrorbek.staff@local')).toHaveCount(0)
  await expect(page.getByText('No sign-in', { exact: true })).toBeVisible()
  await page.getByText('Abbrorbek', { exact: true }).click()

  const dialog = page.getByRole('dialog', { name: 'Abbrorbek', exact: true })

  await expect(dialog.getByText('08.2026', { exact: true })).toBeVisible()
  await expect(dialog.getByText('Safe and bank payments')).toHaveCount(0)
  await expect(dialog.getByRole('alert')).toHaveCount(0)
})
