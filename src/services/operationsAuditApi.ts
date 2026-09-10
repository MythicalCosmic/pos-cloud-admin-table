import type {
  AttendanceRecord,
  AttendanceSummaryRow,
  AuditDashboard,
  AuditListParams,
  DisciplinaryCase,
  DisciplinaryRule,
  EmployeeRef,
  EntityId,
  PaginationResult,
  PreparationAudit,
  PreparationAuditCategory,
  WorkSchedule,
} from '@/types/operationsAudit'
import { hrApi } from '@/plugins/axios'

type ApiRecord = Record<string, any>

function unwrap(response: any): ApiRecord | any[] {
  return response?.data?.data ?? response?.data ?? {}
}

function asNumber(value: unknown, fallback = 0): number {
  const number = Number(value)

  return Number.isFinite(number) ? number : fallback
}

function optionalNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === '')
    return null
  const number = Number(value)

  return Number.isFinite(number) ? number : null
}

function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean')
    return value
  if (value === 1 || value === '1' || value === 'true')
    return true
  if (value === 0 || value === '0' || value === 'false')
    return false

  return fallback
}

function idOf(value: ApiRecord | null | undefined): EntityId {
  return value?.id ?? value?.uuid ?? ''
}

function nameOf(value: ApiRecord | null | undefined): string {
  if (!value)
    return ''
  const user = value.user ?? value.employee?.user ?? {}
  const employee = value.employee ?? value
  const firstName = employee.first_name ?? user.first_name ?? ''
  const lastName = employee.last_name ?? user.last_name ?? ''

  return String(
    value.full_name
      || value.name
      || value.title
      || employee.full_name
      || `${firstName} ${lastName}`.trim()
      || value.email
      || user.email
      || '',
  ).trim()
}

function employeeOf(value: ApiRecord | null | undefined): EmployeeRef {
  const employee = value?.employee ?? value ?? {}
  const user = employee.user ?? value?.user ?? {}

  return {
    id: idOf(employee),
    name: nameOf(employee) || String(idOf(employee) || '—'),
    email: employee.email ?? user.email,
    active: employee.is_active ?? employee.active ?? (employee.status ? employee.status === 'ACTIVE' : undefined),
  }
}

function listFrom(root: ApiRecord | any[], keys: string[]): any[] {
  if (Array.isArray(root))
    return root
  for (const key of [...keys, 'items', 'results', 'records']) {
    if (Array.isArray(root?.[key]))
      return root[key]
  }

  return []
}

function paginated<T>(root: ApiRecord | any[], keys: string[], mapper: (item: ApiRecord) => T, params: AuditListParams = {}): PaginationResult<T> {
  const items = listFrom(root, keys).map(mapper)
  const meta = !Array.isArray(root) ? (root.pagination ?? root.meta ?? {}) : {}

  return {
    items,
    total: asNumber(meta.total ?? meta.total_items ?? meta.count ?? (!Array.isArray(root) ? root.total : undefined), items.length),
    page: asNumber(meta.page ?? meta.current_page ?? params.page, 1),
    perPage: asNumber(meta.per_page ?? meta.page_size ?? params.per_page, Math.max(items.length, 20)),
  }
}

function minutesFrom(record: ApiRecord, minuteKeys: string[], hourKeys: string[] = []): number {
  for (const key of minuteKeys) {
    if (record[key] !== undefined && record[key] !== null)
      return Math.round(asNumber(record[key]))
  }
  for (const key of hourKeys) {
    if (record[key] !== undefined && record[key] !== null)
      return Math.round(asNumber(record[key]) * 60)
  }

  return 0
}

