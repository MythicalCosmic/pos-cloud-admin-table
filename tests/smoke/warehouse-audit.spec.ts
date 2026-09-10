import { type Locator, type Page, expect, test } from '@playwright/test'

async function chooseDate(page: Page, form: Locator, label: string, iso: string) {
  await form.getByRole('button', { name: label, exact: true }).click()
  const calendar = page.locator('dialog.calendar-popover[open]')
  await calendar.locator('.calendar-popover__month-switch').click()
  await calendar.getByRole('textbox', { name: 'Year', exact: true }).fill(iso.slice(0, 4))
  await calendar.getByRole('textbox', { name: 'Year', exact: true }).press('Tab')
  const month = new Intl.DateTimeFormat('en', { month: 'long' }).format(new Date(`${iso}T12:00:00`))
  await calendar.getByRole('button', { name: month, exact: true }).click()
  await calendar.locator(`[data-date="${iso}"]`).click()
}

async function chooseTime(page: Page, form: Locator, label: string, value: string) {
  await form.getByRole('button', { name: label, exact: true }).click()
  const picker = page.locator('dialog.calendar-popover[open]')
  await picker.getByRole('textbox', { name: 'Hours', exact: true }).fill(value.slice(0, 2))
  await picker.getByRole('textbox', { name: 'Minutes', exact: true }).fill(value.slice(3, 5))
  await picker.getByRole('button', { name: 'Apply', exact: true }).click()
}

interface CapturedMutation {
  body: Record<string, unknown>
  idempotencyKey?: string
}

interface MockAuditApi {
  manualAttendance: CapturedMutation[]
  attendanceReviews: Array<CapturedMutation & { path: string }>
  disciplineCases: CapturedMutation[]
  preparationReviews: CapturedMutation[]
}

const warehousePermissions = [
  'stock.catalog.view',
  'stock.level.view',
  'stock.batch.view',
  'stock.supplier.view',
  'stock.supplier.balance.view',
  'stock.purchase.view',
  'stock.receiving.create',
  'stock.receiving.update_draft',
  'stock.receiving.complete',
  'stock.count.view',
  'stock.count.create',
  'stock.count.record',
  'stock.transfer.view',
  'stock.transfer.create',
  'attendance.view',
  'attendance.record',
  'attendance.adjust.request',
  'attendance.adjust.approve',
  'discipline.rule.view',
  'discipline.case.view',
  'discipline.case.create',
  'prep.audit.view',
  'prep.audit.review',
]

async function seedSession(page: Page, permissions: string[], role = 'WAREHOUSE') {
  await page.addInitScript(({ grantedPermissions, userRole }) => {
    localStorage.setItem('appLocale', 'en')
    localStorage.setItem('numberFormat', 'full')
    localStorage.setItem('businessDayStart', '03:00')
    localStorage.setItem('accessToken', JSON.stringify('warehouse-test-token'))
    localStorage.setItem('userData', JSON.stringify({
      id: 'warehouse-user-1',
      name: 'Warehouse Tester',
      role: userRole,
      permissions: grantedPermissions,
    }))
    localStorage.setItem('userAbilities', JSON.stringify(userRole === 'WAREHOUSE'
      ? [{ action: 'read', subject: 'Auth' }]
      : [{ action: 'manage', subject: 'all' }]))
  }, { grantedPermissions: permissions, userRole: role })
}

async function seedWarehouseSession(page: Page) {
  await seedSession(page, warehousePermissions)
}

