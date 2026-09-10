<script setup lang="ts">
import Checkbox from '@/components/design/Checkbox.vue'
import type { DataTableColumn } from '@/components/design/DataTable.vue'
import type { AttendanceRecord, AttendanceSummaryRow, EmployeeRef, WorkSchedule } from '@/types/operationsAudit'
import Badge from '@/components/design/Badge.vue'
import Button from '@/components/design/Button.vue'
import Card from '@/components/design/Card.vue'
import DataTable from '@/components/design/DataTable.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import Field from '@/components/design/Field.vue'
import IconAction from '@/components/design/IconAction.vue'
import Input from '@/components/design/Input.vue'
import Modal from '@/components/design/Modal.vue'
import SearchSelect from '@/components/design/SearchSelect.vue'
import Segmented from '@/components/design/Segmented.vue'
import Select from '@/components/design/Select.vue'
import StateFill from '@/components/design/StateFill.vue'
import Textarea from '@/components/design/Textarea.vue'
import TimeField from '@/components/design/TimeField.vue'
import { operationsAuditApi, tashkentDateTime } from '@/services/operationsAuditApi'
import { useUserAccess } from '@/composables/useUserAccess'

interface Props {
  dateFrom: string
  dateTo: string
  employees: EmployeeRef[]
  refreshKey?: number
}

const props = defineProps<Props>()
const emit = defineEmits<{ (event: 'changed'): void }>()

const { t, locale } = useI18n({ useScope: 'global' })
const { notify } = useNotify()
const { translate } = useApiError()
const { formatCurrency, formatDateShort } = useFormatters()
const { hasPermission, hasAnyPermission, currentUserId } = useUserAccess()

const view = ref<'daily' | 'summary' | 'schedules'>('daily')
const page = ref(1)
const perPage = ref(20)
const summaryPage = ref(1)
const schedulePage = ref(1)
const employeeFilter = ref('')
const statusFilter = ref('')

const dailyRows = ref<AttendanceRecord[]>([])
const dailyTotal = ref(0)
const summaryRows = ref<AttendanceSummaryRow[]>([])
const summaryTotal = ref(0)
const schedules = ref<WorkSchedule[]>([])
const scheduleTotal = ref(0)
const loading = ref(false)
const errorMessage = ref('')
let loadRequestId = 0

const canRecord = computed(() => hasPermission('attendance.record'))
const canAdjust = computed(() => hasPermission('attendance.adjust.request'))
const canReview = computed(() => hasPermission('attendance.adjust.approve'))
const canManageSchedule = computed(() => hasAnyPermission(['attendance.schedule.manage', 'discipline.rule.manage']))

const employeeOptions = computed(() => props.employees.map(employee => ({
  value: String(employee.id),
  label: employee.name,
})))

const statusOptions = computed(() => ['PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'ON_LEAVE'].map(status => ({
  value: status,
  label: t(`opsAudit.attendanceStatus.${status}`),
})))

const views = computed(() => [
  { value: 'daily', label: t('opsAudit.attendance.daily'), icon: 'calendar', id: 'attendance-daily-tab', ariaControls: 'attendance-daily-panel' },
  { value: 'summary', label: t('opsAudit.attendance.summary'), icon: 'bars', id: 'attendance-summary-tab', ariaControls: 'attendance-summary-panel' },
  { value: 'schedules', label: t('opsAudit.attendance.schedules'), icon: 'clock', id: 'attendance-schedules-tab', ariaControls: 'attendance-schedules-panel' },
])

const weekdayOptions = computed(() => Array.from({ length: 7 }, (_, weekday) => ({
  value: String(weekday),
  label: t(`opsAudit.weekday.${weekday}`),
})))

function badgeTone(status: string): 'success' | 'warning' | 'error' | 'info' | 'neutral' {
  if (['PRESENT', 'APPROVED'].includes(status))
    return 'success'
  if (['LATE', 'PENDING', 'HALF_DAY'].includes(status))
    return 'warning'
  if (['ABSENT', 'REJECTED'].includes(status))
    return 'error'
  if (status === 'ON_LEAVE')
    return 'info'

  return 'neutral'
}

function formatMinutes(value: number): string {
  const minutes = Math.max(0, Math.round(Number(value) || 0))
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  if (!hours)
    return t('opsAudit.minutes', { count: remainder })
  if (!remainder)
    return t('opsAudit.hours', { count: hours })

  return t('opsAudit.hoursMinutes', { hours, minutes: remainder })
}

function formatTime(value?: string | null): string {
  if (!value)
    return '—'
  if (/^\d{2}:\d{2}/.test(value))
    return value.slice(0, 5)
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime()))
    return value

  return new Intl.DateTimeFormat(locale.value === 'uz' ? 'uz-UZ' : locale.value === 'ru' ? 'ru-RU' : 'en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Tashkent',
  }).format(parsed)
}

function interval(start?: string | null, end?: string | null): string {
  if (!start && !end)
    return '—'

  return `${formatTime(start)}–${formatTime(end)}`
}

function editableTime(value?: string | null): string {
  const formatted = formatTime(value)

  return /^\d{2}:\d{2}$/.test(formatted) ? formatted : ''
}

function actorId(actor: Record<string, any> | null | undefined): string | number | null {
  return actor?.id ?? actor?.user_id ?? actor?.user?.id ?? actor?.user?.user_id ?? null
}

function actorName(actor: Record<string, any> | null | undefined): string {
  if (!actor)
    return t('opsAudit.attendance.unknownRequester')

  const firstName = actor.first_name ?? actor.user?.first_name ?? ''
  const lastName = actor.last_name ?? actor.user?.last_name ?? ''

  return String([
    actor.full_name,
    actor.name,
    actor.display_name,
    `${firstName} ${lastName}`.trim(),
    actor.email,
    actor.user?.email,
  ].find(Boolean) ?? t('opsAudit.attendance.unknownRequester'))
}

function isOwnReview(item: Record<string, any>, kind: 'adjustment' | 'excuse'): boolean {
  const actor = kind === 'adjustment' ? item.requested_by : item.submitted_by
  const requestUserId = actorId(actor) ?? item.requested_by_id ?? item.submitted_by_id

  return currentUserId.value != null
    && requestUserId != null
    && String(currentUserId.value) === String(requestUserId)
}

function nextCalendarDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  const utc = new Date(Date.UTC(year, month - 1, day + 1))

  return utc.toISOString().slice(0, 10)
}

function checkoutDate(workDate: string, checkIn: string, checkOut: string): string {
  // An earlier clock time is the following calendar day for an overnight
  // shift. The backend still validates that the employee's saved schedule is
  // allowed to cross midnight.
  return (/^\d{2}:\d{2}/.test(checkIn) && checkOut <= checkIn)
    ? nextCalendarDate(workDate)
    : workDate
}

