<script setup lang="ts">
import WorkspacePage from '@/components/design/workspace/WorkspacePage.vue'
import WorkspaceToolbar from '@/components/design/workspace/WorkspaceToolbar.vue'
import Badge from '@/components/design/Badge.vue'
import Button from '@/components/design/Button.vue'
import Card from '@/components/design/Card.vue'
import DataTable, {
  type DataTableColumn,
  type DataTablePagination,
} from '@/components/design/DataTable.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import Field from '@/components/design/Field.vue'
import Input from '@/components/design/Input.vue'
import Modal from '@/components/design/Modal.vue'
import MoneyInput from '@/components/design/MoneyInput.vue'
import PageHeader from '@/components/design/PageHeader.vue'
import Select from '@/components/design/Select.vue'
import Skeleton from '@/components/design/Skeleton.vue'
import StateFill from '@/components/design/StateFill.vue'
import {
  classifyMoneyControlApiError,
  createCashPositionRecurringCost,
  fetchCashPosition,
  fetchMoneyControlLocations,
  fetchMoneyControlOverview,
  fetchRawInventory,
  updateCashPositionRecurringCost,
} from '@/services/moneyControlApi'
import type {
  CashPosition,
  CashPositionMonthlyCostRow,
  DecimalValue,
  ExpenseCategorySummaryRow,
  MoneyControlApiErrorKind,
  MoneyControlIssue,
  MoneyControlLocation,
  MoneyControlOverview,
  RawInventoryResult,
  RawInventoryRow,
  SupplierBalanceSummaryRow,
} from '@/types/moneyControl'

type ViewState = 'idle' | 'ready' | MoneyControlApiErrorKind
type BadgeTone = 'success' | 'warning' | 'error' | 'info' | 'primary' | 'neutral'

interface InventoryTableRow extends RawInventoryRow {
  rowKey: string
}

interface SupplierTableRow extends SupplierBalanceSummaryRow {
  rowKey: string
}

interface ExpenseTableRow extends ExpenseCategorySummaryRow {
  rowKey: string
  sharePercent: number | null
}

const { t } = useI18n({ useScope: 'global' })
const { formatCurrency, formatDate } = useFormatters()
const { notify } = useNotify()

function toLocalDateValue(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

const today = new Date()
const dateFrom = ref(toLocalDateValue(new Date(today.getFullYear(), today.getMonth(), 1)))
const dateTo = ref(toLocalDateValue(today))
const locationId = ref('')
const search = ref('')
const inventoryPage = ref(1)
const inventoryPerPage = ref(20)

const overview = ref<MoneyControlOverview | null>(null)
const cashPosition = ref<CashPosition | null>(null)
const inventory = ref<RawInventoryResult | null>(null)
const locations = ref<MoneyControlLocation[]>([])
const overviewState = ref<ViewState>('idle')
const cashPositionState = ref<ViewState>('idle')
const inventoryState = ref<ViewState>('idle')
const overviewLoading = ref(false)
const cashPositionLoading = ref(false)
const inventoryLoading = ref(false)
const locationsLoading = ref(false)
const locationsError = ref(false)
let overviewRequestId = 0
let cashPositionRequestId = 0
let inventoryRequestId = 0

const rangeInvalid = computed(() => Boolean(dateFrom.value && dateTo.value && dateFrom.value > dateTo.value))

const isRefreshing = computed(() =>
  overviewLoading.value || cashPositionLoading.value || inventoryLoading.value,
)

const integrationUnavailable = computed(() =>
  overviewState.value === 'integration-unavailable'
  && inventoryState.value === 'integration-unavailable',
)

const partiallyUnavailable = computed(() =>
  !integrationUnavailable.value
  && [overviewState.value, inventoryState.value].includes('integration-unavailable'),
)

const quantityFormatter = computed(() => new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 3,
}))

const percentFormatter = computed(() => new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0,
}))

const locationOptions = computed(() => locations.value.map(location => ({
  value: String(location.id),
  label: location.name,
})))

const inventoryRows = computed<InventoryTableRow[]>(() =>
  (inventory.value?.items ?? []).map((row, index) => ({
    ...row,
    rowKey: String(row.stockItem.id ?? `${row.stockItem.code ?? 'material'}-${index}`),
  })),
)

const supplierRows = computed<SupplierTableRow[]>(() =>
  (overview.value?.suppliers.topBalances ?? []).map((row, index) => ({
    ...row,
    rowKey: String(row.supplierId ?? `supplier-${index}`),
  })),
)

const expenseRows = computed<ExpenseTableRow[]>(() => {
  const rows = overview.value?.expenses.byCategory ?? []
  const paidTotal = numeric(overview.value?.expenses.paidUzs)

  return rows.map((row, index) => ({
    ...row,
    rowKey: String(row.categoryId ?? `category-${index}`),
    sharePercent: (paidTotal > 0 && row.paidUzs !== null)
      ? numeric(row.paidUzs) / paidTotal * 100
      : null,
  }))
})

const allIssues = computed<MoneyControlIssue[]>(() => {
  const unique = new Map<string, MoneyControlIssue>()

  const issues = [
    ...(overview.value?.completeness.issues ?? []),
    ...(overview.value?.reconciliation.issues ?? []),
    ...(cashPosition.value?.dataQuality.issues ?? []),
    ...(inventory.value?.completeness.issues ?? []),
    ...(inventory.value?.issues ?? []),
  ]

  issues.forEach((issue, index) => {
    const key = `${issue.code}-${issue.entityType ?? ''}-${issue.entityId ?? ''}-${issue.message ?? index}`

    unique.set(key, issue)
  })

  return [...unique.values()]
})

const inventoryPagination = computed<DataTablePagination>(() => ({
  page: inventoryPage.value,
  perPage: inventoryPerPage.value,
  total: inventory.value?.pagination.total ?? inventoryRows.value.length,
  onPage: (nextPage: number) => {
    inventoryPage.value = nextPage
    loadInventory()
  },
  onPerPage: (nextPerPage: number) => {
    inventoryPerPage.value = nextPerPage
    inventoryPage.value = 1
    loadInventory()
  },
}))

const rawMaterialColumns = computed<DataTableColumn<InventoryTableRow>[]>(() => [
  { key: 'material', label: t('moneyControl.colMaterial'), sortable: true, sortValue: row => row.stockItem.name },
  { key: 'category', label: t('moneyControl.colCategory'), sortable: true, sortValue: row => row.category?.name ?? '' },
  { key: 'quantity', label: t('moneyControl.colOnHand'), align: 'right', sortable: true, sortValue: row => numeric(row.quantity) },
  { key: 'reservedQuantity', label: t('moneyControl.colReserved'), align: 'right', sortable: true, sortValue: row => numeric(row.reservedQuantity) },
  { key: 'availableQuantity', label: t('moneyControl.colAvailable'), align: 'right', sortable: true, sortValue: row => numeric(row.availableQuantity) },
  { key: 'averageCostUzs', label: t('moneyControl.colAverageCost'), align: 'right', sortable: true, sortValue: row => numeric(row.averageCostUzs) },
  { key: 'inventoryValueUzs', label: t('moneyControl.colInventoryValue'), align: 'right', sortable: true, sortValue: row => numeric(row.inventoryValueUzs) },
  { key: 'stockStatus', label: t('moneyControl.colStockStatus') },
  { key: 'preferredSupplier', label: t('moneyControl.colPreferredSupplier') },
])

const supplierColumns = computed<DataTableColumn<SupplierTableRow>[]>(() => [
  { key: 'supplierName', label: t('moneyControl.colSupplier'), sortable: true },
  { key: 'balanceUzs', label: t('moneyControl.colSupplierBalance'), align: 'right', sortable: true, sortValue: row => numeric(row.balanceUzs) },
])

