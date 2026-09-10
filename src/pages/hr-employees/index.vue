<script setup lang="ts">
import Textarea from '@/components/design/Textarea.vue'
/* ============================================================
   HR EMPLOYEES — staff directory, contracts and base pay
   Plain HTML + design primitives (PageHeader / Card / DataTable /
   Modal / Field / Input / Select / Switch / Badge / IconAction /
   Kpi / DesignIcon). No Vuetify on this surface.
   ============================================================ */
import type { DataTableColumn } from '@/components/design/DataTable.vue'
import { hrApi as axios } from '@/plugins/axios'
import defaultAxios from '@/plugins/axios'
import Badge from '@/components/design/Badge.vue'
import Button from '@/components/design/Button.vue'
import Card from '@/components/design/Card.vue'
import DataTable from '@/components/design/DataTable.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import Field from '@/components/design/Field.vue'
import IconAction from '@/components/design/IconAction.vue'
import Input from '@/components/design/Input.vue'
import Kpi from '@/components/design/Kpi.vue'
import MoneyInput from '@/components/design/MoneyInput.vue'
import Modal from '@/components/design/Modal.vue'
import PageHeader from '@/components/design/PageHeader.vue'
import Select from '@/components/design/Select.vue'
import Switch from '@/components/design/Switch.vue'
import { fmtNum } from '@/components/design/utils/format'
import { buildCsv } from '@/utils/csv'

const { t } = useI18n({ useScope: 'global' })
const { snackbar, snackbarMsg, snackbarColor, notify } = useNotify()
const { formatDate } = useFormatters()

// ============================================================
// State
// ============================================================
// Full, unpaged dataset. The backend `/employees/` list endpoint ignores
// search / department / contract / is_active query params (the view only
// forwards page + per_page), so filtering and search are done client-side
// here over the complete set. Restaurant headcount is small, so we page
// through the API once and keep everything in memory.
const employees = ref<any[]>([])
const total = ref(0)
const loading = ref(false)
const stats = ref<any>(null)
const itemsPerPage = ref(20)
const search = ref('')
const departmentFilter = ref<string>('')
const contractTypeFilter = ref<string>('')
const activeFilter = ref<string>('')

const departments = ref<any[]>([])
const users = ref<any[]>([])

const contractTypes = ['FULL_TIME', 'PART_TIME', 'CONTRACT'] as const
const paymentFreqs = ['MONTHLY', 'WEEKLY', 'BI_WEEKLY'] as const

const dialog = ref(false)
const editing = ref<any>(null)
const saving = ref(false)
const deleteDialog = ref(false)
const deleting = ref<any>(null)

const form = ref({
  user_id: null as number | null,
  department_id: null as number | null,
  position: '',
  hire_date: new Date().toISOString().slice(0, 10),
  contract_type: 'FULL_TIME',
  base_salary: 0,
  payment_frequency: 'MONTHLY',
  phone: '',
  address: '',
  emergency_contact_name: '',
  emergency_contact_phone: '',
  bank_account: '',
  bank_name: '',
  notes: '',
  is_active: true,
})

// ============================================================
// Tone maps
// ============================================================
const CONTRACT_TONE: Record<string, 'success' | 'warning' | 'info' | 'neutral'> = {
  FULL_TIME: 'success',
  PART_TIME: 'info',
  CONTRACT: 'warning',
}

// ============================================================
// Money formatter (UZS)
// ============================================================
function fmtMoney(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === '' || Number.isNaN(Number(n)))
    return '—'
  return fmtNum(Number(n))
}

// ============================================================
// Client-side filtering (backend list ignores filter params)
// ============================================================
const filteredEmployees = computed(() => {
  let rows = employees.value
  const q = search.value.trim().toLowerCase()
  if (q) {
    rows = rows.filter((e: any) => {
      const name = `${e.user?.first_name ?? ''} ${e.user?.last_name ?? ''}`.toLowerCase()
      return name.includes(q)
        || (e.user?.email ?? '').toLowerCase().includes(q)
        || (e.position ?? '').toLowerCase().includes(q)
        || (e.phone ?? '').toLowerCase().includes(q)
        || (e.department?.name ?? '').toLowerCase().includes(q)
    })
  }
  if (departmentFilter.value)
    rows = rows.filter((e: any) => String(e.department?.id ?? '') === departmentFilter.value)
  if (contractTypeFilter.value)
    rows = rows.filter((e: any) => e.contract_type === contractTypeFilter.value)
  if (activeFilter.value !== '')
    rows = rows.filter((e: any) => Boolean(e.is_active) === (activeFilter.value === 'true'))
  return rows
})