function commonParams() {
  return {
    date_from: props.dateFrom,
    date_to: props.dateTo,
    employee_id: employeeFilter.value || undefined,
    status: statusFilter.value || undefined,
  }
}

async function loadCurrent() {
  const requestId = ++loadRequestId

  loading.value = true
  errorMessage.value = ''
  try {
    if (view.value === 'daily') {
      const result = await operationsAuditApi.attendance({
        ...commonParams(),
        page: page.value,
        per_page: perPage.value,
      })

      if (requestId !== loadRequestId)
        return
      dailyRows.value = result.items
      dailyTotal.value = result.total
    }
    else if (view.value === 'summary') {
      const result = await operationsAuditApi.attendanceSummary({
        ...commonParams(),
        page: summaryPage.value,
        per_page: perPage.value,
      })

      if (requestId !== loadRequestId)
        return
      summaryRows.value = result.items
      summaryTotal.value = result.total
    }
    else {
      const result = await operationsAuditApi.workSchedules({
        employee_id: employeeFilter.value || undefined,
        page: schedulePage.value,
        per_page: perPage.value,
      })

      if (requestId !== loadRequestId)
        return
      schedules.value = result.items.map(schedule => ({
        ...schedule,
        employee: props.employees.find(employee => String(employee.id) === String(schedule.employee.id)) ?? schedule.employee,
      }))
      scheduleTotal.value = result.total
    }
  }
  catch (error) {
    if (requestId === loadRequestId)
      errorMessage.value = translate(error)
  }
  finally {
    if (requestId === loadRequestId)
      loading.value = false
  }
}

watch(
  () => [props.dateFrom, props.dateTo, props.refreshKey, view.value, employeeFilter.value, statusFilter.value, page.value, summaryPage.value, schedulePage.value, perPage.value],
  () => { loadCurrent() },
  { immediate: true },
)

watch([employeeFilter, statusFilter], () => {
  page.value = 1
  summaryPage.value = 1
  schedulePage.value = 1
})

const dailyColumns = computed<DataTableColumn<AttendanceRecord>[]>(() => [
  { key: 'workDate', label: t('opsAudit.columns.date'), width: 120 },
  { key: 'employee', label: t('opsAudit.columns.employee'), width: 190 },
  { key: 'schedule', label: t('opsAudit.columns.schedule'), width: 130 },
  { key: 'actual', label: t('opsAudit.columns.actualTime'), width: 130 },
  { key: 'worked', label: t('opsAudit.columns.worked'), align: 'right', width: 110 },
  { key: 'variance', label: t('opsAudit.columns.variance'), width: 180 },
  { key: 'status', label: t('opsAudit.columns.status'), width: 120 },
  { key: 'penalty', label: t('opsAudit.columns.penalty'), align: 'right', width: 140 },
])

const summaryColumns = computed<DataTableColumn<AttendanceSummaryRow>[]>(() => [
  { key: 'employee', label: t('opsAudit.columns.employee'), width: 210 },
  { key: 'scheduled', label: t('opsAudit.columns.scheduled'), align: 'right', width: 125 },
  { key: 'worked', label: t('opsAudit.columns.worked'), align: 'right', width: 125 },
  { key: 'overtime', label: t('opsAudit.columns.overtime'), align: 'right', width: 125 },
  { key: 'late', label: t('opsAudit.columns.late'), align: 'right', width: 115 },
  { key: 'early', label: t('opsAudit.columns.earlyLeave'), align: 'right', width: 125 },
  { key: 'absent', label: t('opsAudit.columns.absences'), align: 'right', width: 105 },
  { key: 'excuses', label: t('opsAudit.columns.excuses'), width: 160 },
  { key: 'penalties', label: t('opsAudit.columns.penalties'), align: 'right', width: 170 },
])

const scheduleColumns = computed<DataTableColumn<WorkSchedule>[]>(() => [
  { key: 'employee', label: t('opsAudit.columns.employee'), width: 220 },
  { key: 'weekday', label: t('opsAudit.columns.weekday'), width: 140 },
  { key: 'hours', label: t('opsAudit.columns.schedule'), width: 160 },
  { key: 'grace', label: t('opsAudit.columns.grace'), align: 'right', width: 130 },
  { key: 'effective', label: t('opsAudit.columns.effectivePeriod'), width: 220 },
])

const recordOpen = ref(false)
const recordSaving = ref(false)
const recordErrors = ref<Record<string, string>>({})
const recordForm = ref({ employee_id: '', work_date: '', check_in: '', check_out: '', notes: '' })

function openRecord() {
  recordForm.value = {
    employee_id: employeeFilter.value,
    work_date: props.dateTo,
    check_in: '',
    check_out: '',
    notes: '',
  }
  recordErrors.value = {}
  recordOpen.value = true
}

async function submitRecord() {
  if (recordSaving.value)
    return

  const errors: Record<string, string> = {}
  if (!recordForm.value.employee_id)
    errors.employee_id = t('opsAudit.validation.employeeRequired')
  if (!recordForm.value.work_date)
    errors.work_date = t('opsAudit.validation.dateRequired')
  if (!recordForm.value.check_in)
    errors.check_in = t('opsAudit.validation.checkInRequired')
  recordErrors.value = errors
  if (Object.keys(errors).length)
    return

  recordSaving.value = true
  try {
    await operationsAuditApi.createManualAttendance({
      employee_id: recordForm.value.employee_id,
      work_date: recordForm.value.work_date,
      check_in_local: tashkentDateTime(recordForm.value.work_date, recordForm.value.check_in),
      check_out_local: recordForm.value.check_out
        ? tashkentDateTime(
          checkoutDate(recordForm.value.work_date, recordForm.value.check_in, recordForm.value.check_out),
          recordForm.value.check_out,
        )
        : null,
      notes: recordForm.value.notes || undefined,
    })
    notify(t('opsAudit.attendance.recorded'))
    recordOpen.value = false
    await loadCurrent()
    emit('changed')
  }
  catch (error) {
    notify(translate(error), 'error')
  }
  finally {
    recordSaving.value = false
  }
}

const adjustmentOpen = ref(false)
const adjustmentSaving = ref(false)
const adjustmentTarget = ref<AttendanceRecord | null>(null)
const adjustmentForm = ref({ check_in: '', check_out: '', reason_category: '', reason_text: '' })
const adjustmentErrors = ref<Record<string, string>>({})

const adjustmentReasons = computed(() => ['MISSING_ENTRY', 'DEVICE_FAILURE', 'MANAGER_INSTRUCTION', 'DATA_ENTRY_ERROR', 'OTHER'].map(value => ({
  value,
  label: t(`opsAudit.adjustmentReason.${value}`),
})))