const expenseColumns = computed<DataTableColumn<ExpenseTableRow>[]>(() => [
  { key: 'categoryName', label: t('moneyControl.colCategory'), sortable: true },
  { key: 'paidUzs', label: t('moneyControl.colAmount'), align: 'right', sortable: true, sortValue: row => numeric(row.paidUzs) },
  { key: 'sharePercent', label: t('moneyControl.colShare'), align: 'right', sortable: true },
])

const summaryCards = computed(() => {
  const data = overview.value
  if (!data)
    return []

  return [
    {
      id: 'drawer',
      label: t('moneyControl.drawerAwaiting'),
      sub: t('moneyControl.drawerAwaitingSub'),
      value: data.treasury.drawerUnreconciledUzs,
      icon: 'register',
      tone: 'warning',
    },
    {
      id: 'safe',
      label: t('moneyControl.safeBalance'),
      sub: t('moneyControl.safeBalanceSub'),
      value: data.treasury.safeUzs,
      icon: 'lock',
      tone: 'success',
    },
    {
      id: 'bank',
      label: t('moneyControl.bankBalance'),
      sub: t('moneyControl.bankBalanceSub'),
      value: data.treasury.bankUzs,
      icon: 'wallet',
      tone: 'primary',
    },
    {
      id: 'suppliers',
      label: t('moneyControl.supplierPayable'),
      sub: t('moneyControl.supplierPayableSub'),
      value: data.suppliers.payableUzs,
      icon: 'building',
      tone: numeric(data.suppliers.overduePayableUzs) > 0 ? 'error' : 'warning',
    },
    {
      id: 'inventory',
      label: t('moneyControl.rawInventoryValue'),
      sub: data.inventory.rawItemCount === null
        ? t('moneyControl.rawInventoryValueSub')
        : `${t('moneyControl.rawInventoryValueSub')} · ${t('moneyControl.itemsCount', { count: data.inventory.rawItemCount })}`,
      value: data.inventory.rawMaterialValueUzs,
      icon: 'package',
      tone: data.inventory.outOfStockCount ? 'warning' : 'info',
    },
    {
      id: 'expenses',
      label: t('moneyControl.periodExpenses'),
      sub: t('moneyControl.periodExpensesSub'),
      value: data.expenses.paidUzs,
      icon: 'receipt',
      tone: 'error',
    },
    {
      id: 'working-capital',
      label: t('moneyControl.workingCapital'),
      sub: t('moneyControl.workingCapitalSub'),
      value: data.workingCapital.amountUzs,
      icon: 'trend',
      tone: numeric(data.workingCapital.amountUzs) < 0 ? 'error' : 'success',
    },
  ] as Array<{
    id: string
    label: string
    sub: string
    value: DecimalValue | null
    icon: string
    tone: BadgeTone
  }>
})

const quickActions = computed(() => [
  { to: '/stock/items?type=RAW', label: t('moneyControl.openRawMaterials'), icon: 'box' },
  { to: '/stock/suppliers', label: t('moneyControl.openSuppliers'), icon: 'building' },
  { to: '/stock/receiving', label: t('moneyControl.receiveGoods'), icon: 'inbox' },
  { to: '/stock/levels?item_type=RAW', label: t('moneyControl.openStockLevels'), icon: 'bars' },
  { to: '/treasury', label: t('moneyControl.openTreasury'), icon: 'wallet' },
  { to: '/hr-expenses', label: t('moneyControl.openExpenses'), icon: 'receipt' },
])

const recurringGroupOptions = computed(() => [
  { value: 'RENT', label: t('moneyControl.costGroupRent') },
  { value: 'UTILITIES', label: t('moneyControl.costGroupUtilities') },
  { value: 'OPERATING', label: t('moneyControl.costGroupOperating') },
  { value: 'TAXES', label: t('moneyControl.costGroupTaxes') },
])

interface RecurringCostForm {
  name: string
  reportingGroup: string
  monthlyAmount: number | null
}

const costModalOpen = ref(false)
const editingCost = ref<CashPositionMonthlyCostRow | null>(null)
const costSaving = ref(false)
const costFormError = ref('')

const costForm = ref<RecurringCostForm>({
  name: '',
  reportingGroup: 'RENT',
  monthlyAmount: null,
})

function openCreateCost() {
  editingCost.value = null
  costForm.value = {
    name: '',
    reportingGroup: 'RENT',
    monthlyAmount: null,
  }
  costFormError.value = ''
  costModalOpen.value = true
}

function openEditCost(row: CashPositionMonthlyCostRow) {
  if (row.recurringCostId === null)
    return
  editingCost.value = row
  costForm.value = {
    name: row.name,
    reportingGroup: row.reportingGroup,
    monthlyAmount: numeric(row.monthlyBaselineUzs),
  }
  costFormError.value = ''
  costModalOpen.value = true
}

function closeCostModal() {
  if (costSaving.value)
    return
  costModalOpen.value = false
}

function cashPositionTone(status: string | null | undefined): BadgeTone {
  if (status === 'ESTIMATED')
    return 'success'
  if (status === 'REVIEW_REQUIRED')
    return 'warning'
  if (status === 'UNAVAILABLE')
    return 'error'

  return 'neutral'
}

function cashPositionLabel(status: string | null | undefined): string {
  if (status === 'ESTIMATED')
    return t('moneyControl.positionStatusEstimated')
  if (status === 'REVIEW_REQUIRED')
    return t('moneyControl.positionStatusReview')
  if (status === 'UNAVAILABLE')
    return t('moneyControl.positionStatusUnavailable')

  return t('moneyControl.statusUnknown')
}

function supplierEvidenceLabel(status: string): string {
  if (status === 'VERIFIED')
    return t('moneyControl.debtVerified')
  if (status === 'OPENING_BALANCE_REVIEW_REQUIRED')
    return t('moneyControl.openingDebtReview')
  if (status === 'LEDGER_RECONCILIATION_REQUIRED')
    return t('moneyControl.debtReconcile')

  return t('moneyControl.statusUnknown')
}

function supplierEvidenceTone(status: string): BadgeTone {
  return status === 'VERIFIED' ? 'success' : status === 'UNSUPPORTED_CURRENCY' ? 'error' : 'warning'
}

function costBasisLabel(basis: string): string {
  return basis === 'PREVIOUS_MONTH_ACTUAL'
    ? t('moneyControl.costBasisPreviousMonth')
    : t('moneyControl.costBasisFixed')
}

function costErrorMessage(error: any): string {
  const body = error?.response?.data

  const errors = (body?.errors && typeof body.errors === 'object')
    ? Object.values(body.errors).flat().filter(Boolean).join(' ')
    : ''

  return String(errors || body?.message || t('moneyControl.costSaveError'))
}

async function saveRecurringCost() {
  const name = costForm.value.name.trim()
  const amount = Number(costForm.value.monthlyAmount)
  if (!name) {
    costFormError.value = t('moneyControl.costNameRequired')

    return
  }
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    costFormError.value = t('moneyControl.costAmountRequired')

    return
  }

  costSaving.value = true
  costFormError.value = ''
  try {
    const payload = {
      name,
      reporting_group: costForm.value.reportingGroup,
      monthly_amount: amount,
    }

    const recurringCostId = editingCost.value?.recurringCostId

    if (recurringCostId !== null && recurringCostId !== undefined)
      await updateCashPositionRecurringCost(recurringCostId, payload)
    else
      await createCashPositionRecurringCost(payload)

    costModalOpen.value = false
    notify(t('moneyControl.costSaved'))
    await loadCashPosition()
  }
  catch (error: any) {
    costFormError.value = costErrorMessage(error)
  }
  finally {
    costSaving.value = false
  }
}

function numeric(value: DecimalValue | null | undefined): number {
  const number = Number(value)

  return Number.isFinite(number) ? number : 0
}

function displayMoney(value: DecimalValue | null | undefined): string {
  if (value === null || value === undefined || value === '')
    return '—'

  return formatCurrency(value)
}