export function normalizeAttendance(record: ApiRecord): AttendanceRecord {
  const schedule = record.schedule_snapshot ?? record.schedule ?? {}
  const penalty = record.penalty_summary ?? record.penalties ?? {}

  return {
    id: idOf(record),
    workDate: String(record.work_date ?? record.date ?? ''),
    employee: employeeOf(record.employee),
    scheduledStart: record.scheduled_start ?? schedule.scheduled_start ?? schedule.start ?? null,
    scheduledEnd: record.scheduled_end ?? schedule.scheduled_end ?? schedule.end ?? null,
    checkIn: record.check_in ?? null,
    checkOut: record.check_out ?? null,
    scheduledMinutes: minutesFrom(record, ['scheduled_minutes'], ['scheduled_hours']),
    workedMinutes: minutesFrom(record, ['worked_minutes', 'work_minutes'], ['worked_hours', 'work_hours']),
    overtimeMinutes: minutesFrom(record, ['overtime_minutes'], ['overtime_hours']),
    lateMinutes: minutesFrom(record, ['late_minutes']),
    earlyLeaveMinutes: minutesFrom(record, ['early_leave_minutes']),
    status: String(record.status ?? 'UNKNOWN'),
    source: record.source,
    excuseStatus: record.excuse_status
      ?? record.excuse?.status
      ?? (asBoolean(record.has_approved_excuse) ? 'APPROVED' : null),
    penaltyCount: asNumber(record.penalty_count ?? penalty.count),
    approvedPenaltyUzs: asNumber(record.approved_penalty_uzs ?? penalty.approved_amount_uzs ?? penalty.approved_total_uzs),
    notes: record.notes,
    raw: record,
  }
}

export function normalizeAttendanceSummary(record: ApiRecord): AttendanceSummaryRow {
  const excuses = record.excuses ?? record.excuse_counts ?? {}
  const penalties = record.penalties ?? record.penalty_summary ?? {}
  const penaltyCount = Object.values(penalties).reduce((total: number, value) => total + asNumber(value), 0)

  return {
    employee: employeeOf(record.employee),
    scheduledMinutes: minutesFrom(record, ['scheduled_minutes'], ['scheduled_hours']),
    workedMinutes: minutesFrom(record, ['worked_minutes'], ['worked_hours']),
    overtimeMinutes: minutesFrom(record, ['overtime_minutes'], ['overtime_hours']),
    lateMinutes: minutesFrom(record, ['late_minutes']),
    earlyLeaveMinutes: minutesFrom(record, ['early_leave_minutes']),
    absentDays: asNumber(record.absent_days ?? record.absences),
    excusePending: asNumber(record.excuse_pending ?? excuses.pending ?? excuses.PENDING),
    excuseApproved: asNumber(record.excuse_approved ?? excuses.approved ?? excuses.APPROVED),
    excuseRejected: asNumber(record.excuse_rejected ?? excuses.rejected ?? excuses.REJECTED),
    penaltyCount: asNumber(record.penalty_count ?? penalties.count, penaltyCount),
    approvedPenaltyUzs: asNumber(record.approved_penalty_total_uzs ?? record.approved_penalty_uzs ?? penalties.approved_amount_uzs ?? penalties.approved_total_uzs),
    pendingPenaltyUzs: asNumber(record.pending_penalty_total_uzs ?? record.pending_penalty_uzs ?? penalties.pending_amount_uzs ?? penalties.pending_total_uzs),
    raw: record,
  }
}

export function normalizeWorkSchedule(record: ApiRecord): WorkSchedule {
  const employee = record.employee ?? {
    id: record.employee_id,
    full_name: record.employee_name,
  }

  return {
    id: idOf(record),
    employee: employeeOf(employee),
    weekday: asNumber(record.weekday),
    scheduledStartLocal: String(record.scheduled_start_local ?? record.scheduled_start ?? ''),
    scheduledEndLocal: String(record.scheduled_end_local ?? record.scheduled_end ?? ''),
    graceMinutes: asNumber(record.grace_minutes),
    effectiveFrom: String(record.effective_from ?? ''),
    effectiveTo: record.effective_to ?? null,
    overnight: asBoolean(record.overnight ?? record.is_overnight),
    raw: record,
  }
}

export function normalizeDisciplinaryRule(record: ApiRecord): DisciplinaryRule {
  return {
    id: idOf(record),
    code: String(record.code ?? ''),
    category: String(record.category ?? 'OTHER'),
    title: String(record.title ?? record.name ?? ''),
    description: record.description,
    defaultAmountUzs: asNumber(record.default_amount_uzs ?? record.default_amount),
    active: asBoolean(record.is_active ?? record.active, true),
    requiresEvidence: asBoolean(record.requires_evidence, true),
    requiresComment: asBoolean(record.requires_comment, true),
    effectiveFrom: record.effective_from ?? null,
    effectiveTo: record.effective_to ?? null,
    raw: record,
  }
}

