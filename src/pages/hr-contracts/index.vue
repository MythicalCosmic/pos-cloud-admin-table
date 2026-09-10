<script setup lang="ts">
/* ============================================================
   HR CONTRACTS — employment contracts: draft, activate, renew, terminate.
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
import Modal from '@/components/design/Modal.vue'
import MoneyInput from '@/components/design/MoneyInput.vue'
import PageHeader from '@/components/design/PageHeader.vue'
import Select from '@/components/design/Select.vue'

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

const employees = ref<any[]>([])

const statusFilter = ref<string>('')
const employeeFilter = ref<string>('')
const expiringCount = ref<number | null>(null)

const statusOptions = ['DRAFT', 'ACTIVE', 'EXPIRED', 'TERMINATED', 'RENEWED']
const contractTypes = ['INITIAL', 'RENEWAL', 'AMENDMENT']

const dialog = ref(false)
const editing = ref<any>(null)
const saving = ref(false)
const errors = ref<Record<string, string>>({})

const deleteDialog = ref(false)
const deleting = ref<any>(null)
const deletingBusy = ref(false)

const terminateDialog = ref(false)
const terminating = ref<any>(null)
const terminateReason = ref('')
const terminateDate = ref('')
const terminatingBusy = ref(false)

const renewDialog = ref(false)
const renewing = ref<any>(null)
const renewForm = ref({ new_start_date: '', new_end_date: '', new_salary: 0 })
const renewingBusy = ref(false)

const form = ref({
  employee_id: null as number | null,
  contract_type: 'INITIAL',
  start_date: '',
  end_date: '',
  probation_end_date: '',
  salary_amount: 0,
  position_title: '',
  terms: '',
})

// ============================================================
// Tone map (status → Badge tone)
// ============================================================
const STATUS_TONE: Record<string, 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'primary'> = {
  DRAFT: 'neutral',
  ACTIVE: 'success',
  EXPIRED: 'warning',
  TERMINATED: 'error',
  RENEWED: 'info',
}

// ============================================================
// API
// ============================================================
async function load() {
  loading.value = true
  try {
    const params: any = { page: page.value, per_page: itemsPerPage.value }
    if (statusFilter.value)
      params.status = statusFilter.value
    if (employeeFilter.value)
      params.employee_id = Number(employeeFilter.value)

    const res = await axios.get('/contracts/', { params })
    const d = res.data?.data ?? res.data

    items.value = d?.contracts ?? d?.items ?? []
    total.value = d?.pagination?.total_items ?? d?.pagination?.total ?? items.value.length
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
    const res = await axios.get('/employees/', { params: { per_page: 300 } })
    const d = res.data?.data ?? res.data

    employees.value = d?.employees ?? d?.items ?? []
  }
  catch { /* ignore */ }
}

async function loadExpiring() {
  try {
    const res = await axios.get('/contracts/expiring/', { params: { days: 30 } })
    const d = res.data?.data ?? res.data
    const list = d?.contracts ?? d?.items ?? []

    expiringCount.value = d?.count ?? d?.pagination?.total_items ?? list.length
  }
  catch { /* ignore */ }
}

onMounted(() => { load(); loadEmployees(); loadExpiring() })
watch([page, itemsPerPage], load)
watch([statusFilter, employeeFilter], () => {
  page.value = 1
  load()
})

// ============================================================
// Select options
// ============================================================
const contractTypeOptions = computed(() =>
  contractTypes.map(v => ({ value: v, label: t(`contract_kind_${v}`) })),
)

const statusFilterOptions = computed(() => [
  { value: '', label: t('All statuses') },
  ...statusOptions.map(v => ({ value: v, label: t(`contract_status_${v}`) })),
])

const employeeOptions = computed(() => [
  { value: '', label: t('All employees') },
  ...employees.value.map((e: any) => ({
    value: String(e.id),
    label: `${e.user?.first_name ?? ''} ${e.user?.last_name ?? ''}${e.position ? ` — ${e.position}` : ''}`.trim() || `#${e.id}`,
  })),
])