async function mockAuditApi(page: Page): Promise<MockAuditApi> {
  const captured: MockAuditApi = {
    manualAttendance: [],
    attendanceReviews: [],
    disciplineCases: [],
    preparationReviews: [],
  }

  await page.route('**/api/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    const method = request.method()

    if (path.endsWith('/audit-dashboard/') && method === 'GET') {
      await route.fulfill({
        json: {
          data: {
            counts: { ON_TIME: 2, SLIGHTLY_LATE: 1, VERY_LATE: 0, UNTRACKED: 0 },
            pending_yellow_count: 1,
            pending_red_count: 0,
          },
        },
      })
      return
    }

    if (path.endsWith('/attendance/summary/') && method === 'GET') {
      await route.fulfill({
        json: {
          data: {
            employees: [
              {
                employee: { id: '101', full_name: 'Aziza Karimova', is_active: true },
                scheduled_minutes: 480,
                worked_minutes: 475,
                overtime_minutes: 0,
                late_minutes: 5,
                early_leave_minutes: 0,
                absences: 0,
                excuses: { PENDING: 0, APPROVED: 0, REJECTED: 0 },
                penalties: { DRAFT: 0, SUBMITTED: 0, APPROVED_PENDING_PAYROLL: 0, APPROVED: 0, REJECTED: 0, VOIDED: 0 },
                approved_penalty_total_uzs: 0,
                pending_penalty_total_uzs: 0,
              },
              {
                employee: { id: '102', full_name: 'Bekzod Aliyev', is_active: true },
                scheduled_minutes: 480,
                worked_minutes: 480,
                overtime_minutes: 0,
                late_minutes: 0,
                early_leave_minutes: 0,
                absences: 0,
                excuses: { PENDING: 0, APPROVED: 0, REJECTED: 0 },
                penalties: { DRAFT: 0, SUBMITTED: 0, APPROVED_PENDING_PAYROLL: 0, APPROVED: 0, REJECTED: 0, VOIDED: 0 },
                approved_penalty_total_uzs: 0,
                pending_penalty_total_uzs: 0,
              },
            ],
            pagination: { total: 2, page: 1, per_page: 100 },
          },
        },
      })
      return
    }

    if (path.endsWith('/attendance/manual-entry/') && method === 'POST') {
      captured.manualAttendance.push({
        body: request.postDataJSON() as Record<string, unknown>,
        idempotencyKey: request.headers()['idempotency-key'],
      })
      await route.fulfill({ json: { data: { id: 'attendance-manual-1' } } })
      return
    }

    if (path.endsWith('/attendance/attendance-1/') && method === 'GET') {
      const adjustmentRequests = captured.attendanceReviews.length
        ? []
        : [{
          id: 'adjustment-1',
          original_check_in: '2026-08-28T09:05:00+05:00',
          original_check_out: '2026-08-28T17:00:00+05:00',
          requested_check_in: '2026-08-28T09:00:00+05:00',
          requested_check_out: '2026-08-28T17:00:00+05:00',
          reason_category: 'DEVICE_FAILURE',
          reason_text: 'Entrance terminal was offline.',
          status: 'PENDING',
          requested_by: { id: 'manager-2', full_name: 'Nodira Manager' },
        }]

      await route.fulfill({
        json: {
          data: {
            attendance: {
              id: 'attendance-1',
              late_minutes: 5,
              early_leave_minutes: 0,
              adjustment_requests: adjustmentRequests,
              excuses: [{
                id: 'excuse-1',
                category: 'TRANSPORT',
                description: 'Bus service was delayed.',
                status: 'PENDING',
                submitted_by: { id: 'warehouse-user-1', full_name: 'Warehouse Tester' },
              }],
            },
          },
        },
      })
      return
    }

    if (/\/attendance-(?:adjustments|excuses)\/[^/]+\/(?:approve|reject)\/$/.test(path) && method === 'POST') {
      captured.attendanceReviews.push({
        path,
        body: request.postDataJSON() as Record<string, unknown>,
        idempotencyKey: request.headers()['idempotency-key'],
      })
      await route.fulfill({ json: { data: { status: path.includes('/approve/') ? 'APPROVED' : 'REJECTED' } } })
      return
    }

    if (path.endsWith('/attendance/') && method === 'GET') {
      await route.fulfill({
        json: {
          data: {
            attendances: [
              {
                id: 'attendance-1',
                work_date: '2026-08-28',
                employee: { id: '101', full_name: 'Aziza Karimova' },
                scheduled_start: '09:00',
                scheduled_end: '17:00',
                check_in: '2026-08-28T09:05:00+05:00',
                check_out: '2026-08-28T17:00:00+05:00',
                scheduled_minutes: 480,
                worked_minutes: '475',
                overtime_minutes: 0,
                late_minutes: 5,
                early_leave_minutes: 0,
                status: 'LATE',
                penalty_summary: { count: 0, approved_amount_uzs: 0 },
              },
            ],
            pagination: { total: 1, page: 1, per_page: 20 },
          },
        },
      })
      return
    }

    if (path.endsWith('/discipline-rules/') && method === 'GET') {
      await route.fulfill({
        json: {
          data: {
            discipline_rules: [
              {
                id: 'rule-1',
                code: 'ATT-LATE-01',
                category: 'ATTENDANCE',
                title: 'Late arrival',
                description: 'Arriving after the scheduled start.',
                default_amount_uzs: '125000',
                is_active: true,
                requires_evidence: true,
                requires_comment: true,
                effective_from: '2026-01-01',
              },
            ],
            pagination: { total: 1, page: 1, per_page: 500 },
          },
        },
      })
      return
    }

    if (path.endsWith('/discipline-cases/') && method === 'POST') {
      captured.disciplineCases.push({
        body: request.postDataJSON() as Record<string, unknown>,
        idempotencyKey: request.headers()['idempotency-key'],
      })
      await route.fulfill({ json: { data: { id: 'case-1', status: 'SUBMITTED' } } })
      return
    }

    if (path.endsWith('/discipline-cases/') && method === 'GET') {
      await route.fulfill({
        json: {
          data: {
            discipline_cases: [],
            pagination: { total: 0, page: 1, per_page: 20 },
          },
        },
      })
      return
    }

    if (path.endsWith('/preparation-audit-categories/') && method === 'GET') {
      await route.fulfill({
        json: {
          data: {
            preparation_audit_categories: [
              { id: 'category-staff', code: 'STAFF_SHORTAGE', name: 'Staff shortage', is_active: true },
              { id: 'category-volume', code: 'HIGH_ORDER_VOLUME', name: 'High order volume', is_active: true },
            ],
          },
        },
      })
      return
    }

    if (path.endsWith('/preparation-audits/preparation-1/review/') && method === 'POST') {
      captured.preparationReviews.push({
        body: request.postDataJSON() as Record<string, unknown>,
        idempotencyKey: request.headers()['idempotency-key'],
      })
      await route.fulfill({ json: { data: { id: 'review-1', review_status: 'COMPLETED' } } })
      return
    }

    if (path.endsWith('/preparation-audits/') && method === 'GET') {
      const pendingRows = captured.preparationReviews.length
        ? []
        : [
          {
            id: 'preparation-1',
            order: {
              id: 'order-501',
              display_id: 'A-501',
              cashier_id: 'cashier-1',
            },
            branch_id: 'branch-central',
            created_at_snapshot: '2026-08-28T12:00:00+05:00',
            ready_at_snapshot: '2026-08-28T12:13:00+05:00',
            elapsed_seconds: 780,
            target_seconds: 600,
            target_name_snapshot: 'Kitchen standard',
            performance_status: 'SLIGHTLY_LATE',
            review_required: true,
            review_status: 'PENDING',
          },
        ]

      await route.fulfill({
        json: {
          data: {
            preparation_audits: pendingRows,
            pagination: { total: pendingRows.length, page: 1, per_page: 20 },
          },
        },
      })
      return
    }

    // Keep these focused tests isolated from optional shell and future
    // read-only requests without inventing business records.
    await route.fulfill({ json: { data: {} } })
  })

  return captured
}