// API compatibility aliases are deliberately centralized in these normalizers.
// eslint-disable-next-line sonarjs/cognitive-complexity
export function normalizeDisciplinaryCase(record: ApiRecord): DisciplinaryCase {
  const rule = record.rule_snapshot ?? record.rule ?? {}
  const payroll = record.payroll_period ?? record.effective_payroll_period

  const payrollPeriod = (payroll && typeof payroll === 'object')
    ? `${payroll.year}-${String(payroll.month).padStart(2, '0')}`
    : payroll

  return {
    id: idOf(record),
    employee: employeeOf(record.employee),
    businessDate: String(record.business_date ?? record.violation_date ?? record.occurred_at?.slice?.(0, 10) ?? ''),
    occurredAt: record.occurred_at ?? null,
    ruleId: rule.id ?? record.rule_id ?? null,
    ruleCode: String(record.rule_code ?? rule.code ?? ''),
    ruleTitle: String(record.rule_title ?? rule.title ?? rule.name ?? ''),
    ruleCategory: String(record.rule_category ?? rule.category ?? 'OTHER'),
    amountUzs: asNumber(record.amount_uzs ?? record.amount ?? rule.amount_uzs),
    evidence: String(record.evidence ?? record.details ?? record.reason ?? ''),
    comment: record.comment,
    excuse: record.excuse_text ?? record.excuse?.text ?? (typeof record.excuse === 'string' ? record.excuse : undefined),
    status: String(record.status ?? 'DRAFT'),
    createdById: record.created_by_id ?? record.created_by?.id ?? null,
    createdBy: nameOf(record.created_by),
    createdAt: record.created_at ?? null,
    reviewedBy: nameOf(record.reviewed_by),
    reviewedAt: record.reviewed_at ?? null,
    payrollPeriod: payrollPeriod ?? null,
    raw: record,
  }
}

export function normalizePreparationCategory(record: ApiRecord): PreparationAuditCategory {
  return {
    id: idOf(record),
    code: String(record.code ?? record.value ?? ''),
    label: String(record.label ?? record.title ?? record.name ?? record.code ?? ''),
    active: asBoolean(record.is_active ?? record.active, true),
    raw: record,
  }
}

// eslint-disable-next-line sonarjs/cognitive-complexity
export function normalizePreparationAudit(record: ApiRecord): PreparationAudit {
  const order = record.order ?? {}
  const review = record.review ?? record.current_review ?? {}

  const responsible = review.responsible_employee
    ?? record.responsible_employee
    ?? (review.responsible_employee_id ? { id: review.responsible_employee_id } : null)

  return {
    id: idOf(record),
    orderId: order.id ?? record.order_id ?? '',
    orderNumber: String(order.order_number ?? order.display_id ?? record.order_number ?? record.display_id ?? order.id ?? record.order_id ?? '—'),
    branchName: record.branch_name
      || record.location_name
      || record.branch?.name
      || record.location?.name
      || (record.branch_id ? `#${record.branch_id}` : undefined),
    cashierName: record.cashier_name
      || nameOf(order.cashier ?? record.cashier)
      || (order.cashier_id ? `#${order.cashier_id}` : undefined),
    responsibleEmployee: responsible ? employeeOf(responsible) : null,
    createdAt: record.created_at_snapshot ?? order.created_at ?? record.order_created_at ?? null,
    readyAt: record.ready_at_snapshot ?? order.ready_at ?? record.ready_at ?? null,
    elapsedSeconds: asNumber(record.elapsed_seconds ?? record.prep_elapsed),
    targetSeconds: asNumber(record.target_seconds ?? record.prep_target),
    targetName: record.target_name_snapshot ?? record.target_name,
    performanceStatus: String(record.performance_status ?? record.prep_status_level ?? 'UNTRACKED'),
    reviewRequired: asBoolean(record.review_required),
    reviewStatus: String(record.review_status ?? (record.review_required ? 'PENDING' : 'NOT_REQUIRED')),
    reviewCategory: review.category?.code ?? review.category_code ?? review.category ?? null,
    reviewComment: review.comment ?? null,
    reviewedBy: nameOf(review.reviewed_by ?? record.reviewed_by) || null,
    reviewedAt: review.reviewed_at ?? record.reviewed_at ?? null,
    raw: record,
  }
}