const employeeFormOptions = computed(() => [
  { value: '', label: t('contract_employee_select') },
  ...employees.value.map((e: any) => ({
    value: String(e.id),
    label: `${e.user?.first_name ?? ''} ${e.user?.last_name ?? ''}${e.position ? ` — ${e.position}` : ''}`.trim() || `#${e.id}`,
  })),
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
      val: t(`contract_status_${statusFilter.value}`),
      clear: () => { statusFilter.value = '' },
    })
  }
  if (employeeFilter.value) {
    const hit = employees.value.find((e: any) => String(e.id) === employeeFilter.value)
    const label = hit
      ? `${hit.user?.first_name ?? ''} ${hit.user?.last_name ?? ''}`.trim() || `#${hit.id}`
      : `#${employeeFilter.value}`
    out.push({
      k: 'e',
      label: t('Employee'),
      val: label,
      clear: () => { employeeFilter.value = '' },
    })
  }
  return out
})

function clearAllFilters() {
  statusFilter.value = ''
  employeeFilter.value = ''
}

// ============================================================
// Columns
// ============================================================
const columns: DataTableColumn<any>[] = [
  { key: 'contract_number', label: t('Contract #'), sortable: false, width: 130 },
  { key: 'employee', label: t('Employee'), sortable: false },
  { key: 'contract_type', label: t('Contract Type'), sortable: false, width: 130 },
  { key: 'start_date', label: t('Start Date'), sortable: false, width: 120 },
  { key: 'end_date', label: t('End Date'), sortable: false, width: 120 },
  { key: 'probation_end_date', label: t('Probation ends'), sortable: false, width: 140 },
  { key: 'salary', label: t('Salary'), sortable: false, align: 'right', width: 140 },
  { key: 'status', label: t('Status'), sortable: false, width: 130 },
]

const tablePagination = computed(() => ({
  page: page.value,
  perPage: itemsPerPage.value,
  total: total.value,
  onPage: (n: number) => { page.value = n },
  onPerPage: (n: number) => { itemsPerPage.value = n; page.value = 1 },
}))

// ============================================================
// Create / Edit
// ============================================================
function openCreate() {
  editing.value = null
  form.value = {
    employee_id: null,
    contract_type: 'INITIAL',
    start_date: '',
    end_date: '',
    probation_end_date: '',
    salary_amount: 0,
    position_title: '',
    terms: '',
  }
  errors.value = {}
  dialog.value = true
}

function openEdit(c: any) {
  editing.value = c
  form.value = {
    employee_id: c.employee?.id ?? c.employee_id ?? null,
    contract_type: c.contract_type ?? 'INITIAL',
    start_date: c.start_date ?? '',
    end_date: c.end_date ?? '',
    probation_end_date: c.probation_end_date ?? '',
    salary_amount: Number(c.salary_amount ?? c.salary ?? c.base_salary ?? 0),
    position_title: c.position_title ?? '',
    terms: c.terms ?? '',
  }
  errors.value = {}
  dialog.value = true
}

function closeForm() {
  if (saving.value)
    return
  dialog.value = false
  editing.value = null
}

function validate(): boolean {
  const e: Record<string, string> = {}
  if (!form.value.employee_id)
    e.employee_id = t('Required')
  if (!form.value.start_date)
    e.start_date = t('Required')
  errors.value = e
  return Object.keys(e).length === 0
}