test.describe('warehouse operational audit readiness', () => {
  test.beforeEach(async ({ page }) => {
    await seedWarehouseSession(page)
  })

  test('shows only assigned warehouse navigation and blocks unrelated admin pages', async ({ page }) => {
    await mockAuditApi(page)
    await page.goto('/')

    await expect(page).toHaveURL(/\/warehouse$/)
    await expect(page.getByRole('heading', { name: 'Warehouse operations' })).toBeVisible()
    const workspace = page.getByRole('main')

    await expect(workspace.getByText('PO receiving', { exact: true })).toBeVisible()
    await expect(workspace.getByText('Suppliers and balances', { exact: true })).toBeVisible()

    const navigation = page.getByRole('navigation', { name: 'Navigation' })

    await expect(navigation.getByRole('link', { name: 'Warehouse operations' })).toBeVisible()
    await expect(navigation.getByText('HR', { exact: true })).toHaveCount(0)
    await expect(navigation.getByRole('link', { name: 'Operational Audit' })).toHaveCount(0)
    await expect(navigation.getByRole('link', { name: 'Safe & Bank', exact: true })).toHaveCount(0)
    await expect(navigation.getByText('Adjustments', { exact: true })).toHaveCount(0)

    await page.goto('/treasury')
    await expect(page).toHaveURL(/\/not-authorized$/)

    await page.goto('/audit?tab=attendance')
    await expect(page.getByRole('heading', { name: 'Operational audit' })).toBeVisible()
  })

  test('records attendance with server minutes and explicit Tashkent timestamps', async ({ page }) => {
    const api = await mockAuditApi(page)

    await page.goto('/audit?tab=attendance')
    await expect(page.getByText('Late by 5 min')).toBeVisible()
    await expect(page.getByText('7 h 55 min')).toBeVisible()

    await page.getByRole('button', { name: 'Record attendance' }).click()

    const dialog = page.getByRole('dialog', { name: 'Record attendance' })

    await dialog.getByRole('combobox', { name: 'Employee' }).click()
    await page.getByRole('option', { name: 'Aziza Karimova' }).click()
    await chooseDate(page, dialog, 'Date', '2026-08-28')
    await chooseTime(page, dialog, 'Check-in', '09:05')
    await chooseTime(page, dialog, 'Check-out', '17:00')
    await dialog.getByLabel('Notes').fill('Manual record verified by warehouse auditor.')
    await dialog.getByRole('button', { name: 'Save attendance' }).click()

    await expect.poll(() => api.manualAttendance.length).toBe(1)
    await expect(dialog).toHaveCount(0)

    expect(api.manualAttendance[0].body).toEqual({
      employee_id: '101',
      work_date: '2026-08-28',
      check_in_local: '2026-08-28T09:05:00+05:00',
      check_out_local: '2026-08-28T17:00:00+05:00',
      notes: 'Manual record verified by warehouse auditor.',
    })
    expect(api.manualAttendance[0].idempotencyKey).toBeTruthy()
  })

  test('reviews pending attendance requests, requires a rejection note, and blocks self-review', async ({ page }) => {
    const api = await mockAuditApi(page)

    await page.goto('/audit?tab=attendance')
    await page.getByRole('button', { name: 'Review attendance requests' }).click()

    const dialog = page.getByRole('dialog', { name: 'Attendance review queue' })

    await expect(dialog.getByText('Nodira Manager')).toBeVisible()
    await expect(dialog.getByText('Entrance terminal was offline.')).toBeVisible()
    await expect(dialog.getByText('You cannot review your own request.')).toBeVisible()

    await dialog.getByRole('button', { name: 'Reject' }).click()
    await dialog.getByRole('button', { name: 'Confirm rejection' }).click()
    await expect(dialog.getByText('Enter a reason for rejection.')).toBeVisible()
    expect(api.attendanceReviews).toHaveLength(0)

    await dialog.getByLabel('Review note').fill('Terminal outage was not supported by the service log.')
    await dialog.getByRole('button', { name: 'Confirm rejection' }).click()
    await expect.poll(() => api.attendanceReviews.length).toBe(1)

    expect(api.attendanceReviews[0]).toMatchObject({
      path: '/api/admins/hr/attendance-adjustments/adjustment-1/reject/',
      body: { review_note: 'Terminal outage was not supported by the service log.' },
    })
  })

  test('submits a penalty as a numeric UZS amount with a policy snapshot source', async ({ page }) => {
    const api = await mockAuditApi(page)

    await page.goto('/audit?tab=discipline')
    await page.getByRole('button', { name: 'New penalty case' }).click()

    const dialog = page.getByRole('dialog', { name: 'New penalty case' })

    await dialog.getByRole('combobox', { name: 'Employee' }).click()
    await page.getByRole('option', { name: 'Aziza Karimova' }).click()
    await dialog.getByRole('combobox', { name: 'Rule' }).click()
    await page.getByRole('option', { name: /ATT-LATE-01/ }).click()
    await chooseDate(page, dialog, 'Date', '2026-08-28')
    await chooseTime(page, dialog, 'Time', '14:30')
    await dialog.getByLabel('Amount').fill('150000')
    await dialog.getByLabel('Evidence').fill('Arrival time was verified against the entrance log.')
    await dialog.getByLabel('Comment').fill('The documented late arrival breaks the active attendance rule.')
    await dialog.getByRole('button', { name: 'Submit for approval' }).click()

    await expect.poll(() => api.disciplineCases.length).toBe(1)
    await expect(dialog).toHaveCount(0)

    expect(api.disciplineCases[0].body).toMatchObject({
      employee_id: '101',
      business_date: '2026-08-28',
      occurred_at: '2026-08-28T14:30:00+05:00',
      rule_id: 'rule-1',
      amount_uzs: 150000,
      evidence: 'Arrival time was verified against the entrance log.',
      comment: 'The documented late arrival breaks the active attendance rule.',
      status: 'SUBMITTED',
    })
    expect(typeof api.disciplineCases[0].body.amount_uzs).toBe('number')
    expect(api.disciplineCases[0].idempotencyKey).toBeTruthy()
  })

  test('requires a categorized delay comment and sends the completed preparation review', async ({ page }) => {
    const api = await mockAuditApi(page)

    await page.goto('/audit?tab=preparation')
    await expect(page.getByText('Yellow · late')).toBeVisible()
    await expect(page.getByText('13 min')).toBeVisible()
    await page.getByRole('button', { name: 'Review' }).click()

    const dialog = page.getByRole('dialog', { name: 'Review preparation delay' })

    await dialog.getByRole('button', { name: 'Complete review' }).click()
    await expect(dialog.getByText('Select a category.')).toBeVisible()
    await expect(dialog.getByText('Comment must contain 10–1,000 characters.')).toBeVisible()
    expect(api.preparationReviews).toHaveLength(0)

    await dialog.getByRole('combobox', { name: 'Reason category' }).click()
    await page.getByRole('option', { name: 'Staff shortage' }).click()
    await dialog.getByLabel('Comment').fill('Kitchen staffing was verified below the planned level.')
    await dialog.getByRole('combobox', { name: 'Responsible employee' }).click()
    await page.getByRole('option', { name: 'Bekzod Aliyev' }).click()
    await dialog.getByRole('button', { name: 'Complete review' }).click()

    await expect.poll(() => api.preparationReviews.length).toBe(1)
    await expect(dialog).toHaveCount(0)

    expect(api.preparationReviews[0].body).toEqual({
      category_id: 'category-staff',
      comment: 'Kitchen staffing was verified below the planned level.',
      responsible_employee_id: '102',
      disciplinary_case_id: null,
    })
    expect(api.preparationReviews[0].idempotencyKey).toBeTruthy()
  })
})

test.describe('warehouse read-permission boundaries', () => {
  test('does not expose list workspaces when only a mutation permission is assigned', async ({ page }) => {
    await seedSession(page, [
      'stock.receiving.create',
      'stock.count.create',
      'stock.transfer.create',
    ])
    await page.route('**/api/**', route => route.fulfill({ json: { data: {} } }))

    await page.goto('/warehouse')

    await expect(page.getByText('PO receiving', { exact: true })).toHaveCount(0)
    await expect(page.getByText('Stock counts', { exact: true })).toHaveCount(0)
    await expect(page.getByText('Stock transfers', { exact: true })).toHaveCount(0)

    const navigation = page.getByRole('navigation', { name: 'Navigation' })

    await expect(navigation.getByRole('link', { name: 'PO receiving', exact: true })).toHaveCount(0)
    await expect(navigation.getByRole('link', { name: 'Stock Counts' })).toHaveCount(0)
    await expect(navigation.getByRole('link', { name: 'Transfers' })).toHaveCount(0)

    for (const path of ['/stock/receiving', '/stock/counts', '/stock/transfers']) {
      await page.goto(path)
      await expect(page).toHaveURL(/\/not-authorized$/)
    }
  })
})