// Payroll math derived from the loaded set (BE stats omits these).
const activeEmployees = computed(() => employees.value.filter((e: any) => e.is_active))
const monthlyPayroll = computed(() =>
  activeEmployees.value.reduce((s: number, e: any) => s + Number(e.base_salary || 0), 0),
)
const avgSalary = computed(() =>
  activeEmployees.value.length ? monthlyPayroll.value / activeEmployees.value.length : null,
)

// ============================================================
// API
// ============================================================
async function load() {
  loading.value = true
  try {
    // Page through the API and accumulate every employee. Backend caps
    // per_page at 100; the loop guard prevents any runaway on bad data.
    const acc: any[] = []
    let p = 1
    for (let i = 0; i < 50; i++) {
      const res = await axios.get('/employees/', { params: { page: p, per_page: 100 } })
      const d = res.data?.data ?? res.data
      const batch: any[] = d?.employees ?? []
      acc.push(...batch)
      total.value = d?.pagination?.total ?? acc.length
      if (!d?.pagination?.has_next || batch.length === 0)
        break
      p += 1
    }
    employees.value = acc
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Failed to load'), 'error')
  }
  finally {
    loading.value = false
  }
}

async function loadStats() {
  try {
    const res = await axios.get('/employees/stats/')
    const d = res.data?.data ?? res.data

    // BE returns { data: { stats: { total, active, inactive, by_contract_type, by_department } } }
    // Unwrap the inner `stats` wrapper so template can read stats.value.total directly.
    stats.value = d?.stats ?? d ?? null
  }
  catch { /* ignore */ }
}

async function loadDepartments() {
  try {
    const res = await axios.get('/departments/', { params: { per_page: 200 } })
    const d = res.data?.data ?? res.data

    departments.value = d?.departments ?? d?.items ?? []
  }
  catch { /* ignore */ }
}

async function loadUsers() {
  try {
    const res = await defaultAxios.get('/users', { params: { per_page: 200 } })
    const d = res.data?.data ?? res.data

    users.value = d?.users ?? []
  }
  catch { /* ignore */ }
}

onMounted(() => { load(); loadStats(); loadDepartments(); loadUsers() })
// Search + filters run client-side over the in-memory set (see load()),
// so they need no refetch — the `filteredEmployees` computed reacts to them.

// ============================================================
// Form helpers
// ============================================================
function resetForm() {
  form.value = {
    user_id: null,
    department_id: null,
    position: '',
    hire_date: new Date().toISOString().slice(0, 10),
    contract_type: 'FULL_TIME',
    base_salary: 0,
    payment_frequency: 'MONTHLY',
    phone: '',
    address: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    bank_account: '',
    bank_name: '',
    notes: '',
    is_active: true,
  }
}

function openCreate() {
  editing.value = null
  resetForm()
  dialog.value = true
}

function openEdit(e: any) {
  editing.value = e
  form.value = {
    user_id: e.user?.id ?? null,
    department_id: e.department?.id ?? null,
    position: e.position ?? '',
    hire_date: e.hire_date ?? new Date().toISOString().slice(0, 10),
    contract_type: e.contract_type ?? 'FULL_TIME',
    base_salary: Number(e.base_salary ?? 0),
    payment_frequency: e.payment_frequency ?? 'MONTHLY',
    phone: e.phone ?? '',
    address: e.address ?? '',
    emergency_contact_name: e.emergency_contact_name ?? '',
    emergency_contact_phone: e.emergency_contact_phone ?? '',
    bank_account: e.bank_account ?? '',
    bank_name: e.bank_name ?? '',
    notes: e.notes ?? '',
    is_active: e.is_active ?? true,
  }
  dialog.value = true
}

function closeDialog() {
  if (saving.value)
    return
  dialog.value = false
}