async function save() {
  if (!validate()) {
    notify(t('Employee and start date are required'), 'error')
    return
  }
  saving.value = true
  try {
    const payload: any = {
      employee_id: form.value.employee_id,
      contract_type: form.value.contract_type,
      start_date: form.value.start_date,
      salary_amount: form.value.salary_amount,
      position_title: form.value.position_title,
      terms: form.value.terms,
    }

    if (form.value.end_date)
      payload.end_date = form.value.end_date
    if (form.value.probation_end_date)
      payload.probation_end_date = form.value.probation_end_date

    if (editing.value)
      await axios.put(`/contracts/${editing.value.id}/`, payload)
    else
      await axios.post('/contracts/', payload)
    notify(editing.value ? t('Contract updated') : t('Contract created'))
    dialog.value = false
    await load()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
  finally {
    saving.value = false
  }
}

// ============================================================
// Delete confirm
// ============================================================
function confirmDelete(c: any) {
  deleting.value = c
  deleteDialog.value = true
}

function closeDelete() {
  if (deletingBusy.value)
    return
  deleteDialog.value = false
  deleting.value = null
}

async function doDelete() {
  if (!deleting.value)
    return
  deletingBusy.value = true
  try {
    await axios.delete(`/contracts/${deleting.value.id}/`)
    notify(t('Contract deleted'))
    deleteDialog.value = false
    deleting.value = null
    await load()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
  finally {
    deletingBusy.value = false
  }
}

// ============================================================
// Activate
// ============================================================
async function activate(c: any) {
  try {
    await axios.post(`/contracts/${c.id}/activate/`)
    notify(t('Activated'))
    await load()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
}

// ============================================================
// Terminate
// ============================================================
function openTerminate(c: any) {
  terminating.value = c
  terminateReason.value = ''
  terminateDate.value = ''
  terminateDialog.value = true
}

function closeTerminate() {
  if (terminatingBusy.value)
    return
  terminateDialog.value = false
  terminating.value = null
}

async function doTerminate() {
  if (!terminating.value)
    return
  terminatingBusy.value = true
  try {
    const payload: any = {}
    if (terminateDate.value)
      payload.termination_date = terminateDate.value
    if (terminateReason.value)
      payload.termination_reason = terminateReason.value
    await axios.post(`/contracts/${terminating.value.id}/terminate/`, payload)
    notify(t('Terminated'))
    terminateDialog.value = false
    terminating.value = null
    await load()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
  finally {
    terminatingBusy.value = false
  }
}

// ============================================================
// Renew
// ============================================================
function openRenew(c: any) {
  renewing.value = c
  renewForm.value = {
    new_start_date: '',
    new_end_date: '',
    new_salary: Number(c.salary_amount ?? c.salary ?? 0),
  }
  renewDialog.value = true
}

function closeRenew() {
  if (renewingBusy.value)
    return
  renewDialog.value = false
  renewing.value = null
}

async function doRenew() {
  if (!renewing.value || !renewForm.value.new_start_date) {
    notify(t('New start date is required'), 'error')
    return
  }
  renewingBusy.value = true
  try {
    const payload: any = { new_start_date: renewForm.value.new_start_date }
    if (renewForm.value.new_end_date)
      payload.new_end_date = renewForm.value.new_end_date
    if (renewForm.value.new_salary)
      payload.new_salary = renewForm.value.new_salary
    await axios.post(`/contracts/${renewing.value.id}/renew/`, payload)
    notify(t('Contract renewed'))
    renewDialog.value = false
    renewing.value = null
    await load()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
  finally {
    renewingBusy.value = false
  }
}

// ============================================================
// Form-modal binding for employee_id (Select uses string values)
// ============================================================
const employeeIdStr = computed({
  get: () => form.value.employee_id == null ? '' : String(form.value.employee_id),
  set: (v: string) => { form.value.employee_id = v ? Number(v) : null },
})

// ============================================================
// Helpers
// ============================================================
function employeeName(row: any): string {
  const e = row?.employee
  if (!e)
    return '—'
  const full = `${e.user?.first_name ?? ''} ${e.user?.last_name ?? ''}`.trim()
  return full || `#${e.id}`
}

// ============================================================
// ESC handler
// ============================================================
function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape')
    return
  if (deleteDialog.value) { closeDelete(); e.preventDefault(); return }
  if (terminateDialog.value) { closeTerminate(); e.preventDefault(); return }
  if (renewDialog.value) { closeRenew(); e.preventDefault(); return }
  if (dialog.value) { closeForm(); e.preventDefault() }
}

onMounted(() => { window.addEventListener('keydown', onKeydown) })
onBeforeUnmount(() => { window.removeEventListener('keydown', onKeydown) })
</script>

<template>
  <div class="page">
    <PageHeader
      :title="t('Contracts')"
      :subtitle="t('contract_subtitle')"
    >
      <template #actions>
        <Button
          variant="ghost"
          icon="refresh"
          :disabled="loading"
          @click="load"
        >
          {{ t('Refresh') }}
        </Button>
        <Button
          variant="primary"
          icon="plus"
          @click="openCreate"
        >
          {{ t('New Contract') }}
        </Button>
      </template>
    </PageHeader>

    <!-- Toolbar + table -->
    <Card>
      <div class="toolbar toolbar--wrap">
        <div class="tb-filter">
          <Select
            v-model="statusFilter"
            icon="filter"
            :placeholder="t('All statuses')"
            :options="statusFilterOptions"
          />
        </div>
        <div class="tb-filter tb-filter--lg">
          <Select
            v-model="employeeFilter"
            icon="user"
            :placeholder="t('All employees')"
            :options="employeeOptions"
          />
        </div>
        <div
          v-if="expiringCount !== null"
          class="tb-chip"
        >
          <Badge tone="warning">
            <DesignIcon
              name="clock"
              :size="13"
            />
            {{ t('Expiring soon (30 days)') }}: {{ expiringCount }}
          </Badge>
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
        </div>
      </div>

      <div class="card__divider" />

      <DataTable
        :columns="columns"
        :rows="items"
        row-key="id"
        :loading="loading"
        :pagination="tablePagination"
      >
        <template #cell.contract_number="{ row }">
          <span class="cell-strong">{{ row.contract_number ?? '—' }}</span>
        </template>

        <template #cell.employee="{ row }">
          <span>{{ employeeName(row) }}</span>
        </template>

        <template #cell.contract_type="{ row }">
          <Badge tone="info">
            {{ t(`contract_kind_${row.contract_type}`) }}
          </Badge>
        </template>

        <template #cell.start_date="{ row }">
          <span>{{ formatDate(row.start_date) }}</span>
        </template>

        <template #cell.end_date="{ row }">
          <span>{{ row.end_date ? formatDate(row.end_date) : '—' }}</span>
        </template>

        <template #cell.probation_end_date="{ row }">
          <span>{{ row.probation_end_date ? formatDate(row.probation_end_date) : '—' }}</span>
        </template>

        <template #cell.salary="{ row }">
          <span class="num-tabular">{{ formatCurrency(row.salary_amount ?? row.salary ?? row.base_salary ?? 0) }}</span>
        </template>

        <template #cell.status="{ row }">
          <Badge :tone="STATUS_TONE[row.status] ?? 'neutral'">
            {{ t(`contract_status_${row.status}`) }}
          </Badge>
        </template>

        <template #row-actions="{ row }">
          <IconAction
            v-if="row.status === 'DRAFT'"
            icon="play"
            tone="success"
            :title="t('Activate')"
            @click="activate(row)"
          />
          <IconAction
            v-if="row.status === 'ACTIVE'"
            icon="stop"
            tone="warning"
            :title="t('Terminate')"
            @click="openTerminate(row)"
          />
          <IconAction
            v-if="['ACTIVE', 'EXPIRED', 'TERMINATED'].includes(row.status)"
            icon="refresh"
            tone="primary"
            :title="t('Renew')"
            @click="openRenew(row)"
          />
          <IconAction
            v-if="row.status === 'DRAFT'"
            icon="pencil"
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
                name="document"
                :size="24"
              />
            </div>
            <div class="statefill__title">
              {{ t('contract_empty_title') }}
            </div>
            <div class="statefill__sub">
              {{ t('contract_empty_sub') }}
            </div>
            <div style="margin-top:12px;display:flex;gap:8px;justify-content:center;">
              <Button
                v-if="activeFilters.length > 0"
                variant="secondary"
                @click="clearAllFilters"
              >
                {{ t('Clear all') }}
              </Button>
              <Button
                variant="primary"
                icon="plus"
                @click="openCreate"
              >
                {{ t('New Contract') }}
              </Button>
            </div>
          </div>
        </template>
      </DataTable>
    </Card>

    <!-- Create / Edit modal -->
    <Modal
      :open="dialog"
      :title="editing ? t('Edit Contract') : t('New Contract')"
      :subtitle="editing && editing.contract_number ? editing.contract_number : t('contract_modal_sub')"
      :width="640"
      @close="closeForm"
    >
      <form @submit.prevent="save">
        <div class="form-grid">
          <Field
            :label="t('Employee')"
            class="span-2"
            :error="errors.employee_id"
          >
            <Select
              v-model="employeeIdStr"
              :options="employeeFormOptions"
              :placeholder="t('contract_employee_select')"
              :disabled="!!editing"
              :error="!!errors.employee_id"
            />
          </Field>

          <Field :label="t('Contract Type')">
            <Select
              v-model="form.contract_type"
              :options="contractTypeOptions"
            />
          </Field>

          <Field :label="t('Salary')">
            <MoneyInput
              v-model="form.salary_amount"
              :placeholder="t('contract_salary_placeholder')"
            />
          </Field>

          <Field
            :label="t('Start Date')"
            :error="errors.start_date"
          >
            <Input
              v-model="form.start_date"
              type="date"
              :error="!!errors.start_date"
            />
          </Field>

          <Field :label="t('End Date')">
            <Input
              v-model="form.end_date"
              type="date"
            />
          </Field>

          <Field :label="t('Probation End')">
            <Input
              v-model="form.probation_end_date"
              type="date"
            />
          </Field>

          <Field :label="t('Position')">
            <Input
              v-model="form.position_title"
              :placeholder="t('contract_position_placeholder')"
            />
          </Field>

          <Field
            :label="t('Terms')"
            class="span-2"
          >
            <Input
              v-model="form.terms"
              :placeholder="t('contract_terms_placeholder')"
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
          {{ t('Save') }}
        </Button>
      </template>
    </Modal>

    <!-- Delete confirm modal -->
    <Modal
      :open="deleteDialog"
      :title="t('Delete Contract')"
      :subtitle="deleting ? (deleting.contract_number || '') : ''"
      :width="440"
      @close="closeDelete"
    >
      <div style="padding:4px 2px 8px;color:rgb(var(--v-theme-text-secondary));">
        {{ t('contract_confirm_delete') }}
      </div>

      <template #footer>
        <Button
          variant="danger"
          icon="trash"
          :loading="deletingBusy"
          :disabled="deletingBusy"
          @click="doDelete"
        >
          {{ t('Delete') }}
        </Button>
      </template>
    </Modal>

    <!-- Terminate modal -->
    <Modal
      :open="terminateDialog"
      :title="t('Terminate Contract')"
      :subtitle="terminating ? (terminating.contract_number || '') : ''"
      :width="520"
      @close="closeTerminate"
    >
      <div class="form-grid">
        <Field
          :label="t('Termination Date')"
          class="span-2"
        >
          <Input
            v-model="terminateDate"
            type="date"
          />
        </Field>

        <Field
          :label="t('Reason')"
          class="span-2"
        >
          <Input
            v-model="terminateReason"
            :placeholder="t('contract_terminate_reason_placeholder')"
          />
        </Field>
      </div>

      <template #footer>
        <Button
          variant="danger"
          icon="stop"
          :loading="terminatingBusy"
          :disabled="terminatingBusy"
          @click="doTerminate"
        >
          {{ t('Terminate') }}
        </Button>
      </template>
    </Modal>

    <!-- Renew modal -->
    <Modal
      :open="renewDialog"
      :title="t('Renew Contract')"
      :subtitle="renewing ? (renewing.contract_number || '') : ''"
      :width="520"
      @close="closeRenew"
    >
      <div class="form-grid">
        <Field :label="t('New Start Date')">
          <Input
            v-model="renewForm.new_start_date"
            type="date"
          />
        </Field>

        <Field :label="t('New End Date')">
          <Input
            v-model="renewForm.new_end_date"
            type="date"
          />
        </Field>

        <Field
          :label="t('New Salary')"
          class="span-2"
        >
          <MoneyInput
            v-model="renewForm.new_salary"
          />
        </Field>
      </div>

      <template #footer>
        <Button
          variant="primary"
          icon="refresh"
          :loading="renewingBusy"
          :disabled="renewingBusy"
          @click="doRenew"
        >
          {{ t('Renew') }}
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

<route lang="yaml">
meta:
  action: manage
  subject: all
</route>

<style scoped>
.toolbar--wrap {
  flex-wrap: wrap;
}

.tb-filter {
  width: 200px;
  min-width: 180px;
}

.tb-filter--lg {
  width: 260px;
  min-width: 220px;
  flex: 1;
  max-width: 320px;
}

.tb-chip {
  display: inline-flex;
  align-items: center;
  margin-left: auto;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.form-grid .span-2 {
  grid-column: span 2;
}

@media (max-width: 900px) {
  .tb-filter,
  .tb-filter--lg {
    width: 100%;
    max-width: 100%;
    min-width: 0;
    flex: 1 1 100%;
  }

  .tb-chip {
    margin-left: 0;
    width: 100%;
  }
}

@media (max-width: 768px) {
  .form-grid {
    grid-template-columns: 1fr;
  }

  .form-grid .span-2 {
    grid-column: span 1;
  }

  /* Force modals to collapse to sheet on phone — inline maxWidth on Modal beats canonical .modal rule */
  :deep(.modal) {
    max-width: 100% !important;
  }
}
</style>
