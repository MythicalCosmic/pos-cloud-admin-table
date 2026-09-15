<script setup lang="ts">
import WorkspacePage from '@/components/design/workspace/WorkspacePage.vue'
import WorkspaceToolbar from '@/components/design/workspace/WorkspaceToolbar.vue'
import type { DataTableColumn } from '@/components/design/DataTable.vue'
import type {
  ExpenseCategory,
  ExpenseCostBehavior,
  ExpenseReclassificationResult,
  ExpenseRecord,
  ExpenseSource,
  ExpenseStatus,
  ExpenseTotals,
} from '@/types/expenseControl'
import Badge from '@/components/design/Badge.vue'
import Button from '@/components/design/Button.vue'
import Card from '@/components/design/Card.vue'
import DataTable from '@/components/design/DataTable.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import Field from '@/components/design/Field.vue'
import IconAction from '@/components/design/IconAction.vue'
import Input from '@/components/design/Input.vue'
import DateRangePicker from '@/components/design/DateRangePicker.vue'
import type { DateRangeValue } from '@/components/design/DateRangePicker.vue'
import Kpi from '@/components/design/Kpi.vue'
import MoneyInput from '@/components/design/MoneyInput.vue'
import Modal from '@/components/design/Modal.vue'
import PageHeader from '@/components/design/PageHeader.vue'
import SearchSelect from '@/components/design/SearchSelect.vue'
import Segmented from '@/components/design/Segmented.vue'
import Select from '@/components/design/Select.vue'
import Textarea from '@/components/design/Textarea.vue'
import { fmtNum } from '@/components/design/utils/format'
import {
  type ExpenseListParams,
  approveExpense,
  cancelExpense,
  createExpense,
  getExpense,
  listAllExpenseCategories,
  listExpenses,
  payExpense,
  reclassifyExpenses,
  rejectExpense,
  voidExpense,
} from '@/services/expenseControlApi'
import { useUserAccess } from '@/composables/useUserAccess'
import {
  EXPENSE_COST_BEHAVIORS,
  EXPENSE_REPORTING_GROUPS,
  expenseCategoryAllowsSource,
  expenseCategoryFilterOptions,
  expenseCategoryPath,
  expenseCategoryRequestOptions,
  expenseCostBehavior,
  isSelectableExpenseCategory,
} from '@/utils/expenseCategories'

const { t } = useI18n({ useScope: 'global' })
const route = useRoute()
const router = useRouter()
const { snackbar, snackbarMsg, snackbarColor, notify } = useNotify()
const { formatCurrency, formatDate } = useFormatters()
const { currentUserId, hasPermission, hasAnyPermission } = useUserAccess()

const canView = computed(() => hasAnyPermission([
  'expense.request.view_all',
  'expense.request.view_own',
]))

const canCreate = computed(() => hasPermission('expense.request.create'))
const canApprove = computed(() => hasPermission('expense.request.approve'))
const canPay = computed(() => hasPermission('expense.request.pay'))
const canVoid = computed(() => hasPermission('expense.request.void'))
const canViewCategories = computed(() => hasPermission('expense.category.view'))

const canReclassify = computed(() =>
  hasPermission('expense.category.manage') && hasPermission('expense.request.approve'),
)

const items = ref<ExpenseRecord[]>([])
const total = ref(0)
const loading = ref(false)
const loadError = ref('')
const page = ref(1)
const itemsPerPage = ref(20)
const totals = ref<ExpenseTotals>({ row_count: 0, amount_uzs: 0, by_status: {} })
const categories = ref<ExpenseCategory[]>([])

const EXPENSE_STATUSES: ExpenseStatus[] = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'PAID',
  'CANCELED',
  'VOIDED',
]

const EXPENSE_SOURCES: ExpenseSource[] = ['DRAWER', 'SAFE', 'BANK']
const FILTER_QUERY_KEYS = ['status', 'category', 'from', 'to', 'source', 'behavior', 'group', 'q']

function queryText(key: string): string {
  const value = route.query[key]

  return String(Array.isArray(value) ? value[0] ?? '' : value ?? '').trim()
}

function queryChoice<T extends string>(key: string, allowed: readonly T[]): T | '' {
  const value = queryText(key).toUpperCase() as T

  return allowed.includes(value) ? value : ''
}

function queryDate(key: string): string {
  const value = queryText(key)

  return (/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value))) ? value : ''
}

function allTime(): DateRangeValue {
  return { from: '', to: '', preset: 'all' }
}

const initialFrom = queryDate('from')
const initialTo = queryDate('to')
const hasInitialRange = !!(initialFrom && initialTo && initialFrom <= initialTo)

const statusFilter = ref<ExpenseStatus | ''>(queryChoice('status', EXPENSE_STATUSES))
const categoryFilter = ref(/^\d+$/.test(queryText('category')) ? queryText('category') : '')
const costBehaviorFilter = ref<ExpenseCostBehavior | ''>(queryChoice('behavior', EXPENSE_COST_BEHAVIORS))
const reportingGroupFilter = ref<string>(queryChoice('group', EXPENSE_REPORTING_GROUPS))
const sourceFilter = ref<ExpenseSource | ''>(queryChoice('source', EXPENSE_SOURCES))
const dateRange = ref<DateRangeValue>(hasInitialRange ? { from: initialFrom, to: initialTo } : allTime())
const search = ref(queryText('q'))
const showMoreFilters = ref(!!(costBehaviorFilter.value || reportingGroupFilter.value))
const scopeTotals = ref<ExpenseTotals>({ row_count: 0, amount_uzs: 0, by_status: {} })
const reviewMode = ref(false)
const reviewSelection = ref<Set<string | number>>(new Set())
let expenseRequestId = 0

function translate(key: string, values?: Record<string, unknown>) {
  return values ? t(key, values) : t(key)
}

const statusTabs = computed(() => [
  { value: '', label: `${t('All')} · ${fmtNum(scopeTotals.value.row_count)}` },
  ...EXPENSE_STATUSES.map(value => ({
    value,
    label: `${t(`expense_status_${value}`)} · ${fmtNum(scopeTotals.value.by_status?.[value]?.count ?? 0)}`,
  })),
])

const categoryFilterOptions = computed(() => expenseCategoryFilterOptions(categories.value, translate))
const selectedFilterCategory = computed(() => categoryFilterOptions.value.find(option => option.value === categoryFilter.value))

const availableRequestCategories = computed(() => categories.value.filter(category =>
  isSelectableExpenseCategory(category)
  && (expenseCategoryAllowsSource(category, 'SAFE') || expenseCategoryAllowsSource(category, 'BANK')),
))

const categoryFormOptions = computed(() => expenseCategoryRequestOptions(
  categories.value,
  translate,
  category => expenseCategoryAllowsSource(category, 'SAFE') || expenseCategoryAllowsSource(category, 'BANK'),
))

// Each Select placeholder is its "all" choice, so it is not repeated as an option.
const costBehaviorFilterOptions = computed(() => EXPENSE_COST_BEHAVIORS.map(value => ({
  value,
  label: t(`expense_cost_behavior_${value}`),
})))

const reportingGroupFilterOptions = computed(() => [...new Set(categories.value.map(category => category.reporting_group).filter(Boolean))].map(value => ({
  value,
  label: t(`expense_reporting_group_${value}`),
})))

const sourceFilterOptions = computed(() => EXPENSE_SOURCES.map(value => ({
  value,
  label: t(`supplier_source_${value}`),
})))

