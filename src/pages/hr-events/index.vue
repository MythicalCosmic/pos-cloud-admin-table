<script setup lang="ts">
import Textarea from '@/components/design/Textarea.vue'
/* ============================================================
   HR EVENTS — Employment milestones (promotions, warnings,
   transfers, salary changes etc.) Built on the alpha design
   system (Plain HTML + design primitives only — no Vuetify).
   Wired to GET/POST /api/admins/hr/events/.
   ============================================================ */
import type { DataTableColumn } from '@/components/design/DataTable.vue'
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
import StateFill from '@/components/design/StateFill.vue'
import { hrApi } from '@/plugins/axios'

const { t } = useI18n({ useScope: 'global' })
const { notify } = useNotify()
const { formatDate } = useFormatters()

// ============================================================
// State
// ============================================================
const items = ref<any[]>([])
const total = ref(0)
const loading = ref(false)

const page = ref(1)
const itemsPerPage = ref(20)

const employees = ref<any[]>([])

// Filters
const employeeFilter = ref<string>('')
const eventTypeFilter = ref<string>('')
const search = ref('') // client-side q

// Modals
const createOpen = ref(false)
const createBusy = ref(false)
const viewOpen = ref(false)
const viewRow = ref<any>(null)
const viewLoading = ref(false)

const timelineOpen = ref(false)
const timelineEmployee = ref<any>(null)
const timelineEvents = ref<any[]>([])
const timelineLoading = ref(false)

// Form
const EVENT_KINDS = [
  'HIRED',
  'PROMOTED',
  'TRANSFERRED',
  'CONTRACT_RENEWED',
  'CONTRACT_TERMINATED',
  'WARNING',
  'SALARY_CHANGE',
  'SUSPENDED',
  'REINSTATED',
  'RESIGNED',
  'TERMINATED',
] as const

const form = ref({
  employee_id: '' as string | number,
  event_type: '',
  event_date: new Date().toISOString().slice(0, 10),
  old_value: '',
  new_value: '',
  description: '',
})

const errors = ref<Record<string, string>>({})

// ============================================================
// Tone mapping — gives the badge column a meaningful colour cue.
// ============================================================
const EVENT_TONE: Record<string, 'primary' | 'info' | 'neutral' | 'success' | 'warning' | 'error'> = {
  HIRED: 'success',
  PROMOTED: 'primary',
  TRANSFERRED: 'info',
  CONTRACT_RENEWED: 'success',
  CONTRACT_TERMINATED: 'error',
  WARNING: 'warning',
  SALARY_CHANGE: 'primary',
  SUSPENDED: 'warning',
  REINSTATED: 'success',
  RESIGNED: 'neutral',
  TERMINATED: 'error',
}

// ============================================================
// Helpers
// ============================================================
function employeeName(e: any): string {
  if (!e) return '—'
  // BE may return either { id, name } (event rows) or { id, user: { first_name, last_name, email } } (full employee object)
  if (e.name) return e.name
  const u = e.user ?? e
  const full = `${u?.first_name ?? ''} ${u?.last_name ?? ''}`.trim()
  return full || u?.email || `#${e.id ?? '?'}`
}

function userName(u: any): string {
  if (!u) return '—'
  const full = `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim()
  return full || u.email || `#${u.id ?? '?'}`
}

// ============================================================
// API
// ============================================================
async function loadEvents() {
  loading.value = true
  try {
    const params: any = { page: page.value, per_page: itemsPerPage.value }
    if (employeeFilter.value)
      params.employee_id = employeeFilter.value
    if (eventTypeFilter.value)
      params.event_type = eventTypeFilter.value
    const res = await hrApi.get('/events/', { params })
    const d = res.data?.data ?? res.data
    items.value = d?.events ?? d?.items ?? []
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
    const res = await hrApi.get('/employees/', { params: { per_page: 200 } })
    const d = res.data?.data ?? res.data
    employees.value = d?.employees ?? d?.items ?? []
  }
  catch { /* ignore */ }
}