// eslint-disable-next-line sonarjs/cognitive-complexity
export function normalizeDashboard(root: ApiRecord | any[]): AuditDashboard {
  const value = Array.isArray(root) ? {} : root
  const attendance = value.attendance ?? value.attendance_summary ?? {}
  const penalties = value.penalties ?? value.discipline ?? {}
  const preparation = value.preparation ?? value.preparation_audit ?? value.counts ?? {}
  const pending = preparation.pending ?? {}

  return {
    attendancePresent: optionalNumber(attendance.present ?? value.attendance_present),
    attendanceLate: optionalNumber(attendance.late ?? value.attendance_late),
    attendanceAbsent: optionalNumber(attendance.absent ?? value.attendance_absent),
    penaltyPendingCount: optionalNumber(penalties.pending_count ?? value.penalty_pending_count),
    penaltyPendingUzs: optionalNumber(penalties.pending_amount_uzs ?? value.penalty_pending_uzs),
    penaltyApprovedUzs: optionalNumber(penalties.approved_amount_uzs ?? value.penalty_approved_uzs),
    preparationGreen: optionalNumber(preparation.green ?? preparation.on_time ?? preparation.ON_TIME ?? value.preparation_green),
    preparationYellow: optionalNumber(preparation.yellow ?? preparation.slightly_late ?? preparation.SLIGHTLY_LATE ?? value.preparation_yellow),
    preparationRed: optionalNumber(preparation.red ?? preparation.very_late ?? preparation.VERY_LATE ?? value.preparation_red),
    preparationPendingYellow: optionalNumber(preparation.pending_yellow ?? pending.yellow ?? value.pending_yellow_count ?? value.preparation_pending_yellow),
    preparationPendingRed: optionalNumber(preparation.pending_red ?? pending.red ?? value.pending_red_count ?? value.preparation_pending_red),
  }
}

function paramsWithoutEmpty(params: AuditListParams): Record<string, string | number> {
  return Object.fromEntries(Object.entries(params).filter(([, value]) => value !== '' && value !== undefined && value !== null)) as Record<string, string | number>
}