const moreFilterCount = computed(() => [costBehaviorFilter.value, reportingGroupFilter.value].filter(Boolean).length)

interface FilterChip {
  key: string
  label: string
  value: string
  clear: () => void
}

const activeFilterChips = computed<FilterChip[]>(() => {
  const chips: FilterChip[] = []
  const { from, to } = dateRange.value

  if (search.value.trim())
    chips.push({ key: 'q', label: t('Search'), value: search.value.trim(), clear: () => { search.value = '' } })
  if (categoryFilter.value) {
    chips.push({
      key: 'category',
      label: t('Category'),
      value: selectedFilterCategory.value?.selectedLabel ?? selectedFilterCategory.value?.label ?? `#${categoryFilter.value}`,
      clear: () => { categoryFilter.value = '' },
    })
  }
  if (from && to) {
    chips.push({
      key: 'dates',
      label: t('expense_filter_dates'),
      value: from === to ? formatDate(from) : `${formatDate(from)} – ${formatDate(to)}`,
      clear: () => { dateRange.value = allTime() },
    })
  }
  if (sourceFilter.value)
    chips.push({ key: 'source', label: t('pay_field_source_account'), value: t(`supplier_source_${sourceFilter.value}`), clear: () => { sourceFilter.value = '' } })
  if (costBehaviorFilter.value)
    chips.push({ key: 'behavior', label: t('expense_cost_behavior'), value: t(`expense_cost_behavior_${costBehaviorFilter.value}`), clear: () => { costBehaviorFilter.value = '' } })
  if (reportingGroupFilter.value)
    chips.push({ key: 'group', label: t('expense_reporting_group'), value: t(`expense_reporting_group_${reportingGroupFilter.value}`), clear: () => { reportingGroupFilter.value = '' } })

  return chips
})

function clearFilters() {
  search.value = ''
  categoryFilter.value = ''
  dateRange.value = allTime()
  sourceFilter.value = ''
  costBehaviorFilter.value = ''
  reportingGroupFilter.value = ''
}

const filterQuery = computed(() => {
  const query: Record<string, string> = {}

  const values: Array<[string, string]> = [
    ['status', statusFilter.value],
    ['category', categoryFilter.value],
    ['from', dateRange.value.from],
    ['to', dateRange.value.to],
    ['source', sourceFilter.value],
    ['behavior', costBehaviorFilter.value],
    ['group', reportingGroupFilter.value],
    ['q', search.value.trim()],
  ]

  for (const [key, value] of values) {
    if (value)
      query[key] = value
  }

  return query
})

watch(filterQuery, query => {
  const preserved = Object.fromEntries(Object.entries(route.query).filter(([key]) => !FILTER_QUERY_KEYS.includes(key)))

  router.replace({ query: { ...preserved, ...query } }).catch(() => { /* A newer filter change superseded this URL update. */ })
})

const tableRows = computed(() => reviewMode.value
  ? items.value.filter(row => row.status === 'PENDING')
  : items.value,
)

const dialog = ref(false)
const saving = ref(false)
const formErrors = ref<Record<string, string>>({})

const form = ref({
  category_id: null as number | null,
  amount_uzs: 0,
  requested_source: '' as '' | 'SAFE' | 'BANK',
  description: '',
  expense_date: new Date().toISOString().slice(0, 10),
  receipt_number: '',
  notes: '',
})

const selectedCategory = computed(() =>
  categories.value.find(category => category.id === form.value.category_id) ?? null,
)

const availableSources = computed<Array<'SAFE' | 'BANK'>>(() => {
  if (!selectedCategory.value)
    return []

  if (!Array.isArray(selectedCategory.value.allowed_sources))
    return ['SAFE', 'BANK']

  const allowed = selectedCategory.value.allowed_sources

  return (['SAFE', 'BANK'] as const).filter(source => allowed.includes(source))
})

const sourceOptions = computed(() => availableSources.value.map(value => ({
  value,
  label: t(`supplier_source_${value}`),
})))

const categoryIdString = computed({
  get: () => form.value.category_id == null ? '' : String(form.value.category_id),
  set: (value: string) => { form.value.category_id = value ? Number(value) : null },
})

watch(() => form.value.category_id, () => {
  if (!availableSources.value.includes(form.value.requested_source as 'SAFE' | 'BANK'))
    form.value.requested_source = availableSources.value[0] ?? ''
})

function apiError(error: any): string {
  const body = error?.response?.data

  const fieldErrors = (body?.errors && typeof body.errors === 'object')
    ? Object.values(body.errors).flat().filter(Boolean).join(' ')
    : ''

  return String(fieldErrors || body?.message || body?.detail || t('Error'))
}

function applyExpenseResult(requestId: number, result: Awaited<ReturnType<typeof listExpenses>>) {
  if (requestId !== expenseRequestId)
    return

  items.value = result.expenses
  total.value = Number(result.pagination.total ?? result.expenses.length)
  totals.value = result.totals
}

function applyExpenseError(requestId: number, error: unknown) {
  if (requestId !== expenseRequestId)
    return

  loadError.value = apiError(error)
  items.value = []
  total.value = 0
  totals.value = { row_count: 0, amount_uzs: 0, by_status: {} }
}

function expenseFilters(): ExpenseListParams {
  return {
    category_id: categoryFilter.value ? Number(categoryFilter.value) : undefined,

    // A group includes its subcategories; for a subcategory this adds no other rows.
    include_subcategories: categoryFilter.value ? true : undefined,
    cost_behavior: costBehaviorFilter.value || undefined,
    reporting_group: reportingGroupFilter.value || undefined,
    source_account: sourceFilter.value || undefined,
    date_from: dateRange.value.from || undefined,
    date_to: dateRange.value.to || undefined,
    search: search.value.trim() || undefined,
  }
}

async function load() {
  if (!canView.value)
    return
  const requestId = ++expenseRequestId
  const filters = expenseFilters()

  loading.value = true
  loadError.value = ''
  try {
    const [result, scope] = await Promise.all([
      listExpenses({ ...filters, page: page.value, per_page: itemsPerPage.value, status: statusFilter.value || undefined }),
      statusFilter.value ? listExpenses({ ...filters, page: 1, per_page: 1 }) : null,
    ])

    applyExpenseResult(requestId, result)
    if (requestId === expenseRequestId)
      scopeTotals.value = scope?.totals ?? result.totals
  }
  catch (error: unknown) {
    applyExpenseError(requestId, error)
  }
  finally {
    if (requestId === expenseRequestId)
      loading.value = false
  }
}

async function loadCategories() {
  if (!canViewCategories.value && !canCreate.value && !canReclassify.value)
    return
  try {
    categories.value = await listAllExpenseCategories({
      // Historical expenses can still be filtered by categories that are no longer active.
      include_inactive: hasPermission('expense.category.manage') ? true : undefined,
    })
  }
  catch (error: any) {
    notify(apiError(error), 'error')
  }
}

onMounted(() => Promise.all([load(), loadCategories()]))
watch([page, itemsPerPage], load)
watch([statusFilter, categoryFilter, costBehaviorFilter, reportingGroupFilter, sourceFilter, dateRange], () => {
  page.value = 1
  reviewSelection.value = new Set()
  load()
})

const debouncedSearch = useDebounceFn(() => {
  page.value = 1
  load()
}, 350)

watch(search, debouncedSearch)

