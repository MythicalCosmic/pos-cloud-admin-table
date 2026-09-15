<script setup lang="ts">
import WorkspacePage from '@/components/design/workspace/WorkspacePage.vue'
import WorkspaceToolbar from '@/components/design/workspace/WorkspaceToolbar.vue'

/* ============================================================
   HR SALARIES — monthly payroll: generate, approve, pay
   Plain HTML + design primitives. No Vuetify on this surface.
   ============================================================ */
import type { DataTableColumn } from '@/components/design/DataTable.vue'
import { hrApi as axios } from '@/plugins/axios'
import Badge from '@/components/design/Badge.vue'
import Button from '@/components/design/Button.vue'
import Card from '@/components/design/Card.vue'
import DataTable from '@/components/design/DataTable.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import Field from '@/components/design/Field.vue'
import IconAction from '@/components/design/IconAction.vue'
import Input from '@/components/design/Input.vue'
import Kpi from '@/components/design/Kpi.vue'
import Modal from '@/components/design/Modal.vue'
import MoneyInput from '@/components/design/MoneyInput.vue'
import PageHeader from '@/components/design/PageHeader.vue'
import Select from '@/components/design/Select.vue'
import StateFill from '@/components/design/StateFill.vue'
import { buildCsv } from '@/utils/csv'
import { formatMonthNumber } from '@/utils/monthLabels'

const { t } = useI18n({ useScope: 'global' })
const { snackbar, snackbarMsg, snackbarColor, notify } = useNotify()
const { formatCurrency, formatDate } = useFormatters()

// ============================================================
// State
// ============================================================
const items = ref<any[]>([])
const total = ref(0)
const loading = ref(false)
const page = ref(1)
const itemsPerPage = ref(20)
const summary = ref<any>(null)
const selectedSalaryIds = ref<Set<string | number>>(new Set())

// ---------- filters ----------
const statusFilter = ref<string>('')
const periodFilter = ref<string>('') // YYYY-MM
const employeeFilter = ref<string>('')
const employeeOptions = ref<any[]>([])

const generateDialog = ref(false)
const generatePeriod = ref('')
const generating = ref(false)

// ============================================================
// Tone map
// ============================================================
const STATUS_TONE: Record<string, 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'primary'> = {
  PENDING: 'warning',
  APPROVED: 'info',
  PAID: 'success',
}

// ============================================================
// API
// ============================================================
async function load() {
  loading.value = true
  try {
    // KNOWN LIMITATION: BE salary_views.salaries only forwards `page` and `per_page`
    // to SalaryService.list. The status / employee_id / year / month params below
    // are silently dropped server-side until the BE view is updated to forward them
    // (the service signature already accepts these filters).
    const params: any = { page: page.value, per_page: itemsPerPage.value }
    if (statusFilter.value)
      params.status = statusFilter.value
    if (employeeFilter.value)
      params.employee_id = employeeFilter.value
    if (periodFilter.value) {
      const [y, m] = periodFilter.value.split('-')
      if (y)
        params.year = Number(y)
      if (m)
        params.month = Number(m)
    }
    const res = await axios.get('/salaries/', { params })
    const d = res.data?.data ?? res.data

    items.value = d?.salaries ?? d?.items ?? []
    total.value = d?.pagination?.total ?? items.value.length
  }
  catch {
    notify(t('Failed to load'), 'error')
  }
  finally {
    loading.value = false
  }
}

async function loadEmployees() {
  try {
    const res = await axios.get('/employees/', { params: { per_page: 200 } })
    const d = res.data?.data ?? res.data
    employeeOptions.value = d?.employees ?? d?.items ?? []
  }
  catch { /* ignore */ }
}

async function loadSummary() {
  try {
    // BE salary_summary requires year/month — derive from periodFilter,
    // fall back to today so the KPI strip tracks the table filter.
    const now = new Date()
    let year = now.getFullYear()
    let month = now.getMonth() + 1
    if (periodFilter.value) {
      const [y, m] = periodFilter.value.split('-')
      if (y)
        year = Number(y)
      if (m)
        month = Number(m)
    }
    const res = await axios.get('/salaries/summary/', { params: { year, month } })

    summary.value = res.data?.data ?? res.data
  }
  catch { /* ignore */ }
}

