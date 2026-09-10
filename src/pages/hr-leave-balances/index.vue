<script setup lang="ts">
/* ============================================================
   HR LEAVE BALANCES — per-employee annual quota tracking
   Read-only listing. Toolbar: employee (required) + year + Refresh
   + Initialize Annual Balances (bulk modal action).
   KPIs sum across the loaded balances.
   ============================================================ */
import type { DataTableColumn } from '@/components/design/DataTable.vue'
import { hrApi as axios } from '@/plugins/axios'
import Badge from '@/components/design/Badge.vue'
import Button from '@/components/design/Button.vue'
import Card from '@/components/design/Card.vue'
import DataTable from '@/components/design/DataTable.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import Field from '@/components/design/Field.vue'
import Input from '@/components/design/Input.vue'
import Kpi from '@/components/design/Kpi.vue'
import Modal from '@/components/design/Modal.vue'
import PageHeader from '@/components/design/PageHeader.vue'
import Select from '@/components/design/Select.vue'
import StateFill from '@/components/design/StateFill.vue'
import { fmtNum } from '@/components/design/utils/format'

const { t } = useI18n({ useScope: 'global' })
const { snackbar, snackbarMsg, snackbarColor, notify } = useNotify()
const { formatDate } = useFormatters()

// ============================================================
// State
// ============================================================
const items = ref<any[]>([])
const loading = ref(false)
const employees = ref<any[]>([])
const employeesLoading = ref(false)

const currentYear = new Date().getFullYear()
const employeeFilter = ref<string>('')
const yearFilter = ref<string>(String(currentYear))

// ============================================================
// Formatters — leave days may be fractional (e.g. 1.5). The integer
// portion uses the design fmtNum; the decimal suffix is appended.
// ============================================================
function fmtDays(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === '' || Number.isNaN(Number(n))) return '—'
  const v = Number(n)
  const absV = Math.abs(v)
  const int = Math.trunc(absV)
  const decStr = absV.toFixed(2).replace(/\.?0+$/, '').split('.')[1]
  const base = fmtNum(v < 0 ? -int : int)
  return decStr ? base + '.' + decStr : base
}

// ============================================================
// API
// ============================================================
async function loadEmployees() {
  employeesLoading.value = true
  try {
    const res = await axios.get('/employees/', { params: { per_page: 500 } })
    const d = res.data?.data ?? res.data
    employees.value = d?.employees ?? d?.items ?? []
  }
  catch {
    /* silent */
  }
  finally {
    employeesLoading.value = false
  }
}

async function load() {
  if (!employeeFilter.value) {
    items.value = []
    return
  }
  loading.value = true
  try {
    const params: Record<string, any> = { employee_id: employeeFilter.value }
    if (yearFilter.value) params.year = yearFilter.value
    const res = await axios.get('/leave-balances/', { params })
    const d = res.data?.data ?? res.data
    items.value = d?.balances ?? d?.items ?? []
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('leave_balance_load_error'), 'error')
    items.value = []
  }
  finally {
    loading.value = false
  }
}

onMounted(() => {
  loadEmployees()
})
watch([employeeFilter, yearFilter], () => { load() })

// ============================================================
// Filter options
// ============================================================
const employeeOptions = computed(() => employees.value.map((e) => {
  const first = e.user?.first_name ?? ''
  const last = e.user?.last_name ?? ''
  const full = `${first} ${last}`.trim()
  const pos = e.position ?? e.role ?? ''
  const head = full || e.user?.email || `#${e.id}`
  const label = pos ? `${head} — ${pos}` : head
  return { value: String(e.id), label }
}))

const yearOptions = ['2024', '2025', '2026', '2027'].map(y => ({ value: y, label: y }))

// ============================================================
// KPIs (sums across visible rows)
// ============================================================
function sumOf(key: string): number {
  return items.value.reduce((acc, row) => acc + Number(row[key] ?? 0), 0)
}

const kpiAllocated = computed(() => ({
  label: t('leave_balance_kpi_allocated_total'),
  value: items.value.length ? sumOf('allocated_days') : null,
  icon: 'calendar',
  tone: 'primary' as const,
}))
const kpiUsed = computed(() => ({
  label: t('leave_balance_kpi_used_total'),
  value: items.value.length ? sumOf('used_days') : null,
  icon: 'arrowdown',
  tone: 'warning' as const,
}))
const kpiRemaining = computed(() => ({
  label: t('leave_balance_kpi_remaining_total'),
  value: items.value.length ? sumOf('remaining_days') : null,
  icon: 'wallet',
  tone: 'success' as const,
}))
const kpiCarried = computed(() => ({
  label: t('leave_balance_kpi_carried_total'),
  value: items.value.length ? sumOf('carried_over') : null,
  icon: 'retry',
  tone: 'info' as const,
}))