const columns = computed<DataTableColumn<ExpenseRecord>[]>(() => [
  { key: 'expense_date', label: t('Date'), width: 116 },
  { key: 'category', label: t('Category'), width: 250, mobileFullWidth: true },
  { key: 'description', label: t('Description'), width: 280, mobileFullWidth: true },
  { key: 'amount_uzs', label: t('Amount'), align: 'right', width: 150 },
  { key: 'requested_source', label: t('pay_field_source_account'), width: 130 },
  { key: 'created_by', label: t('Filed by'), width: 170 },
  { key: 'status', label: t('Status'), width: 126 },
])

const tablePagination = computed(() => ({
  page: page.value,
  perPage: itemsPerPage.value,
  total: total.value,
  onPage: (value: number) => { page.value = value },
  onPerPage: (value: number) => { itemsPerPage.value = value; page.value = 1 },
}))

const STATUS_TONE: Record<ExpenseStatus, 'success' | 'warning' | 'error' | 'info' | 'neutral'> = {
  PENDING: 'warning',
  APPROVED: 'info',
  REJECTED: 'error',
  PAID: 'success',
  CANCELED: 'neutral',
  VOIDED: 'neutral',
}

function statusAmount(status: ExpenseStatus) {
  return Number(totals.value.by_status?.[status]?.amount_uzs ?? 0)
}

function openCreate() {
  // Require a deliberate category choice instead of preselecting the first one.
  form.value = {
    category_id: null,
    amount_uzs: 0,
    requested_source: '',
    description: '',
    expense_date: new Date().toISOString().slice(0, 10),
    receipt_number: '',
    notes: '',
  }
  formErrors.value = {}
  dialog.value = true
}

function closeForm() {
  if (!saving.value)
    dialog.value = false
}

function validateCreate() {
  const errors: Record<string, string> = {}
  if (!form.value.category_id)
    errors.category_id = t('expense_category_required')
  if (!Number.isInteger(form.value.amount_uzs) || form.value.amount_uzs <= 0)
    errors.amount_uzs = t('Amount must be greater than 0')
  if (!form.value.requested_source)
    errors.requested_source = t('expense_source_required')
  if (!form.value.expense_date)
    errors.expense_date = t('Required')
  if (selectedCategory.value?.requires_description && !form.value.description.trim())
    errors.description = t('expense_description_required')
  if (selectedCategory.value?.requires_receipt && !form.value.receipt_number.trim())
    errors.receipt_number = t('expense_receipt_required')
  formErrors.value = errors

  return Object.keys(errors).length === 0
}

async function save() {
  if (!validateCreate() || !form.value.category_id || !form.value.requested_source)
    return
  saving.value = true
  try {
    await createExpense({
      category_id: form.value.category_id,
      amount_uzs: form.value.amount_uzs,
      requested_source: form.value.requested_source,
      expense_date: form.value.expense_date,
      description: form.value.description.trim(),
      receipt_number: form.value.receipt_number.trim(),
      notes: form.value.notes.trim(),
    })
    notify(t('Expense created'))
    dialog.value = false
    await load()
  }
  catch (error: any) {
    notify(apiError(error), 'error')
  }
  finally {
    saving.value = false
  }
}

const busyAction = ref('')
async function approve(row: ExpenseRecord) {
  busyAction.value = `approve-${row.id}`
  try {
    await approveExpense(row.id)
    notify(t('Approved'))
    await load()
  }
  catch (error: any) {
    notify(apiError(error), 'error')
  }
  finally {
    busyAction.value = ''
  }
}

type ReasonAction = 'reject' | 'cancel' | 'void'
const reasonOpen = ref(false)
const reasonAction = ref<ReasonAction>('reject')
const reasonRow = ref<ExpenseRecord | null>(null)
const reason = ref('')
const reasonSaving = ref(false)

function openReason(action: ReasonAction, row: ExpenseRecord) {
  reasonAction.value = action
  reasonRow.value = row
  reason.value = ''
  reasonOpen.value = true
}

function closeReason() {
  if (!reasonSaving.value) {
    reasonOpen.value = false
    reasonRow.value = null
  }
}

const reasonRequired = computed(() => reasonAction.value !== 'cancel' || reasonRow.value?.status === 'APPROVED')
const reasonTitle = computed(() => t(`expense_${reasonAction.value}_title`))

async function submitReason() {
  if (!reasonRow.value)
    return
  if (reasonRequired.value && !reason.value.trim()) {
    notify(t('expense_reason_required'), 'error')
    return
  }
  reasonSaving.value = true
  try {
    if (reasonAction.value === 'reject')
      await rejectExpense(reasonRow.value.id, reason.value.trim())
    else if (reasonAction.value === 'cancel')
      await cancelExpense(reasonRow.value.id, reason.value.trim())
    else
      await voidExpense(reasonRow.value.id, reason.value.trim())

    notify(t(`expense_${reasonAction.value}_success`))
    reasonOpen.value = false
    reasonRow.value = null
    await load()
  }
  catch (error: any) {
    notify(apiError(error), 'error')
  }
  finally {
    reasonSaving.value = false
  }
}

const payDialog = ref(false)
const paying = ref<ExpenseRecord | null>(null)
const feePercent = ref('')
const paymentNote = ref('')
const payingFlag = ref(false)

function openPay(row: ExpenseRecord) {
  paying.value = row
  feePercent.value = ''
  paymentNote.value = ''
  payDialog.value = true
}

function closePay() {
  if (!payingFlag.value) {
    payDialog.value = false
    paying.value = null
  }
}

async function pay() {
  if (!paying.value?.requested_source)
    return
  payingFlag.value = true
  try {
    const bankFee = (paying.value.requested_source === 'BANK' && feePercent.value !== '')
      ? { fee_percent: feePercent.value }
      : {}

    await payExpense(paying.value.id, {
      source_account: paying.value.requested_source,
      ...bankFee,
      ...(paymentNote.value.trim() ? { note: paymentNote.value.trim() } : {}),
    })
    notify(t('Paid'))
    payDialog.value = false
    paying.value = null
    await load()
  }
  catch (error: any) {
    notify(apiError(error), 'error')
  }
  finally {
    payingFlag.value = false
  }
}

const detailsOpen = ref(false)
const detailsLoading = ref(false)
const details = ref<ExpenseRecord | null>(null)

async function openDetails(row: ExpenseRecord) {
  details.value = row
  detailsOpen.value = true
  detailsLoading.value = true
  try {
    details.value = await getExpense(row.id)
  }
  catch (error: any) {
    notify(apiError(error), 'error')
  }
  finally {
    detailsLoading.value = false
  }
}

function canCancel(row: ExpenseRecord) {
  if (row.status === 'PENDING')
    return String(row.created_by?.id ?? '') === String(currentUserId.value ?? '')

  return row.status === 'APPROVED' && canApprove.value
}

function actorName(actor: any) {
  if (!actor)
    return '—'

  return actor.name || `${actor.first_name ?? ''} ${actor.last_name ?? ''}`.trim() || '—'
}

function sourceLabel(source: ExpenseSource | null) {
  return source ? t(`supplier_source_${source}`) : '—'
}

function costBehaviorTone(value: ExpenseCostBehavior): 'neutral' | 'info' | 'primary' | 'warning' {
  if (value === 'FIXED')
    return 'info'
  if (value === 'VARIABLE')
    return 'primary'
  if (value === 'MIXED' || value === 'ONE_TIME')
    return 'warning'

  return 'neutral'
}