onMounted(() => {
  loadEvents()
  loadEmployees()
})

watch([page, itemsPerPage], loadEvents)
watch([employeeFilter, eventTypeFilter], () => { page.value = 1; loadEvents() })

const debouncedSearch = useDebounceFn(() => { /* client side, no reload */ }, 200)
watch(search, debouncedSearch)

// ============================================================
// Client-side q filter — matches employee name, description,
// old / new value (case-insensitive substring).
// ============================================================
const visibleRows = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return items.value
  return items.value.filter((r: any) => {
    const hay = [
      employeeName(r.employee),
      r.description ?? '',
      r.old_value ?? '',
      r.new_value ?? '',
    ].join(' ').toLowerCase()
    return hay.includes(q)
  })
})

// ============================================================
// Filter chips
// ============================================================
const employeeOptions = computed(() => employees.value.map((e: any) => ({
  value: String(e.id),
  label: employeeName(e),
})))

const eventTypeOptions = computed(() => EVENT_KINDS.map(v => ({
  value: v,
  label: t(`event_kind_${v}`),
})))

const activeFilters = computed(() => {
  const out: { k: string; label: string; val: string; clear: () => void }[] = []
  if (search.value) {
    out.push({ k: 'q', label: t('Search'), val: search.value, clear: () => { search.value = '' } })
  }
  if (employeeFilter.value) {
    const e = employees.value.find((x: any) => String(x.id) === String(employeeFilter.value))
    out.push({
      k: 'emp',
      label: t('hr_event_field_employee'),
      val: employeeName(e),
      clear: () => { employeeFilter.value = '' },
    })
  }
  if (eventTypeFilter.value) {
    out.push({
      k: 'type',
      label: t('hr_event_field_event_type'),
      val: t(`event_kind_${eventTypeFilter.value}`),
      clear: () => { eventTypeFilter.value = '' },
    })
  }
  return out
})

function clearAllFilters() {
  search.value = ''
  employeeFilter.value = ''
  eventTypeFilter.value = ''
}

// ============================================================
// Create modal
// ============================================================
function openCreate() {
  form.value = {
    employee_id: '',
    event_type: '',
    event_date: new Date().toISOString().slice(0, 10),
    old_value: '',
    new_value: '',
    description: '',
  }
  errors.value = {}
  createOpen.value = true
}

function closeCreate() {
  if (createBusy.value) return
  createOpen.value = false
}

function validateCreate(): boolean {
  const e: Record<string, string> = {}
  if (!form.value.employee_id) e.employee_id = t('Required')
  if (!form.value.event_type) e.event_type = t('Required')
  if (!form.value.event_date) e.event_date = t('Required')
  errors.value = e
  return Object.keys(e).length === 0
}

async function submitCreate() {
  if (!validateCreate()) {
    notify(t('Please fill all required fields'), 'error')
    return
  }
  createBusy.value = true
  try {
    const payload: any = {
      employee_id: form.value.employee_id,
      event_type: form.value.event_type,
      event_date: form.value.event_date,
    }
    if (form.value.old_value) payload.old_value = form.value.old_value
    if (form.value.new_value) payload.new_value = form.value.new_value
    if (form.value.description) payload.description = form.value.description
    await hrApi.post('/events/', payload)
    notify(t('hr_event_toast_created'))
    createOpen.value = false
    await loadEvents()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('hr_event_toast_error'), 'error')
  }
  finally {
    createBusy.value = false
  }
}

// ============================================================
// View details modal
// ============================================================
async function openView(row: any) {
  viewRow.value = row
  viewOpen.value = true
  viewLoading.value = true
  try {
    const res = await hrApi.get(`/events/${row.id}/`)
    const d = res.data?.data ?? res.data
    viewRow.value = d?.event ?? d ?? row
  }
  catch { /* keep row fallback */ }
  finally {
    viewLoading.value = false
  }
}