async function mockReceivingApi(page: Page, options: {
  status: 'DRAFT' | 'COMPLETED'
  receivedById: string
}) {
  const overApprovals: CapturedMutation[] = []
  const correctionRequests: CapturedMutation[] = []
  let receivingDetailReads = 0

  const poStatus = options.status === 'DRAFT' ? 'CONFIRMED' : 'RECEIVED'

  const receiving = () => ({
    id: 920,
    receiving_number: 'RCV-920',
    purchase_order_id: 910,
    purchase_order_number: 'PO-910',
    location_id: 31,
    location_name: 'Main warehouse',
    received_date: '2026-08-28',
    received_by_id: options.receivedById,
    status: options.status,
    notes: 'Production-shaped receiving fixture',
    items: [{
      id: 930,
      po_item_id: 911,
      stock_item_id: 901,
      stock_item_name: 'Brown rice',
      quantity_received: '8.0000',
      unit: 'kg',
      unit_cost_uzs: 100000,
      unit_cost: 100000,
      batch_number: '',
      expiry_date: null,
      quality_status: 'PASSED',
      notes: '',
    }],
  })

  const purchaseOrder = () => ({
    id: 910,
    order_number: 'PO-910',
    status: poStatus,
    delivery_location_id: 31,
    items: [{
      id: 911,
      stock_item_id: 901,
      stock_item_name: 'Brown rice',
      quantity_ordered: '10.0000',
      quantity_received: options.status === 'DRAFT' ? '0.0000' : '8.0000',
      quantity_canceled: '0.0000',
      quantity_pending: options.status === 'DRAFT' ? '10.0000' : '2.0000',
      unit_price_uzs: 100000,
    }],
  })

  await page.route('**/api/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    const method = request.method()

    if (path.endsWith('/purchase-orders/') && method === 'GET') {
      const rows = url.searchParams.get('status') === poStatus ? [purchaseOrder()] : []

      await route.fulfill({
        json: { data: { orders: rows, pagination: { total: rows.length, page: 1, per_page: 100 } } },
      })
      return
    }

    if (path.endsWith('/purchase-orders/910/') && method === 'GET') {
      await route.fulfill({ json: { data: { order: purchaseOrder() } } })
      return
    }

    if (path.endsWith('/purchase-order/910/receiving/') && method === 'GET') {
      await route.fulfill({ json: { data: { receivings: [receiving()] } } })
      return
    }

    if (path.endsWith('/receiving/920/items/') && method === 'GET') {
      receivingDetailReads += 1

      // Deployed cf5dcee serializer deliberately does not expose over-receipt
      // approval fields. The test preserves that production response shape.
      await route.fulfill({ json: { data: { receiving: receiving() } } })
      return
    }

    if (path.endsWith('/receiving/920/approve-over-receipt/') && method === 'POST') {
      overApprovals.push({
        body: request.postDataJSON() as Record<string, unknown>,
        idempotencyKey: request.headers()['idempotency-key'],
      })
      await route.fulfill({ json: { data: { receiving: receiving() } } })
      return
    }

    if (path.endsWith('/receiving/920/corrections/') && method === 'POST') {
      correctionRequests.push({
        body: request.postDataJSON() as Record<string, unknown>,
        idempotencyKey: request.headers()['idempotency-key'],
      })
      await route.fulfill({ json: { data: { correction_id: 940, status: 'PENDING' } } })
      return
    }

    if (path.endsWith('/locations/') && method === 'GET') {
      await route.fulfill({ json: { data: { locations: [], pagination: { total: 0 } } } })
      return
    }

    await route.fulfill({ json: { data: {} } })
  })

  return { overApprovals, correctionRequests, receivingDetailReads: () => receivingDetailReads }
}

