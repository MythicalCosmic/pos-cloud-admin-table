<script setup lang="ts">
import { useActionDialog } from '@/composables/useActionDialog'

/* ============================================================
   HR LEAVES — leave requests with approval workflow
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
import PageHeader from '@/components/design/PageHeader.vue'
import Select from '@/components/design/Select.vue'

const { confirmAction, promptAction } = useActionDialog()
const { t } = useI18n({ useScope: 'global' })
const { snackbar, snackbarMsg, snackbarColor, notify } = useNotify()
const { formatDate } = useFormatters()

// ============================================================
// State
// ============================================================
const items = ref<any[]>([])
const total = ref(0)
const loading = ref(false)
const page = ref(1)
const itemsPerPage = ref(10)

const statusFilter = ref<string>('')
const employeeFilter = ref<string>('')
const leaveTypeFilter = ref<string>('')

// Note: BE leave_requests view does not currently filter on date_from/date_to;
// these are exposed as client-side filters only.
const dateFrom = ref<string>('')
const dateTo = ref<string>('')

const employees = ref<any[]>([])
const leaveTypes = ref<any[]>([])

// ============================================================
// Tone map
// ============================================================
const STATUS_TONE: Record<string, 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'primary'> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'error',
  CANCELED: 'neutral',
}

// ============================================================
// Options
// ============================================================
const statusOptions = computed(() => [
  { value: '', label: t('leave_filter_all_status') },
  ...['PENDING', 'APPROVED', 'REJECTED', 'CANCELED'].map(v => ({
    value: v,
    label: t(`leave_status_${v}`),
  })),
])

const employeeOptions = computed(() => [
  { value: '', label: t('leave_filter_all_employees') },
  ...employees.value.map((e: any) => ({
    value: String(e.id),
    label: `${e.user?.first_name ?? ''} ${e.user?.last_name ?? ''}`.trim() || e.user?.email || `#${e.id}`,
  })),
])

const leaveTypeOptions = computed(() => [
  { value: '', label: t('leave_filter_all_types') },
  ...leaveTypes.value.map((lt: any) => ({ value: String(lt.id), label: lt.name })),
])

// Modal-only employee/leave-type options (no "all" sentinel)
const employeeOptionsForm = computed(() =>
  employees.value.map((e: any) => ({
    value: String(e.id),
    label: `${e.user?.first_name ?? ''} ${e.user?.last_name ?? ''}`.trim() || e.user?.email || `#${e.id}`,
  })),
)

const leaveTypeOptionsForm = computed(() =>
  leaveTypes.value.map((lt: any) => ({ value: String(lt.id), label: lt.name })),
)

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
      params.employee_id = employeeFilter.value
    if (leaveTypeFilter.value)
      params.leave_type_id = leaveTypeFilter.value
    const res = await axios.get('/leaves/', { params })
    const d = res.data?.data ?? res.data

    let rows = d?.leave_requests ?? d?.leaves ?? d?.items ?? []

    // Client-side date filtering (BE does not yet support date_from/date_to on this endpoint)
    if (dateFrom.value)
      rows = rows.filter((r: any) => (r.start_date ?? '') >= dateFrom.value)
    if (dateTo.value)
      rows = rows.filter((r: any) => (r.end_date ?? '') <= dateTo.value)
    items.value = rows
    total.value = d?.pagination?.total ?? d?.pagination?.total_items ?? items.value.length
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

    employees.value = d?.employees ?? d?.items ?? []
  }
  catch {}
}

async function loadLeaveTypes() {
  try {
    const res = await axios.get('/leave-types/', { params: { per_page: 200 } })
    const d = res.data?.data ?? res.data

    leaveTypes.value = d?.leave_types ?? d?.items ?? []
  }
  catch {}
}

onMounted(() => {
  load()
  loadEmployees()
  loadLeaveTypes()
})
watch([page, itemsPerPage], load)
watch([statusFilter, employeeFilter, leaveTypeFilter, dateFrom, dateTo], () => {
  page.value = 1
  load()
})

// ============================================================
// Actions
// ============================================================
async function approve(l: any) {
  try {
    await axios.post(`/leaves/${l.id}/approve/`)
    notify(t('Approved'))
    await load()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
}

async function reject(l: any) {
  const reason = await promptAction({ title: t('Rejection reason'), inputLabel: t('Rejection reason'), confirmLabel: t('Reject') })
  if (!reason)
    return
  try {
    await axios.post(`/leaves/${l.id}/reject/`, { notes: reason })
    notify(t('Rejected'))
    await load()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
}

async function cancelLeave(l: any) {
  if (!await confirmAction({ title: t('Cancel this leave request?'), confirmLabel: t('Cancel leave'), danger: true }))
    return
  try {
    await axios.post(`/leaves/${l.id}/cancel/`)
    notify(t('Canceled'))
    await load()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
}

// ============================================================
// Filter chips
// ============================================================
const activeFilters = computed(() => {
  const out: { k: string; label: string; val: string; clear: () => void }[] = []
  if (statusFilter.value) {
    out.push({
      k: 'status',
      label: t('Status'),
      val: t(`leave_status_${statusFilter.value}`),
      clear: () => { statusFilter.value = '' },
    })
  }
  if (employeeFilter.value) {
    const hit = employees.value.find((e: any) => String(e.id) === employeeFilter.value)
    const name = hit ? (`${hit.user?.first_name ?? ''} ${hit.user?.last_name ?? ''}`.trim() || hit.user?.email || `#${hit.id}`) : employeeFilter.value

    out.push({
      k: 'emp',
      label: t('Employee'),
      val: name,
      clear: () => { employeeFilter.value = '' },
    })
  }
  if (leaveTypeFilter.value) {
    const hit = leaveTypes.value.find((lt: any) => String(lt.id) === leaveTypeFilter.value)

    out.push({
      k: 'lt',
      label: t('Leave Type'),
      val: hit?.name ?? leaveTypeFilter.value,
      clear: () => { leaveTypeFilter.value = '' },
    })
  }
  if (dateFrom.value) {
    out.push({
      k: 'df',
      label: t('Date from'),
      val: dateFrom.value,
      clear: () => { dateFrom.value = '' },
    })
  }
  if (dateTo.value) {
    out.push({
      k: 'dt',
      label: t('Date to'),
      val: dateTo.value,
      clear: () => { dateTo.value = '' },
    })
  }
  return out
})

function clearAllFilters() {
  statusFilter.value = ''
  employeeFilter.value = ''
  leaveTypeFilter.value = ''
  dateFrom.value = ''
  dateTo.value = ''
}

// ============================================================
// Columns
// ============================================================
const columns: DataTableColumn<any>[] = [
  { key: 'employee', label: t('Employee'), sortable: false },
  { key: 'leave_type', label: t('Leave Type'), sortable: false },
  { key: 'start_date', label: t('From'), sortable: true, width: 120 },
  { key: 'end_date', label: t('To'), sortable: true, width: 120 },
  { key: 'days', label: t('Days'), sortable: false, align: 'right', width: 80 },
  { key: 'reason', label: t('Reason'), sortable: false },
  { key: 'approved_by', label: t('Approved by'), sortable: false },
  { key: 'status', label: t('Status'), sortable: true, width: 120 },
]

const tablePagination = computed(() => ({
  page: page.value,
  perPage: itemsPerPage.value,
  total: total.value,
  onPage: (n: number) => { page.value = n },
  onPerPage: (n: number) => { itemsPerPage.value = n; page.value = 1 },
}))

// ============================================================
// Create modal
// ============================================================
const newDialog = ref(false)
const newSubmitting = ref(false)

const newForm = ref<{ employee_id: string; leave_type_id: string; start_date: string; end_date: string; reason: string }>({
  employee_id: '',
  leave_type_id: '',
  start_date: '',
  end_date: '',
  reason: '',
})

function openNewDialog() {
  newForm.value = { employee_id: '', leave_type_id: '', start_date: '', end_date: '', reason: '' }
  newDialog.value = true
}

function closeNewDialog() {
  if (newSubmitting.value)
    return
  newDialog.value = false
}

async function submitNew() {
  if (!newForm.value.employee_id || !newForm.value.leave_type_id || !newForm.value.start_date || !newForm.value.end_date) {
    notify(t('Please fill all required fields'), 'error')
    return
  }
  newSubmitting.value = true
  try {
    await axios.post('/leaves/', {
      employee_id: Number(newForm.value.employee_id),
      leave_type_id: Number(newForm.value.leave_type_id),
      start_date: newForm.value.start_date,
      end_date: newForm.value.end_date,
      reason: newForm.value.reason,
    })
    notify(t('Leave request created'))
    newDialog.value = false
    await load()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
  finally {
    newSubmitting.value = false
  }
}

// ============================================================
// Helpers
// ============================================================
function employeeName(row: any): string {
  const u = row?.employee?.user
  if (!u)
    return '—'
  const full = `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim()
  return full || '—'
}

function approverName(row: any): string {
  const a = row?.approved_by
  if (!a)
    return '—'
  const full = `${a.first_name ?? ''} ${a.last_name ?? ''}`.trim()
  return full || '—'
}

// ============================================================
// ESC handler
// ============================================================
function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape')
    return
  if (newDialog.value) {
    closeNewDialog()
    e.preventDefault()
  }
}

onMounted(() => { window.addEventListener('keydown', onKeydown) })
onBeforeUnmount(() => { window.removeEventListener('keydown', onKeydown) })
</script>

<template>
  <div class="page">
    <PageHeader
      :title="t('Leave Requests')"
      :subtitle="t('leave_subtitle')"
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
          @click="openNewDialog"
        >
          {{ t('New Leave Request') }}
        </Button>
      </template>
    </PageHeader>

    <Card>
      <div class="toolbar toolbar--wrap">
        <div class="tb-filter">
          <Select
            v-model="employeeFilter"
            icon="user"
            :placeholder="t('Employee')"
            :options="employeeOptions"
          />
        </div>
        <div class="tb-filter">
          <Select
            v-model="leaveTypeFilter"
            icon="filter"
            :placeholder="t('Leave Type')"
            :options="leaveTypeOptions"
          />
        </div>
        <div class="tb-filter tb-filter--date">
          <Input
            v-model="dateFrom"
            type="date"
            :placeholder="t('Date from')"
          />
        </div>
        <div class="tb-filter tb-filter--date">
          <Input
            v-model="dateTo"
            type="date"
            :placeholder="t('Date to')"
          />
        </div>
        <div class="tb-filter">
          <Select
            v-model="statusFilter"
            icon="filter"
            :placeholder="t('Status')"
            :options="statusOptions"
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
        <template #cell.employee="{ row }">
          <span class="cell-strong">{{ employeeName(row) }}</span>
        </template>

        <template #cell.leave_type="{ row }">
          <span>{{ row.leave_type?.name ?? '—' }}</span>
        </template>

        <template #cell.start_date="{ row }">
          <span>{{ formatDate(row.start_date) }}</span>
        </template>

        <template #cell.end_date="{ row }">
          <span>{{ formatDate(row.end_date) }}</span>
        </template>

        <template #cell.days="{ row }">
          <span class="mono">{{ row.days_count ?? '—' }}</span>
        </template>

        <template #cell.reason="{ row }">
          <span
            v-if="row.reason"
            class="reason-cell"
            :title="row.reason"
          >
            {{ row.reason }}
          </span>
          <span v-else>—</span>
        </template>

        <template #cell.approved_by="{ row }">
          <span>{{ approverName(row) }}</span>
        </template>

        <template #cell.status="{ row }">
          <Badge :tone="STATUS_TONE[row.status] ?? 'neutral'">
            {{ t(`leave_status_${row.status}`) }}
          </Badge>
        </template>

        <template #row-actions="{ row }">
          <IconAction
            v-if="row.status === 'PENDING'"
            icon="check"
            tone="success"
            :title="t('Approve')"
            @click="approve(row)"
          />
          <IconAction
            v-if="row.status === 'PENDING'"
            icon="close"
            tone="danger"
            :title="t('Reject')"
            @click="reject(row)"
          />
          <IconAction
            v-if="row.status === 'PENDING' || row.status === 'APPROVED'"
            icon="stop"
            tone="warning"
            :title="t('Cancel')"
            @click="cancelLeave(row)"
          />
        </template>

        <template #empty>
          <div class="statefill">
            <div class="statefill__icon">
              <DesignIcon
                name="calendar"
                :size="24"
              />
            </div>
            <div class="statefill__title">
              {{ t('leave_empty_title') }}
            </div>
            <div class="statefill__sub">
              {{ t('leave_empty_hint') }}
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
                @click="openNewDialog"
              >
                {{ t('New Leave Request') }}
              </Button>
            </div>
          </div>
        </template>
      </DataTable>
    </Card>

    <!-- Create modal -->
    <Modal
      :open="newDialog"
      :title="t('New Leave Request')"
      :subtitle="t('leave_modal_create_subtitle')"
      :width="520"
      @close="closeNewDialog"
    >
      <form @submit.prevent="submitNew">
        <div class="form-grid">
          <Field
            :label="t('Employee')"
            class="span-2"
          >
            <Select
              v-model="newForm.employee_id"
              :options="employeeOptionsForm"
              :placeholder="t('leave_select_employee')"
            />
          </Field>

          <Field
            :label="t('Leave Type')"
            class="span-2"
          >
            <Select
              v-model="newForm.leave_type_id"
              :options="leaveTypeOptionsForm"
              :placeholder="t('leave_select_type')"
            />
          </Field>

          <Field :label="t('Start date')">
            <Input
              v-model="newForm.start_date"
              type="date"
            />
          </Field>

          <Field :label="t('End date')">
            <Input
              v-model="newForm.end_date"
              type="date"
            />
          </Field>

          <Field
            :label="t('Reason')"
            class="span-2"
          >
            <Input
              v-model="newForm.reason"
              :placeholder="t('leave_reason_placeholder')"
            />
          </Field>
        </div>
      </form>

      <template #footer>
        <Button
          variant="primary"
          icon="check"
          :loading="newSubmitting"
          :disabled="newSubmitting"
          @click="submitNew"
        >
          {{ t('Create') }}
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
  flex: 1 1 180px;
  min-width: 160px;
  max-width: 220px;
}

.tb-filter--date {
  min-width: 150px;
  max-width: 180px;
}

.reason-cell {
  display: inline-block;
  max-inline-size: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
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
  .tb-filter--date {
    flex: 1 1 100%;
    min-width: 0;
    max-width: 100%;
    width: 100%;
  }

  .form-grid {
    grid-template-columns: 1fr;
  }

  .form-grid .span-2 {
    grid-column: span 1;
  }

  .reason-cell {
    max-inline-size: 140px;
  }
}

@media (max-width: 768px) {
  .reason-cell {
    max-inline-size: 120px;
  }
}

@media (max-width: 420px) {
  .reason-cell {
    max-inline-size: 90px;
  }
}
</style>