function closeView() {
  viewOpen.value = false
  viewRow.value = null
}

// ============================================================
// Timeline modal (per-employee event history)
// ============================================================
async function openTimeline(row: any) {
  timelineEmployee.value = row.employee
  timelineOpen.value = true
  timelineLoading.value = true
  timelineEvents.value = []
  try {
    const empId = row.employee?.id ?? row.employee_id
    if (!empId) throw new Error('no employee id')
    const res = await hrApi.get(`/events/employee/${empId}/`)
    const d = res.data?.data ?? res.data
    timelineEvents.value = d?.events ?? d?.items ?? []
  }
  catch {
    notify(t('Failed to load'), 'error')
  }
  finally {
    timelineLoading.value = false
  }
}

function closeTimeline() {
  timelineOpen.value = false
  timelineEmployee.value = null
  timelineEvents.value = []
}

// ============================================================
// Table
// ============================================================
const columns: DataTableColumn<any>[] = [
  { key: 'event_date', label: t('hr_event_field_event_date'), sortable: true, width: 140 },
  { key: 'employee', label: t('hr_event_field_employee'), sortable: true, sortValue: (r: any) => employeeName(r.employee) },
  { key: 'event_type', label: t('hr_event_field_event_type'), sortable: true, width: 180 },
  { key: 'description', label: t('hr_event_field_description'), sortable: false },
  { key: 'old_value', label: t('hr_event_field_old_value'), sortable: false, width: 160 },
  { key: 'new_value', label: t('hr_event_field_new_value'), sortable: false, width: 160 },
  { key: 'created_by', label: t('hr_event_field_created_by'), sortable: false, width: 160 },
  { key: 'created_at', label: t('hr_event_field_created_at'), sortable: true, width: 160 },
]

const tablePagination = computed(() => ({
  page: page.value,
  perPage: itemsPerPage.value,
  total: total.value,
  onPage: (n: number) => { page.value = n },
  onPerPage: (n: number) => { itemsPerPage.value = n; page.value = 1 },
}))