const reviewRows = computed(() => tableRows.value.filter(row => reviewSelection.value.has(row.id)))

async function startReview() {
  reviewMode.value = true
  reviewSelection.value = new Set()
  page.value = 1
  if (statusFilter.value !== 'PENDING')
    statusFilter.value = 'PENDING'
  else
    await load()
}

function stopReview() {
  reviewMode.value = false
  reviewSelection.value = new Set()
}

function updateReviewSelection(value: Set<string | number>) {
  if (reviewMode.value)
    reviewSelection.value = value
}

function operationKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    return crypto.randomUUID()

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`
}

const reclassOpen = ref(false)
const reclassTargetId = ref('')
const reclassReason = ref('')
const reclassPreview = shallowRef<ExpenseReclassificationResult | null>(null)
const reclassPreviewing = ref(false)
const reclassApplying = ref(false)
const reclassError = ref('')
const reclassNeedsReload = ref(false)
const reclassReasonAttempted = ref(false)
const applyIdempotencyKey = ref('')
const reclassExpenseIds = ref<number[]>([])
const reclassExpectedCategoryId = ref<number | undefined>()
const reclassReasonField = ref<{ focus: () => void } | null>(null)

const reclassTarget = computed(() => availableRequestCategories.value.find(category =>
  String(category.id) === reclassTargetId.value,
))

const expectedCategoryId = computed(() => {
  const ids = new Set(reviewRows.value
    .map(row => row.category_id)
    .filter((id): id is number => typeof id === 'number'))

  return ids.size === 1 ? [...ids][0] : undefined
})

const reclassPreviewCount = computed(() => Number(
  reclassPreview.value?.row_count ?? reviewRows.value.length,
))

const reclassPreviewTotal = computed(() => Number(
  reclassPreview.value?.total_amount_uzs
    ?? reviewRows.value.reduce((sum, row) => sum + Number(row.amount_uzs ?? 0), 0),
))

const reclassPreviewTargetPath = computed(() => {
  const previewPath = reclassPreview.value?.target_path ?? reclassPreview.value?.target_category?.path

  return previewPath?.filter(Boolean).join(' / ') || expenseCategoryPath(reclassTarget.value)
})

const reclassPreviewBehavior = computed(() =>
  reclassPreview.value?.target_cost_behavior
  ?? reclassPreview.value?.target_category?.cost_behavior
  ?? expenseCostBehavior(reclassTarget.value),
)

const reclassPreviewReportingGroup = computed(() =>
  reclassPreview.value?.target_reporting_group
  ?? reclassPreview.value?.target_category?.reporting_group
  ?? reclassTarget.value?.reporting_group
  ?? '',
)

function closeReclassification() {
  if (reclassPreviewing.value || reclassApplying.value)
    return

  reclassOpen.value = false
  reclassPreview.value = null
  reclassExpenseIds.value = []
  reclassExpectedCategoryId.value = undefined
}

function openReclassification() {
  if (!reviewRows.value.length)
    return

  reclassTargetId.value = ''
  reclassReason.value = ''
  reclassPreview.value = null
  reclassError.value = ''
  reclassNeedsReload.value = false
  reclassReasonAttempted.value = false
  applyIdempotencyKey.value = ''
  reclassExpenseIds.value = reviewRows.value.map(row => row.id)
  reclassExpectedCategoryId.value = expectedCategoryId.value
  reclassOpen.value = true
}

function reclassificationPayload(dryRun: boolean) {
  return {
    expense_ids: [...reclassExpenseIds.value],
    category_id: Number(reclassTargetId.value),
    ...(reclassExpectedCategoryId.value ? { expected_category_id: reclassExpectedCategoryId.value } : {}),
    reason: dryRun ? '' : reclassReason.value.trim(),
    dry_run: dryRun,
  }
}

function reclassificationStale(error: any): boolean {
  const code = String(error?.response?.data?.code ?? '')

  return error?.response?.status === 409
    || code === 'EXPENSE_RECLASSIFICATION_NO_CHANGE'
    || code.includes('EXPENSE_STATUS')
    || code.includes('EXPECTED_CATEGORY')
}

async function previewReclassification() {
  if (!reclassTarget.value || reclassPreviewing.value)
    return

  reclassPreviewing.value = true
  reclassError.value = ''
  reclassNeedsReload.value = false
  try {
    reclassPreview.value = await reclassifyExpenses(reclassificationPayload(true), operationKey())
    applyIdempotencyKey.value = operationKey()
    await nextTick()
    reclassReasonField.value?.focus()
  }
  catch (error: any) {
    reclassError.value = apiError(error)
    reclassNeedsReload.value = reclassificationStale(error)
  }
  finally {
    reclassPreviewing.value = false
  }
}

async function applyReclassification() {
  reclassReasonAttempted.value = true
  if (!reclassPreview.value || !reclassReason.value.trim() || reclassApplying.value)
    return

  reclassApplying.value = true
  reclassError.value = ''
  reclassNeedsReload.value = false
  try {
    await reclassifyExpenses(reclassificationPayload(false), applyIdempotencyKey.value)
    notify(t('expense_reclassify_success', { count: reclassPreviewCount.value }))
    reclassOpen.value = false
    reclassExpenseIds.value = []
    reclassExpectedCategoryId.value = undefined
    reviewSelection.value = new Set()
    await load()
  }
  catch (error: any) {
    reclassError.value = apiError(error)
    reclassNeedsReload.value = reclassificationStale(error)
  }
  finally {
    reclassApplying.value = false
  }
}

async function reloadReclassification() {
  reclassOpen.value = false
  reclassPreview.value = null
  reclassExpenseIds.value = []
  reclassExpectedCategoryId.value = undefined
  reviewSelection.value = new Set()
  await load()
}
</script>

<template>
  <WorkspacePage class="page">
    <PageHeader
      :title="t('Expenses')"
      :subtitle="t('expense_subtitle')"
    >
      <template #actions>
        <Button
          v-if="canReclassify"
          :variant="reviewMode ? 'primary' : 'ghost'"
          :icon="reviewMode ? 'close' : 'check'"
          @click="reviewMode ? stopReview() : startReview()"
        >
          {{ t(reviewMode ? 'expense_review_exit' : 'expense_review_categories') }}
        </Button>
        <Button
          v-if="canViewCategories"
          variant="ghost"
          icon="folder"
          @click="router.push('/hr-expense-categories')"
        >
          {{ t('Categories') }}
        </Button>
        <Button
          v-if="canCreate"
          variant="primary"
          icon="plus"
          :disabled="!availableRequestCategories.length"
          @click="openCreate"
        >
          {{ t('New Expense') }}
        </Button>
      </template>
    </PageHeader>

    <Card
      v-if="!canView"
      class="permission-state"
    >
      <div class="statefill">
        <div class="statefill__icon">
          <DesignIcon
            name="lock"
            :size="24"
          />
        </div>
        <div class="statefill__title">
          {{ t('expense_permission_denied_title') }}
        </div>
        <div class="statefill__sub">
          {{ t('expense_permission_denied_body') }}
        </div>
      </div>
    </Card>

    <template v-else>
      <div
        v-if="reviewMode"
        class="review-banner"
        role="status"
      >
        <div class="review-banner__icon">
          <DesignIcon
            name="check"
            :size="20"
          />
        </div>
        <div>
          <strong>{{ t('expense_review_mode_title') }}</strong>
          <p>{{ t('expense_review_mode_body') }}</p>
        </div>
      </div>

      <div class="kpi-grid">
        <Kpi :data="{ label: t('Pending'), value: statusAmount('PENDING'), icon: 'clock', tone: 'warning', money: true }" />
        <Kpi :data="{ label: t('Approved'), value: statusAmount('APPROVED'), icon: 'calendar', tone: 'info', money: true }" />
        <Kpi :data="{ label: t('Paid'), value: statusAmount('PAID'), icon: 'check', tone: 'success', money: true }" />
        <Kpi :data="{ label: t('Total'), value: scopeTotals.amount_uzs, icon: 'wallet', tone: 'primary', money: true, sub: `${fmtNum(scopeTotals.row_count)} ${t('expense_count_suffix')}` }" />
      </div>

      <Card>
        <div
          v-if="!reviewMode"
          class="status-tabs"
        >
          <Segmented
            :model-value="statusFilter"
            :options="statusTabs"
            :aria-label="t('expense_status_tabs_label')"
            @update:model-value="value => statusFilter = value as ExpenseStatus | ''"
          />
        </div>

        <WorkspaceToolbar class="toolbar expense-filters">
          <div class="expense-filters__row">
            <div class="tb-search">
              <Input
                v-model="search"
                icon="search"
                :placeholder="t('Search description or category')"
              />
            </div>
            <div class="tb-category">
              <SearchSelect
                v-model="categoryFilter"
                icon="folder"
                :options="categoryFilterOptions"
                :placeholder="t('expense_filter_all_categories')"
                :aria-label="t('Category')"
              />
            </div>
            <div class="tb-dates">
              <DateRangePicker
                v-model="dateRange"
                :enable-time="false"
                :placeholder="t('All time')"
                :aria-label="t('expense_filter_dates')"
              />
            </div>
            <div class="tb-filter">
              <Select
                v-model="sourceFilter"
                :options="sourceFilterOptions"
                :placeholder="t('expense_source_all')"
                :aria-label="t('pay_field_source_account')"
              />
            </div>
            <Button
              class="more-filters"
              variant="ghost"
              icon="sliders"
              :aria-expanded="showMoreFilters"
              @click="showMoreFilters = !showMoreFilters"
            >
              {{ t(showMoreFilters ? 'expense_filter_fewer' : 'expense_filter_more') }}
              <span
                v-if="moreFilterCount"
                class="more-filters__count"
              >{{ moreFilterCount }}</span>
            </Button>
            <IconAction
              icon="refresh"
              :title="t('expcat_action_refresh')"
              :disabled="loading"
              @click="load"
            />
          </div>
          <div
            v-if="showMoreFilters"
            class="expense-filters__row expense-filters__row--more"
          >
            <div class="tb-filter tb-filter--wide">
              <Select
                v-model="costBehaviorFilter"
                :options="costBehaviorFilterOptions"
                :placeholder="t('expense_cost_behavior_all')"
                :aria-label="t('expense_cost_behavior')"
              />
            </div>
            <div class="tb-filter tb-filter--wide">
              <Select
                v-model="reportingGroupFilter"
                :options="reportingGroupFilterOptions"
                :placeholder="t('expense_reporting_group_all')"
                :aria-label="t('expense_reporting_group')"
              />
            </div>
          </div>
        </WorkspaceToolbar>

        <div
          v-if="activeFilterChips.length"
          class="toolbar filter-chip-row"
        >
          <div class="chips">
            <span
              v-for="chip in activeFilterChips"
              :key="chip.key"
              class="chip"
            >
              <span>{{ chip.label }}: <b>{{ chip.value }}</b></span>
              <button
                type="button"
                class="chip__x"
                :aria-label="`${t('Remove')}: ${chip.label}`"
                @click="chip.clear"
              >
                <DesignIcon
                  name="close"
                  :size="13"
                />
              </button>
            </span>
            <button
              type="button"
              class="chip--clear"
              @click="clearFilters"
            >
              {{ t('Clear all') }}
            </button>
          </div>
        </div>

        <div
          v-if="loadError"
          class="error-banner"
          role="alert"
        >
          <span>{{ loadError }}</span>
          <Button
            variant="ghost"
            icon="retry"
            @click="load"
          >
            {{ t('Retry') }}
          </Button>
        </div>

        <div class="card__divider" />

        <DataTable
          class="expense-table"
          :columns="columns"
          :rows="tableRows"
          row-key="id"
          :loading="loading"
          :selectable="reviewMode"
          :selection="reviewMode ? reviewSelection : undefined"
          :pagination="tablePagination"
          :empty-title="t('expense_empty_title')"
          :empty-sub="t('expense_empty_hint')"
          @update:selection="updateReviewSelection"
        >
          <template #bulk-actions>
            <Button
              v-if="reviewMode"
              variant="primary"
              size="sm"
              icon="check"
              @click="openReclassification"
            >
              {{ t('expense_review_selection') }}
            </Button>
          </template>
          <template #cell.expense_date="{ row }">
            {{ formatDate(row.expense_date) }}
          </template>
          <template #cell.category="{ row }">
            <div
              v-if="row.category"
              class="expense-category"
              :title="row.category.code"
            >
              <span
                v-if="row.category.parent?.name"
                class="expense-category__parent"
              >
                <DesignIcon
                  name="folder"
                  :size="12"
                />
                {{ row.category.parent.name }}
              </span>
              <span class="cell-strong expense-category__name">{{ row.category.name }}</span>
              <Badge :tone="costBehaviorTone(expenseCostBehavior(row.category))">
                {{ t(`expense_cost_behavior_${expenseCostBehavior(row.category)}`) }}
              </Badge>
            </div>
            <span
              v-else
              class="cell-muted"
            >{{ t('expense_uncategorized') }}</span>
          </template>
          <template #cell.description="{ row }">
            <span class="cell-muted expense-description">{{ row.description || '—' }}</span>
          </template>
          <template #cell.amount_uzs="{ row }">
            <span class="mono">{{ formatCurrency(row.amount_uzs ?? row.amount ?? 0) }}</span>
          </template>
          <template #cell.requested_source="{ row }">
            {{ sourceLabel(row.requested_source) }}
          </template>
          <template #cell.created_by="{ row }">
            {{ actorName(row.created_by) }}
          </template>
          <template #cell.status="{ row }">
            <Badge :tone="STATUS_TONE[row.status] ?? 'neutral'">
              {{ t(`expense_status_${row.status}`) }}
            </Badge>
          </template>
          <template #row-actions="{ row }">
            <IconAction
              icon="info"
              :title="t('Details')"
              @click="openDetails(row)"
            />
            <IconAction
              v-if="row.status === 'PENDING' && canApprove && String(row.created_by?.id ?? '') !== String(currentUserId ?? '')"
              icon="check"
              tone="success"
              :title="t('Approve')"
              :disabled="!!busyAction"
              @click="approve(row)"
            />
            <IconAction
              v-if="row.status === 'PENDING' && canApprove && String(row.created_by?.id ?? '') !== String(currentUserId ?? '')"
              icon="close"
              tone="danger"
              :title="t('Reject')"
              :disabled="!!busyAction"
              @click="openReason('reject', row)"
            />
            <IconAction
              v-if="row.status === 'APPROVED' && canPay"
              icon="dollar"
              tone="success"
              :title="t('Pay')"
              @click="openPay(row)"
            />
            <IconAction
              v-if="canCancel(row)"
              icon="close"
              tone="danger"
              :title="t('expense_cancel_action')"
              @click="openReason('cancel', row)"
            />
            <IconAction
              v-if="row.status === 'PAID' && canVoid"
              icon="refresh"
              tone="danger"
              :title="t('expense_void_action')"
              @click="openReason('void', row)"
            />
          </template>
          <template #empty>
            <div class="statefill">
              <div class="statefill__icon">
                <DesignIcon
                  name="wallet"
                  :size="24"
                />
              </div>
              <div class="statefill__title">
                {{ t('expense_empty_title') }}
              </div>
              <div class="statefill__sub">
                {{ t('expense_empty_hint') }}
              </div>
              <Button
                v-if="canCreate && availableRequestCategories.length"
                class="empty-action"
                variant="primary"
                icon="plus"
                @click="openCreate"
              >
                {{ t('New Expense') }}
              </Button>
            </div>
          </template>
        </DataTable>
      </Card>
    </template>

    <Modal
      :open="dialog"
      :title="t('New Expense')"
      :subtitle="t('expense_request_create_hint')"
      :width="600"
      @close="closeForm"
    >
      <form @submit.prevent="save">
        <div class="form-grid">
          <Field
            :label="t('Category')"
            class="span-2"
            :error="formErrors.category_id"
          >
            <SearchSelect
              v-model="categoryIdString"
              icon="tag"
              :options="categoryFormOptions"
              :placeholder="t('expense_pick_category')"
              :error="!!formErrors.category_id"
            />
            <div
              v-if="selectedCategory"
              class="category-context"
            >
              <Badge :tone="costBehaviorTone(expenseCostBehavior(selectedCategory))">
                {{ t(`expense_cost_behavior_${expenseCostBehavior(selectedCategory)}`) }}
              </Badge>
              <span>{{ expenseCategoryPath(selectedCategory) }}</span>
            </div>
          </Field>
          <Field
            :label="t('Amount')"
            :error="formErrors.amount_uzs"
          >
            <MoneyInput
              v-model="form.amount_uzs"
              :error="!!formErrors.amount_uzs"
              :placeholder="t('expense_amount_placeholder')"
            />
          </Field>
          <Field
            :label="t('Date')"
            :error="formErrors.expense_date"
          >
            <Input
              v-model="form.expense_date"
              type="date"
              :error="!!formErrors.expense_date"
            />
          </Field>
          <Field
            :label="t('expense_requested_source')"
            class="span-2"
            :error="formErrors.requested_source"
            :hint="t('expense_requested_source_hint')"
          >
            <Select
              v-model="form.requested_source"
              :options="sourceOptions"
              :placeholder="t('expense_source_required')"
              :error="!!formErrors.requested_source"
            />
          </Field>
          <Field
            :label="t('Description')"
            class="span-2"
            :error="formErrors.description"
          >
            <Input
              v-model="form.description"
              :error="!!formErrors.description"
              :placeholder="t('expense_description_placeholder')"
            />
          </Field>
          <Field
            :label="t('Receipt #')"
            class="span-2"
            :error="formErrors.receipt_number"
            :hint="selectedCategory?.requires_receipt ? t('expense_receipt_category_required') : ''"
          >
            <Input
              v-model="form.receipt_number"
              :error="!!formErrors.receipt_number"
              :placeholder="t('expense_receipt_placeholder')"
            />
          </Field>
          <Field
            :label="t('Notes')"
            class="span-2"
          >
            <Input
              v-model="form.notes"
              :placeholder="t('expense_notes_placeholder')"
            />
          </Field>
        </div>
      </form>
      <template #footer>
        <Button
          variant="primary"
          icon="check"
          :loading="saving"
          :disabled="saving"
          @click="save"
        >
          {{ t('expense_submit_request') }}
        </Button>
      </template>
    </Modal>

    <Modal
      :open="reclassOpen"
      :busy="reclassPreviewing || reclassApplying"
      :title="t('expense_reclassify_title')"
      :subtitle="t('expense_reclassify_subtitle')"
      :width="720"
      @close="closeReclassification"
    >
      <div
        v-if="!reclassPreview"
        class="reclass-steps"
        aria-hidden="true"
      >
        <span class="is-active">1 · {{ t('expense_reclassify_choose') }}</span>
        <span :class="{ 'is-active': !!reclassPreview }">2 · {{ t('expense_reclassify_review') }}</span>
        <span>3 · {{ t('expense_reclassify_apply') }}</span>
      </div>

      <div
        v-if="reclassError"
        class="reclass-error"
        role="alert"
      >
        <DesignIcon
          name="alert"
          :size="18"
        />
        <div>
          <strong>{{ t(reclassNeedsReload ? 'expense_reclassify_needs_attention' : 'expense_reclassify_failed') }}</strong>
          <p>{{ reclassError }}</p>
        </div>
        <Button
          v-if="reclassNeedsReload"
          variant="ghost"
          size="sm"
          icon="refresh"
          @click="reloadReclassification"
        >
          {{ t('expense_reclassify_reload') }}
        </Button>
      </div>

      <template v-if="!reclassPreview">
        <div class="reclass-summary">
          <div>
            <span>{{ t('expense_selected_rows') }}</span>
            <strong>{{ reviewRows.length }}</strong>
          </div>
          <div>
            <span>{{ t('expense_selected_total') }}</span>
            <strong class="mono">{{ formatCurrency(reviewRows.reduce((sum, row) => sum + Number(row.amount_uzs ?? 0), 0)) }}</strong>
          </div>
        </div>

        <Field
          :label="t('expense_reclassify_target')"
          :hint="t('expense_reclassify_target_hint')"
        >
          <SearchSelect
            v-model="reclassTargetId"
            icon="tag"
            :options="categoryFormOptions"
            :placeholder="t('expense_reclassify_choose_target')"
            autofocus
          />
        </Field>

        <div
          v-if="reclassTarget"
          class="target-card"
        >
          <div class="target-card__icon">
            <DesignIcon
              name="tag"
              :size="20"
            />
          </div>
          <div>
            <strong>{{ expenseCategoryPath(reclassTarget) }}</strong>
            <div class="category-meta">
              <Badge :tone="costBehaviorTone(expenseCostBehavior(reclassTarget))">
                {{ t(`expense_cost_behavior_${expenseCostBehavior(reclassTarget)}`) }}
              </Badge>
              <span>{{ t(`expense_reporting_group_${reclassTarget.reporting_group}`) }}</span>
            </div>
          </div>
        </div>
      </template>

      <template v-else>
        <div class="preview-hero">
          <div>
            <span>{{ t('expense_preview_rows') }}</span>
            <strong>{{ reclassPreviewCount }}</strong>
          </div>
          <div>
            <span>{{ t('expense_preview_total') }}</span>
            <strong class="mono">{{ formatCurrency(reclassPreviewTotal) }}</strong>
          </div>
        </div>

        <div class="preview-target">
          <span>{{ t('expense_reclassify_new_category') }}</span>
          <strong>{{ reclassPreviewTargetPath }}</strong>
          <div class="category-meta">
            <Badge :tone="costBehaviorTone(reclassPreviewBehavior)">
              {{ t(`expense_cost_behavior_${reclassPreviewBehavior}`) }}
            </Badge>
            <span v-if="reclassPreviewReportingGroup">
              {{ t(`expense_reporting_group_${reclassPreviewReportingGroup}`) }}
            </span>
          </div>
        </div>

        <div
          v-if="reclassPreview.current_category_breakdown?.length || reclassPreview.source_breakdown?.length"
          class="preview-breakdowns"
        >
          <div v-if="reclassPreview.current_category_breakdown?.length">
            <h4>{{ t('expense_current_categories') }}</h4>
            <div
              v-for="entry in reclassPreview.current_category_breakdown"
              :key="entry.category_id ?? entry.id ?? entry.code ?? entry.name"
              class="breakdown-row"
            >
              <span>{{ entry.path?.join(' / ') || entry.name || entry.code }}</span>
              <strong class="mono">{{ entry.count }} · {{ formatCurrency(entry.amount_uzs) }}</strong>
            </div>
          </div>
          <div v-if="reclassPreview.source_breakdown?.length">
            <h4>{{ t('expense_payment_sources') }}</h4>
            <div
              v-for="entry in reclassPreview.source_breakdown"
              :key="entry.source_account ?? entry.code ?? entry.name"
              class="breakdown-row"
            >
              <span>{{ sourceLabel(entry.source_account ?? null) }}</span>
              <strong class="mono">{{ entry.count }} · {{ formatCurrency(entry.amount_uzs) }}</strong>
            </div>
          </div>
        </div>

        <Field
          class="reclass-reason"
          :label="t('Reason')"
          :hint="t('expense_reclassify_reason_hint')"
          :error="reclassReasonAttempted && !reclassReason.trim() ? t('expense_reason_required') : ''"
        >
          <Textarea
            ref="reclassReasonField"
            v-model="reclassReason"
            rows="2"
            :placeholder="t('expense_reclassify_reason_placeholder')"
            autofocus
          />
        </Field>
      </template>

      <template #footer>
        <Button
          v-if="!reclassPreview"
          variant="primary"
          icon="check"
          :loading="reclassPreviewing"
          :disabled="reclassPreviewing || !reclassTarget || !reviewRows.length"
          @click="previewReclassification"
        >
          {{ t('expense_reclassify_preview_action') }}
        </Button>
        <Button
          v-else
          variant="primary"
          icon="check"
          :loading="reclassApplying"
          :disabled="reclassApplying || !reclassReason.trim()"
          @click="applyReclassification"
        >
          {{ t('expense_reclassify_confirm_action') }}
        </Button>
      </template>
    </Modal>

    <Modal
      :open="payDialog"
      :title="t('Pay Expense')"
      :subtitle="paying ? formatCurrency(paying.amount_uzs) : ''"
      :width="460"
      @close="closePay"
    >
      <div class="summary-row">
        <span>{{ t('pay_field_source_account') }}</span>
        <strong>{{ sourceLabel(paying?.requested_source ?? null) }}</strong>
      </div>
      <Field
        v-if="paying?.requested_source === 'BANK'"
        :label="t('pay_field_commission')"
        :hint="t('pay_commission_hint')"
      >
        <Input
          v-model="feePercent"
          type="number"
          min="0"
          max="100"
          step="0.01"
          placeholder="0"
        />
      </Field>
      <Field :label="t('Notes')">
        <Input
          v-model="paymentNote"
          :placeholder="t('expense_payment_note_placeholder')"
        />
      </Field>
      <div class="pay-hint">
        {{ t('expense_payment_posts_money') }}
      </div>
      <template #footer>
        <Button
          variant="primary"
          icon="dollar"
          :loading="payingFlag"
          :disabled="payingFlag || !paying?.requested_source"
          @click="pay"
        >
          {{ t('Pay') }}
        </Button>
      </template>
    </Modal>

    <Modal
      :open="reasonOpen"
      :title="reasonTitle"
      :subtitle="reasonRow?.description || ''"
      :width="480"
      @close="closeReason"
    >
      <Field
        :label="t('Reason')"
        :hint="reasonRequired ? t('expense_reason_required') : t('Reason (optional)')"
      >
        <Input
          v-model="reason"
          :placeholder="t('expense_reason_placeholder')"
          autofocus
        />
      </Field>
      <template #footer>
        <Button
          variant="danger"
          icon="close"
          :loading="reasonSaving"
          :disabled="reasonSaving"
          @click="submitReason"
        >
          {{ t(`expense_${reasonAction}_action`) }}
        </Button>
      </template>
    </Modal>

    <Modal
      :open="detailsOpen"
      :title="t('expense_details_title')"
      :subtitle="details ? `#${details.id}` : ''"
      :width="680"
      @close="detailsOpen = false"
    >
      <div
        v-if="detailsLoading"
        class="detail-loading"
      >
        {{ t('Loading...') }}
      </div>
      <template v-else-if="details">
        <dl class="detail-grid">
          <div>
            <dt>{{ t('Category') }}</dt><dd>
              <span>{{ expenseCategoryPath(details.category) || '—' }}</span>
              <Badge
                v-if="details.category"
                class="detail-behavior"
                :tone="costBehaviorTone(expenseCostBehavior(details.category))"
              >
                {{ t(`expense_cost_behavior_${expenseCostBehavior(details.category)}`) }}
              </Badge>
            </dd>
          </div>
          <div>
            <dt>{{ t('Amount') }}</dt><dd class="mono">
              {{ formatCurrency(details.amount_uzs) }}
            </dd>
          </div>
          <div><dt>{{ t('pay_field_source_account') }}</dt><dd>{{ sourceLabel(details.requested_source) }}</dd></div>
          <div>
            <dt>{{ t('Status') }}</dt><dd>
              <Badge :tone="STATUS_TONE[details.status]">
                {{ t(`expense_status_${details.status}`) }}
              </Badge>
            </dd>
          </div>
          <div><dt>{{ t('Filed by') }}</dt><dd>{{ actorName(details.created_by) }}</dd></div>
          <div><dt>{{ t('Date') }}</dt><dd>{{ formatDate(details.expense_date) }}</dd></div>
          <div class="span-2">
            <dt>{{ t('Description') }}</dt><dd>{{ details.description || '—' }}</dd>
          </div>
        </dl>
        <div
          v-if="details.transitions?.length"
          class="timeline"
        >
          <div class="timeline__title">
            {{ t('expense_history') }}
          </div>
          <div
            v-for="transition in details.transitions"
            :key="transition.id"
            class="timeline__item"
          >
            <Badge :tone="STATUS_TONE[transition.new_status]">
              {{ t(`expense_status_${transition.new_status}`) }}
            </Badge>
            <span>{{ actorName(transition.actor) }}</span>
            <span class="cell-muted">{{ formatDate(transition.created_at) }}</span>
            <p v-if="transition.reason">
              {{ transition.reason }}
            </p>
          </div>
        </div>
      </template>
    </Modal>

    <VSnackbar
      v-model="snackbar"
      :color="snackbarColor"
      :timeout="3000"
    >
      {{ snackbarMsg }}
    </VSnackbar>
  </WorkspacePage>
