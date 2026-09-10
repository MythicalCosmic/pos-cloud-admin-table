import { type Page, expect, test } from '@playwright/test'
import { warehousePathAllowed } from '@/navigation/access'
import managementNav from '@/navigation/vertical/management'

interface TestUser {
  id: number
  first_name: string
  last_name: string
  email: string
  role: string
  status: string
  permissions: string[]
  last_login_at: string | null
  created_at: string
}

const baseWarehousePermissions = [
  'stock.catalog.view',
  'stock.level.view',
  'stock.supplier.view',
]

const optionalCatalog = [
  { key: 'attendance.view', label: 'View attendance', group: 'Operational audit' },
  { key: 'attendance.record', label: 'Record attendance', group: 'Operational audit' },
  { key: 'attendance.adjust.request', label: 'Request attendance adjustment', group: 'Operational audit' },
  { key: 'discipline.rule.view', label: 'View disciplinary rules', group: 'Operational audit' },
  { key: 'discipline.case.create', label: 'Create disciplinary cases', group: 'Operational audit' },
  { key: 'discipline.case.view', label: 'View disciplinary cases', group: 'Operational audit' },
  { key: 'prep.audit.view', label: 'View preparation audits', group: 'Operational audit' },
  { key: 'prep.audit.review', label: 'Review preparation audits', group: 'Operational audit' },
  { key: 'expense.category.view', label: 'View expense categories', group: 'Expense requests' },
  { key: 'expense.request.create', label: 'Create expense requests', group: 'Expense requests' },
  { key: 'expense.request.view_own', label: 'View own expense requests', group: 'Expense requests' },

  // Approval/payment capabilities must never be exposed by this user editor.
  { key: 'attendance.adjust.approve', label: 'Approve attendance adjustments', group: 'Operational audit approvals' },
  { key: 'expense.request.pay', label: 'Pay expense requests', group: 'Expense request approvals' },
  { key: 'users.manage', label: 'Manage users', group: 'Administration' },
]

async function seedSession(page: Page, role: 'ADMIN' | 'MANAGER') {
  await page.addInitScript(userRole => {
    localStorage.setItem('appLocale', 'en')
    localStorage.setItem('accessToken', JSON.stringify('users-permission-test-token'))
    localStorage.setItem('userData', JSON.stringify({
      id: 1,
      first_name: 'Test',
      last_name: 'Operator',
      role: userRole,
      permissions: userRole === 'ADMIN' ? ['*'] : ['users.manage'],
    }))
    localStorage.setItem('userAbilities', JSON.stringify([{ action: 'manage', subject: 'all' }]))
  }, role)
}

function warehouseUser(): TestUser {
  return {
    id: 17,
    first_name: 'Warehouse',
    last_name: 'Worker',
    email: 'warehouse.worker@example.test',
    role: 'WAREHOUSE',
    status: 'ACTIVE',
    permissions: [...baseWarehousePermissions],
    last_login_at: null,
    created_at: '2026-08-29T09:00:00+05:00',
  }
}

async function openUserEditor(page: Page, fullName: string) {
  const row = page.locator('tbody tr').filter({ hasText: fullName })

  await expect(row).toBeVisible()
  await row.getByTitle('Edit').click()
  await expect(page.getByRole('dialog', { name: 'Edit User' })).toBeVisible()
}