// ESC closes the top-most modal
function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  if (timelineOpen.value) { closeTimeline(); e.preventDefault(); return }
  if (viewOpen.value) { closeView(); e.preventDefault(); return }
  if (createOpen.value) { closeCreate(); e.preventDefault(); return }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="page">
    <PageHeader
      :title="t('hr_events_title')"
      :subtitle="t('hr_events_subtitle')"
    >
      <template #actions>
        <Button
          variant="primary"
          icon="plus"
          @click="openCreate"
        >
          {{ t('hr_event_action_log') }}
        </Button>
      </template>
    </PageHeader>

    <Card>
      <!-- Toolbar -->
      <div class="toolbar hr-events-toolbar">
        <Input
          v-model="search"
          class="hr-events-toolbar__search"
          icon="search"
          :placeholder="t('Search')"
        />
        <Select
          v-model="employeeFilter"
          class="hr-events-toolbar__filter"
          icon="employee"
          :placeholder="t('hr_event_filter_employee_all')"
          :options="employeeOptions"
        />
        <Select
          v-model="eventTypeFilter"
          class="hr-events-toolbar__filter"
          icon="filter"
          :placeholder="t('hr_event_filter_type_all')"
          :options="eventTypeOptions"
        />
      </div>

      <!-- Active filter chips -->
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

      <!-- Table -->
      <DataTable
        :columns="columns"
        :rows="visibleRows"
        row-key="id"
        :loading="loading"
        :pagination="tablePagination"
        :initial-sort="{ key: 'event_date', dir: 'desc' }"
      >
        <template #cell.event_date="{ row }">
          <span class="cell-muted">{{ row.event_date ? formatDate(row.event_date) : '—' }}</span>
        </template>

        <template #cell.employee="{ row }">
          <span class="cell-strong nowrap">{{ employeeName(row.employee) }}</span>
        </template>

        <template #cell.event_type="{ row }">
          <Badge
            :tone="EVENT_TONE[row.event_type] || 'neutral'"
            dot
          >
            {{ row.event_type ? t(`event_kind_${row.event_type}`) : '—' }}
          </Badge>
        </template>

        <template #cell.description="{ row }">
          <span
            v-if="row.description"
            class="cell-muted hr-events-desc"
            :title="row.description"
          >{{ row.description }}</span>
          <span
            v-else
            class="cell-muted"
          >—</span>
        </template>

        <template #cell.old_value="{ row }">
          <span
            v-if="row.old_value"
            class="mono"
          >{{ row.old_value }}</span>
          <span
            v-else
            class="cell-muted"
          >—</span>
        </template>

        <template #cell.new_value="{ row }">
          <span
            v-if="row.new_value"
            class="mono"
          >{{ row.new_value }}</span>
          <span
            v-else
            class="cell-muted"
          >—</span>
        </template>

        <template #cell.created_by="{ row }">
          <span class="cell-muted">{{ row.created_by ? userName(row.created_by) : '—' }}</span>
        </template>

        <template #cell.created_at="{ row }">
          <span class="cell-muted">{{ row.created_at ? formatDate(row.created_at) : '—' }}</span>
        </template>

        <template #row-actions="{ row }">
          <IconAction
            icon="clock"
            tone="primary"
            :title="t('hr_event_action_timeline')"
            @click="openTimeline(row)"
          />
          <IconAction
            icon="info"
            tone="primary"
            :title="t('hr_event_action_view')"
            @click="openView(row)"
          />
        </template>

        <template #empty>
          <StateFill
            icon="inbox"
            :title="t('hr_event_empty_title')"
            :subtitle="t('hr_event_empty_subtitle')"
          >
            <template #action>
              <Button
                variant="primary"
                icon="plus"
                @click="openCreate"
              >
                {{ t('hr_event_action_log') }}
              </Button>
            </template>
          </StateFill>
        </template>
      </DataTable>
    </Card>

    <!-- Create event modal -->
    <Modal
      :open="createOpen"
      :title="t('hr_event_modal_create_title')"
      :subtitle="t('hr_events_subtitle')"
      class="hr-events-modal hr-events-modal--lg"
      @close="closeCreate"
    >
      <form @submit.prevent="submitCreate">
        <div class="form-grid hr-events-form-grid">
          <Field
            :label="t('hr_event_field_employee')"
            :error="errors.employee_id"
            class="span-2"
          >
            <Select
              v-model="form.employee_id"
              icon="employee"
              :options="employeeOptions"
              :placeholder="t('hr_event_filter_employee_all')"
            />
          </Field>

          <Field
            :label="t('hr_event_field_event_type')"
            :error="errors.event_type"
          >
            <Select
              v-model="form.event_type"
              icon="flag"
              :options="eventTypeOptions"
              :placeholder="t('hr_event_filter_type_all')"
            />
          </Field>

          <Field
            :label="t('hr_event_field_event_date')"
            :error="errors.event_date"
          >
            <Input
              v-model="form.event_date"
              icon="calendar"
              type="date"
            />
          </Field>

          <Field
            :label="t('hr_event_field_old_value')"
            :hint="t('hr_event_hint_old_value')"
          >
            <Input
              v-model="form.old_value"
              :placeholder="t('hr_event_field_old_value')"
            />
          </Field>

          <Field
            :label="t('hr_event_field_new_value')"
            :hint="t('hr_event_hint_new_value')"
          >
            <Input
              v-model="form.new_value"
              :placeholder="t('hr_event_field_new_value')"
            />
          </Field>

          <Field
            :label="t('hr_event_field_description')"
            class="span-2"
          >
            <Textarea
              v-model="form.description"
              rows="3"
              :placeholder="t('hr_event_field_description')"
              style="resize:vertical; min-height:80px;"
            />
          </Field>
        </div>
      </form>

      <template #footer>
        <Button
          variant="primary"
          icon="check"
          :loading="createBusy"
          :disabled="createBusy"
          @click="submitCreate"
        >
          {{ t('hr_event_action_log') }}
        </Button>
      </template>
    </Modal>

    <!-- View details modal -->
    <Modal
      :open="viewOpen"
      :title="t('hr_event_modal_view_title')"
      class="hr-events-modal hr-events-modal--md"
      @close="closeView"
    >
      <div
        v-if="viewLoading"
        style="padding:24px;text-align:center;"
        class="cell-muted"
      >
        {{ t('Loading') }}…
      </div>
      <div
        v-else-if="viewRow"
        class="form-grid hr-events-form-grid"
      >
        <Field
          :label="t('hr_event_field_employee')"
          class="span-2"
        >
          <Input
            class="is-disabled"
            icon="employee"
            :model-value="employeeName(viewRow.employee)"
            disabled
          />
        </Field>

        <Field :label="t('hr_event_field_event_type')">
          <div
            class="row"
            style="gap:10px;align-items:center;height:42px;"
          >
            <Badge
              :tone="EVENT_TONE[viewRow.event_type] || 'neutral'"
              dot
            >
              {{ viewRow.event_type ? t(`event_kind_${viewRow.event_type}`) : '—' }}
            </Badge>
          </div>
        </Field>

        <Field :label="t('hr_event_field_event_date')">
          <Input
            class="is-disabled"
            icon="calendar"
            :model-value="viewRow.event_date ? formatDate(viewRow.event_date) : '—'"
            disabled
          />
        </Field>

        <Field :label="t('hr_event_field_old_value')">
          <Input
            :model-value="viewRow.old_value || '—'"
            disabled
            class="mono is-disabled"
          />
        </Field>

        <Field :label="t('hr_event_field_new_value')">
          <Input
            :model-value="viewRow.new_value || '—'"
            disabled
            class="mono is-disabled"
          />
        </Field>

        <Field
          :label="t('hr_event_field_description')"
          class="span-2"
        >
          <Textarea
            class="is-disabled"
            :value="viewRow.description || '—'"
            disabled
            rows="3"
            style="resize:none;"
          />
        </Field>

        <Field :label="t('hr_event_field_created_by')">
          <Input
            class="is-disabled"
            icon="user"
            :model-value="viewRow.created_by ? userName(viewRow.created_by) : '—'"
            disabled
          />
        </Field>

        <Field :label="t('hr_event_field_created_at')">
          <Input
            class="is-disabled"
            icon="clock"
            :model-value="viewRow.created_at ? formatDate(viewRow.created_at) : '—'"
            disabled
          />
        </Field>
      </div>

      <template #footer>
        <Button
          variant="ghost"
          @click="closeView"
        >
          {{ t('Close') }}
        </Button>
        <Button
          v-if="viewRow"
          variant="secondary"
          icon="clock"
          @click="openTimeline(viewRow); closeView()"
        >
          {{ t('hr_event_action_timeline') }}
        </Button>
      </template>
    </Modal>

    <!-- Timeline modal -->
    <Modal
      :open="timelineOpen"
      :title="t('hr_event_timeline_title')"
      :subtitle="employeeName(timelineEmployee)"
      class="hr-events-modal hr-events-modal--xl"
      @close="closeTimeline"
    >
      <div
        v-if="timelineLoading"
        style="padding:24px;text-align:center;"
        class="cell-muted"
      >
        {{ t('Loading') }}…
      </div>
      <div
        v-else-if="timelineEvents.length === 0"
        style="padding:8px 0;"
      >
        <StateFill
          icon="clock"
          :title="t('hr_event_timeline_empty')"
        />
      </div>
      <ol
        v-else
        class="timeline"
      >
        <li
          v-for="ev in timelineEvents"
          :key="ev.id"
          class="timeline__item"
        >
          <div
            class="timeline__dot"
            :class="`t-${EVENT_TONE[ev.event_type] || 'neutral'}`"
          >
            <DesignIcon
              name="flag"
              :size="14"
            />
          </div>
          <div class="timeline__body">
            <div
              class="row"
              style="gap:10px;align-items:center;flex-wrap:wrap;"
            >
              <Badge
                :tone="EVENT_TONE[ev.event_type] || 'neutral'"
                dot
              >
                {{ ev.event_type ? t(`event_kind_${ev.event_type}`) : '—' }}
              </Badge>
              <span class="cell-muted">{{ ev.event_date ? formatDate(ev.event_date) : '—' }}</span>
            </div>
            <div
              v-if="ev.description"
              style="margin-top:6px;"
            >
              {{ ev.description }}
            </div>
            <div
              v-if="ev.old_value || ev.new_value"
              class="row"
              style="gap:8px;margin-top:8px;flex-wrap:wrap;"
            >
              <span
                v-if="ev.old_value"
                class="chip"
              >
                <span class="cell-muted">{{ t('hr_event_field_old_value') }}:</span>
                <b class="mono">{{ ev.old_value }}</b>
              </span>
              <span
                v-if="ev.new_value"
                class="chip"
              >
                <span class="cell-muted">{{ t('hr_event_field_new_value') }}:</span>
                <b class="mono">{{ ev.new_value }}</b>
              </span>
            </div>
            <div
              v-if="ev.created_by || ev.created_at"
              class="cell-muted"
              style="margin-top:6px;font-size:12px;"
            >
              {{ ev.created_by ? userName(ev.created_by) : '—' }}
              <span v-if="ev.created_at"> · {{ formatDate(ev.created_at) }}</span>
            </div>
          </div>
        </li>
      </ol>

      <template #footer>
        <Button
          variant="ghost"
          @click="closeTimeline"
        >
          {{ t('Close') }}
        </Button>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.hr-events-toolbar {
  flex-wrap: wrap;
}
.hr-events-toolbar__search {
  flex: 1;
  max-width: 320px;
  min-width: 200px;
}
.hr-events-toolbar__filter {
  width: 220px;
}
.hr-events-desc {
  display: inline-block;
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}
@media (max-width: 900px) {
  .hr-events-toolbar__search,
  .hr-events-toolbar__filter {
    width: 100%;
    max-width: none;
  }
  .hr-events-desc {
    max-width: 180px;
  }
  .hr-events-form-grid {
    grid-template-columns: 1fr !important;
  }
  .hr-events-form-grid :deep(.span-2) {
    grid-column: span 1 !important;
  }
}
@media (max-width: 768px) {
  .hr-events-toolbar__search {
    min-width: 0;
  }
}
</style>