</template>

<route lang="yaml">
meta:
  action: manage
  subject: all
</route>

<style scoped>
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-block-end: 16px;
}

.review-banner {
  display: flex;
  align-items: center;
  gap: 13px;
  margin-block-end: 16px;
  padding: 14px 16px;
  border: 1px solid color-mix(in srgb, var(--primary) 28%, var(--border));
  border-radius: 14px;
  background: linear-gradient(120deg, color-mix(in srgb, var(--primary) 10%, var(--surface)), var(--surface));
}
.review-banner__icon { display: grid; flex: 0 0 38px; width: 38px; height: 38px; place-items: center; border-radius: 11px; background: var(--primary); color: var(--on-primary, white); }
.review-banner strong { display: block; color: var(--text); font-size: 14px; }
.review-banner p { margin: 2px 0 0; color: var(--text-secondary); font-size: 13px; line-height: 1.45; }

.status-tabs { overflow-x: auto; padding: 14px 16px 2px; }
.expense-filters { display: grid; gap: 10px; }
.expense-filters__row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.expense-filters__row--more { padding-block-start: 10px; border-block-start: 1px dashed var(--border); }
.tb-search { flex: 1 1 220px; min-width: 180px; }
.tb-category { flex: 0 1 260px; min-width: 220px; }
.tb-dates { flex: 0 0 auto; }
.tb-filter { width: 170px; }
.tb-filter--wide { width: 240px; }
.more-filters__count { display: inline-grid; min-width: 18px; height: 18px; margin-inline-start: 4px; padding-inline: 5px; place-items: center; border-radius: 99px; background: var(--primary); color: var(--on-primary); font-size: 11px; font-weight: 700; }
.filter-chip-row { padding-block: 0 12px; }
.expense-category { display: grid; justify-items: start; min-width: 0; gap: 3px; }
.expense-category__parent { display: inline-flex; align-items: center; gap: 4px; color: var(--text-tertiary); font-size: 11px; font-weight: 600; }
.expense-category__name { overflow-wrap: anywhere; }
.expense-description { display: -webkit-box; max-width: 320px; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow-wrap: anywhere; }