function openAdjustment(row: AttendanceRecord) {
  adjustmentTarget.value = row
  adjustmentForm.value = {
    check_in: editableTime(row.checkIn),
    check_out: editableTime(row.checkOut),
    reason_category: '',
    reason_text: '',
  }
  adjustmentErrors.value = {}
  adjustmentOpen.value = true
}

async function submitAdjustment() {
  if (!adjustmentTarget.value || adjustmentSaving.value)
    return
  const errors: Record<string, string> = {}
  if (!adjustmentForm.value.reason_category)
    errors.reason_category = t('opsAudit.validation.reasonRequired')
  if (adjustmentForm.value.reason_category === 'OTHER' && !adjustmentForm.value.reason_text.trim())
    errors.reason_text = t('opsAudit.validation.explanationRequired')

  const checkInChanged = Boolean(adjustmentForm.value.check_in)
    && adjustmentForm.value.check_in !== editableTime(adjustmentTarget.value.checkIn)

  const checkOutChanged = Boolean(adjustmentForm.value.check_out)
    && adjustmentForm.value.check_out !== editableTime(adjustmentTarget.value.checkOut)

  if (!checkInChanged && !checkOutChanged)
    errors.check_in = t('opsAudit.validation.adjustedTimeRequired')
  adjustmentErrors.value = errors
  if (Object.keys(errors).length)
    return

  adjustmentSaving.value = true
  try {
    await operationsAuditApi.requestAttendanceAdjustment(adjustmentTarget.value.id, {
      requested_check_in: adjustmentForm.value.check_in
        ? tashkentDateTime(adjustmentTarget.value.workDate, adjustmentForm.value.check_in)
        : null,
      requested_check_out: adjustmentForm.value.check_out
        ? tashkentDateTime(
          checkoutDate(
            adjustmentTarget.value.workDate,
            adjustmentForm.value.check_in || formatTime(adjustmentTarget.value.checkIn),
            adjustmentForm.value.check_out,
          ),
          adjustmentForm.value.check_out,
        )
        : null,
      reason_category: adjustmentForm.value.reason_category,
      reason_text: adjustmentForm.value.reason_text || undefined,
    })
    notify(t('opsAudit.attendance.adjustmentSubmitted'))
    adjustmentOpen.value = false
    await loadCurrent()
    emit('changed')
  }
  catch (error) {
    notify(translate(error), 'error')
  }
  finally {
    adjustmentSaving.value = false
  }
}

const excuseOpen = ref(false)
const excuseSaving = ref(false)
const excuseTarget = ref<AttendanceRecord | null>(null)
const excuseForm = ref({ category: '', description: '' })
const excuseErrors = ref<Record<string, string>>({})

const excuseCategories = computed(() => ['MEDICAL', 'FAMILY', 'TRANSPORT', 'APPROVED_LEAVE', 'MANAGER_INSTRUCTION', 'OTHER'].map(value => ({
  value,
  label: t(`opsAudit.excuseCategory.${value}`),
})))

type AttendanceReviewKind = 'adjustment' | 'excuse'
type AttendanceReviewAction = 'approve' | 'reject'

interface AttendanceReviewTarget {
  kind: AttendanceReviewKind
  action: AttendanceReviewAction
  item: Record<string, any>
}

const reviewQueueOpen = ref(false)
const reviewQueueLoading = ref(false)
const reviewQueueError = ref('')
const reviewAttendance = ref<Record<string, any> | null>(null)
const reviewAttendanceRow = ref<AttendanceRecord | null>(null)
const reviewTarget = ref<AttendanceReviewTarget | null>(null)
const reviewNote = ref('')
const reviewNoteError = ref('')
const reviewSaving = ref(false)
let reviewRequestId = 0

const pendingAdjustments = computed(() => {
  const rows = reviewAttendance.value?.adjustment_requests

  return Array.isArray(rows) ? rows.filter(row => String(row.status).toUpperCase() === 'PENDING') : []
})

const pendingExcuses = computed(() => {
  const rows = reviewAttendance.value?.excuses

  return Array.isArray(rows) ? rows.filter(row => String(row.status).toUpperCase() === 'PENDING') : []
})

const hasPendingReviews = computed(() => pendingAdjustments.value.length + pendingExcuses.value.length > 0)

function excuseImpact(item: Record<string, any>): string {
  const parts: string[] = []
  const late = Number(item.excused_late_minutes ?? reviewAttendance.value?.late_minutes ?? 0)
  const early = Number(item.excused_early_leave_minutes ?? reviewAttendance.value?.early_leave_minutes ?? 0)
  const absence = Number(item.excused_absence_minutes ?? 0)
  if (late > 0)
    parts.push(t('opsAudit.lateBy', { value: formatMinutes(late) }))
  if (early > 0)
    parts.push(t('opsAudit.leftEarlyBy', { value: formatMinutes(early) }))
  if (absence > 0)
    parts.push(t('opsAudit.attendance.absenceMinutes', { value: formatMinutes(absence) }))

  return parts.join(' · ') || t('opsAudit.attendance.fullRelevantVariance')
}

function resetReviewDecision() {
  reviewTarget.value = null
  reviewNote.value = ''
  reviewNoteError.value = ''
}

function closeReviewQueue() {
  if (reviewSaving.value)
    return
  reviewRequestId += 1
  reviewQueueOpen.value = false
  resetReviewDecision()
}

async function loadReviewDetail(row: AttendanceRecord) {
  const requestId = ++reviewRequestId

  reviewQueueLoading.value = true
  reviewQueueError.value = ''
  try {
    const detail = await operationsAuditApi.attendanceDetail(row.id)
    if (requestId !== reviewRequestId)
      return
    reviewAttendance.value = detail
  }
  catch (error) {
    if (requestId === reviewRequestId)
      reviewQueueError.value = translate(error)
  }
  finally {
    if (requestId === reviewRequestId)
      reviewQueueLoading.value = false
  }
}

function openReviewQueue(row: AttendanceRecord) {
  reviewAttendanceRow.value = row
  reviewAttendance.value = null
  resetReviewDecision()
  reviewQueueOpen.value = true
  loadReviewDetail(row)
}

function selectReview(kind: AttendanceReviewKind, action: AttendanceReviewAction, item: Record<string, any>) {
  if (reviewSaving.value || isOwnReview(item, kind))
    return
  reviewTarget.value = { kind, action, item }
  reviewNote.value = ''
  reviewNoteError.value = ''
}