onMounted(() => { load(); loadSummary(); loadEmployees() })
watch([page, itemsPerPage], () => {
  selectedSalaryIds.value = new Set()
  load()
})
watch([statusFilter, periodFilter, employeeFilter], () => {
  selectedSalaryIds.value = new Set()
  if (page.value !== 1)
    page.value = 1
  else
    load()
  loadSummary()
})

// ============================================================
// Filter options
// ============================================================
const statusOptions = computed(() => [
  { value: '', label: t('All statuses') },
  { value: 'PENDING', label: t('salary_status_PENDING') },
  { value: 'APPROVED', label: t('salary_status_APPROVED') },
  { value: 'PAID', label: t('salary_status_PAID') },
])

const employeeSelectOptions = computed(() => [
  { value: '', label: t('All employees') },
  ...employeeOptions.value.map((e: any) => ({
    value: String(e.id),
    label: `${e.user?.first_name ?? ''} ${e.user?.last_name ?? ''}`.trim() || e.user?.email || `#${e.id}`,
  })),
])

const payMethodOptions = computed(() => [
  { value: 'CASH', label: t('payment_method_CASH') },
  { value: 'UZCARD', label: t('payment_method_UZCARD') },
  { value: 'HUMO', label: t('payment_method_HUMO') },
  { value: 'PAYME', label: t('payment_method_PAYME') },
  { value: 'BANK_TRANSFER', label: t('payment_method_BANK_TRANSFER') },
])

// ============================================================
// Filter chips
// ============================================================
const activeFilters = computed(() => {
  const out: { k: string; label: string; val: string; clear: () => void }[] = []
  if (statusFilter.value) {
    out.push({
      k: 's',
      label: t('Status'),
      val: t(`salary_status_${statusFilter.value}`),
      clear: () => { statusFilter.value = '' },
    })
  }
  if (periodFilter.value) {
    out.push({
      k: 'p',
      label: t('Period'),
      val: periodFilter.value,
      clear: () => { periodFilter.value = '' },
    })
  }
  if (employeeFilter.value) {
    const hit = employeeSelectOptions.value.find(o => o.value === employeeFilter.value)
    out.push({
      k: 'e',
      label: t('Employee'),
      val: hit?.label ?? employeeFilter.value,
      clear: () => { employeeFilter.value = '' },
    })
  }
  return out
})

function clearAllFilters() {
  statusFilter.value = ''
  periodFilter.value = ''
  employeeFilter.value = ''
}

// ============================================================
// KPI cards
// ============================================================
// BE /salaries/summary/ returns { year, month, count, total_base, total_bonus,
// total_deduction, total_net, by_status }. by_status is keyed by status string
// and the VALUE is Sum(net_amount) — a monetary total, NOT a count of salaries.
function statusValue(status: string): number | null {
  const s = summary.value
  if (!s)
    return null
  const bs = s.by_status
  if (bs && bs[status] != null)
    return Number(bs[status])
  return null
}

const kpiPending = computed(() => ({
  label: t('Pending total'),
  value: statusValue('PENDING'),
  icon: 'clock',
  tone: 'warning' as const,
  money: true,
}))

const kpiApproved = computed(() => ({
  label: t('Approved total'),
  value: statusValue('APPROVED'),
  icon: 'check',
  tone: 'info' as const,
  money: true,
}))

const kpiPaid = computed(() => ({
  label: t('Paid total'),
  value: statusValue('PAID'),
  icon: 'dollar',
  tone: 'success' as const,
  money: true,
}))

const kpiTotal = computed(() => ({
  label: t('Total'),
  value: summary.value?.total_net ?? null,
  icon: 'trend',
  tone: 'primary' as const,
  money: true,
  sub: summary.value?.count != null ? t('{n} employees', { n: summary.value.count }) : undefined,
}))

// ============================================================
// Contextual empty state
// ============================================================
const hasActiveFilters = computed(() =>
  !!(statusFilter.value || periodFilter.value || employeeFilter.value),
)

const emptyTitle = computed(() =>
  hasActiveFilters.value ? t('No matching salaries') : t('salary_empty_title'),
)

const emptySub = computed(() =>
  hasActiveFilters.value ? t('Nothing matches your filters.') : t('salary_empty_sub'),
)

