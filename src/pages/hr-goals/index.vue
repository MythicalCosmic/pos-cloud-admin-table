<script setup lang="ts">
import WorkspacePage from '@/components/design/workspace/WorkspacePage.vue'
import Textarea from '@/components/design/Textarea.vue'
/* ============================================================
   HR — Performance Goals
   Track employee objectives, target dates and progress.
   Uses alpha-design primitives (PageHeader, DataTable, Modal,
   Field, Input, Select, Button, Badge, IconAction, StateFill).
   Wired to hrApi → /api/admins/hr/goals/.
   ============================================================ */
import type { DataTableColumn } from '@/components/design/DataTable.vue'
import { hrApi as axios } from '@/plugins/axios'
import Badge from '@/components/design/Badge.vue'
import Button from '@/components/design/Button.vue'
import Card from '@/components/design/Card.vue'
import DataTable from '@/components/design/DataTable.vue'
import Field from '@/components/design/Field.vue'
import IconAction from '@/components/design/IconAction.vue'
import Input from '@/components/design/Input.vue'
import Modal from '@/components/design/Modal.vue'
import PageHeader from '@/components/design/PageHeader.vue'
import Select from '@/components/design/Select.vue'
import StateFill from '@/components/design/StateFill.vue'

const { t } = useI18n({ useScope: 'global' })
const { notify } = useNotify()
const { formatDate } = useFormatters()

// ----------------------------------------------------------------
// Enum + tone maps
// ----------------------------------------------------------------
const GOAL_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELED'] as const
type GoalStatus = typeof GOAL_STATUSES[number]

const STATUS_TONE: Record<string, 'success' | 'warning' | 'error' | 'info' | 'primary' | 'neutral'> = {
  PENDING: 'warning',
  IN_PROGRESS: 'info',
  COMPLETED: 'success',
  CANCELED: 'error',
}

function tone(v: string | undefined | null): 'success' | 'warning' | 'error' | 'info' | 'primary' | 'neutral' {
  if (!v)
    return 'neutral'

  return STATUS_TONE[v] ?? 'neutral'
}

// ----------------------------------------------------------------
// State
// ----------------------------------------------------------------
const items = ref<any[]>([])
const total = ref(0)
const loading = ref(false)

const page = ref(1)
const itemsPerPage = ref(20)

// Create modal
const createOpen = ref(false)
const createBusy = ref(false)
const createForm = ref<{
  employee_id: string
  title: string
  description: string
  target_date: string
}>({
  employee_id: '',
  title: '',
  description: '',
  target_date: '',
})
const createErrors = ref<Record<string, string>>({})

// Edit modal
const editOpen = ref(false)
const editBusy = ref(false)
const editing = ref<any>(null)
const editForm = ref<{
  title: string
  description: string
  target_date: string
  notes: string
}>({
  title: '',
  description: '',
  target_date: '',
  notes: '',
})
const editErrors = ref<Record<string, string>>({})

// Progress modal
const progressOpen = ref(false)
const progressBusy = ref(false)
const progressTarget = ref<any>(null)
const progressForm = ref<{ progress_percent: number, status: GoalStatus }>({
  progress_percent: 0,
  status: 'IN_PROGRESS',
})

// Per-row action lock
const actingOnId = ref<number | string | null>(null)

// ----------------------------------------------------------------
// Option lists
// ----------------------------------------------------------------
const statusFormOptions = computed(() => GOAL_STATUSES.map(s => ({
  value: s,
  label: t(`goal_status_${s}`),
})))

// ----------------------------------------------------------------
// Data load
// ----------------------------------------------------------------
async function load() {
  loading.value = true
  try {
    const params: any = { page: page.value, per_page: itemsPerPage.value }

    const res = await axios.get('/goals/', { params })
    const d = res.data?.data ?? res.data
    items.value = d?.goals ?? d?.items ?? d?.results ?? []
    total.value = d?.pagination?.total_items ?? d?.pagination?.total ?? d?.count ?? items.value.length
  }
  catch {
    notify(t('Failed to load'), 'error')
  }
  finally {
    loading.value = false
  }
}

onMounted(load)