async function submitReviewDecision() {
  if (!reviewTarget.value || reviewSaving.value)
    return

  if (reviewTarget.value.action === 'reject' && !reviewNote.value.trim()) {
    reviewNoteError.value = t('opsAudit.attendance.rejectionNoteRequired')

    return
  }

  reviewNoteError.value = ''
  reviewSaving.value = true

  const { kind, action, item } = reviewTarget.value

  try {
    const payload = { review_note: reviewNote.value.trim() || undefined }
    if (kind === 'adjustment')
      await operationsAuditApi.reviewAttendanceAdjustment(item.id, action, payload)
    else
      await operationsAuditApi.reviewAttendanceExcuse(item.id, action, payload)

    notify(t(`opsAudit.attendance.reviewSuccess.${kind}.${action}`))
    resetReviewDecision()

    if (reviewAttendanceRow.value)
      await Promise.allSettled([loadReviewDetail(reviewAttendanceRow.value), loadCurrent()])
    emit('changed')
  }
  catch (error) {
    notify(translate(error), 'error')
  }
  finally {
    reviewSaving.value = false
  }
}

function openExcuse(row: AttendanceRecord) {
  excuseTarget.value = row
  excuseForm.value = { category: '', description: '' }
  excuseErrors.value = {}
  excuseOpen.value = true
}

async function submitExcuse() {
  if (!excuseTarget.value || excuseSaving.value)
    return
  const errors: Record<string, string> = {}
  if (!excuseForm.value.category)
    errors.category = t('opsAudit.validation.categoryRequired')
  if (excuseForm.value.category === 'OTHER' && !excuseForm.value.description.trim())
    errors.description = t('opsAudit.validation.explanationRequired')
  excuseErrors.value = errors
  if (Object.keys(errors).length)
    return

  excuseSaving.value = true
  try {
    await operationsAuditApi.submitAttendanceExcuse(excuseTarget.value.id, {
      category: excuseForm.value.category,
      description: excuseForm.value.description || undefined,
    })
    notify(t('opsAudit.attendance.excuseSubmitted'))
    excuseOpen.value = false
    await loadCurrent()
    emit('changed')
  }
  catch (error) {
    notify(translate(error), 'error')
  }
  finally {
    excuseSaving.value = false
  }
}

const scheduleOpen = ref(false)
const scheduleSaving = ref(false)
const editingSchedule = ref<WorkSchedule | null>(null)
const scheduleForm = ref({ employee_id: '', weekday: '', start: '', end: '', grace_minutes: '0', effective_from: '', effective_to: '', overnight: false })
const scheduleErrors = ref<Record<string, string>>({})

function tashkentCalendarDate(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tashkent',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())

  const value = Object.fromEntries(parts.map(part => [part.type, part.value]))

  return `${value.year}-${value.month}-${value.day}`
}

function nextDate(value: string): string {
  const date = new Date(`${value}T12:00:00Z`)

  date.setUTCDate(date.getUTCDate() + 1)

  return date.toISOString().slice(0, 10)
}

const editingHistoricalSchedule = computed(() => Boolean(
  editingSchedule.value && editingSchedule.value.effectiveFrom <= tashkentCalendarDate(),
))

function openSchedule(row?: WorkSchedule) {
  editingSchedule.value = row ?? null

  const prospectiveFrom = (row && row.effectiveFrom <= tashkentCalendarDate())
    ? nextDate(tashkentCalendarDate())
    : row?.effectiveFrom

  scheduleForm.value = row
    ? {
      employee_id: String(row.employee.id),
      weekday: String(row.weekday),
      start: row.scheduledStartLocal.slice(0, 5),
      end: row.scheduledEndLocal.slice(0, 5),
      grace_minutes: String(row.graceMinutes),
      effective_from: prospectiveFrom ?? row.effectiveFrom,
      effective_to: (row.effectiveTo && row.effectiveTo >= (prospectiveFrom ?? row.effectiveFrom)) ? row.effectiveTo : '',
      overnight: row.overnight,
    }
    : { employee_id: employeeFilter.value, weekday: '', start: '', end: '', grace_minutes: '0', effective_from: props.dateTo, effective_to: '', overnight: false }
  scheduleErrors.value = {}
  scheduleOpen.value = true
}

function openNewSchedule() {
  openSchedule()
}

async function saveSchedule() {
  if (scheduleSaving.value)
    return

  const errors: Record<string, string> = {}
  if (!scheduleForm.value.employee_id)
    errors.employee_id = t('opsAudit.validation.employeeRequired')
  if (scheduleForm.value.weekday === '')
    errors.weekday = t('opsAudit.validation.weekdayRequired')
  if (!scheduleForm.value.start)
    errors.start = t('opsAudit.validation.startRequired')
  if (!scheduleForm.value.end)
    errors.end = t('opsAudit.validation.endRequired')
  if (!scheduleForm.value.effective_from)
    errors.effective_from = t('opsAudit.validation.dateRequired')
  if (scheduleForm.value.effective_to && scheduleForm.value.effective_to < scheduleForm.value.effective_from)
    errors.effective_to = t('opsAudit.validation.effectiveDateOrder')
  scheduleErrors.value = errors
  if (Object.keys(errors).length)
    return

  scheduleSaving.value = true

  const payload = {
    employee_id: scheduleForm.value.employee_id,
    weekday: Number(scheduleForm.value.weekday),
    scheduled_start_local: scheduleForm.value.start,
    scheduled_end_local: scheduleForm.value.end,
    grace_minutes: Math.max(0, Number(scheduleForm.value.grace_minutes) || 0),
    effective_from: scheduleForm.value.effective_from,
    effective_to: scheduleForm.value.effective_to || null,
    is_overnight: scheduleForm.value.overnight,
  }

  try {
    if (editingSchedule.value)
      await operationsAuditApi.updateWorkSchedule(editingSchedule.value.id, payload)
    else
      await operationsAuditApi.createWorkSchedule(payload)
    notify(t(editingSchedule.value ? 'opsAudit.attendance.scheduleUpdated' : 'opsAudit.attendance.scheduleCreated'))
    scheduleOpen.value = false
    await loadCurrent()
    emit('changed')
  }
  catch (error) {
    notify(translate(error), 'error')
  }
  finally {
    scheduleSaving.value = false
  }
}
</script>

