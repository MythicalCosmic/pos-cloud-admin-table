export type EntityId = string | number

export interface EmployeeRef {
  id: EntityId
  name: string
  email?: string
  active?: boolean
}

export interface PaginationResult<T> {
  items: T[]
  total: number
  page: number
  perPage: number
}

export interface AttendanceRecord {
  id: EntityId
  workDate: string
  employee: EmployeeRef
  scheduledStart?: string | null
  scheduledEnd?: string | null
  checkIn?: string | null
  checkOut?: string | null
  scheduledMinutes: number
  workedMinutes: number
  overtimeMinutes: number
  lateMinutes: number
  earlyLeaveMinutes: number
  status: string
  source?: string
  excuseStatus?: string | null
  penaltyCount: number
  approvedPenaltyUzs: number
  notes?: string
  raw: Record<string, any>
}

export interface AttendanceSummaryRow {
  employee: EmployeeRef
  scheduledMinutes: number
  workedMinutes: number
  overtimeMinutes: number
  lateMinutes: number
  earlyLeaveMinutes: number
  absentDays: number
  excusePending: number
  excuseApproved: number
  excuseRejected: number
  penaltyCount: number
  approvedPenaltyUzs: number
  pendingPenaltyUzs: number
  raw: Record<string, any>
}

export interface WorkSchedule {
  id: EntityId
  employee: EmployeeRef
  weekday: number
  scheduledStartLocal: string
  scheduledEndLocal: string
  graceMinutes: number
  effectiveFrom: string
  effectiveTo?: string | null
  overnight: boolean
  raw: Record<string, any>
}

export interface DisciplinaryRule {
  id: EntityId
  code: string
  category: string
  title: string
  description?: string
  defaultAmountUzs: number
  active: boolean
  requiresEvidence: boolean
  requiresComment: boolean
  effectiveFrom?: string | null
  effectiveTo?: string | null
  raw: Record<string, any>
}

export interface DisciplinaryCase {
  id: EntityId
  employee: EmployeeRef
  businessDate: string
  occurredAt?: string | null
  ruleId?: EntityId | null
  ruleCode: string
  ruleTitle: string
  ruleCategory: string
  amountUzs: number
  evidence: string
  comment?: string
  excuse?: string
  status: string
  createdById?: EntityId | null
  createdBy?: string
  createdAt?: string | null
  reviewedBy?: string
  reviewedAt?: string | null
  payrollPeriod?: string | null
  raw: Record<string, any>
}

export interface PreparationAuditCategory {
  id: EntityId
  code: string
  label: string
  active: boolean
  raw: Record<string, any>
}

export interface PreparationAudit {
  id: EntityId
  orderId: EntityId
  orderNumber: string
  branchName?: string
  cashierName?: string
  responsibleEmployee?: EmployeeRef | null
  createdAt?: string | null
  readyAt?: string | null
  elapsedSeconds: number
  targetSeconds: number
  targetName?: string
  performanceStatus: string
  reviewRequired: boolean
  reviewStatus: string
  reviewCategory?: string | null
  reviewComment?: string | null
  reviewedBy?: string | null
  reviewedAt?: string | null
  raw: Record<string, any>
}

export interface AuditDashboard {
  attendancePresent: number | null
  attendanceLate: number | null
  attendanceAbsent: number | null
  penaltyPendingCount: number | null
  penaltyPendingUzs: number | null
  penaltyApprovedUzs: number | null
  preparationGreen: number | null
  preparationYellow: number | null
  preparationRed: number | null
  preparationPendingYellow: number | null
  preparationPendingRed: number | null
}

export interface AuditListParams {
  date_from?: string
  date_to?: string
  employee_id?: string | number
  status?: string
  review_status?: string
  performance_status?: string
  category?: string
  page?: number
  per_page?: number
}