// ============================================================
// Columns
// ============================================================
const columns: DataTableColumn<any>[] = [
  { key: 'leave_type', label: t('leave_balance_leave_type'), sortable: true },
  { key: 'year', label: t('leave_balance_year'), sortable: true, align: 'right', width: 100 },
  { key: 'allocated_days', label: t('leave_balance_allocated'), sortable: true, align: 'right', width: 140 },
  { key: 'used_days', label: t('leave_balance_used'), sortable: true, align: 'right', width: 120 },
  { key: 'carried_over', label: t('leave_balance_carried_over'), sortable: true, align: 'right', width: 140 },
  { key: 'remaining_days', label: t('leave_balance_remaining'), sortable: true, align: 'right', width: 130 },
  { key: 'updated_at', label: t('leave_balance_updated'), sortable: true, width: 170 },
]

// ============================================================
// Initialize Annual Balances modal
// ============================================================
const initOpen = ref(false)
const initSaving = ref(false)
const initForm = ref<{ year: number | string }>({ year: currentYear })
const initErrors = ref<Record<string, string>>({})

function openInitModal() {
  initForm.value = { year: yearFilter.value ? Number(yearFilter.value) : currentYear }
  initErrors.value = {}
  initOpen.value = true
}

function closeInitModal() {
  if (initSaving.value) return
  initOpen.value = false
}

function validateInit(): boolean {
  const e: Record<string, string> = {}
  const y = Number(initForm.value.year)
  if (!y || y < 2000 || y > 2100)
    e.year = t('Required')
  initErrors.value = e
  return Object.keys(e).length === 0
}

async function runInitialize() {
  if (!validateInit()) return
  initSaving.value = true
  try {
    const payload = { year: Number(initForm.value.year) }
    const res = await axios.post('/leave-balances/initialize/', payload)
    const d = res.data?.data ?? res.data
    const created = d?.created ?? 0
    const skipped = d?.skipped ?? 0
    notify(
      t('leave_balance_initialize_success', { created, skipped }) as string,
    )
    initOpen.value = false
    if (employeeFilter.value) await load()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
  finally {
    initSaving.value = false
  }
}

// ============================================================
// Refresh
// ============================================================
function onRefresh() {
  if (!employeeFilter.value) {
    notify(t('leave_balance_employee_required'), 'error')
    return
  }
  load()
}

// ============================================================
// ESC handler
// ============================================================
function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  if (initOpen.value) { closeInitModal(); e.preventDefault() }
}

onMounted(() => { window.addEventListener('keydown', onKeydown) })
onBeforeUnmount(() => { window.removeEventListener('keydown', onKeydown) })

// ============================================================
// Active filter chips
// ============================================================
const selectedEmployeeLabel = computed(() => {
  const found = employeeOptions.value.find(o => o.value === employeeFilter.value)
  return found?.label ?? ''
})

const activeFilters = computed(() => {
  const out: { k: string; label: string; val: string; clear: () => void }[] = []
  if (employeeFilter.value)
    out.push({ k: 'emp', label: t('leave_balance_employee'), val: selectedEmployeeLabel.value, clear: () => { employeeFilter.value = '' } })
  if (yearFilter.value)
    out.push({ k: 'yr', label: t('leave_balance_year'), val: yearFilter.value, clear: () => { yearFilter.value = String(currentYear) } })
  return out
})
</script>