export const operationsAuditApi = {
  async employees(params: Pick<AuditListParams, 'date_from' | 'date_to'> = {}): Promise<EmployeeRef[]> {
    // The deployed audit contract exposes the employee roster to Warehouse
    // through attendance summary, while the general /employees/ route remains
    // Admin-only. Summary includes every active/inactive employee even when no
    // attendance row exists in the selected period.
    if (params.date_from && params.date_to) {
      const response = await hrApi.get('/attendance/summary/', {
        params: { ...paramsWithoutEmpty(params), page: 1, per_page: 500 },
      })

      return listFrom(unwrap(response), ['employees'])
        .map(row => employeeOf(row.employee ?? row))
    }

    const response = await hrApi.get('/employees/', { params: { per_page: 500 } })

    return listFrom(unwrap(response), ['employees']).map(employeeOf)
  },

  async dashboard(params: AuditListParams): Promise<AuditDashboard> {
    const response = await hrApi.get('/audit-dashboard/', { params: paramsWithoutEmpty(params) })

    return normalizeDashboard(unwrap(response))
  },

  async attendance(params: AuditListParams): Promise<PaginationResult<AttendanceRecord>> {
    const response = await hrApi.get('/attendance/', { params: paramsWithoutEmpty(params) })

    return paginated(unwrap(response), ['attendances', 'attendance'], normalizeAttendance, params)
  },

  async attendanceDetail(attendanceId: EntityId): Promise<ApiRecord> {
    const response = await hrApi.get(`/attendance/${attendanceId}/`)
    const root = unwrap(response) as ApiRecord

    return root.attendance ?? root
  },

  async attendanceSummary(params: AuditListParams): Promise<PaginationResult<AttendanceSummaryRow>> {
    const response = await hrApi.get('/attendance/summary/', { params: paramsWithoutEmpty(params) })

    return paginated(unwrap(response), ['summary', 'employees', 'rows'], normalizeAttendanceSummary, params)
  },

  async attendanceSummaryAll(params: AuditListParams): Promise<AttendanceSummaryRow[]> {
    const perPage = 100
    const first = await this.attendanceSummary({ ...params, page: 1, per_page: perPage })
    const rows = [...first.items]
    const pages = Math.ceil(first.total / perPage)
    for (let page = 2; page <= pages; page += 1) {
      const result = await this.attendanceSummary({ ...params, page, per_page: perPage })

      rows.push(...result.items)
    }

    return rows
  },

  async createManualAttendance(payload: Record<string, any>) {
    return hrApi.post('/attendance/manual-entry/', payload)
  },

  async requestAttendanceAdjustment(attendanceId: EntityId, payload: Record<string, any>) {
    return hrApi.post(`/attendance/${attendanceId}/adjustment-requests/`, payload)
  },

  async submitAttendanceExcuse(attendanceId: EntityId, payload: Record<string, any>) {
    return hrApi.post(`/attendance/${attendanceId}/excuses/`, payload)
  },

  async reviewAttendanceAdjustment(requestId: EntityId, action: 'approve' | 'reject', payload: { review_note?: string }) {
    return hrApi.post(`/attendance-adjustments/${requestId}/${action}/`, payload)
  },

  async reviewAttendanceExcuse(excuseId: EntityId, action: 'approve' | 'reject', payload: { review_note?: string }) {
    // Excused minutes are deliberately omitted. On approval the backend applies
    // the complete relevant variance (late, early leave, or absence) atomically.
    return hrApi.post(`/attendance-excuses/${excuseId}/${action}/`, payload)
  },

  async workSchedules(params: AuditListParams): Promise<PaginationResult<WorkSchedule>> {
    const response = await hrApi.get('/work-schedules/', { params: paramsWithoutEmpty(params) })

    return paginated(unwrap(response), ['work_schedules', 'schedules'], normalizeWorkSchedule, params)
  },

  async createWorkSchedule(payload: Record<string, any>) {
    return hrApi.post('/work-schedules/', payload)
  },

  async updateWorkSchedule(id: EntityId, payload: Record<string, any>) {
    return hrApi.patch(`/work-schedules/${id}/`, payload)
  },

  async disciplineRules(params: AuditListParams = {}): Promise<PaginationResult<DisciplinaryRule>> {
    const response = await hrApi.get('/discipline-rules/', { params: paramsWithoutEmpty(params) })

    return paginated(unwrap(response), ['discipline_rules', 'rules'], normalizeDisciplinaryRule, params)
  },

  async disciplineRulesAll(params: AuditListParams = {}): Promise<DisciplinaryRule[]> {
    const perPage = 100
    const first = await this.disciplineRules({ ...params, page: 1, per_page: perPage })
    const rules = [...first.items]
    const pages = Math.ceil(first.total / perPage)
    for (let page = 2; page <= pages; page += 1) {
      const result = await this.disciplineRules({ ...params, page, per_page: perPage })

      rules.push(...result.items)
    }

    return rules
  },

  async createDisciplineRule(payload: Record<string, any>) {
    return hrApi.post('/discipline-rules/', payload)
  },

  async updateDisciplineRule(id: EntityId, payload: Record<string, any>) {
    return hrApi.patch(`/discipline-rules/${id}/`, payload)
  },

  async disciplineCases(params: AuditListParams): Promise<PaginationResult<DisciplinaryCase>> {
    const response = await hrApi.get('/discipline-cases/', { params: paramsWithoutEmpty(params) })

    return paginated(unwrap(response), ['discipline_cases', 'cases'], normalizeDisciplinaryCase, params)
  },

  async createDisciplineCase(payload: Record<string, any>) {
    return hrApi.post('/discipline-cases/', payload)
  },

  async transitionDisciplineCase(id: EntityId, action: 'approve' | 'reject' | 'void', payload: Record<string, any> = {}) {
    return hrApi.post(`/discipline-cases/${id}/${action}/`, payload)
  },

  async preparationAudits(params: AuditListParams): Promise<PaginationResult<PreparationAudit>> {
    const response = await hrApi.get('/preparation-audits/', { params: paramsWithoutEmpty(params) })

    return paginated(unwrap(response), ['preparation_audits', 'audits'], normalizePreparationAudit, params)
  },

  async preparationCategories(): Promise<PreparationAuditCategory[]> {
    const response = await hrApi.get('/preparation-audit-categories/')

    return listFrom(unwrap(response), ['preparation_audit_categories', 'categories'])
      .map(normalizePreparationCategory)
      .filter(category => category.active)
  },

  async reviewPreparationAudit(id: EntityId, payload: Record<string, any>) {
    return hrApi.post(`/preparation-audits/${id}/review/`, payload)
  },

  async reopenPreparationAudit(id: EntityId, payload: { reason: string }) {
    return hrApi.post(`/preparation-audits/${id}/reopen/`, payload)
  },
}

export function tashkentDateTime(date: string, time: string): string {
  return `${date}T${time.length === 5 ? `${time}:00` : time}+05:00`
}