<!-- Non-scoped so it can reach teleported .modal element (Modal class lands on the .overlay root) -->
<style>
.overlay.hr-events-modal--md > .modal { max-width: 560px; }
.overlay.hr-events-modal--lg > .modal { max-width: 640px; }
.overlay.hr-events-modal--xl > .modal { max-width: 680px; }
@media (max-width: 768px) {
  .overlay.hr-events-modal--md > .modal,
  .overlay.hr-events-modal--lg > .modal,
  .overlay.hr-events-modal--xl > .modal { max-width: 100%; }
}
.timeline {
  list-style: none;
  margin: 0;
  padding: 4px 0 0;
  position: relative;
}
.timeline::before {
  content: '';
  position: absolute;
  left: 13px;
  top: 6px;
  bottom: 6px;
  width: 2px;
  background: var(--border, rgba(127, 127, 127, 0.18));
}
.timeline__item {
  position: relative;
  padding: 10px 0 18px 40px;
}
.timeline__item:last-child {
  padding-bottom: 4px;
}
.timeline__dot {
  position: absolute;
  left: 0;
  top: 8px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--surface, #fff);
  border: 2px solid currentColor;
}
.timeline__body {
  min-width: 0;
}
</style>

<route lang="yaml">
meta:
  action: manage
  subject: all
</route>