function displayQuantity(value: DecimalValue | null | undefined): string {
  if (value === null || value === undefined || value === '')
    return '—'

  return quantityFormatter.value.format(numeric(value))
}

function displayPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value))
    return '—'

  return `${percentFormatter.value.format(value)}%`
}

function materialStatus(row: RawInventoryRow): { text: string; tone: BadgeTone } {
  if (row.availableQuantity === null)
    return { text: t('moneyControl.statusUnknown'), tone: 'neutral' }
  if (row.isOutOfStock === true || numeric(row.availableQuantity) <= 0)
    return { text: t('moneyControl.statusOut'), tone: 'error' }
  if (row.isLowStock === true)
    return { text: t('moneyControl.statusLow'), tone: 'warning' }

  return { text: t('moneyControl.statusHealthy'), tone: 'success' }
}

function statusLabel(status: string | null | undefined): string {
  switch (String(status ?? '').toUpperCase()) {
    case 'COMPLETE': return t('moneyControl.statusComplete')
    case 'BALANCED': return t('moneyControl.statusBalanced')
    case 'PARTIAL': return t('moneyControl.statusPartial')
    case 'WARNING': return t('moneyControl.statusWarning')
    case 'UNSAFE': return t('moneyControl.statusUnsafe')
    case 'INCOMPLETE': return t('moneyControl.statusIncomplete')
    default: return t('moneyControl.statusUnknown')
  }
}

function statusTone(status: string | null | undefined): BadgeTone {
  switch (String(status ?? '').toUpperCase()) {
    case 'COMPLETE':
    case 'BALANCED': return 'success'
    case 'PARTIAL':
    case 'WARNING': return 'warning'
    case 'UNSAFE':
    case 'INCOMPLETE': return 'error'
    default: return 'neutral'
  }
}

function issueTone(issue: MoneyControlIssue): BadgeTone {
  const severity = issue.severity.toUpperCase()
  if (['ERROR', 'CRITICAL'].includes(severity))
    return 'error'
  if (severity === 'INFO')
    return 'info'

  return 'warning'
}

function issueText(issue: MoneyControlIssue): string {
  return issue.message || issue.title || issue.code
}

function stateTitle(state: ViewState): string {
  if (state === 'integration-unavailable')
    return t('moneyControl.integrationTitle')
  if (state === 'forbidden')
    return t('moneyControl.forbiddenTitle')

  return t('moneyControl.loadErrorTitle')
}

function stateBody(state: ViewState): string {
  if (state === 'integration-unavailable')
    return t('moneyControl.integrationBody')
  if (state === 'forbidden')
    return t('moneyControl.forbiddenBody')

  return t('moneyControl.loadErrorBody')
}

async function loadCashPosition() {
  const requestId = ++cashPositionRequestId

  cashPositionLoading.value = true
  try {
    const result = await fetchCashPosition()

    if (requestId === cashPositionRequestId) {
      cashPosition.value = result
      cashPositionState.value = 'ready'
    }
  }
  catch (error: unknown) {
    if (requestId === cashPositionRequestId) {
      cashPosition.value = null
      cashPositionState.value = classifyMoneyControlApiError(error).kind
    }
  }
  finally {
    if (requestId === cashPositionRequestId)
      cashPositionLoading.value = false
  }
}

async function loadOverview() {
  if (rangeInvalid.value) {
    overviewRequestId += 1
    overviewLoading.value = false

    return
  }

  const requestId = ++overviewRequestId

  overviewLoading.value = true
  overview.value = null
  try {
    const result = await fetchMoneyControlOverview({
      date_from: dateFrom.value || undefined,
      date_to: dateTo.value || undefined,
      location_id: locationId.value || undefined,
    })

    if (requestId === overviewRequestId) {
      overview.value = result
      overviewState.value = 'ready'
    }
  }
  catch (error: unknown) {
    if (requestId === overviewRequestId)
      overviewState.value = classifyMoneyControlApiError(error).kind
  }
  finally {
    if (requestId === overviewRequestId)
      overviewLoading.value = false
  }
}

async function loadInventory() {
  const requestId = ++inventoryRequestId

  inventoryLoading.value = true
  inventory.value = null
  try {
    const result = await fetchRawInventory({
      location_id: locationId.value || undefined,
      search: search.value.trim() || undefined,
      page: inventoryPage.value,
      per_page: inventoryPerPage.value,
    })

    if (requestId === inventoryRequestId) {
      inventory.value = result
      inventoryState.value = 'ready'
    }
  }
  catch (error: unknown) {
    if (requestId === inventoryRequestId)
      inventoryState.value = classifyMoneyControlApiError(error).kind
  }
  finally {
    if (requestId === inventoryRequestId)
      inventoryLoading.value = false
  }
}

async function loadLocations() {
  locationsLoading.value = true
  locationsError.value = false
  try {
    locations.value = await fetchMoneyControlLocations()
  }
  catch {
    locations.value = []
    locationsError.value = true
  }
  finally {
    locationsLoading.value = false
  }
}

async function refreshAll() {
  if (rangeInvalid.value) {
    overviewRequestId += 1
    inventoryRequestId += 1
    overviewLoading.value = false
    inventoryLoading.value = false
    overview.value = null
    inventory.value = null
    overviewState.value = 'idle'
    inventoryState.value = 'idle'

    return
  }

  inventoryPage.value = 1
  await Promise.all([loadCashPosition(), loadOverview(), loadInventory()])
}

const searchInventory = useDebounceFn(() => {
  inventoryPage.value = 1
  loadInventory()
}, 350)

watch(search, searchInventory)

onMounted(() => {
  loadLocations()
  refreshAll()
})
</script>