.error-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 0 16px 12px;
  padding: 10px 12px;
  border: 1px solid rgba(var(--v-theme-error), .3);
  border-radius: 8px;
  background: rgba(var(--v-theme-error), .08);
  color: rgb(var(--v-theme-error));
}

.cell-stack { display: flex; flex-direction: column; min-width: 0; gap: 2px; }
.category-path { overflow-wrap: anywhere; }
.expense-table :deep(.dtable) { min-inline-size: 1318px; }
.expense-table :deep(.dtable thead th:last-child),
.expense-table :deep(.dtable tbody td:last-child) { position: sticky; z-index: 3; inset-inline-end: 0; background: var(--surface); box-shadow: -10px 0 18px -18px color-mix(in srgb, var(--text) 40%, transparent); }
.expense-table :deep(.dtable thead th:last-child) { z-index: 4; background: var(--surface-2); }
.category-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; color: var(--text-secondary); font-size: 11px; }
.category-context { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-block-start: 8px; color: var(--text-secondary); font-size: 12px; }
.detail-behavior { margin-inline-start: 7px; }
.truncate { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 300px; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.span-2 { grid-column: span 2; }
.empty-action { margin-block-start: 12px; }

.summary-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px;
  margin-block-end: 14px;
  border-radius: 8px;
  background: rgba(var(--v-theme-on-surface), .04);
}