<template>
  <section class="audit-panel">
    <div class="audit-panel__toolbar">
      <Segmented
        v-model="view"
        :options="views"
      />
      <div class="audit-panel__actions">
        <Button
          v-if="view === 'schedules' && canManageSchedule"
          variant="secondary"
          icon="plus"
          @click="openNewSchedule"
        >
          {{ t('opsAudit.attendance.addSchedule') }}
        </Button>
        <Button
          v-if="view !== 'schedules' && canRecord"
          variant="primary"
          icon="clock"
          @click="openRecord"
        >
          {{ t('opsAudit.attendance.record') }}
        </Button>
      </div>
    </div>

    <Card
      :id="`attendance-${view}-panel`"
      role="tabpanel"
      :aria-labelledby="`attendance-${view}-tab`"
    >
      <div class="toolbar audit-filters">
        <div class="audit-filter audit-filter--employee">
          <SearchSelect
            v-model="employeeFilter"
            icon="user"
            :placeholder="t('opsAudit.filters.allEmployees')"
            :options="employeeOptions"
          />
        </div>
        <div
          v-if="view !== 'schedules'"
          class="audit-filter"
        >
          <Select
            v-model="statusFilter"
            icon="filter"
            :placeholder="t('opsAudit.filters.allStatuses')"
            :options="statusOptions"
          />
        </div>
        <Button
          variant="ghost"
          size="sm"
          icon="refresh"
          :disabled="loading"
          @click="loadCurrent"
        >
          {{ t('opsAudit.refresh') }}
        </Button>
      </div>

      <StateFill
        v-if="errorMessage"
        icon="alert"
        :title="t('opsAudit.loadFailed')"
        :sub="errorMessage"
        error
      >
        <template #action>
          <Button
            variant="secondary"
            size="sm"
            icon="retry"
            @click="loadCurrent"
          >
            {{ t('opsAudit.tryAgain') }}
          </Button>
        </template>
      </StateFill>

      <DataTable
        v-else-if="view === 'daily'"
        :columns="dailyColumns"
        :rows="dailyRows"
        row-key="id"
        :loading="loading"
        :pagination="{
          page,
          perPage,
          total: dailyTotal,
          onPage: (value: number) => { page = value },
          onPerPage: (value: number) => { perPage = value; page = 1 },
        }"
        :empty-title="t('opsAudit.attendance.emptyTitle')"
        :empty-sub="t('opsAudit.attendance.emptySubtitle')"
        empty-icon="calendar"
      >
        <template #cell.workDate="{ row }">
          <span class="cell-strong">{{ formatDateShort(row.workDate) }}</span>
        </template>
        <template #cell.employee="{ row }">
          <div
            class="cell-strong ellipsis"
            :title="row.employee.name"
          >
            {{ row.employee.name }}
          </div>
        </template>
        <template #cell.schedule="{ row }">
          <span class="mono cell-muted">{{ interval(row.scheduledStart, row.scheduledEnd) }}</span>
        </template>
        <template #cell.actual="{ row }">
          <span class="mono">{{ interval(row.checkIn, row.checkOut) }}</span>
        </template>
        <template #cell.worked="{ row }">
          <span class="mono">{{ formatMinutes(row.workedMinutes) }}</span>
        </template>
        <template #cell.variance="{ row }">
          <div class="variance-list">
            <span
              v-if="row.lateMinutes"
              class="variance variance--warning"
            >{{ t('opsAudit.lateBy', { value: formatMinutes(row.lateMinutes) }) }}</span>
            <span
              v-if="row.earlyLeaveMinutes"
              class="variance variance--error"
            >{{ t('opsAudit.leftEarlyBy', { value: formatMinutes(row.earlyLeaveMinutes) }) }}</span>
            <span
              v-if="row.overtimeMinutes"
              class="variance variance--success"
            >{{ t('opsAudit.overtimeBy', { value: formatMinutes(row.overtimeMinutes) }) }}</span>
            <span
              v-if="!row.lateMinutes && !row.earlyLeaveMinutes && !row.overtimeMinutes"
              class="cell-muted"
            >—</span>
          </div>
        </template>
        <template #cell.status="{ row }">
          <div class="badge-stack">
            <Badge
              :tone="badgeTone(row.status)"
              dot
            >
              {{ t(`opsAudit.attendanceStatus.${row.status}`) }}
            </Badge>
            <Badge
              v-if="row.excuseStatus"
              :tone="badgeTone(row.excuseStatus)"
            >
              {{ t(`opsAudit.reviewStatus.${row.excuseStatus}`) }}
            </Badge>
          </div>
        </template>
        <template #cell.penalty="{ row }">
          <div class="money-cell">
            <span class="mono">{{ formatCurrency(row.approvedPenaltyUzs) }} UZS</span>
            <small v-if="row.penaltyCount">{{ t('opsAudit.caseCount', { count: row.penaltyCount }) }}</small>
          </div>
        </template>
        <template #row-actions="{ row }">
          <IconAction
            v-if="canReview"
            icon="check"
            tone="primary"
            :title="t('opsAudit.attendance.reviewRequests')"
            @click="openReviewQueue(row)"
          />
          <IconAction
            v-if="canAdjust"
            icon="edit"
            :title="t('opsAudit.attendance.requestAdjustment')"
            @click="openAdjustment(row)"
          />
          <IconAction
            v-if="canAdjust && row.excuseStatus !== 'APPROVED'"
            icon="info"
            tone="primary"
            :title="t('opsAudit.attendance.submitExcuse')"
            @click="openExcuse(row)"
          />
        </template>
      </DataTable>

      <DataTable
        v-else-if="view === 'summary'"
        :columns="summaryColumns"
        :rows="summaryRows"
        row-key="employee.id"
        :loading="loading"
        :pagination="{
          page: summaryPage,
          perPage,
          total: summaryTotal,
          onPage: (value: number) => { summaryPage = value },
          onPerPage: (value: number) => { perPage = value; summaryPage = 1 },
        }"
        :empty-title="t('opsAudit.attendance.summaryEmptyTitle')"
        :empty-sub="t('opsAudit.attendance.summaryEmptySubtitle')"
        empty-icon="bars"
      >
        <template #cell.employee="{ row }">
          <span class="cell-strong">{{ row.employee.name }}</span>
        </template>
        <template #cell.scheduled="{ row }">
          <span class="mono">{{ formatMinutes(row.scheduledMinutes) }}</span>
        </template>
        <template #cell.worked="{ row }">
          <span class="mono">{{ formatMinutes(row.workedMinutes) }}</span>
        </template>
        <template #cell.overtime="{ row }">
          <span class="mono positive">{{ formatMinutes(row.overtimeMinutes) }}</span>
        </template>
        <template #cell.late="{ row }">
          <span class="mono warning-text">{{ formatMinutes(row.lateMinutes) }}</span>
        </template>
        <template #cell.early="{ row }">
          <span class="mono error-text">{{ formatMinutes(row.earlyLeaveMinutes) }}</span>
        </template>
        <template #cell.absent="{ row }">
          <span class="mono">{{ row.absentDays }}</span>
        </template>
        <template #cell.excuses="{ row }">
          <div class="summary-stack">
            <span>{{ t('opsAudit.approvedCount', { count: row.excuseApproved }) }}</span>
            <small>{{ t('opsAudit.pendingCount', { count: row.excusePending }) }}</small>
          </div>
        </template>
        <template #cell.penalties="{ row }">
          <div class="summary-stack summary-stack--end">
            <strong class="mono">{{ formatCurrency(row.approvedPenaltyUzs) }} UZS</strong>
            <small>{{ t('opsAudit.pendingAmount', { amount: formatCurrency(row.pendingPenaltyUzs) }) }}</small>
          </div>
        </template>
      </DataTable>

      <DataTable
        v-else
        :columns="scheduleColumns"
        :rows="schedules"
        row-key="id"
        :loading="loading"
        :pagination="{
          page: schedulePage,
          perPage,
          total: scheduleTotal,
          onPage: (value: number) => { schedulePage = value },
          onPerPage: (value: number) => { perPage = value; schedulePage = 1 },
        }"
        :empty-title="t('opsAudit.attendance.scheduleEmptyTitle')"
        :empty-sub="t('opsAudit.attendance.scheduleEmptySubtitle')"
        empty-icon="clock"
      >
        <template #cell.employee="{ row }">
          <span class="cell-strong">{{ row.employee.name }}</span>
        </template>
        <template #cell.weekday="{ row }">
          {{ t(`opsAudit.weekday.${row.weekday}`) }}
        </template>
        <template #cell.hours="{ row }">
          <span class="mono">{{ row.scheduledStartLocal.slice(0, 5) }}–{{ row.scheduledEndLocal.slice(0, 5) }}</span>
          <Badge
            v-if="row.overnight"
            tone="info"
          >
            {{ t('opsAudit.attendance.overnight') }}
          </Badge>
        </template>
        <template #cell.grace="{ row }">
          <span class="mono">{{ t('opsAudit.minutes', { count: row.graceMinutes }) }}</span>
        </template>
        <template #cell.effective="{ row }">
          <span>{{ formatDateShort(row.effectiveFrom) }} – {{ row.effectiveTo ? formatDateShort(row.effectiveTo) : t('opsAudit.openEnded') }}</span>
        </template>
        <template #row-actions="{ row }">
          <IconAction
            v-if="canManageSchedule"
            icon="edit"
            :title="t('opsAudit.edit')"
            @click="openSchedule(row)"
          />
        </template>
      </DataTable>
    </Card>

    <Modal
      :open="reviewQueueOpen"
      :title="t('opsAudit.attendance.reviewQueueTitle')"
      :subtitle="reviewAttendanceRow ? `${reviewAttendanceRow.employee.name} · ${formatDateShort(reviewAttendanceRow.workDate)}` : ''"
      :width="760"
      :close-on-backdrop="!reviewSaving"
      :close-on-esc="!reviewSaving"
      @close="closeReviewQueue"
    >
      <StateFill
        v-if="reviewQueueLoading"
        icon="clock"
        :title="t('opsAudit.attendance.loadingReviews')"
      />

      <StateFill
        v-else-if="reviewQueueError"
        icon="alert"
        :title="t('opsAudit.attendance.reviewsLoadFailed')"
        :sub="reviewQueueError"
        error
      >
        <template #action>
          <Button
            v-if="reviewAttendanceRow"
            variant="secondary"
            size="sm"
            icon="retry"
            @click="loadReviewDetail(reviewAttendanceRow)"
          >
            {{ t('opsAudit.tryAgain') }}
          </Button>
        </template>
      </StateFill>

      <StateFill
        v-else-if="!hasPendingReviews"
        icon="check"
        :title="t('opsAudit.attendance.noPendingReviewsTitle')"
        :sub="t('opsAudit.attendance.noPendingReviewsSubtitle')"
      />

      <div
        v-else
        class="review-queue"
      >
        <section
          v-if="pendingAdjustments.length"
          class="review-group"
          aria-labelledby="attendance-adjustment-review-heading"
        >
          <h4 id="attendance-adjustment-review-heading">
            {{ t('opsAudit.attendance.pendingAdjustments', { count: pendingAdjustments.length }) }}
          </h4>
          <article
            v-for="item in pendingAdjustments"
            :key="`adjustment-${item.id}`"
            class="review-card"
          >
            <div class="review-card__head">
              <div>
                <strong>{{ actorName(item.requested_by) }}</strong>
                <div class="review-card__meta">
                  {{ t(`opsAudit.adjustmentReason.${item.reason_category}`) }}
                </div>
              </div>
              <Badge tone="warning">
                {{ t('opsAudit.reviewStatus.PENDING') }}
              </Badge>
            </div>
            <dl class="review-facts">
              <div>
                <dt>{{ t('opsAudit.attendance.originalTime') }}</dt>
                <dd class="mono">
                  {{ interval(item.original_check_in, item.original_check_out) }}
                </dd>
              </div>
              <div>
                <dt>{{ t('opsAudit.attendance.requestedTime') }}</dt>
                <dd class="mono">
                  {{ interval(item.requested_check_in, item.requested_check_out) }}
                </dd>
              </div>
            </dl>
            <p
              v-if="item.reason_text"
              class="review-card__description"
            >
              {{ item.reason_text }}
            </p>
            <p
              v-if="isOwnReview(item, 'adjustment')"
              class="review-card__self"
              role="status"
            >
              {{ t('opsAudit.attendance.selfReviewBlocked') }}
            </p>
            <div
              v-else
              class="review-card__actions"
            >
              <Button
                variant="danger-soft"
                size="sm"
                icon="close"
                :disabled="reviewSaving"
                @click="selectReview('adjustment', 'reject', item)"
              >
                {{ t('opsAudit.reject') }}
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon="check"
                :disabled="reviewSaving"
                @click="selectReview('adjustment', 'approve', item)"
              >
                {{ t('opsAudit.approve') }}
              </Button>
            </div>
          </article>
        </section>

        <section
          v-if="pendingExcuses.length"
          class="review-group"
          aria-labelledby="attendance-excuse-review-heading"
        >
          <h4 id="attendance-excuse-review-heading">
            {{ t('opsAudit.attendance.pendingExcuses', { count: pendingExcuses.length }) }}
          </h4>
          <article
            v-for="item in pendingExcuses"
            :key="`excuse-${item.id}`"
            class="review-card"
          >
            <div class="review-card__head">
              <div>
                <strong>{{ actorName(item.submitted_by) }}</strong>
                <div class="review-card__meta">
                  {{ t(`opsAudit.excuseCategory.${item.category}`) }} · {{ excuseImpact(item) }}
                </div>
              </div>
              <Badge tone="warning">
                {{ t('opsAudit.reviewStatus.PENDING') }}
              </Badge>
            </div>
            <p
              v-if="item.description"
              class="review-card__description"
            >
              {{ item.description }}
            </p>
            <p class="review-card__hint">
              {{ t('opsAudit.attendance.excuseApprovalHint') }}
            </p>
            <p
              v-if="isOwnReview(item, 'excuse')"
              class="review-card__self"
              role="status"
            >
              {{ t('opsAudit.attendance.selfReviewBlocked') }}
            </p>
            <div
              v-else
              class="review-card__actions"
            >
              <Button
                variant="danger-soft"
                size="sm"
                icon="close"
                :disabled="reviewSaving"
                @click="selectReview('excuse', 'reject', item)"
              >
                {{ t('opsAudit.reject') }}
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon="check"
                :disabled="reviewSaving"
                @click="selectReview('excuse', 'approve', item)"
              >
                {{ t('opsAudit.approve') }}
              </Button>
            </div>
          </article>
        </section>

        <div
          v-if="reviewTarget"
          class="review-decision"
          role="region"
          :aria-label="t('opsAudit.attendance.reviewDecision')"
        >
          <div class="review-decision__head">
            <strong>{{ t(`opsAudit.attendance.reviewDecisionTitle.${reviewTarget.action}`) }}</strong>
            <Badge :tone="reviewTarget.action === 'approve' ? 'success' : 'error'">
              {{ t(`opsAudit.${reviewTarget.action}`) }}
            </Badge>
          </div>
          <Field
            :label="t('opsAudit.reviewNote')"
            :hint="reviewTarget.action === 'approve' ? t('opsAudit.optional') : undefined"
            :error="reviewNoteError"
          >
            <Textarea
              v-model="reviewNote"
              :placeholder="t(`opsAudit.attendance.reviewNotePlaceholder.${reviewTarget.action}`)"
              :disabled="reviewSaving"
              autofocus
            />
          </Field>
        </div>
      </div>

      <template
        v-if="reviewTarget && !reviewQueueLoading && !reviewQueueError"
        #footer
      >
        <Button
          variant="ghost"
          :disabled="reviewSaving"
          @click="resetReviewDecision"
        >
          {{ t('opsAudit.attendance.changeDecision') }}
        </Button>
        <Button
          :variant="reviewTarget.action === 'approve' ? 'primary' : 'danger'"
          :icon="reviewTarget.action === 'approve' ? 'check' : 'close'"
          :loading="reviewSaving"
          @click="submitReviewDecision"
        >
          {{ t(`opsAudit.attendance.confirmDecision.${reviewTarget.action}`) }}
        </Button>
      </template>
    </Modal>

    <Modal
      :open="recordOpen"
      :title="t('opsAudit.attendance.recordTitle')"
      :subtitle="t('opsAudit.attendance.recordSubtitle')"
      :width="620"
      @close="recordOpen = false"
    >
      <div class="form-grid form-grid--two">
        <Field
          :label="t('opsAudit.columns.employee')"
          :error="recordErrors.employee_id"
        >
          <SearchSelect
            v-model="recordForm.employee_id"
            icon="user"
            :options="employeeOptions"
            :placeholder="t('opsAudit.filters.selectEmployee')"
          />
        </Field>
        <Field
          :label="t('opsAudit.columns.date')"
          :error="recordErrors.work_date"
        >
          <Input
            v-model="recordForm.work_date"
            type="date"
            icon="calendar"
          />
        </Field>
        <Field
          :label="t('opsAudit.attendance.checkIn')"
          :error="recordErrors.check_in"
        >
          <TimeField
            v-model:value="recordForm.check_in"
            icon="clock"
            :step="60"
          />
        </Field>
        <Field
          :label="t('opsAudit.attendance.checkOut')"
          :error="recordErrors.check_out"
          :hint="t('opsAudit.optionalUntilEmployeeLeaves')"
        >
          <TimeField
            v-model:value="recordForm.check_out"
            icon="clock"
            :step="60"
          />
        </Field>
        <Field
          class="span-two"
          :label="t('opsAudit.notes')"
        >
          <Textarea
            v-model="recordForm.notes"
            :placeholder="t('opsAudit.attendance.notesPlaceholder')"
          />
        </Field>
      </div>
      <div class="timezone-note">
        <DesignIcon
          name="info"
          :size="16"
        />{{ t('opsAudit.tashkentTimezone') }}
      </div>
      <template #footer>
        <Button
          variant="primary"
          icon="check"
          :loading="recordSaving"
          @click="submitRecord"
        >
          {{ t('opsAudit.saveRecord') }}
        </Button>
      </template>
    </Modal>

    <Modal
      :open="adjustmentOpen"
      :title="t('opsAudit.attendance.adjustmentTitle')"
      :subtitle="adjustmentTarget ? `${adjustmentTarget.employee.name} · ${formatDateShort(adjustmentTarget.workDate)}` : ''"
      :width="620"
      @close="adjustmentOpen = false"
    >
      <div class="form-grid form-grid--two">
        <Field
          :label="t('opsAudit.attendance.correctedCheckIn')"
          :error="adjustmentErrors.check_in"
        >
          <TimeField
            v-model:value="adjustmentForm.check_in"
            icon="clock"
            :step="60"
          />
        </Field>
        <Field :label="t('opsAudit.attendance.correctedCheckOut')">
          <TimeField
            v-model:value="adjustmentForm.check_out"
            icon="clock"
            :step="60"
          />
        </Field>
        <Field
          class="span-two"
          :label="t('opsAudit.reasonCategory')"
          :error="adjustmentErrors.reason_category"
        >
          <Select
            v-model="adjustmentForm.reason_category"
            :options="adjustmentReasons"
            :placeholder="t('opsAudit.selectReason')"
          />
        </Field>
        <Field
          class="span-two"
          :label="t('opsAudit.explanation')"
          :error="adjustmentErrors.reason_text"
        >
          <Textarea
            v-model="adjustmentForm.reason_text"
            :placeholder="t('opsAudit.attendance.adjustmentPlaceholder')"
          />
        </Field>
      </div>
      <template #footer>
        <Button
          variant="primary"
          icon="send"
          :loading="adjustmentSaving"
          @click="submitAdjustment"
        >
          {{ t('opsAudit.submitForApproval') }}
        </Button>
      </template>
    </Modal>

    <Modal
      :open="excuseOpen"
      :title="t('opsAudit.attendance.excuseTitle')"
      :subtitle="excuseTarget ? `${excuseTarget.employee.name} · ${formatDateShort(excuseTarget.workDate)}` : ''"
      :width="560"
      @close="excuseOpen = false"
    >
      <div class="form-grid">
        <Field
          :label="t('opsAudit.reasonCategory')"
          :error="excuseErrors.category"
        >
          <Select
            v-model="excuseForm.category"
            :options="excuseCategories"
            :placeholder="t('opsAudit.selectReason')"
          />
        </Field>
        <Field
          :label="t('opsAudit.explanation')"
          :error="excuseErrors.description"
        >
          <Textarea
            v-model="excuseForm.description"
            :placeholder="t('opsAudit.attendance.excusePlaceholder')"
          />
        </Field>
      </div>
      <template #footer>
        <Button
          variant="primary"
          icon="send"
          :loading="excuseSaving"
          @click="submitExcuse"
        >
          {{ t('opsAudit.submitForApproval') }}
        </Button>
      </template>
    </Modal>

    <Modal
      :open="scheduleOpen"
      :title="editingSchedule ? t('opsAudit.attendance.editSchedule') : t('opsAudit.attendance.addSchedule')"
      :subtitle="t('opsAudit.attendance.scheduleModalSubtitle')"
      :width="680"
      @close="scheduleOpen = false"
    >
      <div class="form-grid form-grid--two">
        <Field
          :label="t('opsAudit.columns.employee')"
          :error="scheduleErrors.employee_id"
        >
          <SearchSelect
            v-model="scheduleForm.employee_id"
            icon="user"
            :options="employeeOptions"
            :disabled="!!editingSchedule"
          />
        </Field>
        <Field
          :label="t('opsAudit.columns.weekday')"
          :error="scheduleErrors.weekday"
        >
          <Select
            v-model="scheduleForm.weekday"
            icon="calendar"
            :options="weekdayOptions"
            :disabled="!!editingSchedule"
          />
        </Field>
        <Field
          :label="t('opsAudit.attendance.startTime')"
          :error="scheduleErrors.start"
        >
          <TimeField
            v-model:value="scheduleForm.start"
            icon="clock"
            :step="60"
          />
        </Field>
        <Field
          :label="t('opsAudit.attendance.endTime')"
          :error="scheduleErrors.end"
        >
          <TimeField
            v-model:value="scheduleForm.end"
            icon="clock"
            :step="60"
          />
        </Field>
        <Field :label="t('opsAudit.attendance.graceMinutes')">
          <Input
            v-model="scheduleForm.grace_minutes"
            type="number"
            min="0"
            step="1"
          />
        </Field>
        <label class="check-row">
          <Checkbox v-model="scheduleForm.overnight" />
          <span>{{ t('opsAudit.attendance.overnight') }}</span>
        </label>
        <Field
          :label="t('opsAudit.effectiveFrom')"
          :error="scheduleErrors.effective_from"
          :hint="editingHistoricalSchedule ? t('opsAudit.attendance.prospectiveScheduleHint') : undefined"
        >
          <Input
            v-model="scheduleForm.effective_from"
            type="date"
            icon="calendar"
          />
        </Field>
        <Field
          :label="t('opsAudit.effectiveTo')"
          :error="scheduleErrors.effective_to"
          :hint="t('opsAudit.optional')"
        >
          <Input
            v-model="scheduleForm.effective_to"
            type="date"
            icon="calendar"
          />
        </Field>
      </div>
      <template #footer>
        <Button
          variant="primary"
          icon="check"
          :loading="scheduleSaving"
          @click="saveSchedule"
        >
          {{ t('opsAudit.saveSchedule') }}
        </Button>
      </template>
    </Modal>
  </section>