<template>
  <WorkspacePage class="page money-control-page">
    <PageHeader
      :title="t('Money Control')"
      :subtitle="t('moneyControl.subtitle')"
    >
      <template #actions>
        <Button
          variant="secondary"
          icon="refresh"
          :loading="isRefreshing"
          :disabled="rangeInvalid"
          @click="refreshAll"
        >
          {{ t('moneyControl.refresh') }}
        </Button>
      </template>
    </PageHeader>

    <Card class-name="control-card">
      <WorkspaceToolbar class="toolbar money-control-filters">
        <Field :label="t('moneyControl.dateFrom')">
          <Input
            v-model="dateFrom"
            type="date"
            :max="dateTo || undefined"
            @change="refreshAll"
          />
        </Field>
        <Field
          :label="t('moneyControl.dateTo')"
          :error="rangeInvalid ? t('moneyControl.invalidRange') : ''"
        >
          <Input
            v-model="dateTo"
            type="date"
            :min="dateFrom || undefined"
            :error="rangeInvalid"
            @change="refreshAll"
          />
        </Field>
        <Field :label="t('Location')">
          <Select
            v-model="locationId"
            :options="locationOptions"
            :placeholder="t('moneyControl.allLocations')"
            :disabled="locationsLoading"
            @change="refreshAll"
          />
        </Field>
        <div class="money-control-filter-meta">
          <span v-if="overview?.asOf || inventory?.summary.asOf">
            {{ t('moneyControl.lastUpdated') }}:
            <strong>{{ formatDate(overview?.asOf || inventory?.summary.asOf || '') }}</strong>
          </span>
          <span v-else>{{ t('moneyControl.liveSource') }}</span>
          <span
            v-if="locationsError"
            class="filter-warning"
            role="status"
          >{{ t('moneyControl.locationLoadFailed') }}</span>
        </div>
      </WorkspaceToolbar>
    </Card>

    <Card
      v-if="rangeInvalid"
      class-name="endpoint-state-card"
    >
      <StateFill
        icon="calendar"
        :title="t('moneyControl.invalidRange')"
        :sub="t('moneyControl.invalidRangeBody')"
        error
      />
    </Card>

    <Card
      v-else-if="integrationUnavailable"
      class-name="endpoint-state-card"
    >
      <StateFill
        icon="gear"
        :title="t('moneyControl.integrationTitle')"
        :sub="t('moneyControl.integrationBody')"
      >
        <template #action>
          <Button
            variant="secondary"
            icon="retry"
            :loading="isRefreshing"
            @click="refreshAll"
          >
            {{ t('moneyControl.retry') }}
          </Button>
        </template>
      </StateFill>
    </Card>

    <div
      v-else-if="partiallyUnavailable"
      class="partial-data-notice"
      role="status"
    >
      <DesignIcon
        name="alert"
        :size="18"
      />
      <div>
        <strong>{{ t('moneyControl.partialDataTitle') }}</strong>
        <span>{{ t('moneyControl.partialDataBody') }}</span>
      </div>
    </div>

    <Card
      v-if="cashPositionLoading && !cashPosition"
      class-name="cash-position-card"
    >
      <div class="card__head between">
        <div class="card__head-text">
          <Skeleton
            w="220px"
            :h="22"
          />
          <Skeleton
            w="360px"
            :h="13"
            style="margin-top: var(--sp-2);"
          />
        </div>
      </div>
      <div class="card__body position-loading-grid">
        <Skeleton
          v-for="index in 3"
          :key="index"
          w="100%"
          :h="92"
          :r="12"
        />
      </div>
    </Card>

    <Card
      v-else-if="cashPosition"
      class-name="cash-position-card"
      :aria-busy="cashPositionLoading"
    >
      <div class="card__head between cash-position-head">
        <div class="card__head-text">
          <h2 class="card__title">
            {{ t('moneyControl.positionTitle') }}
          </h2>
          <div
            v-if="cashPosition.calculation.asOfDate"
            class="card__sub"
          >
            {{ t('moneyControl.positionSubtitle', {
              day: cashPosition.calculation.elapsedDays,
              date: formatDate(cashPosition.calculation.asOfDate),
            }) }}
          </div>
        </div>
        <Badge
          :tone="cashPositionTone(cashPosition.status)"
          dot
        >
          {{ cashPositionLabel(cashPosition.status) }}
        </Badge>
      </div>
      <div class="card__divider" />

      <div class="card__body cash-position-body">
        <div class="position-funds-grid">
          <div class="position-fund-card">
            <div class="position-fund-card__label">
              <DesignIcon
                name="lock"
                :size="18"
              />
              {{ t('moneyControl.positionCash') }}
            </div>
            <strong class="num-tabular">{{ displayMoney(cashPosition.funds.safeUzs) }}</strong>
          </div>
          <div class="position-fund-card">
            <div class="position-fund-card__label">
              <DesignIcon
                name="wallet"
                :size="18"
              />
              {{ t('moneyControl.positionBank') }}
            </div>
            <strong class="num-tabular">{{ displayMoney(cashPosition.funds.bankUzs) }}</strong>
          </div>
          <div class="position-fund-card is-total">
            <div class="position-fund-card__label">
              <DesignIcon
                name="coins"
                :size="18"
              />
              {{ t('moneyControl.positionFundsTotal') }}
            </div>
            <strong class="num-tabular">{{ displayMoney(cashPosition.funds.totalUzs) }}</strong>
          </div>
        </div>

        <div
          v-if="cashPosition.supplierDebts.reviewRequiredCount > 0"
          class="position-trust-note"
          role="alert"
        >
          <DesignIcon
            name="alert"
            :size="19"
          />
          <div>
            <strong>{{ t('moneyControl.positionDebtReviewTitle') }}</strong>
            <span>{{ t('moneyControl.positionDebtReviewBody') }}</span>
          </div>
        </div>

        <div class="position-flow">
          <section class="position-step">
            <div class="position-step__head">
              <div>
                <span class="position-step__index">1</span>
                <div>
                  <h3>{{ t('moneyControl.positionSupplierDebts') }}</h3>
                  <p>{{ t('moneyControl.positionSupplierDebtsSub') }}</p>
                </div>
              </div>
              <strong class="position-deduction num-tabular">
                − {{ displayMoney(cashPosition.supplierDebts.totalUzs) }}
              </strong>
            </div>

            <div
              v-if="cashPosition.supplierDebts.rows.length"
              class="position-detail-list"
            >
              <div
                v-for="supplier in cashPosition.supplierDebts.rows"
                :key="String(supplier.supplierId)"
                class="position-detail-row"
              >
                <div class="position-detail-row__main">
                  <RouterLink
                    v-if="supplier.supplierId !== null"
                    :to="`/stock/suppliers/${supplier.supplierId}`"
                    class="table-link"
                  >
                    {{ supplier.supplierName }}
                  </RouterLink>
                  <strong v-else>{{ supplier.supplierName }}</strong>
                  <Badge :tone="supplierEvidenceTone(supplier.evidenceStatus)">
                    {{ supplierEvidenceLabel(supplier.evidenceStatus) }}
                  </Badge>
                </div>
                <strong class="num-tabular">{{ displayMoney(supplier.amountUzs) }}</strong>
              </div>
            </div>
            <div
              v-else
              class="position-empty-row"
            >
              <DesignIcon
                name="checkcircle"
                :size="18"
              />
              {{ t('moneyControl.positionNoSupplierDebt') }}
            </div>

            <div class="position-net-row">
              <span>{{ t('moneyControl.positionAfterSuppliers') }}</span>
              <strong class="num-tabular">{{ displayMoney(cashPosition.positions.afterSuppliersUzs) }}</strong>
            </div>
          </section>

          <section class="position-step">
            <div class="position-step__head">
              <div>
                <span class="position-step__index">2</span>
                <div>
                  <h3>{{ t('moneyControl.positionPayroll') }}</h3>
                  <p v-if="cashPosition.payroll.elapsedDays">
                    {{ t('moneyControl.positionPayrollSub', {
                      day: cashPosition.payroll.elapsedDays,
                      employees: cashPosition.payroll.employeeCount,
                    }) }}
                  </p>
                </div>
              </div>
              <strong class="position-deduction num-tabular">
                − {{ displayMoney(cashPosition.payroll.dueEstimateUzs) }}
              </strong>
            </div>
            <div class="position-mini-metrics">
              <div>
                <span>{{ t('moneyControl.positionMonthlyPayroll') }}</span>
                <strong class="num-tabular">{{ displayMoney(cashPosition.payroll.monthlyBaselineUzs) }}</strong>
              </div>
              <div>
                <span>{{ t('moneyControl.positionPayrollAccrued') }}</span>
                <strong class="num-tabular">{{ displayMoney(cashPosition.payroll.accruedEstimateUzs) }}</strong>
              </div>
              <div>
                <span>{{ t('moneyControl.positionPayrollPaid') }}</span>
                <strong class="num-tabular">{{ displayMoney(cashPosition.payroll.paidCurrentPeriodUzs) }}</strong>
              </div>
            </div>
            <div class="position-net-row">
              <span>{{ t('moneyControl.positionAfterPayroll') }}</span>
              <strong class="num-tabular">{{ displayMoney(cashPosition.positions.afterPayrollUzs) }}</strong>
            </div>
          </section>

          <section class="position-step">
            <div class="position-step__head position-cost-head">
              <div>
                <span class="position-step__index">3</span>
                <div>
                  <h3>{{ t('moneyControl.positionMonthlyCosts') }}</h3>
                  <p>{{ t('moneyControl.positionMonthlyCostsSub') }}</p>
                </div>
              </div>
              <div class="position-cost-actions">
                <strong class="position-deduction num-tabular">
                  − {{ displayMoney(cashPosition.monthlyCosts.dueEstimateUzs) }}
                </strong>
                <Button
                  v-if="cashPosition.canManageRecurringCosts"
                  size="sm"
                  variant="secondary"
                  icon="plus"
                  @click="openCreateCost"
                >
                  {{ t('moneyControl.addMonthlyCost') }}
                </Button>
              </div>
            </div>

            <div
              v-if="cashPosition.monthlyCosts.rows.length"
              class="position-detail-list position-cost-list"
            >
              <div
                v-for="cost in cashPosition.monthlyCosts.rows"
                :key="cost.rowKey"
                class="position-detail-row position-cost-row"
              >
                <div class="position-detail-row__main">
                  <strong>{{ cost.name }}</strong>
                  <Badge :tone="cost.basis === 'PREVIOUS_MONTH_ACTUAL' ? 'info' : 'neutral'">
                    {{ costBasisLabel(cost.basis) }}
                  </Badge>
                  <span class="position-formula num-tabular">
                    {{ displayMoney(cost.monthlyBaselineUzs) }} ÷ {{ cost.divisorDays }} × {{ cost.elapsedDays }}
                  </span>
                </div>
                <div class="position-cost-row__amount">
                  <strong class="num-tabular">{{ displayMoney(cost.accruedEstimateUzs) }}</strong>
                  <Button
                    v-if="cashPosition.canManageRecurringCosts && cost.recurringCostId !== null"
                    size="sm"
                    variant="ghost"
                    icon="edit"
                    :aria-label="t('moneyControl.editMonthlyCost')"
                    @click="openEditCost(cost)"
                  >
                    {{ t('moneyControl.edit') }}
                  </Button>
                </div>
              </div>
            </div>
            <div
              v-else
              class="position-empty-row"
            >
              <DesignIcon
                name="info"
                :size="18"
              />
              {{ t('moneyControl.positionNoMonthlyCosts') }}
            </div>
            <div
              v-if="numeric(cashPosition.monthlyCosts.paidCurrentPeriodUzs) > 0"
              class="position-paid-note"
            >
              <DesignIcon
                name="checkcircle"
                :size="18"
              />
              <span>{{ t('moneyControl.positionCostsPaid') }}</span>
              <strong class="num-tabular">
                {{ displayMoney(cashPosition.monthlyCosts.paidCurrentPeriodUzs) }}
              </strong>
            </div>
          </section>

          <div
            class="position-final"
            :class="{ 'is-negative': numeric(cashPosition.positions.finalUzs) < 0 }"
          >
            <div>
              <span>{{ t('moneyControl.positionFinal') }}</span>
              <small>{{ t('moneyControl.positionFinalSub') }}</small>
            </div>
            <strong class="num-tabular">{{ displayMoney(cashPosition.positions.finalUzs) }}</strong>
          </div>
        </div>
      </div>
    </Card>

    <Card
      v-else-if="cashPositionState !== 'idle'"
      class-name="cash-position-card"
    >
      <StateFill
        :icon="cashPositionState === 'integration-unavailable' ? 'gear' : 'alert'"
        :title="t('moneyControl.positionLoadErrorTitle')"
        :sub="t('moneyControl.positionLoadErrorBody')"
        :error="cashPositionState !== 'integration-unavailable'"
      >
        <template #action>
          <Button
            variant="secondary"
            icon="retry"
            @click="loadCashPosition"
          >
            {{ t('moneyControl.retry') }}
          </Button>
        </template>
      </StateFill>
    </Card>

    <section
      v-if="overviewLoading || overviewState === 'ready'"
      class="money-control-summary"
      :aria-busy="overviewLoading"
    >
      <div
        v-if="overviewLoading"
        class="money-kpi-grid"
      >
        <div
          v-for="index in 7"
          :key="index"
          class="kpi-card"
        >
          <div class="kpi-card__top">
            <Skeleton
              :w="38"
              :h="38"
              :r="8"
            />
            <Skeleton
              w="55%"
              :h="14"
            />
          </div>
          <Skeleton
            w="72%"
            :h="30"
          />
          <Skeleton
            w="62%"
            :h="12"
            style="margin-top: var(--sp-3);"
          />
        </div>
      </div>

      <div
        v-else
        class="money-kpi-grid"
      >
        <div
          v-for="card in summaryCards"
          :key="card.id"
          class="kpi-card"
        >
          <div class="kpi-card__top">
            <div
              class="kpi-card__icon"
              :class="`t-${card.tone}`"
            >
              <DesignIcon
                :name="card.icon"
                :size="20"
              />
            </div>
            <div class="kpi-card__label">
              {{ card.label }}
            </div>
          </div>
          <div class="kpi-card__value num-tabular">
            {{ displayMoney(card.value) }}<span
              v-if="card.value !== null"
              class="kpi-card__unit"
            >{{ t('moneyControl.currencyUzs') }}</span>
          </div>
          <div class="kpi-card__sub">
            {{ card.sub }}
          </div>
        </div>
      </div>
    </section>

    <Card
      v-else-if="overviewState !== 'idle' && !integrationUnavailable"
      class-name="endpoint-state-card"
    >
      <StateFill
        :icon="overviewState === 'integration-unavailable' ? 'gear' : 'alert'"
        :title="stateTitle(overviewState)"
        :sub="stateBody(overviewState)"
        :error="overviewState !== 'integration-unavailable'"
      >
        <template #action>
          <Button
            variant="secondary"
            icon="retry"
            @click="loadOverview"
          >
            {{ t('moneyControl.retry') }}
          </Button>
        </template>
      </StateFill>
    </Card>

    <div
      v-if="overview || inventory"
      class="money-control-detail-grid"
    >
      <Card class-name="detail-card reconciliation-card">
        <div class="card__head between">
          <div class="card__head-text">
            <h2 class="card__title">
              {{ t('moneyControl.reconciliationTitle') }}
            </h2>
            <div class="card__sub">
              {{ t('moneyControl.reconciliationSubtitle') }}
            </div>
          </div>
        </div>
        <div class="card__body reconciliation-body">
          <div class="reconciliation-statuses">
            <div v-if="overview">
              <span>{{ t('moneyControl.dataCompleteness') }}</span>
              <Badge
                :tone="statusTone(overview.completeness.status)"
                dot
              >
                {{ statusLabel(overview.completeness.status) }}
              </Badge>
            </div>
            <div v-if="overview">
              <span>{{ t('moneyControl.reconciliationTitle') }}</span>
              <Badge
                :tone="statusTone(overview.reconciliation.status)"
                dot
              >
                {{ statusLabel(overview.reconciliation.status) }}
              </Badge>
            </div>
            <div v-if="inventory">
              <span>{{ t('moneyControl.inventoryCompleteness') }}</span>
              <Badge
                :tone="statusTone(inventory.completeness.status)"
                dot
              >
                {{ statusLabel(inventory.completeness.status) }}
              </Badge>
            </div>
          </div>

          <div class="issue-list">
            <h3>{{ t('moneyControl.issueTitle') }}</h3>
            <div
              v-if="allIssues.length === 0"
              class="no-issues"
            >
              <DesignIcon
                name="checkcircle"
                :size="18"
              />
              {{ t('moneyControl.noIssues') }}
            </div>
            <div
              v-for="issue in allIssues"
              v-else
              :key="`${issue.code}-${issue.entityId ?? ''}`"
              class="issue-row"
            >
              <Badge :tone="issueTone(issue)">
                {{ issue.code }}
              </Badge>
              <span>{{ issueText(issue) }}</span>
              <strong
                v-if="issue.amountUzs !== null"
                class="num-tabular"
              >{{ displayMoney(issue.amountUzs) }} {{ t('moneyControl.currencyUzs') }}</strong>
            </div>
          </div>
        </div>
      </Card>

      <Card class-name="detail-card quick-actions-card">
        <div class="card__head">
          <div class="card__head-text">
            <h2 class="card__title">
              {{ t('moneyControl.quickActions') }}
            </h2>
          </div>
        </div>
        <div class="card__body quick-actions-grid">
          <RouterLink
            v-for="action in quickActions"
            :key="action.to"
            :to="action.to"
            class="quick-action"
          >
            <DesignIcon
              :name="action.icon"
              :size="18"
            />
            <span>{{ action.label }}</span>
            <DesignIcon
              name="chevright"
              :size="16"
            />
          </RouterLink>
        </div>
      </Card>
    </div>

    <Card
      v-if="!rangeInvalid && !integrationUnavailable"
      class-name="raw-materials-card"
    >
      <div class="card__head between raw-materials-head">
        <div class="card__head-text">
          <h2 class="card__title">
            {{ t('moneyControl.rawMaterialsTitle') }}
          </h2>
          <div class="card__sub">
            {{ t('moneyControl.rawMaterialsSubtitle') }}
          </div>
        </div>
        <div
          v-if="inventory?.summary"
          class="valuation-meta"
        >
          {{ t('moneyControl.valuationNote', {
            method: inventory.summary.valuationMethod || t('moneyControl.notAvailable'),
            asOf: inventory.summary.asOf ? formatDate(inventory.summary.asOf) : t('moneyControl.notAvailable'),
          }) }}
        </div>
      </div>

      <WorkspaceToolbar class="toolbar raw-materials-toolbar">
        <Input
          v-model="search"
          icon="search"
          :placeholder="t('moneyControl.searchMaterials')"
          :aria-label="t('moneyControl.searchMaterials')"
        />
      </WorkspaceToolbar>
      <div class="card__divider" />

      <DataTable
        v-if="inventoryLoading || inventoryState === 'ready'"
        :columns="rawMaterialColumns"
        :rows="inventoryRows"
        row-key="rowKey"
        :loading="inventoryLoading"
        :pagination="inventoryPagination"
        :per-page-options="[10, 20, 50, 100]"
        :empty-title="t('moneyControl.noMaterialsTitle')"
        :empty-sub="t('moneyControl.noMaterialsBody')"
        empty-icon="package"
      >
        <template #cell.material="{ row }">
          <div class="primary-cell">
            <RouterLink
              v-if="row.stockItem.id !== null"
              :to="`/stock/items/${row.stockItem.id}`"
              class="table-link"
            >
              {{ row.stockItem.name || t('moneyControl.notAvailable') }}
            </RouterLink>
            <strong v-else>{{ row.stockItem.name || t('moneyControl.notAvailable') }}</strong>
            <span>{{ row.stockItem.code || '—' }}</span>
          </div>
        </template>
        <template #cell.category="{ row }">
          <span :class="{ 'cell-muted': !row.category?.name }">
            {{ row.category?.name || '—' }}
          </span>
        </template>
        <template #cell.quantity="{ row }">
          <span class="num-tabular">{{ displayQuantity(row.quantity) }} {{ row.baseUnit?.code || row.baseUnit?.name || '' }}</span>
        </template>
        <template #cell.reservedQuantity="{ row }">
          <span class="num-tabular">{{ displayQuantity(row.reservedQuantity) }}</span>
        </template>
        <template #cell.availableQuantity="{ row }">
          <strong class="num-tabular">{{ displayQuantity(row.availableQuantity) }}</strong>
        </template>
        <template #cell.averageCostUzs="{ row }">
          <span class="num-tabular">{{ displayMoney(row.averageCostUzs) }}</span>
        </template>
        <template #cell.inventoryValueUzs="{ row }">
          <strong class="num-tabular">{{ displayMoney(row.inventoryValueUzs) }}</strong>
        </template>
        <template #cell.stockStatus="{ row }">
          <Badge
            :tone="materialStatus(row).tone"
            dot
          >
            {{ materialStatus(row).text }}
          </Badge>
        </template>
        <template #cell.preferredSupplier="{ row }">
          <div
            v-if="row.preferredSupplier"
            class="primary-cell"
          >
            <RouterLink
              v-if="row.preferredSupplier.supplierId !== null"
              :to="`/stock/suppliers/${row.preferredSupplier.supplierId}`"
              class="table-link"
            >
              {{ row.preferredSupplier.supplierName }}
            </RouterLink>
            <strong v-else>{{ row.preferredSupplier.supplierName }}</strong>
            <span class="num-tabular">
              {{ t('moneyControl.colSupplierBalance') }}: {{ displayMoney(row.preferredSupplier.currentBalanceUzs) }}
            </span>
          </div>
          <span
            v-else
            class="cell-muted"
          >{{ t('moneyControl.unassignedSupplier') }}</span>
        </template>
      </DataTable>

      <StateFill
        v-else
        :icon="inventoryState === 'integration-unavailable' ? 'gear' : 'alert'"
        :title="stateTitle(inventoryState)"
        :sub="stateBody(inventoryState)"
        :error="inventoryState !== 'integration-unavailable'"
      >
        <template #action>
          <Button
            variant="secondary"
            icon="retry"
            @click="loadInventory"
          >
            {{ t('moneyControl.retry') }}
          </Button>
        </template>
      </StateFill>
    </Card>

    <div
      v-if="overview"
      class="money-control-table-grid"
    >
      <Card class-name="summary-table-card">
        <div class="card__head">
          <div class="card__head-text">
            <h2 class="card__title">
              {{ t('moneyControl.suppliersTitle') }}
            </h2>
            <div class="card__sub">
              {{ t('moneyControl.suppliersSubtitle') }}
            </div>
          </div>
        </div>
        <div class="card__divider" />
        <DataTable
          :columns="supplierColumns"
          :rows="supplierRows"
          row-key="rowKey"
          :per-page="5"
          :empty-title="t('moneyControl.noSuppliersTitle')"
          :empty-sub="t('moneyControl.noSuppliersBody')"
          empty-icon="building"
        >
          <template #cell.supplierName="{ row }">
            <RouterLink
              v-if="row.supplierId !== null"
              :to="`/stock/suppliers/${row.supplierId}`"
              class="table-link"
            >
              {{ row.supplierName }}
            </RouterLink>
            <strong v-else>{{ row.supplierName }}</strong>
          </template>
          <template #cell.balanceUzs="{ row }">
            <strong class="num-tabular">{{ displayMoney(row.balanceUzs) }}</strong>
          </template>
        </DataTable>
      </Card>

      <Card class-name="summary-table-card">
        <div class="card__head">
          <div class="card__head-text">
            <h2 class="card__title">
              {{ t('moneyControl.expenseCategoriesTitle') }}
            </h2>
            <div class="card__sub">
              {{ t('moneyControl.expenseCategoriesSubtitle') }}
            </div>
          </div>
        </div>
        <div class="card__divider" />
        <DataTable
          :columns="expenseColumns"
          :rows="expenseRows"
          row-key="rowKey"
          :per-page="5"
          :empty-title="t('moneyControl.noExpensesTitle')"
          :empty-sub="t('moneyControl.noExpensesBody')"
          empty-icon="receipt"
        >
          <template #cell.categoryName="{ row }">
            <strong>{{ row.categoryName }}</strong>
            <div class="cell-muted">
              {{ t('moneyControl.transactionsCount', { count: row.transactionCount ?? 0 }) }}
            </div>
          </template>
          <template #cell.paidUzs="{ row }">
            <strong class="num-tabular">{{ displayMoney(row.paidUzs) }}</strong>
          </template>
          <template #cell.sharePercent="{ row }">
            <span class="num-tabular">{{ displayPercent(row.sharePercent) }}</span>
          </template>
        </DataTable>
      </Card>
    </div>

    <Card
      v-if="integrationUnavailable"
      class-name="quick-actions-card standalone-quick-actions"
    >
      <div class="card__head">
        <div class="card__head-text">
          <h2 class="card__title">
            {{ t('moneyControl.quickActions') }}
          </h2>
        </div>
      </div>
      <div class="card__body quick-actions-grid">
        <RouterLink
          v-for="action in quickActions"
          :key="action.to"
          :to="action.to"
          class="quick-action"
        >
          <DesignIcon
            :name="action.icon"
            :size="18"
          />
          <span>{{ action.label }}</span>
          <DesignIcon
            name="chevright"
            :size="16"
          />
        </RouterLink>
      </div>
    </Card>

    <Modal
      :open="costModalOpen"
      :title="editingCost ? t('moneyControl.editMonthlyCost') : t('moneyControl.addMonthlyCost')"
      :subtitle="t('moneyControl.monthlyCostDialogSub')"
      :width="520"
      :close-on-backdrop="!costSaving"
      :close-on-esc="!costSaving"
      @close="closeCostModal"
    >
      <form
        class="monthly-cost-form"
        @submit.prevent="saveRecurringCost"
      >
        <Field :label="t('moneyControl.costName')">
          <Input
            v-model="costForm.name"
            :placeholder="t('moneyControl.costNamePlaceholder')"
            maxlength="140"
            autofocus
          />
        </Field>
        <Field :label="t('moneyControl.costGroup')">
          <Select
            v-model="costForm.reportingGroup"
            :options="recurringGroupOptions"
          />
        </Field>
        <Field
          :label="t('moneyControl.costMonthlyAmount')"
          :hint="t('moneyControl.costMonthlyAmountHint')"
        >
          <MoneyInput
            v-model="costForm.monthlyAmount"
            nullable
            icon="coins"
            :placeholder="t('moneyControl.costAmountPlaceholder')"
          />
        </Field>
        <div
          v-if="costFormError"
          class="monthly-cost-error"
          role="alert"
        >
          <DesignIcon
            name="alert"
            :size="18"
          />
          {{ costFormError }}
        </div>
      </form>
      <template #footer>
        <Button
          variant="primary"
          icon="check"
          :loading="costSaving"
          :disabled="costSaving"
          @click="saveRecurringCost"
        >
          {{ t('moneyControl.costSave') }}
        </Button>
      </template>
    </Modal>
  </WorkspacePage>