// ============================================================
// Columns
// ============================================================
const columns: DataTableColumn<any>[] = [
  { key: 'employee', label: t('Employee'), sortable: false },
  { key: 'period', label: t('Period'), sortable: false, width: 110 },
  { key: 'base_salary', label: t('Base'), sortable: false, align: 'right', width: 130 },
  { key: 'bonus', label: t('Bonus'), sortable: false, align: 'right', width: 120 },
  { key: 'deduction', label: t('Deduction'), sortable: false, align: 'right', width: 120 },
  { key: 'net_salary', label: t('Net'), sortable: false, align: 'right', width: 140 },
  { key: 'status', label: t('Status'), sortable: false, width: 120 },
  { key: 'payment_method', label: t('Payment method'), sortable: false, width: 140 },
  { key: 'paid_at', label: t('Paid at'), sortable: false, width: 140 },
]

const tablePagination = computed(() => ({
  page: page.value,
  perPage: itemsPerPage.value,
  total: total.value,
  onPage: (n: number) => { page.value = n },
  onPerPage: (n: number) => { itemsPerPage.value = n; page.value = 1 },
}))

// ============================================================
// Approve-all
// ============================================================
const approveAllDialog = ref(false)
const approveAllPeriod = ref('')
const approvingAll = ref(false)

function openApproveAll() {
  const now = new Date()

  approveAllPeriod.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  approveAllDialog.value = true
}