</template>

<style scoped>
.audit-panel,
.summary-stack,
.variance-list,
.badge-stack,
.money-cell {
  display: flex;
  flex-direction: column;
}

.audit-panel { gap: 14px; }
.audit-panel__toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.audit-panel__actions { display: flex; align-items: center; gap: 8px; }
.audit-filters { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.audit-filter { width: 190px; }
.audit-filter--employee { width: min(280px, 100%); }
.variance-list { gap: 3px; }
.variance { font-size: 12px; font-weight: 600; }
.variance--warning, .warning-text { color: rgb(var(--v-theme-warning)); }
.variance--error, .error-text { color: rgb(var(--v-theme-error)); }
.variance--success, .positive { color: rgb(var(--v-theme-success)); }
.badge-stack { gap: 5px; align-items: flex-start; }
.money-cell, .summary-stack { gap: 3px; }
.money-cell { align-items: flex-end; }
.money-cell small, .summary-stack small { color: rgb(var(--v-theme-text-secondary)); }
.summary-stack--end { align-items: flex-end; }
.ellipsis { max-width: 210px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.form-grid { display: grid; gap: 14px; }
.form-grid--two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.span-two { grid-column: 1 / -1; }
.timezone-note { display: flex; align-items: center; gap: 7px; margin-top: 14px; color: rgb(var(--v-theme-text-secondary)); font-size: 13px; }
.check-row { min-height: 42px; display: flex; align-items: center; gap: 9px; padding-top: 20px; color: rgb(var(--v-theme-on-surface)); }
.check-row input { width: 17px; height: 17px; accent-color: rgb(var(--v-theme-primary)); }
.review-queue, .review-group { display: flex; flex-direction: column; gap: 14px; }
.review-group h4 { margin: 0; color: rgb(var(--v-theme-on-surface)); font-size: 14px; }
.review-card { display: flex; flex-direction: column; gap: 12px; padding: 14px; border: 1px solid rgb(var(--v-theme-border)); border-radius: var(--r-md); background: rgb(var(--v-theme-surface)); }
.review-card__head, .review-card__actions, .review-decision__head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.review-card__meta, .review-card__description, .review-card__hint, .review-card__self { margin: 0; color: rgb(var(--v-theme-text-secondary)); font-size: 13px; overflow-wrap: anywhere; }
.review-card__self { color: rgb(var(--v-theme-warning)); font-weight: 600; }
.review-card__hint { padding: 8px 10px; border-radius: var(--r-sm); background: rgb(var(--v-theme-info-weak)); color: rgb(var(--v-theme-info)); }
.review-card__actions { justify-content: flex-end; flex-wrap: wrap; }
.review-facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 0; }
.review-facts div { min-width: 0; padding: 9px 10px; border-radius: var(--r-sm); background: rgb(var(--v-theme-surface-inset)); }
.review-facts dt { margin-bottom: 3px; color: rgb(var(--v-theme-text-secondary)); font-size: 11px; }
.review-facts dd { margin: 0; color: rgb(var(--v-theme-on-surface)); overflow-wrap: anywhere; }
.review-decision { display: flex; flex-direction: column; gap: 12px; padding: 14px; border: 1px solid rgb(var(--v-theme-primary) / 35%); border-radius: var(--r-md); background: rgb(var(--v-theme-primary) / 5%); }

@media (max-width: 700px) {
  .audit-panel__toolbar, .audit-panel__actions { align-items: stretch; }
  .audit-panel__toolbar, .audit-panel__actions, .audit-filter, .audit-filter--employee { width: 100%; }
  .form-grid--two { grid-template-columns: 1fr; }
  .span-two { grid-column: auto; }
  .review-facts { grid-template-columns: 1fr; }
  .review-card__head { align-items: flex-start; }
}
</style>