</template>

<style scoped>
.money-control-page {
  max-width: none;
}

.control-card,
.endpoint-state-card,
.partial-data-notice,
.cash-position-card,
.money-control-summary,
.money-control-detail-grid,
.raw-materials-card,
.money-control-table-grid {
  margin-bottom: var(--sp-5);
}

.cash-position-head {
  align-items: center;
}

.cash-position-body {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
}

.position-loading-grid,
.position-funds-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--sp-3);
}

.position-fund-card {
  min-width: 0;
  padding: var(--sp-4);
  border: 1px solid rgb(var(--v-theme-border));
  border-radius: var(--r-md);
  background: rgb(var(--v-theme-surface-inset));
}

.position-fund-card.is-total {
  border-color: rgb(var(--v-theme-primary-border));
  background: rgb(var(--v-theme-primary-weak));
}

.position-fund-card__label {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  margin-bottom: var(--sp-2);
  color: rgb(var(--v-theme-text-secondary));
  font-size: var(--fs-sm);
  font-weight: var(--fw-medium);
}

.position-fund-card > strong {
  display: block;
  overflow: hidden;
  color: rgb(var(--v-theme-on-surface));
  font-size: clamp(20px, 2vw, 28px);
  letter-spacing: -.025em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.position-fund-card.is-total > strong {
  color: rgb(var(--v-theme-primary));
}

.position-trust-note {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-3);
  padding: var(--sp-3) var(--sp-4);
  border: 1px solid rgb(var(--v-theme-warning-border));
  border-radius: var(--r-md);
  color: rgb(var(--v-theme-warning-strong));
  background: rgb(var(--v-theme-warning-weak));
}