async function save() {
  if (!form.value.user_id || !form.value.position || !form.value.hire_date) {
    notify(t('hr_employees_required_fields'), 'error')

    return
  }
  saving.value = true
  try {
    if (editing.value) {
      const { user_id: _u, ...payload } = form.value
      await axios.put(`/employees/${editing.value.id}/`, payload)
      notify(t('Employee updated'))
    }
    else {
      await axios.post('/employees/', form.value)
      notify(t('Employee created'))
    }
    dialog.value = false
    await Promise.all([load(), loadStats()])
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
  finally {
    saving.value = false
  }
}

function confirmDelete(e: any) {
  deleting.value = e
  deleteDialog.value = true
}

const deletingName = computed(() => {
  const d = deleting.value
  if (!d)
    return ''
  return `${d.user?.first_name ?? ''} ${d.user?.last_name ?? ''}`.trim() || d.user?.email || ''
})

function closeDelete() {
  deleteDialog.value = false
  deleting.value = null
}

async function doDelete() {
  if (!deleting.value)
    return
  try {
    await axios.delete(`/employees/${deleting.value.id}/`)
    notify(t('Deleted'))
    deleteDialog.value = false
    deleting.value = null
    await Promise.all([load(), loadStats()])
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
}

// ============================================================
// Options
// ============================================================
const departmentOptions = computed(() =>
  departments.value.map((d: any) => ({ value: String(d.id), label: d.name })),
)

const contractOptions = computed(() =>
  contractTypes.map(v => ({ value: v, label: t(`contract_type_${v}`) })),
)

const paymentFreqOptions = computed(() =>
  paymentFreqs.map(v => ({ value: v, label: t(`payment_frequency_${v}`) })),
)

const activeOptions = computed(() => [
  { value: 'true', label: t('Active') },
  { value: 'false', label: t('Inactive') },
])

const userOptions = computed(() =>
  users.value.map((u: any) => ({
    value: String(u.id),
    label: `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() + (u.email ? ` (${u.email})` : ''),
  })),
)

// ============================================================
// KPI cards
// ============================================================
const kpiTotal = computed(() => ({
  label: t('hr_employees_kpi_total'),
  value: stats.value ? Number(stats.value.total ?? 0) : null,
  icon: 'group',
  tone: 'primary' as const,
}))
const kpiActive = computed(() => ({
  label: t('hr_employees_kpi_active'),
  value: stats.value ? Number(stats.value.active ?? 0) : null,
  icon: 'check',
  tone: 'success' as const,
}))
const kpiDepartments = computed(() => ({
  label: t('hr_employees_kpi_departments'),
  // BE stats does not return a department count — derive from loaded departments list.
  value: departments.value.length || (stats.value ? 0 : null),
  icon: 'building',
  tone: 'info' as const,
}))
const kpiAvgSalary = computed(() => ({
  label: t('hr_employees_kpi_avg_salary'),
  // BE stats omits avg_salary; compute it from the loaded active-employee set.
  value: employees.value.length ? avgSalary.value : null,
  icon: 'wallet',
  tone: 'warning' as const,
  money: true,
  sub: employees.value.length
    ? t('hr_employees_payroll_sub', { total: `${fmtMoney(monthlyPayroll.value)} UZS` })
    : undefined,
}))

// ============================================================
// Columns
// ============================================================
const columns: DataTableColumn<any>[] = [
  { key: 'name', label: t('Name'), sortable: true, sortValue: (r: any) => `${r.user?.first_name ?? ''} ${r.user?.last_name ?? ''}`.trim() },
  { key: 'position', label: t('Position'), sortable: true },
  { key: 'department', label: t('Department'), sortable: true, sortValue: (r: any) => r.department?.name ?? '' },
  { key: 'contract_type', label: t('hr_employees_col_contract'), sortable: true, width: 140 },
  { key: 'phone', label: t('Phone'), sortable: false, width: 140 },
  { key: 'payment_frequency', label: t('Pay schedule'), sortable: true, width: 140 },
  { key: 'base_salary', label: t('hr_employees_col_base_salary'), sortable: true, align: 'right', width: 160 },
  { key: 'hire_date', label: t('Hire Date'), sortable: true, width: 130 },
  { key: 'is_active', label: t('Status'), sortable: true, width: 110 },
]

// ============================================================
// CSV export — exports the currently filtered set (client-side, no BE endpoint)
// ============================================================
function exportCsv() {
  const rows = filteredEmployees.value
  if (!rows.length) {
    notify(t('hr_employees_export_empty'), 'warning')

    return
  }

  const cols: Array<[string, (e: any) => any]> = [
    [t('Name'), e => `${e.user?.first_name ?? ''} ${e.user?.last_name ?? ''}`.trim()],
    [t('Email'), e => e.user?.email ?? ''],
    [t('Position'), e => e.position ?? ''],
    [t('Department'), e => e.department?.name ?? ''],
    [t('Contract Type'), e => (e.contract_type ? t(`contract_type_${e.contract_type}`) : '')],
    [t('Phone'), e => e.phone ?? ''],
    [t('Pay schedule'), e => (e.payment_frequency ? t(`payment_frequency_${e.payment_frequency}`) : '')],
    [t('Base Salary'), e => e.base_salary ?? ''],
    [t('Hire Date'), e => e.hire_date ?? ''],
    [t('Status'), e => (e.is_active ? t('Active') : t('Inactive'))],
  ]

  const csv = buildCsv([
    cols.map(c => c[0]),
    ...rows.map(e => cols.map(c => c[1](e))),
  ], { alwaysQuote: true })

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')

  a.href = url
  a.download = `employees-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  notify(t('hr_employees_export_done', { n: rows.length }), 'success')
}

// ============================================================
// Filter chips
// ============================================================
const activeFilters = computed(() => {
  const out: { k: string; label: string; val: string; clear: () => void }[] = []
  if (departmentFilter.value) {
    const dep = departments.value.find((d: any) => String(d.id) === departmentFilter.value)
    out.push({
      k: 'dep',
      label: t('Department'),
      val: dep?.name ?? departmentFilter.value,
      clear: () => { departmentFilter.value = '' },
    })
  }
  if (contractTypeFilter.value) {
    out.push({
      k: 'ct',
      label: t('hr_employees_col_contract'),
      val: t(`contract_type_${contractTypeFilter.value}`),
      clear: () => { contractTypeFilter.value = '' },
    })
  }
  if (activeFilter.value !== '') {
    out.push({
      k: 'st',
      label: t('Status'),
      val: activeFilter.value === 'true' ? t('Active') : t('Inactive'),
      clear: () => { activeFilter.value = '' },
    })
  }
  if (search.value) {
    out.push({
      k: 'q',
      label: t('Search'),
      val: search.value,
      clear: () => { search.value = '' },
    })
  }
  return out
})

function clearAllFilters() {
  departmentFilter.value = ''
  contractTypeFilter.value = ''
  activeFilter.value = ''
  search.value = ''
}

// ============================================================
// ESC handler — close modals
// ============================================================
function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape')
    return
  if (deleteDialog.value) { closeDelete(); e.preventDefault(); return }
  if (dialog.value) { closeDialog(); e.preventDefault() }
}

onMounted(() => { window.addEventListener('keydown', onKeydown) })
onBeforeUnmount(() => { window.removeEventListener('keydown', onKeydown) })
</script>

<template>
  <div class="page">
    <PageHeader
      :title="t('Employees')"
      :subtitle="t('hr_employees_subtitle')"
    >
      <template #actions>
        <Button
          variant="secondary"
          icon="download"
          :disabled="loading || filteredEmployees.length === 0"
          @click="exportCsv"
        >
          {{ t('hr_employees_export') }}
        </Button>
        <Button
          variant="primary"
          icon="plus"
          @click="openCreate"
        >
          {{ t('New Employee') }}
        </Button>
      </template>
    </PageHeader>

    <!-- KPI strip -->
    <div class="grid cols-4 hr-emp__kpis">
      <Kpi :data="kpiTotal" />
      <Kpi :data="kpiActive" />
      <Kpi :data="kpiDepartments" />
      <Kpi :data="kpiAvgSalary" />
    </div>

    <!-- Toolbar + table -->
    <Card>
      <div class="toolbar hr-emp__toolbar">
        <div class="hr-emp__search">
          <Input
            v-model="search"
            icon="search"
            :placeholder="t('hr_employees_search_placeholder')"
          />
        </div>
        <div class="hr-emp__filter">
          <Select
            v-model="departmentFilter"
            icon="building"
            :placeholder="t('Department')"
            :options="departmentOptions"
          />
        </div>
        <div class="hr-emp__filter">
          <Select
            v-model="contractTypeFilter"
            icon="filter"
            :placeholder="t('hr_employees_col_contract')"
            :options="contractOptions"
          />
        </div>
        <div class="hr-emp__filter">
          <Select
            v-model="activeFilter"
            icon="check"
            :placeholder="t('Status')"
            :options="activeOptions"
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
          <span
            class="tertiary hr-emp__count"
            style="font-size:13px;"
          >{{ t('hr_employees_count_label', { shown: filteredEmployees.length, total: total }) }}</span>
        </div>
      </div>

      <div class="card__divider" />

      <DataTable
        :columns="columns"
        :rows="filteredEmployees"
        row-key="id"
        :loading="loading"
        :per-page="itemsPerPage"
        :per-page-options="[10, 20, 50]"
        :initial-sort="{ key: 'hire_date', dir: 'desc' }"
      >
        <template #cell.name="{ row }">
          <div class="cell-strong">
            {{ `${row.user?.first_name ?? ''} ${row.user?.last_name ?? ''}`.trim() || '—' }}
          </div>
          <div class="cell-muted" style="font-size:12px;">
            {{ row.user?.email || '—' }}
          </div>
        </template>

        <template #cell.position="{ row }">
          <span>{{ row.position || '—' }}</span>
        </template>

        <template #cell.department="{ row }">
          <span class="cell-muted">{{ row.department?.name ?? '—' }}</span>
        </template>

        <template #cell.contract_type="{ row }">
          <Badge :tone="CONTRACT_TONE[row.contract_type] || 'neutral'">
            {{ row.contract_type ? t(`contract_type_${row.contract_type}`) : '—' }}
          </Badge>
        </template>

        <template #cell.phone="{ row }">
          <span class="cell-muted">{{ row.phone || '—' }}</span>
        </template>

        <template #cell.payment_frequency="{ row }">
          <span class="cell-muted">{{ row.payment_frequency ? t(`payment_frequency_${row.payment_frequency}`) : '—' }}</span>
        </template>

        <template #cell.base_salary="{ row }">
          <span class="mono cell-strong">{{ fmtMoney(row.base_salary) }}</span>
        </template>

        <template #cell.hire_date="{ row }">
          <span class="cell-muted">{{ row.hire_date ? formatDate(row.hire_date) : '—' }}</span>
        </template>

        <template #cell.is_active="{ row }">
          <Badge :tone="row.is_active ? 'success' : 'neutral'">
            {{ row.is_active ? t('Active') : t('Inactive') }}
          </Badge>
        </template>

        <template #row-actions="{ row }">
          <IconAction
            icon="edit"
            tone="primary"
            :title="t('Edit')"
            @click="openEdit(row)"
          />
          <IconAction
            icon="trash"
            tone="danger"
            :title="t('Delete')"
            @click="confirmDelete(row)"
          />
        </template>

        <template #empty>
          <div class="statefill">
            <div class="statefill__icon">
              <DesignIcon
                name="group"
                :size="24"
              />
            </div>
            <div class="statefill__title">
              {{ t('hr_employees_empty_title') }}
            </div>
            <div class="statefill__sub">
              {{ t('hr_employees_empty_sub') }}
            </div>
            <div style="margin-top:12px;display:flex;gap:8px;justify-content:center;">
              <Button
                v-if="activeFilters.length > 0"
                variant="secondary"
                @click="clearAllFilters"
              >
                {{ t('Clear filters') }}
              </Button>
              <Button
                variant="primary"
                icon="plus"
                @click="openCreate"
              >
                {{ t('New Employee') }}
              </Button>
            </div>
          </div>
        </template>
      </DataTable>
    </Card>

    <!-- Create / Edit modal -->
    <Modal
      :open="dialog"
      :title="editing ? t('Edit Employee') : t('New Employee')"
      :subtitle="t('hr_employees_modal_sub')"
      :close-on-backdrop="!saving"
      :close-on-esc="!saving"
      @close="closeDialog"
    >
      <form @submit.prevent="save">
        <div class="form-grid">
          <Field
            :label="t('User')"
            class="span-2"
          >
            <Select
              :model-value="form.user_id !== null ? String(form.user_id) : ''"
              :options="userOptions"
              :placeholder="t('hr_employees_select_user')"
              :disabled="!!editing"
              @update:model-value="(v: string) => { form.user_id = v ? Number(v) : null }"
            />
          </Field>

          <Field
            :label="t('Department')"
            class="span-2"
          >
            <Select
              :model-value="form.department_id !== null ? String(form.department_id) : ''"
              :options="departmentOptions"
              :placeholder="t('Select Department')"
              @update:model-value="(v: string) => { form.department_id = v ? Number(v) : null }"
            />
          </Field>

          <Field
            :label="t('Position')"
            class="span-2"
          >
            <Input
              v-model="form.position"
              :placeholder="t('hr_employees_position_placeholder')"
            />
          </Field>

          <Field
            :label="t('Hire Date')"
            class="span-2"
          >
            <Input
              v-model="form.hire_date"
              type="date"
              icon="calendar"
            />
          </Field>

          <Field
            :label="t('Contract Type')"
            class="span-2"
          >
            <Select
              v-model="form.contract_type"
              :options="contractOptions"
            />
          </Field>

          <Field
            :label="t('Payment Frequency')"
            class="span-2"
          >
            <Select
              v-model="form.payment_frequency"
              :options="paymentFreqOptions"
            />
          </Field>

          <Field
            :label="t('Base Salary')"
            class="span-2"
            :hint="t('currency_short')"
          >
            <MoneyInput
              v-model="form.base_salary"
              icon="wallet"
              placeholder="0"
            />
          </Field>

          <Field
            :label="t('Phone')"
            class="span-2"
          >
            <Input
              v-model="form.phone"
              icon="phone"
              :placeholder="t('hr_employees_phone_placeholder')"
            />
          </Field>

          <Field
            :label="t('Address')"
            class="span-4"
          >
            <Input
              v-model="form.address"
              :placeholder="t('hr_employees_address_placeholder')"
            />
          </Field>

          <Field
            :label="t('hr_employees_emergency_name')"
            class="span-2"
          >
            <Input v-model="form.emergency_contact_name" />
          </Field>

          <Field
            :label="t('hr_employees_emergency_phone')"
            class="span-2"
          >
            <Input
              v-model="form.emergency_contact_phone"
              icon="phone"
            />
          </Field>

          <Field
            :label="t('hr_employees_bank_account')"
            class="span-2"
          >
            <Input v-model="form.bank_account" />
          </Field>

          <Field
            :label="t('hr_employees_bank_name')"
            class="span-2"
          >
            <Input v-model="form.bank_name" />
          </Field>

          <Field
            :label="t('Notes')"
            class="span-4"
          >
            <Textarea
              v-model="form.notes"
              class="control hr-emp__textarea"
              rows="2"
              :placeholder="t('hr_employees_notes_placeholder')"
            />
          </Field>

          <Field
            v-if="editing"
            :label="t('Active')"
            class="span-4"
          >
            <div class="hr-emp__switch-row">
              <Switch v-model="form.is_active" />
              <span class="cell-muted" style="font-size:13px;">
                {{ form.is_active ? t('hr_employees_active_hint_on') : t('hr_employees_active_hint_off') }}
              </span>
            </div>
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
          {{ t('Save') }}
        </Button>
      </template>
    </Modal>

    <!-- Delete confirmation modal -->
    <Modal
      :open="deleteDialog"
      :title="t('hr_employees_delete_title')"
      :subtitle="deletingName"
      @close="closeDelete"
    >
      <p class="cell-muted" style="margin:0;">
        {{ t('hr_employees_delete_body') }}
      </p>

      <template #footer>
        <Button
          variant="danger"
          icon="trash"
          @click="doDelete"
        >
          {{ t('Delete') }}
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
.hr-emp__kpis {
  margin-bottom: var(--sp-5);
}

.hr-emp__toolbar {
  flex-wrap: wrap;
  gap: 12px;
}

.hr-emp__search {
  flex: 1 1 240px;
  max-width: 320px;
  min-width: 200px;
}

.hr-emp__filter {
  flex: 0 1 200px;
  min-width: 160px;
}

.hr-emp__textarea {
  resize: vertical;
  min-height: 64px;
  padding: 10px 12px;
}

.hr-emp__switch-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.hr-emp__count {
  margin-inline-start: auto;
}

@media (max-width: 900px) {
  .hr-emp__kpis {
    grid-template-columns: 1fr 1fr;
  }

  .hr-emp__search,
  .hr-emp__filter {
    flex: 1 1 100%;
    max-width: none;
    min-width: 0;
  }
}

@media (max-width: 768px) {
  .hr-emp__kpis {
    grid-template-columns: 1fr 1fr;
  }

  .form-grid {
    grid-template-columns: 1fr;
  }

  .form-grid .span-2,
  .form-grid .span-3,
  .form-grid .span-4 {
    grid-column: span 1 !important;
  }
}

@media (max-width: 420px) {
  .hr-emp__kpis {
    grid-template-columns: 1fr;
  }
}
</style>

<route lang="yaml">
meta:
  action: manage
  subject: all
</route>