async function approveAll() {
  if (!approveAllPeriod.value)
    return
  approvingAll.value = true
  try {
    const [y, m] = approveAllPeriod.value.split('-')

    await axios.post('/salaries/approve-all/', { year: Number(y), month: Number(m) })
    notify(t('All pending salaries approved'))
    approveAllDialog.value = false
    await Promise.all([load(), loadSummary()])
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
  finally {
    approvingAll.value = false
  }
}

async function approveOne(s: any) {
  try {
    await axios.post(`/salaries/${s.id}/approve/`)
    notify(t('Approved'))
    await load()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
}

// ============================================================
// Bulk approve selected pending rows
// (no bulk endpoint exists — loop the per-row /approve/ route)
// ============================================================
const bulkApproving = ref(false)

async function approveSelected(rows: any[]) {
  const pending = rows.filter((r: any) => r.status === 'PENDING')
  if (!pending.length) {
    notify(t('No pending salaries in selection'), 'warning')
    return
  }
  bulkApproving.value = true
  let ok = 0
  const failedIds: Array<string | number> = []
  try {
    for (const r of pending) {
      try {
        await axios.post(`/salaries/${r.id}/approve/`)
        ok++
      }
      catch { failedIds.push(r.id) }
    }
    notify(t('{n} salaries approved', { n: ok }), ok ? 'success' : 'error')
    selectedSalaryIds.value = new Set(failedIds)
    await Promise.all([load(), loadSummary()])
  }
  finally {
    bulkApproving.value = false
  }
}

// ============================================================
// CSV export of the currently loaded payroll rows
// (scoped to the current page; no BE export endpoint exists)
// ============================================================
function exportCsv() {
  const rows = items.value
  if (!rows.length) {
    notify(t('Nothing to export yet'), 'warning')
    return
  }

  const cols: Array<[string, (s: any) => any]> = [
    [t('Employee'), s => employeeName(s)],
    [t('Position'), s => s.employee?.position ?? ''],
    [t('Period'), s => fmtPeriod(s)],
    [t('Base'), s => s.base_amount ?? 0],
    [t('Bonus'), s => s.bonus ?? 0],
    [t('Deduction'), s => s.deduction ?? 0],
    [t('Net'), s => s.net_amount ?? 0],
    [t('Status'), s => t(`salary_status_${s.status}`)],
    [t('Payment method'), s => (s.payment_method ? t(`payment_method_${s.payment_method}`) : '')],
    [t('Paid at'), s => s.paid_at ?? ''],
  ]

  const csv = buildCsv([
    cols.map(c => c[0]),
    ...rows.map((s: any) => cols.map(c => c[1](s))),
  ], { alwaysQuote: true })

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const stamp = periodFilter.value || new Date().toISOString().slice(0, 7)

  a.href = url
  a.download = `payroll-${stamp}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  notify(t('Exported {n} salaries', { n: rows.length }), 'success')
}

// ============================================================
// Pay dialog
// ============================================================
const payDialog = ref(false)
const paying = ref<any>(null)
const payMethod = ref<string>('CASH')
const submittingPay = ref(false)

function openPay(s: any) {
  paying.value = s
  payMethod.value = 'CASH'
  payDialog.value = true
}

async function payOne() {
  if (!paying.value)
    return
  submittingPay.value = true
  try {
    await axios.post(`/salaries/${paying.value.id}/pay/`, { payment_method: payMethod.value })
    notify(t('Paid'))
    payDialog.value = false
    await Promise.all([load(), loadSummary()])
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
  finally {
    submittingPay.value = false
  }
}

// ============================================================
// Itemization dialog
// ============================================================
const itemDialog = ref(false)
const itemSalary = ref<any>(null)
const itemLoading = ref(false)
const baseInput = ref<number>(0)
const bonuses = ref<any[]>([])
const deductions = ref<any[]>([])
const newBonus = ref({ amount: 0, reason: '' })
const newDeduction = ref({ amount: 0, reason: '' })
const savingBase = ref(false)

const isPaid = computed(() => itemSalary.value?.status === 'PAID')

const calcBonusTotal = computed(() => bonuses.value.reduce((a, b: any) => a + Number(b.amount || 0), 0))
const calcDeductionTotal = computed(() => deductions.value.reduce((a, d: any) => a + Number(d.amount || 0), 0))
const calcNet = computed(() => Number(baseInput.value || 0) + calcBonusTotal.value - calcDeductionTotal.value)

async function openItems(s: any) {
  itemSalary.value = s
  baseInput.value = Number(s.base_amount ?? 0)
  bonuses.value = []
  deductions.value = []
  itemDialog.value = true
  itemLoading.value = true
  try {
    const res = await axios.get(`/salaries/${s.id}/bonuses/`)
    const d = res.data?.data ?? res.data

    bonuses.value = d?.bonuses ?? []
    deductions.value = d?.deductions ?? []
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Failed to load'), 'error')
  }
  finally {
    itemLoading.value = false
  }
}

async function saveBase() {
  if (!itemSalary.value)
    return
  savingBase.value = true
  try {
    await axios.post(`/salaries/${itemSalary.value.id}/base/`, { amount: baseInput.value })
    notify(t('Base updated'))
    await load()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
  finally {
    savingBase.value = false
  }
}

async function addBonus() {
  if (!itemSalary.value || newBonus.value.amount <= 0)
    return
  try {
    await axios.post(`/salaries/${itemSalary.value.id}/bonuses/`, newBonus.value)
    notify(t('Bonus added'))
    newBonus.value = { amount: 0, reason: '' }
    await openItems(itemSalary.value) // reload list
    await load()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
}

async function addDeduction() {
  if (!itemSalary.value || newDeduction.value.amount <= 0)
    return
  try {
    await axios.post(`/salaries/${itemSalary.value.id}/deductions/`, newDeduction.value)
    notify(t('Deduction added'))
    newDeduction.value = { amount: 0, reason: '' }
    await openItems(itemSalary.value)
    await load()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
}

async function deleteBonus(b: any) {
  if (!itemSalary.value)
    return
  try {
    await axios.delete(`/salaries/${itemSalary.value.id}/bonuses/${b.id}/`)
    notify(t('Removed'))
    await openItems(itemSalary.value)
    await load()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
}

async function deleteDeduction(d: any) {
  if (!itemSalary.value)
    return
  try {
    await axios.delete(`/salaries/${itemSalary.value.id}/deductions/${d.id}/`)
    notify(t('Removed'))
    await openItems(itemSalary.value)
    await load()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
}

// ============================================================
// Generate dialog
// ============================================================
function openGenerate() {
  const now = new Date()

  generatePeriod.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  generateDialog.value = true
}

async function generate() {
  if (!generatePeriod.value)
    return
  generating.value = true
  try {
    const [y, m] = generatePeriod.value.split('-')
    await axios.post('/salaries/generate/', { year: Number(y), month: Number(m) })
    notify(t('Salaries generated'))
    generateDialog.value = false
    await Promise.all([load(), loadSummary()])
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
  finally {
    generating.value = false
  }
}

// ============================================================
// ESC handler
// ============================================================
function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape')
    return
  if (payDialog.value) { payDialog.value = false; e.preventDefault(); return }
  if (itemDialog.value) { itemDialog.value = false; e.preventDefault(); return }
  if (approveAllDialog.value) { approveAllDialog.value = false; e.preventDefault(); return }
  if (generateDialog.value) { generateDialog.value = false; e.preventDefault() }
}

onMounted(() => { window.addEventListener('keydown', onKeydown) })
onBeforeUnmount(() => { window.removeEventListener('keydown', onKeydown) })

function fmtPeriod(row: any): string {
  return formatMonthNumber(row.period_month, t, row.period_year)
    ?? `${row.period_year}-${String(row.period_month).padStart(2, '0')}`
}

function employeeName(row: any): string {
  const u = row?.employee?.user
  if (!u)
    return '—'
  const full = `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim()
  return full || u.email || '—'
}
</script>

<template>
  <WorkspacePage class="page">
    <PageHeader
      :title="t('Salaries')"
      :subtitle="t('salary_subtitle')"
    >
      <template #actions>
        <Button
          variant="ghost"
          icon="download"
          :disabled="!items.length"
          @click="exportCsv"
        >
          {{ t('Export CSV') }}
        </Button>
        <Button
          variant="secondary"
          icon="settings"
          @click="openGenerate"
        >
          {{ t('Generate') }}
        </Button>
        <Button
          variant="primary"
          icon="check"
          @click="openApproveAll"
        >
          {{ t('Approve All') }}
        </Button>
      </template>
    </PageHeader>

    <!-- KPI strip -->
    <div
      class="grid cols-4 sal-kpis"
      style="margin-bottom: var(--sp-5);"
    >
      <Kpi :data="kpiPending" />
      <Kpi :data="kpiApproved" />
      <Kpi :data="kpiPaid" />
      <Kpi :data="kpiTotal" />
    </div>

    <!-- Toolbar + table -->
    <Card>
      <WorkspaceToolbar class="toolbar toolbar--wrap">
        <div class="tb-filter">
          <Select
            v-model="statusFilter"
            icon="filter"
            :placeholder="t('Status')"
            :options="statusOptions"
          />
        </div>
        <div class="tb-period">
          <Input
            v-model="periodFilter"
            type="month"
            class="control control--native"
            :placeholder="t('Period')"
          />
        </div>
        <div class="tb-filter tb-filter--wide">
          <Select
            v-model="employeeFilter"
            icon="employee"
            :placeholder="t('Employee')"
            :options="employeeSelectOptions"
          />
        </div>
      </WorkspaceToolbar>

      <!-- Filter chips -->
      <div
        v-if="activeFilters.length > 0"
        class="toolbar"
        style="padding-top:0;"
      >
        <div class="chips">
          <span
            class="tertiary"
            style="font-size:13px;margin-right:2px;"
          >{{ t('Filters') }}:</span>
          <span
            v-for="f in activeFilters"
            :key="f.k"
            class="chip"
          >
            <span>{{ f.label }}: <b>{{ f.val }}</b></span>
            <button
              type="button"
              :aria-label="t('Remove')"
              class="chip__x"
              @click="f.clear()"
            >
              <DesignIcon
                name="close"
                :size="13"
              />
            </button>
          </span>
          <button
            class="chip--clear"
            @click="clearAllFilters"
          >
            {{ t('Clear all') }}
          </button>
        </div>
      </div>

      <div class="card__divider" />

      <DataTable
        v-model:selection="selectedSalaryIds"
        :columns="columns"
        :rows="items"
        row-key="id"
        :loading="loading"
        :pagination="tablePagination"
        selectable
      >
        <template #bulk-actions="{ selected }">
          <Button
            variant="primary"
            icon="check"
            size="sm"
            :loading="bulkApproving"
            :disabled="bulkApproving"
            @click="approveSelected(selected)"
          >
            {{ t('Approve selected') }}
          </Button>
        </template>

        <template #empty>
          <StateFill
            icon="dollar"
            :title="emptyTitle"
            :sub="emptySub"
          >
            <template #action>
              <Button
                v-if="!hasActiveFilters"
                variant="primary"
                icon="settings"
                @click="openGenerate"
              >
                {{ t('Generate') }}
              </Button>
            </template>
          </StateFill>
        </template>

        <template #cell.employee="{ row }">
          <div class="sal-emp">
            <span class="cell-strong">{{ employeeName(row) }}</span>
            <span
              v-if="row.employee?.position"
              class="cell-muted sal-emp__pos"
            >{{ row.employee.position }}</span>
          </div>
        </template>

        <template #cell.period="{ row }">
          <span class="mono">{{ fmtPeriod(row) }}</span>
        </template>

        <template #cell.base_salary="{ row }">
          <span class="num-tabular">{{ formatCurrency(row.base_amount ?? 0) }}</span>
        </template>

        <template #cell.bonus="{ row }">
          <span class="num-tabular t-success">{{ formatCurrency(row.bonus ?? 0) }}</span>
        </template>

        <template #cell.deduction="{ row }">
          <span class="num-tabular t-error">{{ formatCurrency(row.deduction ?? 0) }}</span>
        </template>

        <template #cell.net_salary="{ row }">
          <span class="num-tabular cell-strong">{{ formatCurrency(row.net_amount ?? 0) }}</span>
        </template>

        <template #cell.status="{ row }">
          <Badge :tone="STATUS_TONE[row.status] ?? 'neutral'">
            {{ t(`salary_status_${row.status}`) }}
          </Badge>
        </template>

        <template #cell.payment_method="{ row }">
          <span v-if="row.payment_method">{{ t(`payment_method_${row.payment_method}`) }}</span>
          <span
            v-else
            class="cell-muted"
          >—</span>
        </template>

        <template #cell.paid_at="{ row }">
          <span v-if="row.paid_at">{{ formatDate(row.paid_at) }}</span>
          <span
            v-else
            class="cell-muted"
          >—</span>
        </template>

        <template #row-actions="{ row }">
          <IconAction
            icon="list"
            :title="t('salary_action_items')"
            @click="openItems(row)"
          />
          <IconAction
            v-if="row.status === 'PENDING'"
            icon="check"
            tone="primary"
            :title="t('Approve')"
            @click="approveOne(row)"
          />
          <IconAction
            v-if="row.status === 'APPROVED'"
            icon="dollar"
            tone="success"
            :title="t('Pay')"
            @click="openPay(row)"
          />
        </template>
      </DataTable>
    </Card>

    <!-- Generate modal -->
    <Modal
      :open="generateDialog"
      :title="t('Generate Salaries')"
      :subtitle="t('salary_generate_subtitle')"
      :width="480"
      @close="generateDialog = false"
    >
      <Field :label="t('Period')">
        <Input
          v-model="generatePeriod"
          type="month"
          class="control control--native"
          autofocus
        />
      </Field>

      <template #footer>
        <Button
          variant="primary"
          icon="check"
          :loading="generating"
          :disabled="generating"
          @click="generate"
        >
          {{ t('Generate') }}
        </Button>
      </template>
    </Modal>

    <!-- Itemization modal -->
    <Modal
      :open="itemDialog"
      :title="t('Salary itemization')"
      :subtitle="itemSalary ? employeeName(itemSalary) : ''"
      :width="780"
      @close="itemDialog = false"
    >
      <div
        v-if="itemSalary"
        class="sal-item-head"
      >
        <div class="sal-item-head__meta">
          <div class="cell-strong">
            {{ employeeName(itemSalary) }}
          </div>
          <div class="cell-muted">
            {{ fmtPeriod(itemSalary) }}
          </div>
        </div>
        <Badge :tone="STATUS_TONE[itemSalary.status] ?? 'neutral'">
          {{ t(`salary_status_${itemSalary.status}`) }}
        </Badge>
      </div>

      <div
        v-if="isPaid"
        class="sal-alert"
      >
        <DesignIcon
          name="warning"
          :size="16"
        />
        <span>{{ t('salary_locked_warning') }}</span>
      </div>

      <!-- Base -->
      <div class="sal-section">
        <div class="sal-section__title">
          {{ t('Base salary (this month)') }}
        </div>
        <div class="sal-row">
          <div class="sal-row__input">
            <MoneyInput
              v-model="baseInput"
              :disabled="isPaid"
            />
          </div>
          <Button
            variant="primary"
            icon="save"
            :disabled="isPaid || savingBase"
            :loading="savingBase"
            @click="saveBase"
          >
            {{ t('Save base') }}
          </Button>
        </div>
      </div>

      <!-- Bonuses -->
      <div class="sal-section">
        <div class="sal-section__title sal-section__title--between">
          <span>
            <DesignIcon
              name="plus-circle"
              :size="16"
            />
            <span>{{ t('Bonuses') }}</span>
          </span>
          <span class="t-success cell-strong">+{{ formatCurrency(calcBonusTotal) }}</span>
        </div>
        <ul class="sal-list">
          <li
            v-for="b in bonuses"
            :key="b.id"
            class="sal-list__item"
          >
            <div class="sal-list__main">
              <div class="t-success cell-strong">
                +{{ formatCurrency(b.amount) }}
              </div>
              <div
                v-if="b.reason"
                class="cell-muted"
              >
                {{ b.reason }}
              </div>
            </div>
            <IconAction
              icon="trash"
              tone="danger"
              :title="t('Delete')"
              :disabled="isPaid"
              @click="deleteBonus(b)"
            />
          </li>
          <li
            v-if="!bonuses.length && !itemLoading"
            class="sal-list__empty"
          >
            {{ t('No bonuses') }}
          </li>
        </ul>
        <div class="sal-row sal-row--add">
          <div class="sal-row__amount">
            <MoneyInput
              v-model="newBonus.amount"
              :placeholder="t('Amount')"
              :disabled="isPaid"
            />
          </div>
          <div class="sal-row__reason">
            <Input
              v-model="newBonus.reason"
              :placeholder="t('Reason')"
              :disabled="isPaid"
            />
          </div>
          <Button
            variant="secondary"
            icon="plus"
            :disabled="isPaid || !newBonus.amount"
            @click="addBonus"
          >
            {{ t('Add') }}
          </Button>
        </div>
      </div>

      <!-- Deductions -->
      <div class="sal-section">
        <div class="sal-section__title sal-section__title--between">
          <span>
            <DesignIcon
              name="minus-circle"
              :size="16"
            />
            <span>{{ t('Deductions') }}</span>
          </span>
          <span class="t-error cell-strong">−{{ formatCurrency(calcDeductionTotal) }}</span>
        </div>
        <ul class="sal-list">
          <li
            v-for="d in deductions"
            :key="d.id"
            class="sal-list__item"
          >
            <div class="sal-list__main">
              <div class="t-error cell-strong">
                −{{ formatCurrency(d.amount) }}
              </div>
              <div
                v-if="d.reason"
                class="cell-muted"
              >
                {{ d.reason }}
              </div>
            </div>
            <IconAction
              icon="trash"
              tone="danger"
              :title="t('Delete')"
              :disabled="isPaid"
              @click="deleteDeduction(d)"
            />
          </li>
          <li
            v-if="!deductions.length && !itemLoading"
            class="sal-list__empty"
          >
            {{ t('No deductions') }}
          </li>
        </ul>
        <div class="sal-row sal-row--add">
          <div class="sal-row__amount">
            <MoneyInput
              v-model="newDeduction.amount"
              :placeholder="t('Amount')"
              :disabled="isPaid"
            />
          </div>
          <div class="sal-row__reason">
            <Input
              v-model="newDeduction.reason"
              :placeholder="t('Reason')"
              :disabled="isPaid"
            />
          </div>
          <Button
            variant="secondary"
            icon="minus"
            :disabled="isPaid || !newDeduction.amount"
            @click="addDeduction"
          >
            {{ t('Add') }}
          </Button>
        </div>
      </div>

      <!-- Net preview -->
      <div class="sal-net">
        <span>{{ t('Net (preview)') }}</span>
        <span class="sal-net__value">{{ formatCurrency(calcNet) }}</span>
      </div>

    </Modal>

    <!-- Approve-all modal -->
    <Modal
      :open="approveAllDialog"
      :title="t('Approve All Pending Salaries')"
      :subtitle="t('salary_approve_all_subtitle')"
      :width="480"
      @close="approveAllDialog = false"
    >
      <Field :label="t('Period')">
        <Input
          v-model="approveAllPeriod"
          type="month"
          class="control control--native"
          autofocus
        />
      </Field>

      <template #footer>
        <Button
          variant="primary"
          icon="check"
          :loading="approvingAll"
          :disabled="approvingAll"
          @click="approveAll"
        >
          {{ t('Approve All') }}
        </Button>
      </template>
    </Modal>

    <!-- Pay modal -->
    <Modal
      :open="payDialog"
      :title="t('Pay Salary')"
      :subtitle="paying ? employeeName(paying) : ''"
      :width="440"
      @close="payDialog = false"
    >
      <div class="sal-pay-meta">
        <div>
          <span class="cell-muted">{{ t('Employee') }}:</span>
          <strong>{{ employeeName(paying) }}</strong>
        </div>
        <div>
          <span class="cell-muted">{{ t('Net') }}:</span>
          <strong>{{ formatCurrency(paying?.net_amount ?? 0) }}</strong>
        </div>
      </div>

      <Field :label="t('Payment method')">
        <Select
          v-model="payMethod"
          :options="payMethodOptions"
          icon="dollar"
        />
      </Field>

      <div class="sal-pay-hint">
        {{ t('salary_pay_hint') }}
      </div>

      <template #footer>
        <Button
          variant="primary"
          icon="dollar"
          :loading="submittingPay"
          :disabled="submittingPay"
          @click="payOne"
        >
          {{ t('Pay') }}
        </Button>
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
.toolbar--wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.tb-filter {
  width: 200px;
}

.tb-filter--wide {
  width: 240px;
}

.tb-period {
  width: 180px;
}

.control--native {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 10px;
  border: 1px solid rgb(var(--v-theme-border));
  border-radius: var(--r-sm);
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-text-primary));
  font-size: var(--fs-body);
  width: 100%;
  box-sizing: border-box;
}