.position-trust-note > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.position-trust-note span {
  font-size: var(--fs-sm);
  line-height: 1.45;
  text-wrap: pretty;
}

.position-flow {
  overflow: hidden;
  border: 1px solid rgb(var(--v-theme-border));
  border-radius: var(--r-lg);
  background: rgb(var(--v-theme-surface));
}

.position-step {
  padding: var(--sp-5);
  border-bottom: 1px solid rgb(var(--v-theme-border));
}

.position-step__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sp-4);
}

.position-step__head > div:first-child {
  display: flex;
  min-width: 0;
  align-items: flex-start;
  gap: var(--sp-3);
}

.position-step__index {
  display: inline-flex;
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: rgb(var(--v-theme-primary));
  background: rgb(var(--v-theme-primary-weak));
  font-size: var(--fs-sm);
  font-weight: var(--fw-bold);
}

.position-step h3 {
  margin: 2px 0 3px;
  color: rgb(var(--v-theme-on-surface));
  font-size: var(--fs-body);
  text-wrap: balance;
}

.position-step p {
  margin: 0;
  color: rgb(var(--v-theme-text-secondary));
  font-size: var(--fs-sm);
  line-height: 1.4;
  text-wrap: pretty;
}

.position-deduction {
  flex: 0 0 auto;
  color: rgb(var(--v-theme-error));
  font-size: var(--fs-lg);
  letter-spacing: -.015em;
  white-space: nowrap;
}