watch([page, itemsPerPage], load)

// ----------------------------------------------------------------
// Create
// ----------------------------------------------------------------
function openCreate() {
  createForm.value = { employee_id: '', title: '', description: '', target_date: '' }
  createErrors.value = {}
  createOpen.value = true
}
function closeCreate() {
  if (createBusy.value)
    return
  createOpen.value = false
}
function validateCreate(): boolean {
  const errs: Record<string, string> = {}

  if (!createForm.value.employee_id.trim())
    errs.employee_id = t('hr_goals_employee_id') as string
  if (!createForm.value.title.trim())
    errs.title = t('hr_goals_title_field') as string
  createErrors.value = errs

  return Object.keys(errs).length === 0
}
async function submitCreate() {
  if (!validateCreate()) {
    notify(t('Please fill all required fields'), 'error')

    return
  }
  createBusy.value = true
  try {
    const payload: any = {
      employee_id: createForm.value.employee_id.trim(),
      title: createForm.value.title.trim(),
    }
    if (createForm.value.description.trim())
      payload.description = createForm.value.description.trim()
    if (createForm.value.target_date)
      payload.target_date = createForm.value.target_date

    await axios.post('/goals/', payload)
    notify(t('hr_goals_created'))
    createOpen.value = false
    await load()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
  finally {
    createBusy.value = false
  }
}

// ----------------------------------------------------------------
// Edit
// ----------------------------------------------------------------
function openEdit(row: any) {
  editing.value = row
  editForm.value = {
    title: row.title ?? '',
    description: row.description ?? '',
    target_date: row.target_date ?? '',
    notes: row.notes ?? '',
  }
  editErrors.value = {}
  editOpen.value = true
}
function closeEdit() {
  if (editBusy.value)
    return
  editOpen.value = false
  editing.value = null
}
function validateEdit(): boolean {
  const errs: Record<string, string> = {}

  if (!editForm.value.title.trim())
    errs.title = t('hr_goals_title_field') as string
  editErrors.value = errs

  return Object.keys(errs).length === 0
}
async function submitEdit() {
  if (!editing.value)
    return
  if (!validateEdit()) {
    notify(t('Please fill all required fields'), 'error')

    return
  }
  editBusy.value = true
  try {
    const payload: any = { title: editForm.value.title.trim() }

    if (editForm.value.description.trim())
      payload.description = editForm.value.description.trim()
    if (editForm.value.target_date)
      payload.target_date = editForm.value.target_date
    if (editForm.value.notes.trim())
      payload.notes = editForm.value.notes.trim()

    await axios.put(`/goals/${editing.value.id}/`, payload)
    notify(t('hr_goals_updated'))
    editOpen.value = false
    editing.value = null
    await load()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
  finally {
    editBusy.value = false
  }
}

// ----------------------------------------------------------------
// Progress
// ----------------------------------------------------------------
function openProgress(row: any) {
  progressTarget.value = row
  const raw = Number(row.progress_percent ?? 0)
  progressForm.value = {
    progress_percent: Number.isFinite(raw) ? Math.max(0, Math.min(100, raw)) : 0,
    status: (GOAL_STATUSES as readonly string[]).includes(row.status) ? row.status : 'IN_PROGRESS',
  }
  progressOpen.value = true
}
function closeProgress() {
  if (progressBusy.value)
    return
  progressOpen.value = false
  progressTarget.value = null
}
async function submitProgress() {
  if (!progressTarget.value)
    return
  const pct = Number(progressForm.value.progress_percent)

  if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
    notify(t('hr_goals_progress_hint'), 'error')

    return
  }
  progressBusy.value = true
  actingOnId.value = progressTarget.value.id
  try {
    await axios.post(`/goals/${progressTarget.value.id}/progress/`, {
      progress_percent: pct,
      status: progressForm.value.status,
    })
    notify(t('hr_goals_progress_updated'))
    progressOpen.value = false
    progressTarget.value = null
    await load()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
  finally {
    progressBusy.value = false
    actingOnId.value = null
  }
}

// ----------------------------------------------------------------
// ESC handler
// ----------------------------------------------------------------
function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape')
    return
  if (progressOpen.value) {
    closeProgress(); e.preventDefault(); return
  }
  if (editOpen.value) {
    closeEdit(); e.preventDefault(); return
  }
  if (createOpen.value) {
    closeCreate(); e.preventDefault()
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

// ----------------------------------------------------------------
// Columns
// ----------------------------------------------------------------
const columns = computed<DataTableColumn<any>[]>(() => [
  { key: 'id', label: t('ID'), width: 90 },
  { key: 'employee', label: t('hr_goals_employee') },
  { key: 'title', label: t('hr_goals_title_field') },
  { key: 'target_date', label: t('hr_goals_target_date') },
  { key: 'status', label: t('hr_goals_status') },
  { key: 'progress_percent', label: t('hr_goals_progress_percent'), align: 'right' },
  { key: 'created_by', label: t('hr_goals_created_by') },
])

const dtPagination = computed(() => ({
  page: page.value,
  perPage: itemsPerPage.value,
  total: total.value,
  onPage: (p: number) => { page.value = p },
  onPerPage: (n: number) => { itemsPerPage.value = n; page.value = 1 },
}))

// ----------------------------------------------------------------
// Field helpers
// ----------------------------------------------------------------
function employeeOf(row: any): string {
  const e = row.employee
  if (e) {
    const u = e.user
    if (u) {
      const name = [u.first_name, u.last_name].filter(Boolean).join(' ').trim()
      if (name)
        return name
    }
    if (e.id)
      return `#${e.id}`
  }

  return '—'
}

function creatorOf(row: any): string {
  const cb = row.created_by
  if (cb) {
    const name = [cb.first_name, cb.last_name].filter(Boolean).join(' ').trim()
    if (name)
      return name
  }

  return '—'
}

function progressOf(row: any): number {
  const v = Number(row.progress_percent ?? 0)

  return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 0
}
</script>

<template>
  <WorkspacePage class="page">
    <!-- Page header -->
    <PageHeader
      :title="t('hr_goals_title')"
      :subtitle="t('hr_goals_subtitle')"
    >
      <template #actions>
        <Button
          variant="primary"
          icon="plus"
          @click="openCreate"
        >
          {{ t('hr_goals_new') }}
        </Button>
      </template>
    </PageHeader>

    <!-- Main card -->
    <Card>
      <!-- DataTable -->
      <DataTable
        :columns="columns"
        :rows="items"
        row-key="id"
        :loading="loading"
        :pagination="dtPagination"
        :per-page-options="[10, 20, 50, 100]"
      >
        <template #cell.id="{ row }">
          <span class="mono cell-muted">#{{ row.id }}</span>
        </template>

        <template #cell.employee="{ row }">
          <span class="cell-strong nowrap">{{ employeeOf(row) }}</span>
        </template>

        <template #cell.title="{ row }">
          <span class="cell-strong">{{ row.title ?? '—' }}</span>
        </template>

        <template #cell.target_date="{ row }">
          <span class="mono cell-muted nowrap">{{ row.target_date ? formatDate(row.target_date) : '—' }}</span>
        </template>

        <template #cell.status="{ row }">
          <Badge :tone="tone(row.status)" dot>
            {{ row.status ? t(`goal_status_${row.status}`) : '—' }}
          </Badge>
        </template>

        <template #cell.progress_percent="{ row }">
          <div
            class="row progress-cell"
            style="gap:8px;align-items:center;justify-content:flex-end;"
          >
            <div
              class="progress-cell__bar"
              aria-hidden="true"
            >
              <div
                :style="{
                  width: `${progressOf(row)}%`,
                  height: '100%',
                  background: 'rgb(var(--v-theme-primary))',
                  borderRadius: '99px',
                }"
              />
            </div>
            <span class="mono cell-strong" style="min-width:38px;text-align:right;">{{ progressOf(row) }}%</span>
          </div>
        </template>

        <template #cell.created_by="{ row }">
          <span class="cell-muted">{{ creatorOf(row) }}</span>
        </template>

        <!-- Row actions -->
        <template #row-actions="{ row }">
          <IconAction
            icon="target"
            tone="primary"
            :title="t('hr_goals_progress')"
            :disabled="actingOnId === row.id"
            @click="openProgress(row)"
          />
          <IconAction
            icon="pencil"
            tone="primary"
            :title="t('hr_goals_edit')"
            :disabled="actingOnId === row.id"
            @click="openEdit(row)"
          />
        </template>

        <!-- Empty state -->
        <template #empty>
          <StateFill
            icon="target"
            :title="t('hr_goals_empty')"
            :sub="t('hr_goals_empty_hint')"
          >
            <div style="margin-top:12px;">
              <Button variant="primary" icon="plus" @click="openCreate">
                {{ t('hr_goals_new') }}
              </Button>
            </div>
          </StateFill>
        </template>
      </DataTable>
    </Card>

    <!-- Create modal -->
    <Modal
      :open="createOpen"
      :title="t('hr_goals_new')"
      :subtitle="t('hr_goals_subtitle')"
      :width="600"
      @close="closeCreate"
    >
      <form @submit.prevent="submitCreate">
        <div class="form-grid">
          <Field
            :label="t('hr_goals_employee_id')"
            class="span-2"
            :error="createErrors.employee_id ? (t('hr_goals_employee_id') as string) : ''"
          >
            <Input
              v-model="createForm.employee_id"
              icon="employee"
              :placeholder="t('hr_goals_employee_id')"
              :error="!!createErrors.employee_id"
            />
          </Field>

          <Field
            :label="t('hr_goals_title_field')"
            class="span-2"
            :error="createErrors.title ? (t('hr_goals_title_field') as string) : ''"
          >
            <Input
              v-model="createForm.title"
              :placeholder="t('hr_goals_title_field')"
              :error="!!createErrors.title"
            />
          </Field>

          <Field
            :label="t('hr_goals_description')"
            class="span-2"
          >
            <Textarea
              v-model="createForm.description"
              rows="3"
              style="font-family:inherit; font-size:14px; resize:vertical;"
              :placeholder="t('hr_goals_description')"
            />
          </Field>

          <Field
            :label="t('hr_goals_target_date')"
            class="span-2"
          >
            <Input
              v-model="createForm.target_date"
              icon="calendar"
              type="date"
              :aria-label="t('hr_goals_target_date')"
            />
          </Field>
        </div>
      </form>

      <template #footer>
        <Button
          variant="ghost"
          :disabled="createBusy"
          @click="closeCreate"
        >
          {{ t('hr_goals_cancel') }}
        </Button>
        <Button
          variant="primary"
          icon="check"
          :loading="createBusy"
          :disabled="createBusy"
          @click="submitCreate"
        >
          {{ t('hr_goals_create') }}
        </Button>
      </template>
    </Modal>

    <!-- Edit modal -->
    <Modal
      :open="editOpen"
      :title="t('hr_goals_edit')"
      :subtitle="editing ? `#${editing.id}` : ''"
      :width="600"
      @close="closeEdit"
    >
      <form @submit.prevent="submitEdit">
        <div class="form-grid">
          <Field
            :label="t('hr_goals_title_field')"
            class="span-2"
            :error="editErrors.title ? (t('hr_goals_title_field') as string) : ''"
          >
            <Input
              v-model="editForm.title"
              :placeholder="t('hr_goals_title_field')"
              :error="!!editErrors.title"
            />
          </Field>

          <Field
            :label="t('hr_goals_description')"
            class="span-2"
          >
            <Textarea
              v-model="editForm.description"
              rows="3"
              style="font-family:inherit; font-size:14px; resize:vertical;"
              :placeholder="t('hr_goals_description')"
            />
          </Field>

          <Field
            :label="t('hr_goals_target_date')"
            class="span-2"
          >
            <Input
              v-model="editForm.target_date"
              icon="calendar"
              type="date"
              :aria-label="t('hr_goals_target_date')"
            />
          </Field>

          <Field
            :label="t('hr_goals_notes')"
            class="span-2"
          >
            <Textarea
              v-model="editForm.notes"
              rows="3"
              style="font-family:inherit; font-size:14px; resize:vertical;"
              :placeholder="t('hr_goals_notes')"
            />
          </Field>
        </div>
      </form>

      <template #footer>
        <Button
          variant="ghost"
          :disabled="editBusy"
          @click="closeEdit"
        >
          {{ t('hr_goals_cancel') }}
        </Button>
        <Button
          variant="primary"
          icon="check"
          :loading="editBusy"
          :disabled="editBusy"
          @click="submitEdit"
        >
          {{ t('hr_goals_save') }}
        </Button>
      </template>
    </Modal>

    <!-- Progress modal -->
    <Modal
      :open="progressOpen"
      :title="t('hr_goals_progress')"
      :subtitle="progressTarget ? `#${progressTarget.id} · ${progressTarget.title ?? ''}` : ''"
      :width="480"
      @close="closeProgress"
    >
      <div class="form-grid">
        <Field
          :label="t('hr_goals_progress_percent')"
          class="span-2"
          :hint="t('hr_goals_progress_hint')"
        >
          <Input
            icon="target"
            :model-value="progressForm.progress_percent"
            type="number"
            min="0"
            max="100"
            step="1"
            :aria-label="t('hr_goals_progress_percent')"
            @input="(e: Event) => progressForm.progress_percent = Number((e.target as HTMLInputElement).value)"
          />
        </Field>

        <Field
          :label="t('hr_goals_status')"
          class="span-2"
        >
          <Select
            :model-value="progressForm.status"
            :options="statusFormOptions"
            @update:model-value="(v: string) => {
              if ((GOAL_STATUSES as readonly string[]).includes(v))
                progressForm.status = v as GoalStatus
            }"
          />
        </Field>

        <!-- Live preview bar -->
        <div class="span-2" style="display:flex;flex-direction:column;gap:6px;">
          <div
            style="width:100%;height:8px;background:rgb(var(--v-theme-surface-inset));border-radius:99px;overflow:hidden;"
            aria-hidden="true"
          >
            <div
              :style="{
                width: `${Math.max(0, Math.min(100, Number(progressForm.progress_percent) || 0))}%`,
                height: '100%',
                background: 'rgb(var(--v-theme-primary))',
                borderRadius: '99px',
              }"
            />
          </div>
          <div class="row" style="justify-content:space-between;font-size:12px;color:var(--text-tertiary);">
            <span>{{ t('progress_min_pct') }}</span>
            <span class="mono">{{ Math.max(0, Math.min(100, Number(progressForm.progress_percent) || 0)) }}%</span>
            <span>{{ t('progress_max_pct') }}</span>
          </div>
        </div>
      </div>

      <template #footer>
        <Button
          variant="ghost"
          :disabled="progressBusy"
          @click="closeProgress"
        >
          {{ t('hr_goals_cancel') }}
        </Button>
        <Button
          variant="primary"
          icon="check"
          :loading="progressBusy"
          :disabled="progressBusy"
          @click="submitProgress"
        >
          {{ t('hr_goals_save') }}
        </Button>
      </template>
    </Modal>

  </WorkspacePage>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
}

.tb-wrap {
  flex-wrap: wrap;
  gap: 12px;
}

.tb-search {
  flex: 1 1 240px;
  max-inline-size: 280px;
  min-inline-size: 200px;
}

.tb-status {
  inline-size: 200px;
  flex: 0 0 200px;
}

.progress-cell__bar {
  inline-size: 80px;
  block-size: 6px;
  background: rgb(var(--v-theme-surface-inset));
  border-radius: 99px;
  overflow: hidden;
}

@media (max-width: 1024px) {
  .tb-status {
    inline-size: auto;
    flex: 1 1 200px;
  }
}

@media (max-width: 768px) {
  .tb-wrap {
    flex-direction: column;
    align-items: stretch;
  }

  .tb-search,
  .tb-status {
    inline-size: 100%;
    max-inline-size: none;
    flex: 1 1 100%;
  }

  .progress-cell__bar {
    inline-size: 56px;
  }

  :deep(.form-grid) {
    grid-template-columns: 1fr;
  }

  :deep(.form-grid .span-2) {
    grid-column: 1 / -1;
  }
}
</style>

<route lang="yaml">
meta:
  action: manage
  subject: all
</route>