test.describe('Warehouse per-user permissions', () => {
  test('active money command-palette routes carry the same permission gates', () => {
    const managementItems = managementNav as Array<{ to?: string; anyPermission?: string[] }>

    expect(managementItems.find(item => item.to === 'treasury')?.anyPermission)
      .toEqual(['treasury.account.view'])

    expect(managementItems.find(item => item.to === 'money-control')?.anyPermission)
      .toEqual(['money.control.view'])
  })

  test('optional expense permissions unlock only the matching Warehouse routes', () => {
    const permissions = [
      'expense.category.view',
      'expense.request.create',
      'expense.request.view_own',
    ]

    const access = {
      hasAny: (required: string[]) => required.some(permission => permissions.includes(permission)),
    } as Parameters<typeof warehousePathAllowed>[1]

    expect(warehousePathAllowed('/hr-expenses', access)).toBe(true)
    expect(warehousePathAllowed('/hr-expense-categories', access)).toBe(true)
    expect(warehousePathAllowed('/treasury', access)).toBe(false)
    expect(warehousePathAllowed('/money-control', access)).toBe(false)
  })

  test('ADMIN edits only the safe audit bundle while preserving exact existing permissions', async ({ page }) => {
    await seedSession(page, 'ADMIN')
    let user = warehouseUser()
    let patchedBody: Record<string, unknown> | null = null
    const catalogRequests: string[] = []

    await page.route('**/api/**', async route => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      const method = request.method()

      if (path.endsWith('/users') && method === 'GET') {
        await route.fulfill({
          json: { data: { users: [user], pagination: { total_users: 1 } } },
        })
        return
      }
      if (path.endsWith('/permissions') && method === 'GET') {
        catalogRequests.push(path)
        await route.fulfill({ json: { data: { permissions: optionalCatalog } } })
        return
      }
      if (path.endsWith('/roles/WAREHOUSE') && method === 'GET') {
        catalogRequests.push(path)
        await route.fulfill({ json: { data: { name: 'WAREHOUSE', permissions: baseWarehousePermissions } } })
        return
      }
      if (path.endsWith('/users/17') && method === 'PATCH') {
        patchedBody = request.postDataJSON()
        user = { ...user, ...(patchedBody as Partial<TestUser>) }
        await route.fulfill({ json: { data: { user }, message: 'User updated' } })
        return
      }

      await route.fulfill({ json: { data: {} } })
    })

    await page.goto('/users')
    await openUserEditor(page, 'Warehouse Worker')

    const dialog = page.getByRole('dialog', { name: 'Edit User' })

    await expect(dialog.getByText('Additional warehouse responsibilities')).toBeVisible()
    await expect(dialog.getByRole('combobox', { name: 'Role' })).toHaveAttribute('aria-disabled', 'true')
    await expect(dialog.getByRole('checkbox', { name: 'Attendance records' })).not.toBeChecked()
    await expect(dialog.getByRole('checkbox', { name: 'Expense requests' })).not.toBeChecked()
    await expect(dialog.getByRole('checkbox', { name: 'Pay expense requests' })).toHaveCount(0)
    await expect(dialog.getByRole('checkbox', { name: 'Manage users' })).toHaveCount(0)

    await dialog.getByRole('checkbox', { name: 'Attendance records' }).click()
    await dialog.getByRole('checkbox', { name: 'Expense requests' }).click()
    await dialog.getByRole('button', { name: 'Save' }).click()

    await expect.poll(() => patchedBody).not.toBeNull()

    const permissions = (patchedBody?.permissions ?? []) as string[]

    expect(permissions).toEqual([
      ...baseWarehousePermissions,
      'attendance.view',
      'attendance.record',
      'attendance.adjust.request',
      'expense.category.view',
      'expense.request.create',
      'expense.request.view_own',
    ])
    expect(permissions).not.toContain('*')
    expect(permissions).not.toContain('attendance.adjust.approve')
    expect(permissions).not.toContain('expense.request.pay')
    expect(catalogRequests).toHaveLength(2)
  })

  test('WAREHOUSE creation relies on the backend template and never follows POST with PATCH', async ({ page }) => {
    await seedSession(page, 'ADMIN')

    const postedBodies: Record<string, unknown>[] = []
    const patchedPaths: string[] = []
    let users: TestUser[] = []

    await page.route('**/api/**', async route => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      const method = request.method()

      if (path.endsWith('/users') && method === 'GET') {
        await route.fulfill({ json: { data: { users, pagination: { total_users: users.length } } } })
        return
      }
      if (path.endsWith('/users') && method === 'POST') {
        const body = request.postDataJSON() as Record<string, unknown>

        postedBodies.push(body)
        users = [{
          id: 44,
          first_name: String(body.first_name),
          last_name: String(body.last_name),
          email: String(body.email),
          role: 'WAREHOUSE',
          status: 'ACTIVE',
          permissions: [...baseWarehousePermissions],
          last_login_at: null,
          created_at: '2026-08-29T10:00:00+05:00',
        }]
        await route.fulfill({ status: 201, json: { data: { user: users[0] }, message: 'User created' } })
        return
      }
      if (method === 'PATCH' && /\/users\/\d+$/.test(path)) {
        patchedPaths.push(path)
        await route.fulfill({ json: { data: {} } })
        return
      }

      await route.fulfill({ json: { data: {} } })
    })

    await page.goto('/users')
    await page.getByRole('button', { name: 'New User' }).click()

    const dialog = page.getByRole('dialog', { name: 'New User' })

    await dialog.getByRole('textbox', { name: 'First Name' }).fill('New')
    await dialog.getByRole('textbox', { name: 'Last Name' }).fill('Warehouse')
    await dialog.getByRole('combobox', { name: 'Role' }).click()
    await page.getByRole('option', { name: 'Warehouse', exact: true }).click()
    await dialog.getByRole('textbox', { name: 'Email' }).fill('new.warehouse@example.test')
    await dialog.getByLabel('Password').fill('12345678')
    await dialog.getByRole('button', { name: 'Save' }).click()

    await expect(page.getByText('New Warehouse')).toBeVisible()
    expect(postedBodies).toHaveLength(1)
    expect(postedBodies[0]).toMatchObject({
      first_name: 'New',
      last_name: 'Warehouse',
      email: 'new.warehouse@example.test',
      role: 'WAREHOUSE',
      password: '12345678',
    })
    expect(postedBodies[0]).not.toHaveProperty('permissions')
    expect(patchedPaths).toEqual([])
  })

  test('MANAGER cannot see permission controls or move an account into or out of WAREHOUSE', async ({ page }) => {
    await seedSession(page, 'MANAGER')

    const warehouse = warehouseUser()

    const cashier: TestUser = {
      ...warehouse,
      id: 18,
      first_name: 'Cashier',
      last_name: 'Worker',
      email: 'cashier.worker@local',
      role: 'CASHIER',
      permissions: [],
    }

    const catalogRequests: string[] = []

    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname
      if (path.endsWith('/users') && route.request().method() === 'GET') {
        await route.fulfill({ json: { data: { users: [warehouse, cashier], pagination: { total_users: 2 } } } })
        return
      }
      if (path.endsWith('/permissions') || path.endsWith('/roles/WAREHOUSE'))
        catalogRequests.push(path)
      await route.fulfill({ json: { data: {} } })
    })

    await page.goto('/users')
    await openUserEditor(page, 'Warehouse Worker')
    let dialog = page.getByRole('dialog', { name: 'Edit User' })
    await expect(dialog.getByText('Additional warehouse responsibilities')).toHaveCount(0)
    await expect(dialog.getByRole('combobox', { name: 'Role' })).toHaveAttribute('aria-disabled', 'true')
    await dialog.getByTitle('Close').click()

    await openUserEditor(page, 'Cashier Worker')
    dialog = page.getByRole('dialog', { name: 'Edit User' })
    await dialog.getByRole('combobox', { name: 'Role' }).click()
    await expect(page.getByRole('option', { name: 'Warehouse', exact: true })).toHaveCount(0)
    expect(catalogRequests).toEqual([])
  })
})