.position-detail-list {
  display: flex;
  flex-direction: column;
  margin: var(--sp-4) 0 0 42px;
  border-top: 1px solid rgb(var(--v-theme-border));
}

.position-detail-row {
  display: flex;
  min-height: 46px;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-4);
  padding: var(--sp-2) 0;
  border-bottom: 1px solid rgb(var(--v-theme-border));
}

.position-detail-row:last-child {
  border-bottom: 0;
}

.position-detail-row__main {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--sp-2);
}

.position-detail-row > strong,
.position-cost-row__amount > strong {
  flex: 0 0 auto;
  color: rgb(var(--v-theme-on-surface));
  white-space: nowrap;
}

.position-empty-row {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  margin: var(--sp-4) 0 0 42px;
  color: rgb(var(--v-theme-success-strong));
  font-size: var(--fs-sm);
}

.position-paid-note {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  margin: var(--sp-3) 0 0 42px;
  color: rgb(var(--v-theme-success-strong));
  font-size: var(--fs-sm);
}

.position-paid-note span {
  flex: 1;
}

.position-paid-note strong {
  color: rgb(var(--v-theme-on-surface));
  white-space: nowrap;
}

.position-net-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-4);
  margin: var(--sp-4) 0 0 42px;
  padding: var(--sp-3) var(--sp-4);
  border-radius: var(--r-sm);
  background: rgb(var(--v-theme-surface-inset));
  color: rgb(var(--v-theme-text-secondary));
  font-size: var(--fs-sm);
}

.position-net-row strong {
  color: rgb(var(--v-theme-on-surface));
  font-size: var(--fs-body);
  white-space: nowrap;
}

.position-mini-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--sp-2);
  margin: var(--sp-4) 0 0 42px;
}

.position-mini-metrics > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
  padding: var(--sp-3);
  border-radius: var(--r-sm);
  background: rgb(var(--v-theme-surface-inset));
}

.position-mini-metrics span {
  color: rgb(var(--v-theme-text-tertiary));
  font-size: var(--fs-label);
}

.position-mini-metrics strong {
  overflow: hidden;
  color: rgb(var(--v-theme-on-surface));
  font-size: var(--fs-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.position-cost-actions,
.position-cost-row__amount {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--sp-3);
}

.position-formula {
  color: rgb(var(--v-theme-text-tertiary));
  font-size: var(--fs-label);
  white-space: nowrap;
}

.position-final {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-4);
  padding: var(--sp-5);
  color: rgb(var(--v-theme-success-strong));
  background: rgb(var(--v-theme-success-weak));
}

.position-final.is-negative {
  color: rgb(var(--v-theme-error));
  background: rgb(var(--v-theme-error-weak));
}

.position-final > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.position-final span {
  font-size: var(--fs-body);
  font-weight: var(--fw-bold);
}

.position-final small {
  color: rgb(var(--v-theme-text-secondary));
  font-size: var(--fs-label);
  text-wrap: pretty;
}

.position-final > strong {
  flex: 0 0 auto;
  font-size: clamp(24px, 3vw, 34px);
  letter-spacing: -.03em;
  white-space: nowrap;
}