.pay-hint,
.detail-loading {
  margin-block-start: 10px;
  color: rgb(var(--v-theme-text-secondary));
  font-size: 13px;
}

.detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  margin: 0;
}

.detail-grid div { min-width: 0; }
.detail-grid dt { color: rgb(var(--v-theme-text-secondary)); font-size: 12px; }
.detail-grid dd { margin: 4px 0 0; overflow-wrap: anywhere; }
.timeline { margin-block-start: 22px; }
.timeline__title { margin-block-end: 10px; font-weight: 600; }
.timeline__item { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 8px; padding: 10px 0; border-block-start: 1px solid rgba(var(--v-theme-on-surface), .08); }
.timeline__item p { grid-column: 2 / -1; margin: 0; overflow-wrap: anywhere; }

.reclass-steps { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; margin-block-end: 18px; }
.reclass-steps span { padding: 8px 10px; border-radius: 8px; background: var(--surface-2); color: var(--text-tertiary); font-size: 11px; font-weight: 650; text-align: center; }
.reclass-steps span.is-active { background: var(--primary-weak); color: var(--primary); }
.reclass-error { display: flex; align-items: flex-start; gap: 10px; margin-block-end: 14px; padding: 12px; border: 1px solid color-mix(in srgb, var(--color-negative) 35%, var(--border)); border-radius: 10px; background: color-mix(in srgb, var(--color-negative) 8%, var(--surface)); color: var(--color-negative); }
.reclass-error > div { flex: 1; min-width: 0; }
.reclass-error strong { display: block; font-size: 13px; }
.reclass-error p { margin: 2px 0 0; overflow-wrap: anywhere; color: var(--text-secondary); font-size: 12px; }
.reclass-summary,
.preview-hero { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-block-end: 16px; }
.preview-hero { margin-block-end: 12px; }
.reclass-summary > div,
.preview-hero > div { display: grid; gap: 5px; padding: 14px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface-2); }
.reclass-summary span,
.preview-hero span,
.preview-target > span { color: var(--text-tertiary); font-size: 11px; font-weight: 650; letter-spacing: .04em; text-transform: uppercase; }
.reclass-summary strong,
.preview-hero strong { color: var(--text); font-size: 20px; }
.target-card { display: flex; align-items: center; gap: 12px; margin-block-start: 14px; padding: 14px; border: 1px solid var(--primary-border); border-radius: 12px; background: var(--primary-weak); }
.target-card__icon { display: grid; flex: 0 0 38px; width: 38px; height: 38px; place-items: center; border-radius: 10px; background: var(--surface); color: var(--primary); }
.target-card > div:last-child { min-width: 0; }
.target-card strong { display: block; margin-block-end: 5px; overflow-wrap: anywhere; }
.preview-target { display: grid; gap: 5px; margin-block-end: 12px; padding: 13px; border: 1px solid var(--primary-border); border-radius: 12px; background: var(--primary-weak); }
.preview-target > strong { overflow-wrap: anywhere; font-size: 16px; }
.preview-breakdowns { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-block-end: 12px; }
.preview-breakdowns > div { min-width: 0; padding: 10px; border: 1px solid var(--border); border-radius: 10px; }
.preview-breakdowns h4 { margin: 0 0 8px; font-size: 12px; }
.breakdown-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; padding: 5px 0; border-block-start: 1px solid var(--border-soft, var(--border)); font-size: 12px; }
.breakdown-row span { min-width: 0; overflow-wrap: anywhere; }
.breakdown-row strong { flex: 0 0 auto; font-size: 11px; }
.reclass-reason :deep(.control--textarea) { min-height: 70px; padding-block: 8px; }
.reclass-reason :deep(textarea) { min-height: 48px; }

@media (max-width: 1024px) {
  .kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 768px) {
  .tb-search,
  .tb-category,
  .tb-dates,
  .tb-filter,
  .tb-filter--wide { width: 100%; min-width: 0; flex: 1 1 100%; }
  .form-grid,
  .detail-grid { grid-template-columns: 1fr; }
  .span-2 { grid-column: span 1; }
  .timeline__item { grid-template-columns: auto 1fr; }
  .timeline__item .cell-muted { grid-column: 2; }
  .preview-breakdowns { grid-template-columns: 1fr; }
}

@media (max-width: 480px) {
  .kpi-grid { grid-template-columns: 1fr; }
  .review-banner { align-items: flex-start; }
  .reclass-steps { grid-template-columns: 1fr; }
  .reclass-summary { grid-template-columns: 1fr; }
  .preview-hero { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .preview-hero > div { padding: 11px; }
  .preview-hero strong { font-size: 18px; }
  .error-banner { align-items: flex-start; flex-direction: column; }
}
</style>