test.describe('warehouse stock safety boundaries', () => {
  test('requires a reason for cross-user over-receipt approval and keeps excess blocked without refreshed server evidence', async ({ page }) => {
    await seedSession(page, [
      'stock.purchase.view',
      'stock.batch.view',
      'stock.receiving.create',
      'stock.receiving.approve_over',
    ], 'MANAGER')

    const api = await mockReceivingApi(page, { status: 'DRAFT', receivedById: 'warehouse-user-2' })

    await page.goto('/stock/receiving')

    const row = page.getByRole('row').filter({ hasText: 'RCV-920' })

    await expect(row).toBeVisible()
    await row.getByTitle('View').click()

    const receivingDialog = page.getByRole('dialog', { name: /Receiving # RCV-920/ })

    await receivingDialog.getByRole('button', { name: 'Approve over-receipt' }).click()

    const approvalDialog = page.getByRole('dialog', { name: 'Approve over-receipt' })

    await expect(approvalDialog.getByRole('button', { name: 'Cancel' })).toHaveCount(0)
    await expect(approvalDialog.getByRole('button', { name: 'Confirm approval' })).toBeDisabled()
    await approvalDialog.getByLabel('Approval reason').fill('Supplier invoice INV-920 confirms two promotional kilograms.')
    await approvalDialog.getByRole('button', { name: 'Confirm approval' }).click()

    await expect.poll(() => api.overApprovals.length).toBe(1)
    expect(api.overApprovals[0].body).toEqual({
      reason: 'Supplier invoice INV-920 confirms two promotional kilograms.',
    })
    await expect(page.getByText(/server did not return verification/i)).toBeVisible()
    await expect(receivingDialog.getByRole('button', { name: 'Approve over-receipt' })).toHaveCount(0)
    expect(api.receivingDetailReads()).toBeGreaterThanOrEqual(2)
  })

  test('never advertises over-receipt self-approval', async ({ page }) => {
    await seedSession(page, [
      'stock.purchase.view',
      'stock.batch.view',
      'stock.receiving.create',
      'stock.receiving.approve_over',
    ], 'MANAGER')
    await mockReceivingApi(page, { status: 'DRAFT', receivedById: 'warehouse-user-1' })

    await page.goto('/stock/receiving')

    const row = page.getByRole('row').filter({ hasText: 'RCV-920' })

    await row.getByTitle('View').click()

    const receivingDialog = page.getByRole('dialog', { name: /Receiving # RCV-920/ })

    await expect(receivingDialog.getByRole('button', { name: 'Approve over-receipt' })).toHaveCount(0)
  })

  test('submits one reasoned correction request for a completed receiving and shows its returned reference', async ({ page }) => {
    await seedSession(page, [
      'stock.purchase.view',
      'stock.batch.view',
      'stock.receiving.create',
    ])

    const api = await mockReceivingApi(page, { status: 'COMPLETED', receivedById: 'warehouse-user-1' })

    await page.goto('/stock/receiving')

    const row = page.getByRole('row').filter({ hasText: 'RCV-920' })

    await row.getByTitle('View').click()

    const receivingDialog = page.getByRole('dialog', { name: /Receiving # RCV-920/ })

    await receivingDialog.getByRole('button', { name: 'Request correction' }).click()

    const correctionDialog = page.getByRole('dialog', { name: 'Request receiving correction' })

    await expect(correctionDialog.getByRole('button', { name: 'Cancel' })).toHaveCount(0)
    await expect(correctionDialog.getByRole('button', { name: 'Submit correction request' })).toBeDisabled()
    await correctionDialog.getByLabel('Correction reason').fill('The signed delivery note shows that the wrong receiving was completed.')
    await correctionDialog.getByRole('button', { name: 'Submit correction request' }).dblclick()

    await expect.poll(() => api.correctionRequests.length).toBe(1)
    expect(api.correctionRequests[0].body).toEqual({
      reason: 'The signed delivery note shows that the wrong receiving was completed.',
    })
    await expect(receivingDialog.getByText('Correction request is awaiting review')).toBeVisible()
    await expect(receivingDialog.getByText('#940 · Pending')).toBeVisible()
    await expect(receivingDialog.getByRole('button', { name: 'Request correction' })).toHaveCount(0)
  })

  test('renders supplier ledger values from the deployed *_uzs fields', async ({ page }) => {
    await seedSession(page, ['stock.supplier.view', 'stock.supplier.balance.view'])

    await page.route('**/api/**', async route => {
      const request = route.request()
      const path = new URL(request.url()).pathname

      if (path.endsWith('/suppliers/501/') && request.method() === 'GET') {
        await route.fulfill({
          json: {
            data: {
              supplier: {
                id: 501,
                code: 'SUP-501',
                name: 'Safety Foods',
                currency: 'UZS',
                is_active: true,
                current_balance_uzs: '9876543',
                credit_limit: 0,
                item_count: 0,
                items: [],
                stats: { total_orders: 0, total_value: 0, avg_order_value: 0 },
              },
            },
          },
        })
        return
      }

      if (path.endsWith('/suppliers/501/ledger/') && request.method() === 'GET') {
        await route.fulfill({
          json: {
            data: {
              transactions: [
                {
                  id: 1,
                  created_at: '2026-08-28T10:00:00+05:00',
                  type: 'PURCHASE',
                  amount_uzs: '1234567',
                  balance_after_uzs: '4567890',
                  fee_uzs: '12345',
                  source_account: 'BANK',
                  note: 'Ledger mapping sentinel',
                },
              ],
              pagination: { total: 1, page: 1, per_page: 20 },
            },
          },
        })
        return
      }

      await route.fulfill({ json: { data: {} } })
    })

    await page.goto('/stock/suppliers/501')
    await expect(page.getByRole('heading', { name: 'Safety Foods', level: 1 })).toBeVisible()
    await expect(page.locator('.kpi').filter({ hasText: 'Outstanding balance' })).toContainText(/9\D*876\D*543/)

    await page.getByRole('tab', { name: 'Ledger' }).click()

    const ledgerRow = page.getByRole('row').filter({ hasText: 'Ledger mapping sentinel' })

    await expect(ledgerRow).toBeVisible()
    await expect(ledgerRow.getByRole('cell').nth(2)).toContainText(/\+1\D*234\D*567/)
    await expect(ledgerRow.getByRole('cell').nth(3)).toContainText(/4\D*567\D*890/)
    await expect(ledgerRow.getByRole('cell').nth(5)).toContainText(/12\D*345/)
  })

  test('renders deployed balances in the supplier list ledger modal', async ({ page }) => {
    await seedSession(page, ['stock.supplier.view', 'stock.supplier.balance.view'])

    await page.route('**/api/**', async route => {
      const request = route.request()
      const path = new URL(request.url()).pathname

      if (path.endsWith('/suppliers/') && request.method() === 'GET') {
        await route.fulfill({
          json: {
            data: {
              suppliers: [
                {
                  id: 502,
                  code: 'SUP-502',
                  name: 'Modal Ledger Foods',
                  city: 'Tashkent',
                  rating: 5,
                  is_active: true,
                  current_balance_uzs: 8765432,
                },
              ],
              pagination: { current_page: 1, total_pages: 1, total_suppliers: 1, per_page: 10 },
            },
          },
        })
        return
      }

      if (path.endsWith('/suppliers/502/ledger/') && request.method() === 'GET') {
        await route.fulfill({
          json: {
            data: {
              transactions: [
                {
                  id: 2,
                  created_at: '2026-08-29T09:00:00+05:00',
                  transaction_type: 'PAYMENT',
                  amount_uzs: 1234567,
                  change_uzs: -1234567,
                  balance_after_uzs: 8765432,
                  fee_uzs: 12345,
                  source_account: 'BANK',
                  reference_type: 'TreasuryPayment',
                  reference_id: 88,
                  note: 'List ledger modal sentinel',
                },
              ],
              pagination: { page: 1, per_page: 20, total: 1 },
            },
          },
        })
        return
      }

      await route.fulfill({ json: { data: {} } })
    })

    await page.goto('/stock/suppliers')

    const supplierRow = page.getByRole('row').filter({ hasText: 'Modal Ledger Foods' })

    await expect(supplierRow).toContainText(/8\D*765\D*432/)
    await supplierRow.getByTitle('Ledger').click()

    const ledgerDialog = page.getByRole('dialog', { name: /Modal Ledger Foods.*Ledger/ })
    const ledgerRow = ledgerDialog.getByRole('row').filter({ hasText: 'List ledger modal sentinel' })

    await expect(ledgerDialog.locator('.modal__sub')).toContainText(/Current balance:\s*8\D*765\D*432/)
    await expect(ledgerRow).toBeVisible()
    await expect(ledgerRow.getByRole('cell').nth(2)).toContainText(/-1\D*234\D*567/)
    await expect(ledgerRow.getByRole('cell').nth(3)).toContainText(/8\D*765\D*432/)
    await expect(ledgerRow.getByRole('cell').nth(4)).toContainText(/12\D*345/)
  })

  test('never offers cancel for an in-transit transfer and rechecks the latest state before canceling', async ({ page }) => {
    await seedSession(page, ['stock.manage', 'stock.transfer.view'])
    let approvedDetailReads = 0
    const cancelPosts: Record<string, unknown>[] = []

    const transfer = (id: number, number: string, status: string) => ({
      id,
      transfer_number: number,
      status,
      transfer_type: 'INTERNAL',
      from_location: { id: 1, name: 'Main warehouse' },
      to_location: { id: 2, name: 'Kitchen' },
      requested_by_id: 'warehouse-user-1',
      created_at: '2026-08-28T09:00:00+05:00',
      requested_at: '2026-08-28T09:05:00+05:00',
      shipped_at: status === 'IN_TRANSIT' ? '2026-08-28T09:10:00+05:00' : null,
      received_at: null,
      items: [],
    })

    await page.route('**/api/**', async route => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      const method = request.method()

      if (path.endsWith('/transfers/') && method === 'GET') {
        await route.fulfill({
          json: {
            data: {
              transfers: [
                transfer(701, 'TR-701', 'IN_TRANSIT'),
                transfer(702, 'TR-702', 'APPROVED'),
              ],
              pagination: { total: 2, page: 1, per_page: 10 },
            },
          },
        })
        return
      }

      if (path.endsWith('/transfers/701/') && method === 'GET') {
        await route.fulfill({ json: { data: { transfer: transfer(701, 'TR-701', 'IN_TRANSIT') } } })
        return
      }

      if (path.endsWith('/transfers/702/') && method === 'GET') {
        approvedDetailReads += 1

        const latestStatus = approvedDetailReads === 1 ? 'APPROVED' : 'IN_TRANSIT'

        await route.fulfill({ json: { data: { transfer: transfer(702, 'TR-702', latestStatus) } } })
        return
      }

      if (path.endsWith('/transfers/702/cancel/') && method === 'POST') {
        cancelPosts.push(request.postDataJSON() as Record<string, unknown>)
        await route.fulfill({ json: { data: { transfer: transfer(702, 'TR-702', 'CANCELED') } } })
        return
      }

      if (path.endsWith('/locations/') && method === 'GET') {
        await route.fulfill({ json: { data: { locations: [], pagination: { total: 0 } } } })
        return
      }

      if (path.endsWith('/items/') && method === 'GET') {
        await route.fulfill({
          json: {
            data: {
              items: [{ id: 901, name: 'Brown rice', sku: 'RICE-901', base_unit_short: 'kg' }],
              pagination: { total: 1 },
            },
          },
        })
        return
      }

      await route.fulfill({ json: { data: {} } })
    })

    await page.goto('/stock/transfers')

    const inTransitRow = page.getByRole('row').filter({ hasText: 'TR-701' })
    const approvedRow = page.getByRole('row').filter({ hasText: 'TR-702' })

    await expect(inTransitRow).toBeVisible()
    await expect(approvedRow).toBeVisible()
    await expect(inTransitRow.getByTitle('Cancel Transfer')).toHaveCount(0)
    await expect(approvedRow.getByTitle('Cancel Transfer')).toBeVisible()

    await page.getByRole('button', { name: 'New Transfer Request' }).click()

    const requestDialog = page.getByRole('dialog', { name: 'New Transfer Request' })

    await requestDialog.getByRole('combobox', { name: 'Stock Item' }).click()

    const itemOption = page.getByRole('option', { name: /Brown rice.*RICE-901.*kg/ })

    await expect(itemOption).toBeVisible()
    await itemOption.click()
    await expect(requestDialog.getByText('Quantity is recorded in the base unit: kg')).toBeVisible()
    await requestDialog.getByRole('button', { name: 'Close' }).click()

    await approvedRow.getByTitle('Cancel Transfer').click()

    const dialog = page.getByRole('dialog', { name: 'Cancel Transfer' })

    await dialog.getByLabel('Reason').fill('State changed while this dialog was open.')
    await dialog.getByRole('button', { name: 'Cancel Transfer' }).click()

    await expect(dialog).toHaveCount(0)
    await expect(page.getByText(/A shipped transfer cannot be canceled safely/)).toBeVisible()
    expect(cancelPosts).toHaveLength(0)
    expect(approvedDetailReads).toBeGreaterThanOrEqual(2)
  })

  test('rejects a negative stock-count value before any record request is sent', async ({ page }) => {
    await seedSession(page, ['stock.count.view', 'stock.count.record'])

    const recordPosts: Record<string, unknown>[] = []

    const count = {
      id: 801,
      count_number: 'SC-801',
      status: 'IN_PROGRESS',
      count_type: 'FULL',
      location_name: 'Main warehouse',
      location: { id: 1, name: 'Main warehouse' },
      counted_by_id: 'warehouse-user-1',
      created_at: '2026-08-28T08:00:00+05:00',
    }

    await page.route('**/api/**', async route => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      const method = request.method()

      if (path.endsWith('/counts/') && method === 'GET') {
        await route.fulfill({ json: { data: { counts: [count], pagination: { total: 1 } } } })
        return
      }

      if (path.endsWith('/counts/801/') && method === 'GET') {
        await route.fulfill({
          json: {
            data: {
              count: {
                ...count,
                items: [
                  {
                    id: 811,
                    stock_item: { id: 91, name: 'Brown rice', unit: 'kg' },
                    system_quantity: '15',
                    counted_quantity: null,
                    variance: null,
                    notes: '',
                  },
                ],
              },
            },
          },
        })
        return
      }

      if (path.endsWith('/variance-codes/') && method === 'GET') {
        await route.fulfill({ json: { data: { codes: [] } } })
        return
      }

      if (path.endsWith('/counts/801/record/') && method === 'POST') {
        recordPosts.push(request.postDataJSON() as Record<string, unknown>)
        await route.fulfill({ json: { data: {} } })
        return
      }

      if (path.endsWith('/locations/') && method === 'GET') {
        await route.fulfill({ json: { data: { locations: [], pagination: { total: 0 } } } })
        return
      }

      await route.fulfill({ json: { data: {} } })
    })

    await page.goto('/stock/counts')

    const countRow = page.getByRole('row').filter({ hasText: 'SC-801' })

    await countRow.getByTitle('Open / record').click()

    const dialog = page.getByRole('dialog', { name: 'SC-801' })
    const itemRow = dialog.getByRole('row').filter({ hasText: 'Brown rice' })

    await itemRow.locator('input[type="number"]').fill('-2.5')
    await itemRow.getByTitle('Record').click()

    await expect(page.getByText('Counted quantity cannot be negative')).toBeVisible()
    expect(recordPosts).toHaveLength(0)
  })

  test('uses exact count permissions and approves auto-adjust-off counts without changing stock', async ({ page }) => {
    await seedSession(page, ['stock.count.view', 'stock.adjustment.approve'], 'MANAGER')

    const approvalPosts: CapturedMutation[] = []
    let detailReads = 0

    const reviewableCount = {
      id: 821,
      count_number: 'SC-821',
      status: 'PENDING_APPROVAL',
      count_type: 'FULL',
      location_name: 'Main warehouse',
      counted_by_id: 'warehouse-user-2',
      auto_adjust: false,
      created_at: '2026-08-28T08:00:00+05:00',
    }

    const ownCount = {
      ...reviewableCount,
      id: 822,
      count_number: 'SC-822',
      counted_by_id: 'warehouse-user-1',
    }

    await page.route('**/api/**', async route => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      const method = request.method()

      if (path.endsWith('/counts/') && method === 'GET') {
        await route.fulfill({
          json: {
            data: {
              counts: [reviewableCount, ownCount],
              pagination: { total: 2, page: 1, per_page: 10 },
            },
          },
        })
        return
      }

      if (path.endsWith('/counts/821/') && method === 'GET') {
        detailReads += 1
        await route.fulfill({ json: { data: { count: reviewableCount } } })
        return
      }

      if (path.endsWith('/counts/821/approve/') && method === 'POST') {
        approvalPosts.push({
          body: request.postDataJSON() as Record<string, unknown>,
          idempotencyKey: request.headers()['idempotency-key'],
        })
        await route.fulfill({ json: { data: { count: { ...reviewableCount, status: 'APPROVED' } } } })
        return
      }

      if (path.endsWith('/locations/') && method === 'GET') {
        await route.fulfill({ json: { data: { locations: [], pagination: { total: 0 } } } })
        return
      }

      await route.fulfill({ json: { data: {} } })
    })

    await page.goto('/stock/counts')

    const reviewableRow = page.getByRole('row').filter({ hasText: 'SC-821' })
    const ownRow = page.getByRole('row').filter({ hasText: 'SC-822' })

    await expect(reviewableRow.getByTitle('Approve')).toBeVisible()
    await expect(ownRow.getByTitle('Approve')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'New Count' })).toHaveCount(0)
    await reviewableRow.getByTitle('Approve').click()

    const dialog = page.getByRole('dialog', { name: 'Approve Count' })

    await expect(dialog.getByText('Approving will not change stock')).toBeVisible()
    await expect(dialog.getByText(/without posting inventory variances/i)).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Confirm' }).dblclick()

    await expect.poll(() => approvalPosts.length).toBe(1)
    expect(approvalPosts[0].body).toEqual({ apply_adjustments: false })
    expect(detailReads).toBeGreaterThanOrEqual(2)
  })

  test('uses stock.manage only for count cancellation', async ({ page }) => {
    await seedSession(page, ['stock.count.view', 'stock.manage'], 'MANAGER')

    const cancelPosts: Record<string, unknown>[] = []

    await page.route('**/api/**', async route => {
      const request = route.request()
      const path = new URL(request.url()).pathname

      if (path.endsWith('/counts/') && request.method() === 'GET') {
        await route.fulfill({
          json: {
            data: {
              counts: [
                {
                  id: 831,
                  count_number: 'SC-831',
                  status: 'DRAFT',
                  count_type: 'FULL',
                  location_name: 'Main warehouse',
                  counted_by_id: 'warehouse-user-1',
                  created_at: '2026-08-28T08:00:00+05:00',
                },
                {
                  id: 832,
                  count_number: 'SC-832',
                  status: 'PENDING_APPROVAL',
                  count_type: 'FULL',
                  location_name: 'Main warehouse',
                  counted_by_id: 'warehouse-user-2',
                  created_at: '2026-08-28T08:05:00+05:00',
                },
              ],
              pagination: { total: 2, page: 1, per_page: 10 },
            },
          },
        })
        return
      }

      if (path.endsWith('/counts/831/') && request.method() === 'GET') {
        await route.fulfill({
          json: {
            data: {
              count: {
                id: 831,
                count_number: 'SC-831',
                status: 'DRAFT',
                count_type: 'FULL',
                location_name: 'Main warehouse',
                counted_by_id: 'warehouse-user-1',
                created_at: '2026-08-28T08:00:00+05:00',
              },
            },
          },
        })
        return
      }

      if (path.endsWith('/counts/831/cancel/') && request.method() === 'POST') {
        cancelPosts.push(request.postDataJSON() as Record<string, unknown>)
        await route.fulfill({ json: { data: { count: { id: 831, status: 'CANCELED' } } } })
        return
      }

      if (path.endsWith('/locations/') && request.method() === 'GET') {
        await route.fulfill({ json: { data: { locations: [], pagination: { total: 0 } } } })
        return
      }

      await route.fulfill({ json: { data: {} } })
    })

    await page.goto('/stock/counts')

    await expect(page.getByRole('button', { name: 'New Count' })).toHaveCount(0)
    await expect(page.getByTitle('Start')).toHaveCount(0)
    await expect(page.getByTitle('Approve')).toHaveCount(0)
    await expect(page.getByTitle('Cancel')).toHaveCount(2)

    await page.getByRole('row').filter({ hasText: 'SC-831' }).getByTitle('Cancel').click()

    const dialog = page.getByRole('dialog', { name: 'Cancel Count' })

    await dialog.getByLabel('Reason (optional)').fill('Duplicate count opened for this location.')
    await dialog.getByRole('button', { name: 'Cancel Count' }).click()

    await expect.poll(() => cancelPosts.length).toBe(1)
    expect(cancelPosts[0]).toEqual({ reason: 'Duplicate count opened for this location.' })
  })

  test('blocks approval when the exact count state changed after confirmation opened', async ({ page }) => {
    await seedSession(page, ['stock.count.view', 'stock.adjustment.approve'], 'MANAGER')

    const approvalPosts: Record<string, unknown>[] = []
    let detailReads = 0

    const count = {
      id: 841,
      count_number: 'SC-841',
      status: 'PENDING_APPROVAL',
      count_type: 'FULL',
      location_name: 'Main warehouse',
      counted_by_id: 'warehouse-user-2',
      auto_adjust: true,
      created_at: '2026-08-28T08:00:00+05:00',
    }

    await page.route('**/api/**', async route => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      const method = request.method()

      if (path.endsWith('/counts/') && method === 'GET') {
        await route.fulfill({ json: { data: { counts: [count], pagination: { total: 1 } } } })
        return
      }

      if (path.endsWith('/counts/841/') && method === 'GET') {
        detailReads += 1

        const latest = detailReads === 1 ? count : { ...count, status: 'APPROVED' }

        await route.fulfill({ json: { data: { count: latest } } })
        return
      }

      if (path.endsWith('/counts/841/approve/') && method === 'POST') {
        approvalPosts.push(request.postDataJSON() as Record<string, unknown>)
        await route.fulfill({ json: { data: {} } })
        return
      }

      if (path.endsWith('/locations/') && method === 'GET') {
        await route.fulfill({ json: { data: { locations: [], pagination: { total: 0 } } } })
        return
      }

      await route.fulfill({ json: { data: {} } })
    })

    await page.goto('/stock/counts')
    await page.getByRole('row').filter({ hasText: 'SC-841' }).getByTitle('Approve').click()

    const dialog = page.getByRole('dialog', { name: 'Approve Count' })

    await expect(dialog.getByText('Approving will change stock')).toBeVisible()
    await dialog.getByRole('button', { name: 'Confirm' }).click()

    await expect(dialog).toHaveCount(0)
    await expect(page.getByText(/count changed on the server/i)).toBeVisible()
    expect(approvalPosts).toHaveLength(0)
    expect(detailReads).toBeGreaterThanOrEqual(2)
  })

  test('locks an adjustment request to the selected item base unit', async ({ page }) => {
    await seedSession(page, ['stock.adjustment.request'])

    const adjustmentPosts: Record<string, unknown>[] = []

    await page.route('**/api/**', async route => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      const method = request.method()

      if (path.endsWith('/adjustment-requests/') && method === 'GET') {
        await route.fulfill({ json: { data: { adjustment_requests: [], pagination: { total: 0 } } } })
        return
      }

      if (path.endsWith('/adjustment-requests/') && method === 'POST') {
        adjustmentPosts.push(request.postDataJSON() as Record<string, unknown>)
        await route.fulfill({ json: { data: { adjustment_request: { id: 1, status: 'PENDING' } } } })
        return
      }

      if (path.endsWith('/items/901/') && method === 'GET') {
        await route.fulfill({
          json: {
            data: {
              item: {
                id: 901,
                name: 'Brown rice',
                base_unit_id: 77,
                base_unit: { id: 77, name: 'Kilogram', short_name: 'kg' },
              },
            },
          },
        })
        return
      }

      if (path.endsWith('/items/') && method === 'GET') {
        await route.fulfill({
          json: {
            data: {
              items: [{ id: 901, name: 'Brown rice', sku: 'RICE-901' }],
              pagination: { total: 1 },
            },
          },
        })
        return
      }

      if (path.endsWith('/locations/') && method === 'GET') {
        await route.fulfill({
          json: {
            data: {
              locations: [{ id: 31, name: 'Main warehouse' }],
              pagination: { total: 1 },
            },
          },
        })
        return
      }

      await route.fulfill({ json: { data: {} } })
    })

    await page.goto('/stock/adjustment-requests')
    await page.getByRole('button', { name: 'New adjustment request' }).click()

    const dialog = page.getByRole('dialog', { name: 'New adjustment request' })

    await dialog.getByRole('combobox', { name: 'Stock item' }).click()
    await page.getByRole('option', { name: /Brown rice.*RICE-901/ }).click()

    const baseUnit = dialog.getByLabel('Base unit')

    await expect(baseUnit).toBeDisabled()
    await expect(baseUnit).toHaveValue('kg')
    await expect(dialog.getByRole('combobox', { name: /unit/i })).toHaveCount(0)

    await dialog.getByRole('combobox', { name: 'Location' }).click()
    await page.getByRole('option', { name: 'Main warehouse' }).click()
    await dialog.getByLabel('Quantity').fill('3.5')
    await dialog.getByLabel('Reason').fill('Physical count correction')
    await dialog.getByLabel('Evidence').fill('Signed count sheet SC-901 was checked against the shelf.')
    await dialog.getByRole('button', { name: 'Submit for approval' }).click()

    await expect.poll(() => adjustmentPosts.length).toBe(1)
    await expect(dialog).toHaveCount(0)
    expect(adjustmentPosts[0]).toEqual({
      stock_item_id: 901,
      location_id: 31,
      unit_id: 77,
      quantity: -3.5,
      reason: 'Physical count correction',
      evidence: 'Signed count sheet SC-901 was checked against the shelf.',
    })
  })

  test('blocks approval of a batch-tracked transfer that has no source batch', async ({ page }) => {
    await seedSession(page, ['stock.manage', 'stock.transfer.view'], 'ADMIN')

    const approvalPosts: Record<string, unknown>[] = []

    const transfer = {
      id: 951,
      transfer_number: 'TR-951',
      status: 'REQUESTED',
      transfer_type: 'INTERNAL',
      from_location_id: 31,
      from_location: { id: 31, name: 'Main warehouse' },
      to_location_id: 32,
      to_location: { id: 32, name: 'Kitchen' },
      requested_by_id: 'warehouse-user-2',
      requested_at: '2026-08-28T09:00:00+05:00',
      created_at: '2026-08-28T08:55:00+05:00',
      items: [{
        id: 952,
        stock_item_id: 901,
        stock_item: { id: 901, name: 'Brown rice' },
        requested_qty: '2',
        batch_id: null,
        unit_short: 'kg',
      }],
    }

    await page.route('**/api/**', async route => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      const method = request.method()

      if (path.endsWith('/transfers/') && method === 'GET') {
        await route.fulfill({ json: { data: { transfers: [transfer], pagination: { total: 1 } } } })
        return
      }
      if (path.endsWith('/transfers/951/') && method === 'GET') {
        await route.fulfill({ json: { data: { transfer } } })
        return
      }
      if (path.endsWith('/transfers/951/approve/') && method === 'POST') {
        approvalPosts.push(request.postDataJSON() as Record<string, unknown>)
        await route.fulfill({ json: { data: {} } })
        return
      }
      if (path.endsWith('/items/901/') && method === 'GET') {
        await route.fulfill({ json: { data: { item: { id: 901, name: 'Brown rice', track_batches: true } } } })
        return
      }
      if (path.endsWith('/items/') && method === 'GET') {
        await route.fulfill({ json: { data: { items: [], pagination: { total: 0 } } } })
        return
      }
      if (path.endsWith('/locations/') && method === 'GET') {
        await route.fulfill({ json: { data: { locations: [], pagination: { total: 0 } } } })
        return
      }

      await route.fulfill({ json: { data: {} } })
    })

    await page.goto('/stock/transfers')

    const row = page.getByRole('row').filter({ hasText: 'TR-951' })

    await row.getByTitle('Approve', { exact: true }).click()
    await page.getByRole('dialog', { name: 'Approve', exact: true }).getByRole('button', { name: 'Confirm' }).click()

    await expect(page.getByText(/has no source batch.*cannot be submitted, approved, or shipped safely/i)).toBeVisible()
    expect(approvalPosts).toHaveLength(0)
  })

  test('keeps deployed batch-consumption endpoints read-only for administrators', async ({ page }) => {
    await seedSession(page, ['stock.batch.view'], 'ADMIN')

    await page.route('**/api/**', async route => {
      const request = route.request()
      const path = new URL(request.url()).pathname

      if (path.endsWith('/batches/') && request.method() === 'GET') {
        await route.fulfill({
          json: {
            data: {
              batches: [{
                id: 961,
                batch_number: 'BAT-961',
                stock_item: { id: 901, name: 'Brown rice' },
                location_id: 31,
                location_name: 'Main warehouse',
                initial_quantity: '10',
                current_quantity: '10',
                reserved_quantity: '0',
                available_quantity: '10',
                unit_cost: '15000',
                status: 'AVAILABLE',
                quality_status: 'PASSED',
                is_expired: false,
              }],
              pagination: { total_items: 1 },
            },
          },
        })
        return
      }
      if (path.endsWith('/locations/') && request.method() === 'GET') {
        await route.fulfill({ json: { data: { locations: [] } } })
        return
      }
      if (path.endsWith('/items/') && request.method() === 'GET') {
        await route.fulfill({ json: { data: { items: [] } } })
        return
      }

      await route.fulfill({ json: { data: {} } })
    })

    await page.goto('/stock/batches')

    await expect(page.getByText(/temporarily read-only.*cannot post these movements safely/i)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Auto-consume' })).toHaveCount(0)
    await expect(page.getByTitle('Consume from batch')).toHaveCount(0)
  })

  test('blocks item-detail level adjustment for a batch-tracked item', async ({ page }) => {
    await seedSession(page, ['stock.manage', 'stock.batch.view', 'stock.level.view'], 'ADMIN')

    const adjustmentPosts: Record<string, unknown>[] = []

    await page.route('**/api/**', async route => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      const method = request.method()

      if (path.endsWith('/items/901/') && method === 'GET') {
        await route.fulfill({
          json: {
            data: {
              item: {
                id: 901,
                name: 'Brown rice',
                item_type: 'RAW',
                is_active: true,
                track_batches: true,
                track_expiry: false,
                base_unit: { id: 77, name: 'Kilogram', short_name: 'kg' },
              },
            },
          },
        })
        return
      }
      if (path.endsWith('/levels/item/901/') && method === 'GET') {
        await route.fulfill({ json: { data: { levels: [], total_quantity: '0', total_reserved: '0', total_available: '0' } } })
        return
      }
      if (path.endsWith('/transactions/item/901/') && method === 'GET') {
        await route.fulfill({ json: { data: { transactions: [] } } })
        return
      }
      if (path.endsWith('/adjust/') && method === 'POST') {
        adjustmentPosts.push(request.postDataJSON() as Record<string, unknown>)
        await route.fulfill({ json: { data: {} } })
        return
      }

      await route.fulfill({ json: { data: {} } })
    })

    await page.goto('/stock/items/901')

    await expect(page.getByText(/Direct adjustments are temporarily unavailable for batch-tracked items/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Adjust stock' })).toBeDisabled()
    expect(adjustmentPosts).toHaveLength(0)
  })
})