.monthly-cost-form {
  display: grid;
  gap: var(--sp-4);
}

.monthly-cost-error {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-2);
  padding: var(--sp-3);
  border-radius: var(--r-sm);
  color: rgb(var(--v-theme-error));
  background: rgb(var(--v-theme-error-weak));
  font-size: var(--fs-sm);
}

.money-control-filters {
  align-items: flex-start;
}

.money-control-filters :deep(.field) {
  flex: 0 1 190px;
  min-width: 165px;
}

.money-control-filter-meta {
  display: flex;
  min-width: 220px;
  flex: 1 1 260px;
  flex-direction: column;
  align-items: flex-end;
  align-self: center;
  gap: 4px;
  color: rgb(var(--v-theme-text-secondary));
  font-size: var(--fs-sm);
  text-align: right;
}

.money-control-filter-meta strong {
  color: rgb(var(--v-theme-on-surface));
  font-weight: var(--fw-semibold);
}

.filter-warning {
  color: rgb(var(--v-theme-warning-strong));
}

.partial-data-notice {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-3);
  padding: var(--sp-3) var(--sp-4);
  border: 1px solid rgb(var(--v-theme-warning-border));
  border-radius: var(--r-md);
  color: rgb(var(--v-theme-warning-strong));
  background: rgb(var(--v-theme-warning-weak));
}

.partial-data-notice div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.partial-data-notice span {
  font-size: var(--fs-sm);
}

.money-kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--sp-4);
}

.money-kpi-grid .kpi-card {
  min-width: 0;
  padding: var(--sp-4);
}

.money-kpi-grid .kpi-card__label,
.money-kpi-grid .kpi-card__sub {
  overflow-wrap: anywhere;
}

.money-kpi-grid .kpi-card__value {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.money-kpi-grid .kpi-card__sub {
  min-height: 38px;
  margin-top: var(--sp-2);
  line-height: 1.4;
}

@media (min-width: 1281px) {
  .money-kpi-grid .kpi-card:last-child {
    grid-column: span 2;
  }
}

.money-control-detail-grid,
.money-control-table-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(320px, .65fr);
  gap: var(--sp-4);
}

.money-control-table-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.detail-card,
.summary-table-card {
  min-width: 0;
}

.reconciliation-body {
  display: grid;
  grid-template-columns: minmax(220px, .55fr) minmax(0, 1.45fr);
  gap: var(--sp-5);
}

.reconciliation-statuses {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}

.reconciliation-statuses > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
  padding: var(--sp-3);
  border: 1px solid rgb(var(--v-theme-border));
  border-radius: var(--r-sm);
  background: rgb(var(--v-theme-surface-inset));
  color: rgb(var(--v-theme-text-secondary));
  font-size: var(--fs-sm);
}

.issue-list h3 {
  margin: 0 0 var(--sp-3);
  color: rgb(var(--v-theme-on-surface));
  font-size: var(--fs-body);
}

.issue-row,
.no-issues {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-2) 0;
  border-bottom: 1px solid rgb(var(--v-theme-border));
  color: rgb(var(--v-theme-text-secondary));
  font-size: var(--fs-sm);
}

.issue-row:last-child,
.no-issues:last-child {
  border-bottom: 0;
}

.issue-row > span:nth-child(2) {
  min-width: 0;
  flex: 1;
  overflow-wrap: anywhere;
}

.issue-row strong {
  color: rgb(var(--v-theme-on-surface));
  white-space: nowrap;
}

.no-issues {
  color: rgb(var(--v-theme-success-strong));
}

.quick-actions-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--sp-2);
}

.quick-action {
  display: flex;
  min-width: 0;
  min-height: 44px;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-3);
  border: 1px solid rgb(var(--v-theme-border));
  border-radius: var(--r-sm);
  color: rgb(var(--v-theme-on-surface));
  background: rgb(var(--v-theme-surface));
  text-decoration: none;
  transition: border-color .14s, background .14s, box-shadow .14s;
}

.quick-action:hover {
  border-color: rgb(var(--v-theme-primary-border));
  background: rgb(var(--v-theme-primary-weak));
}

.quick-action:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus);
}

.quick-action > span {
  min-width: 0;
  flex: 1;
  overflow-wrap: anywhere;
  font-size: var(--fs-sm);
  font-weight: var(--fw-medium);
}

.raw-materials-head {
  align-items: center;
}

.valuation-meta {
  max-width: 420px;
  margin-left: auto;
  color: rgb(var(--v-theme-text-tertiary));
  font-size: var(--fs-label);
  text-align: right;
}

.raw-materials-toolbar {
  padding-top: 0;
}

.raw-materials-toolbar :deep(.control) {
  width: min(100%, 360px);
}

.primary-cell {
  display: flex;
  min-width: 150px;
  flex-direction: column;
  gap: 3px;
}

.primary-cell > span {
  color: rgb(var(--v-theme-text-tertiary));
  font-size: var(--fs-label);
}

.table-link {
  color: rgb(var(--v-theme-primary));
  font-weight: var(--fw-semibold);
  text-decoration: none;
}

.table-link:hover {
  text-decoration: underline;
}

.table-link:focus-visible {
  border-radius: 3px;
  outline: none;
  box-shadow: var(--shadow-focus);
}

.standalone-quick-actions .quick-actions-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

@media (max-width: 1280px) {
  .money-kpi-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .money-control-detail-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 960px) {
  .position-funds-grid,
  .position-loading-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .position-fund-card.is-total {
    grid-column: span 2;
  }

  .money-kpi-grid,
  .money-control-table-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .reconciliation-body {
    grid-template-columns: 1fr;
  }

  .standalone-quick-actions .quick-actions-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .money-kpi-grid .kpi-card:last-child {
    grid-column: span 2;
  }
}

@media (max-width: 768px) {
  .position-step__head,
  .position-cost-head,
  .position-final {
    align-items: flex-start;
    flex-direction: column;
  }

  .position-cost-actions {
    width: 100%;
    align-items: flex-start;
    flex-direction: column;
  }

  .position-mini-metrics {
    grid-template-columns: 1fr;
  }

  .position-final > strong {
    align-self: stretch;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .money-control-filters :deep(.field),
  .money-control-filter-meta {
    width: 100%;
    min-width: 0;
    flex-basis: 100%;
  }

  .money-control-filter-meta {
    align-items: flex-start;
    text-align: left;
  }

  .raw-materials-head {
    align-items: flex-start;
  }

  .valuation-meta {
    max-width: none;
    margin-left: 0;
    text-align: left;
  }
}

@media (max-width: 540px) {
  .position-funds-grid,
  .position-loading-grid {
    grid-template-columns: 1fr;
  }

  .position-fund-card.is-total {
    grid-column: span 1;
  }

  .position-step {
    padding: var(--sp-4);
  }

  .position-detail-list,
  .position-empty-row,
  .position-paid-note,
  .position-net-row,
  .position-mini-metrics {
    margin-left: 0;
  }

  .position-detail-row,
  .position-cost-row__amount {
    align-items: flex-start;
  }

  .position-detail-row {
    flex-direction: column;
    gap: var(--sp-2);
  }

  .position-cost-row__amount {
    width: 100%;
    justify-content: space-between;
  }

  .position-formula {
    width: 100%;
    white-space: normal;
  }

  .money-kpi-grid,
  .money-control-table-grid,
  .quick-actions-grid,
  .standalone-quick-actions .quick-actions-grid {
    grid-template-columns: 1fr;
  }

  .money-kpi-grid .kpi-card__value {
    font-size: 22px;
  }

  .money-kpi-grid .kpi-card:last-child {
    grid-column: span 1;
  }

  .issue-row {
    align-items: flex-start;
    flex-wrap: wrap;
  }
}
</style>

<route lang="yaml">
meta:
  action: manage
  subject: all
  anyPermission:
    - money.control.view
</route>