.sal-item-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.sal-item-head__meta {
  min-width: 0;
}

.sal-alert {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  margin-bottom: 16px;
  background: rgb(var(--v-theme-warning-weak));
  color: rgb(var(--v-theme-warning-strong));
  border: 1px solid rgb(var(--v-theme-warning-border));
  border-radius: var(--r-sm);
  font-size: var(--fs-body);
}

.sal-section {
  padding: 14px;
  margin-bottom: 14px;
  border: 1px solid rgb(var(--v-theme-border));
  border-radius: var(--r-md);
  background: rgb(var(--v-theme-surface));
}

.sal-section__title {
  font-weight: var(--fw-semibold);
  font-size: var(--fs-body);
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.sal-section__title--between {
  justify-content: space-between;
}

.sal-section__title--between > span:first-child {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.sal-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.sal-row__input {
  flex: 1 1 200px;
  min-width: 0;
}

.sal-row--add {
  margin-top: 8px;
}

.sal-row__amount {
  width: 140px;
}

.sal-row__reason {
  flex: 1 1 200px;
  min-width: 0;
}

.sal-list {
  list-style: none;
  padding: 0;
  margin: 0 0 8px 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sal-list__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: var(--r-xs);
}

.sal-list__main {
  flex: 1;
  min-width: 0;
}

.sal-list__empty {
  padding: 6px 8px;
  color: rgb(var(--v-theme-text-secondary));
  font-size: var(--fs-label);
}

.sal-net {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-radius: var(--r-md);
  background: rgb(var(--v-theme-primary-weak));
  color: rgb(var(--v-theme-primary));
  font-weight: var(--fw-semibold);
}

.sal-net__value {
  font-size: 22px;
  font-weight: var(--fw-bold);
}

.sal-pay-meta {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
}

.sal-pay-meta strong {
  margin-left: 6px;
}

.sal-pay-hint {
  font-size: var(--fs-label);
  color: rgb(var(--v-theme-text-secondary));
  margin-top: 8px;
}

.sal-emp {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.sal-emp__pos {
  font-size: var(--fs-label);
  line-height: 1.2;
}

.t-success {
  color: rgb(var(--v-theme-success-strong));
}

.t-error {
  color: rgb(var(--v-theme-error-strong));
}

@media (max-width: 768px) {
  .sal-kpis {
    grid-template-columns: repeat(2, 1fr);
  }

  .tb-filter,
  .tb-filter--wide,
  .tb-period {
    width: 100%;
    flex: 1 1 100%;
  }

  .sal-row__amount,
  .sal-row__reason,
  .sal-row__input {
    width: 100%;
    flex: 1 1 100%;
  }
}
</style>