<template>
  <div class="page lb-page">
    <PageHeader
      :title="t('leave_balances_title')"
      :subtitle="t('leave_balances_subtitle')"
    >
      <template #actions>
        <Button
          variant="secondary"
          icon="refresh"
          :disabled="!employeeFilter || loading"
          @click="onRefresh"
        >
          {{ t('leave_balance_refresh') }}
        </Button>
        <Button
          variant="primary"
          icon="plus"
          @click="openInitModal"
        >
          {{ t('leave_balance_initialize') }}
        </Button>
      </template>
    </PageHeader>

    <!-- KPI strip -->
    <div
      class="grid cols-4 lb-kpis"
      style="margin-bottom: var(--sp-5);"
    >
      <Kpi :data="kpiAllocated" />
      <Kpi :data="kpiUsed" />
      <Kpi :data="kpiRemaining" />
      <Kpi :data="kpiCarried" />
    </div>

    <!-- Toolbar + table -->
    <Card>
      <div class="toolbar lb-toolbar">
        <div class="lb-toolbar__employee">
          <Select
            v-model="employeeFilter"
            icon="employee"
            :placeholder="t('leave_balance_select_employee')"
            :options="employeeOptions"
            :disabled="employeesLoading"
          />
        </div>
        <div class="lb-toolbar__year">
          <Select
            v-model="yearFilter"
            icon="calendar"
            :placeholder="t('leave_balance_year')"
            :options="yearOptions"
          />
        </div>
      </div>

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
              v-if="f.k !== 'emp'"
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
        </div>
      </div>

      <div class="card__divider" />

      <!-- No employee selected: prompt -->
      <StateFill
        v-if="!employeeFilter"
        icon="employee"
        :title="t('leave_balance_select_employee')"
        :sub="t('leave_balance_select_employee_hint')"
      />

      <!-- Employee selected but empty: prompt to initialize -->
      <StateFill
        v-else-if="!loading && items.length === 0"
        icon="calendar"
        :title="t('leave_balance_no_data')"
        :sub="t('leave_balance_no_data_hint')"
      >
        <template #action>
          <div style="margin-top:12px;">
            <Button
              variant="primary"
              icon="plus"
              @click="openInitModal"
            >
              {{ t('leave_balance_initialize') }}
            </Button>
          </div>
        </template>
      </StateFill>

      <!-- Table -->
      <DataTable
        v-else
        :columns="columns"
        :rows="items"
        row-key="id"
        :loading="loading"
        :initial-sort="{ key: 'leave_type', dir: 'asc' }"
      >
        <template #cell.leave_type="{ row }">
          <span class="cell-strong">{{ row.leave_type?.name ?? '—' }}</span>
        </template>

        <template #cell.year="{ row }">
          <span class="mono cell-muted">{{ row.year ?? '—' }}</span>
        </template>

        <template #cell.allocated_days="{ row }">
          <span class="mono cell-strong">{{ fmtDays(row.allocated_days) }}</span>
        </template>

        <template #cell.used_days="{ row }">
          <span
            class="mono"
            :style="{ color: Number(row.used_days) > 0 ? 'var(--warning)' : undefined }"
          >{{ fmtDays(row.used_days) }}</span>
        </template>

        <template #cell.carried_over="{ row }">
          <span class="mono cell-muted">{{ fmtDays(row.carried_over) }}</span>
        </template>

        <template #cell.remaining_days="{ row }">
          <Badge :tone="Number(row.remaining_days) > 0 ? 'success' : 'neutral'">
            <span class="mono">{{ fmtDays(row.remaining_days) }}</span>
          </Badge>
        </template>

        <template #cell.updated_at="{ row }">
          <span class="cell-muted">{{ row.updated_at ? formatDate(row.updated_at) : '—' }}</span>
        </template>
      </DataTable>
    </Card>

    <!-- Initialize Annual Balances modal -->
    <Modal
      :open="initOpen"
      :title="t('leave_balance_initialize')"
      :subtitle="t('leave_balance_initialize_subtitle')"
      :width="520"
      @close="closeInitModal"
    >
      <form @submit.prevent="runInitialize">
        <div class="form-grid">
          <Field
            :label="t('leave_balance_initialize_year')"
            class="span-2"
            :error="initErrors.year"
          >
            <Input
              v-model="initForm.year"
              icon="calendar"
              type="number"
              :error="!!initErrors.year"
              :placeholder="t('leave_balance_year_placeholder')"
              inputmode="numeric"
            />
          </Field>
        </div>
      </form>

      <template #footer>
        <Button
          variant="primary"
          icon="check"
          :loading="initSaving"
          :disabled="initSaving"
          @click="runInitialize"
        >
          {{ t('leave_balance_initialize_run') }}
        </Button>
      </template>
    </Modal>

    <!-- Toast -->
    <VSnackbar
      v-model="snackbar"
      :color="snackbarColor"
      :timeout="3000"
    >
      {{ snackbarMsg }}
    </VSnackbar>
  </div>
</template>

<style scoped>
/* Toolbar: employee select takes the lion's share, year is fixed-ish.
   Both shrink/wrap on narrow viewports. */
.lb-toolbar__employee { flex: 1 1 240px; max-width: 340px; min-width: 200px; }
.lb-toolbar__year { flex: 0 1 160px; min-width: 120px; }

/* Tablet: keep KPI strip as 2-up so cards stay readable. */
@media (max-width: 1024px) {
  .lb-page .lb-kpis { grid-template-columns: repeat(2, 1fr); }
}

/* Phone: toolbar items stretch full width; KPI stays 2-up per canonical rules. */
@media (max-width: 768px) {
  .lb-page .lb-kpis { grid-template-columns: repeat(2, 1fr); }
  .lb-toolbar__employee { max-width: none; min-width: 0; flex: 1 1 100%; }
  .lb-toolbar__year { flex: 1 1 100%; min-width: 0; }
}

/* Small phone: collapse KPI strip to single column. */
@media (max-width: 420px) {
  .lb-page .lb-kpis { grid-template-columns: 1fr; }
}
</style>

<route lang="yaml">
meta:
  action: manage
  subject: all
</route>
