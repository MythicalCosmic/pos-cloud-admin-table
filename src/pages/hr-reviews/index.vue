<script setup lang="ts">
import WorkspacePage from '@/components/design/workspace/WorkspacePage.vue'
import WorkspaceToolbar from '@/components/design/workspace/WorkspaceToolbar.vue'
import Textarea from '@/components/design/Textarea.vue'
/* ============================================================
   HR PERFORMANCE REVIEWS — list + create + edit + submit + ack
   Plain HTML + design primitives (PageHeader / Card / DataTable /
   Modal / Field / Input / Select / Badge / IconAction /
   StateFill / DesignIcon). No Vuetify on this surface.
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
import StateFill from '@/components/design/StateFill.vue'

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

// Filters per spec
const employeeFilter = ref<string>('')
const statusFilter = ref<string>('')

// Enums per spec
const REVIEW_STATUSES = ['DRAFT', 'SUBMITTED', 'ACKNOWLEDGED'] as const
type ReviewStatus = typeof REVIEW_STATUSES[number]

// ============================================================
// Tone maps
// ============================================================
const STATUS_TONE: Record<string, 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'primary'> = {
  DRAFT: 'neutral',
  SUBMITTED: 'warning',
  ACKNOWLEDGED: 'success',
}

// ============================================================
// API
// ============================================================
async function load() {
  loading.value = true
  try {
    const params: Record<string, any> = { page: page.value, per_page: itemsPerPage.value }
    // BE GET /reviews/ does NOT currently filter by employee_id/status, but
    // we still pass them in case BE adds support. Client-side filter applied below.
    if (employeeFilter.value) params.employee_id = employeeFilter.value
    if (statusFilter.value) params.status = statusFilter.value
    const res = await axios.get('/reviews/', { params })
    const d = res.data?.data ?? res.data
    let rows = d?.reviews ?? []
    // Client-side filter fallback (BE ignores filter params)
    if (employeeFilter.value) {
      const empId = String(employeeFilter.value).trim()
      rows = rows.filter((r: any) => String(r.employee?.id ?? '') === empId)
    }
    if (statusFilter.value)
      rows = rows.filter((r: any) => r.status === statusFilter.value)
    items.value = rows
    total.value = d?.pagination?.total ?? items.value.length
  }
  catch {
    notify(t('Failed to load'), 'error')
  }
  finally {
    loading.value = false
  }
}

onMounted(() => { load() })
watch([page, itemsPerPage], load)
const debouncedEmployee = useDebounceFn(() => { page.value = 1; load() }, 400)
watch(employeeFilter, debouncedEmployee)
watch(statusFilter, () => { page.value = 1; load() })

// ============================================================
// Create modal
// ============================================================
interface CreateForm {
  employee_id: number | string
  period_start: string
  period_end: string
  rating: number | string
  strengths: string
  improvements: string
  goals: string
}
const blankCreateForm = (): CreateForm => ({
  employee_id: '',
  period_start: '',
  period_end: '',
  rating: 3,
  strengths: '',
  improvements: '',
  goals: '',
})

const createOpen = ref(false)
const createSaving = ref(false)
const createForm = ref<CreateForm>(blankCreateForm())
const createErrors = ref<Record<string, string>>({})

function openCreate() {
  createForm.value = blankCreateForm()
  createErrors.value = {}
  createOpen.value = true
}

function closeCreate() {
  if (createSaving.value) return
  createOpen.value = false
}

function validateCreate(): boolean {
  const e: Record<string, string> = {}
  if (!createForm.value.employee_id) e.employee_id = t('Required')
  if (!createForm.value.period_start) e.period_start = t('Required')
  if (!createForm.value.period_end) e.period_end = t('Required')
  const r = createForm.value.rating === '' ? null : Number(createForm.value.rating)
  if (r !== null && (Number.isNaN(r) || r < 1 || r > 5))
    e.rating = t('Rating (1-5)')
  createErrors.value = e
  return Object.keys(e).length === 0
}

async function submitCreate() {
  if (!validateCreate()) return
  createSaving.value = true
  try {
    const payload: any = {
      employee_id: Number(createForm.value.employee_id),
      period_start: createForm.value.period_start,
      period_end: createForm.value.period_end,
    }
    if (createForm.value.rating !== '' && createForm.value.rating !== null)
      payload.rating = Number(createForm.value.rating)
    if (createForm.value.strengths) payload.strengths = createForm.value.strengths
    if (createForm.value.improvements) payload.improvements = createForm.value.improvements
    if (createForm.value.goals) payload.goals = createForm.value.goals
    await axios.post('/reviews/', payload)
    notify(t('Review created'))
    createOpen.value = false
    await load()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
  finally {
    createSaving.value = false
  }
}

// ============================================================
// Edit modal — DRAFT only
// ============================================================
interface EditForm {
  review_period_start: string
  review_period_end: string
  rating: number | string
  strengths: string
  improvements: string
  goals: string
}
const editOpen = ref(false)
const editSaving = ref(false)
const editingId = ref<number | null>(null)
const editForm = ref<EditForm>({
  review_period_start: '',
  review_period_end: '',
  rating: '',
  strengths: '',
  improvements: '',
  goals: '',
})
const editErrors = ref<Record<string, string>>({})

function openEdit(row: any) {
  if (row.status !== 'DRAFT') {
    notify(t('Only DRAFT reviews can be edited'), 'error')
    return
  }
  editingId.value = row.id
  editForm.value = {
    review_period_start: row.review_period_start ?? '',
    review_period_end: row.review_period_end ?? '',
    rating: row.rating ?? '',
    strengths: row.strengths ?? '',
    improvements: row.improvements ?? '',
    goals: row.goals ?? '',
  }
  editErrors.value = {}
  editOpen.value = true
}

function closeEdit() {
  if (editSaving.value) return
  editOpen.value = false
  editingId.value = null
}

function validateEdit(): boolean {
  const e: Record<string, string> = {}
  if (!editForm.value.review_period_start) e.review_period_start = t('Required')
  if (!editForm.value.review_period_end) e.review_period_end = t('Required')
  const r = editForm.value.rating === '' ? null : Number(editForm.value.rating)
  if (r !== null && (Number.isNaN(r) || r < 1 || r > 5))
    e.rating = t('Rating (1-5)')
  editErrors.value = e
  return Object.keys(e).length === 0
}

async function submitEdit() {
  if (!validateEdit() || editingId.value == null) return
  editSaving.value = true
  try {
    const payload: any = {
      review_period_start: editForm.value.review_period_start,
      review_period_end: editForm.value.review_period_end,
    }
    if (editForm.value.rating !== '' && editForm.value.rating !== null)
      payload.rating = Number(editForm.value.rating)
    if (editForm.value.strengths !== undefined) payload.strengths = editForm.value.strengths
    if (editForm.value.improvements !== undefined) payload.improvements = editForm.value.improvements
    if (editForm.value.goals !== undefined) payload.goals = editForm.value.goals
    await axios.put(`/reviews/${editingId.value}/`, payload)
    notify(t('Review updated'))
    editOpen.value = false
    editingId.value = null
    await load()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
  finally {
    editSaving.value = false
  }
}

// ============================================================
// Submit / Acknowledge — confirm modals
// ============================================================
const confirmOpen = ref(false)
const confirmSaving = ref(false)
const confirmKind = ref<'submit' | 'acknowledge' | null>(null)
const confirmTarget = ref<any | null>(null)

function askSubmit(row: any) {
  confirmKind.value = 'submit'
  confirmTarget.value = row
  confirmOpen.value = true
}

function askAcknowledge(row: any) {
  confirmKind.value = 'acknowledge'
  confirmTarget.value = row
  confirmOpen.value = true
}

function closeConfirm() {
  if (confirmSaving.value) return
  confirmOpen.value = false
  confirmKind.value = null
  confirmTarget.value = null
}

const confirmTitle = computed(() => {
  if (confirmKind.value === 'submit') return t('Submit Review')
  if (confirmKind.value === 'acknowledge') return t('Acknowledge Review')
  return ''
})

const confirmBody = computed(() => {
  if (confirmKind.value === 'submit')
    return t('Submit this review? You won\'t be able to edit it after.')
  if (confirmKind.value === 'acknowledge')
    return t('Acknowledge this review on behalf of the employee?')
  return ''
})

async function runConfirm() {
  if (!confirmTarget.value || !confirmKind.value) return
  confirmSaving.value = true
  try {
    if (confirmKind.value === 'submit') {
      await axios.post(`/reviews/${confirmTarget.value.id}/submit/`)
      notify(t('Review submitted'))
    }
    else {
      await axios.post(`/reviews/${confirmTarget.value.id}/acknowledge/`)
      notify(t('Review acknowledged'))
    }
    confirmOpen.value = false
    confirmKind.value = null
    confirmTarget.value = null
    await load()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
  finally {
    confirmSaving.value = false
  }
}

// ============================================================
// View detail
// ============================================================
const viewOpen = ref(false)
const viewLoading = ref(false)
const viewDetail = ref<any>(null)

async function openView(row: any) {
  viewDetail.value = row
  viewOpen.value = true
  viewLoading.value = true
  try {
    const res = await axios.get(`/reviews/${row.id}/`)
    // BE returns { success, message, data: { review: {...} } } — unwrap .review
    viewDetail.value = res.data?.data?.review ?? res.data?.data ?? res.data ?? row
  }
  catch { /* keep row */ }
  finally {
    viewLoading.value = false
  }
}

function closeView() {
  viewOpen.value = false
  viewDetail.value = null
}

// ============================================================
// Filter chips
// ============================================================
const activeFilters = computed(() => {
  const out: { k: string; label: string; val: string; clear: () => void }[] = []
  if (employeeFilter.value)
    out.push({ k: 'emp', label: t('Employee ID'), val: employeeFilter.value, clear: () => { employeeFilter.value = '' } })
  if (statusFilter.value)
    out.push({ k: 'st', label: t('Status'), val: t(`review_status_${statusFilter.value}`), clear: () => { statusFilter.value = '' } })
  return out
})

function clearAllFilters() {
  employeeFilter.value = ''
  statusFilter.value = ''
}

// ============================================================
// Filter options
// ============================================================
const statusOptions = computed(() => [
  { value: '', label: t('All statuses') },
  ...REVIEW_STATUSES.map(v => ({ value: v, label: t(`review_status_${v}`) })),
])

// ============================================================
// Columns
// ============================================================
const columns: DataTableColumn<any>[] = [
  { key: 'id', label: t('ID'), sortable: true, width: 90 },
  // Synthetic keys — BE returns nested `employee: { user: { first_name, last_name } }`
  // and `reviewer: { first_name, last_name }`; no scalar field exists, so sort is disabled.
  { key: 'employee_name', label: t('Employee'), sortable: false },
  { key: 'reviewer_name', label: t('Reviewer'), sortable: false },
  { key: 'review_period_start', label: t('Period Start'), sortable: true, width: 130 },
  { key: 'review_period_end', label: t('Period End'), sortable: true, width: 130 },
  { key: 'rating', label: t('Rating'), sortable: true, align: 'right', width: 100 },
  { key: 'status', label: t('Status'), sortable: true, width: 140 },
  { key: 'submitted_at', label: t('Submitted'), sortable: true, width: 140 },
  { key: 'acknowledged_at', label: t('Acknowledged'), sortable: true, width: 140 },
]

const tablePagination = computed(() => ({
  page: page.value,
  perPage: itemsPerPage.value,
  total: total.value,
  onPage: (n: number) => { page.value = n },
  onPerPage: (n: number) => { itemsPerPage.value = n; page.value = 1 },
}))

function nameOf(row: any, fullKey: string, emp?: any): string {
  const direct = row[fullKey]
  if (direct) return String(direct)
  if (emp && typeof emp === 'object') {
    // BE shapes:
    //   employee: { id, position, user: { first_name, last_name } }
    //   reviewer: { id, first_name, last_name }
    const first = emp.user?.first_name ?? emp.first_name ?? ''
    const last = emp.user?.last_name ?? emp.last_name ?? ''
    const full = `${first} ${last}`.trim()
    return full || emp.user?.email || emp.email || (emp.id != null ? `#${emp.id}` : '—')
  }
  return '—'
}

// ESC handler — close any open modal
function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  if (viewOpen.value) { closeView(); e.preventDefault(); return }
  if (confirmOpen.value) { closeConfirm(); e.preventDefault(); return }
  if (editOpen.value) { closeEdit(); e.preventDefault(); return }
  if (createOpen.value) { closeCreate(); e.preventDefault() }
}

onMounted(() => { window.addEventListener('keydown', onKeydown) })
onBeforeUnmount(() => { window.removeEventListener('keydown', onKeydown) })
</script>

<template>
  <WorkspacePage class="page">
    <PageHeader
      :title="t('Performance Reviews')"
      :subtitle="t('Manage employee performance reviews')"
    >
      <template #actions>
        <Button
          variant="primary"
          icon="plus"
          @click="openCreate"
        >
          {{ t('New Review') }}
        </Button>
      </template>
    </PageHeader>

    <!-- Toolbar + table -->
    <Card>
      <WorkspaceToolbar class="toolbar reviews-toolbar">
        <div class="reviews-toolbar__search">
          <Input
            v-model="employeeFilter"
            icon="user"
            :placeholder="t('Employee ID')"
            inputmode="numeric"
          />
        </div>
        <div class="reviews-toolbar__status">
          <Select
            v-model="statusFilter"
            icon="filter"
            :placeholder="t('Filter by status')"
            :options="statusOptions"
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
        :columns="columns"
        :rows="items"
        row-key="id"
        :loading="loading"
        :pagination="tablePagination"
        :initial-sort="{ key: 'id', dir: 'desc' }"
      >
        <template #cell.id="{ row }">
          <span class="mono cell-muted">#{{ row.id }}</span>
        </template>

        <template #cell.employee_name="{ row }">
          <span class="cell-strong">{{ nameOf(row, 'employee_name', row.employee) }}</span>
        </template>

        <template #cell.reviewer_name="{ row }">
          <span class="cell-muted">{{ nameOf(row, 'reviewer_name', row.reviewer) }}</span>
        </template>

        <template #cell.review_period_start="{ row }">
          <span class="cell-muted">{{ row.review_period_start ? formatDate(row.review_period_start) : '—' }}</span>
        </template>

        <template #cell.review_period_end="{ row }">
          <span class="cell-muted">{{ row.review_period_end ? formatDate(row.review_period_end) : '—' }}</span>
        </template>

        <template #cell.rating="{ row }">
          <span class="mono cell-strong">{{ row.rating ?? '—' }}</span>
        </template>

        <template #cell.status="{ row }">
          <Badge :tone="STATUS_TONE[row.status] || 'neutral'">
            {{ row.status ? t(`review_status_${row.status}`) : '—' }}
          </Badge>
        </template>

        <template #cell.submitted_at="{ row }">
          <span class="cell-muted">{{ row.submitted_at ? formatDate(row.submitted_at) : '—' }}</span>
        </template>

        <template #cell.acknowledged_at="{ row }">
          <span class="cell-muted">{{ row.acknowledged_at ? formatDate(row.acknowledged_at) : '—' }}</span>
        </template>

        <template #row-actions="{ row }">
          <IconAction
            icon="search"
            tone="primary"
            :title="t('View')"
            @click="openView(row)"
          />
          <IconAction
            v-if="row.status === 'DRAFT'"
            icon="pencil"
            :title="t('Edit')"
            @click="openEdit(row)"
          />
          <IconAction
            v-if="row.status === 'DRAFT'"
            icon="send"
            tone="primary"
            :title="t('Submit')"
            @click="askSubmit(row)"
          />
          <IconAction
            v-if="row.status === 'SUBMITTED'"
            icon="check"
            tone="success"
            :title="t('Acknowledge')"
            @click="askAcknowledge(row)"
          />
        </template>

        <template #empty>
          <StateFill
            icon="star"
            :title="t('No reviews found')"
            :sub="t('Create the first performance review')"
          >
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
                {{ t('New Review') }}
              </Button>
            </div>
          </StateFill>
        </template>
      </DataTable>
    </Card>

    <!-- Create modal -->
    <Modal
      :open="createOpen"
      :title="t('New Review')"
      :subtitle="t('Performance Reviews')"
      :width="640"
      @close="closeCreate"
    >
      <form @submit.prevent="submitCreate">
        <div class="form-grid">
          <Field
            :label="t('Employee')"
            class="span-2"
            :error="createErrors.employee_id"
          >
            <Input
              v-model="createForm.employee_id"
              icon="user"
              type="number"
              inputmode="numeric"
              :placeholder="t('Employee ID')"
              :error="!!createErrors.employee_id"
            />
          </Field>

          <Field
            :label="t('Period Start')"
            :error="createErrors.period_start"
          >
            <Input
              v-model="createForm.period_start"
              :error="createErrors.period_start"
              icon="calendar"
              type="date"
              :aria-label="t('Period Start')"
            />
          </Field>

          <Field
            :label="t('Period End')"
            :error="createErrors.period_end"
          >
            <Input
              v-model="createForm.period_end"
              :error="createErrors.period_end"
              icon="calendar"
              type="date"
              :aria-label="t('Period End')"
            />
          </Field>

          <Field
            :label="t('Rating (1-5)')"
            class="span-2"
            :error="createErrors.rating"
          >
            <Input
              v-model="createForm.rating"
              icon="star"
              type="number"
              inputmode="numeric"
              :error="!!createErrors.rating"
              placeholder="3"
            />
          </Field>

          <Field
            :label="t('Strengths')"
            class="span-2"
          >
            <Textarea
              v-model="createForm.strengths"
              class="control"
              rows="3"
              :placeholder="t('Strengths')"
              style="resize:vertical;min-height:80px;padding:10px 12px;"
            />
          </Field>

          <Field
            :label="t('Areas for Improvement')"
            class="span-2"
          >
            <Textarea
              v-model="createForm.improvements"
              class="control"
              rows="3"
              :placeholder="t('Areas for Improvement')"
              style="resize:vertical;min-height:80px;padding:10px 12px;"
            />
          </Field>

          <Field
            :label="t('Goals')"
            class="span-2"
          >
            <Textarea
              v-model="createForm.goals"
              class="control"
              rows="3"
              :placeholder="t('Goals')"
              style="resize:vertical;min-height:80px;padding:10px 12px;"
            />
          </Field>
        </div>
      </form>

      <template #footer>
        <Button
          variant="primary"
          icon="check"
          :loading="createSaving"
          :disabled="createSaving"
          @click="submitCreate"
        >
          {{ t('Create') }}
        </Button>
      </template>
    </Modal>

    <!-- Edit modal — DRAFT only -->
    <Modal
      :open="editOpen"
      :title="t('Edit Review')"
      :subtitle="editingId != null ? `#${editingId}` : ''"
      :width="640"
      @close="closeEdit"
    >
      <form @submit.prevent="submitEdit">
        <div class="form-grid">
          <Field
            :label="t('Period Start')"
            :error="editErrors.review_period_start"
          >
            <Input
              v-model="editForm.review_period_start"
              :error="editErrors.review_period_start"
              icon="calendar"
              type="date"
              :aria-label="t('Period Start')"
            />
          </Field>

          <Field
            :label="t('Period End')"
            :error="editErrors.review_period_end"
          >
            <Input
              v-model="editForm.review_period_end"
              :error="editErrors.review_period_end"
              icon="calendar"
              type="date"
              :aria-label="t('Period End')"
            />
          </Field>

          <Field
            :label="t('Rating (1-5)')"
            class="span-2"
            :error="editErrors.rating"
          >
            <Input
              v-model="editForm.rating"
              icon="star"
              type="number"
              inputmode="numeric"
              :error="!!editErrors.rating"
              placeholder="3"
            />
          </Field>

          <Field
            :label="t('Strengths')"
            class="span-2"
          >
            <Textarea
              v-model="editForm.strengths"
              class="control"
              rows="3"
              :placeholder="t('Strengths')"
              style="resize:vertical;min-height:80px;padding:10px 12px;"
            />
          </Field>

          <Field
            :label="t('Areas for Improvement')"
            class="span-2"
          >
            <Textarea
              v-model="editForm.improvements"
              class="control"
              rows="3"
              :placeholder="t('Areas for Improvement')"
              style="resize:vertical;min-height:80px;padding:10px 12px;"
            />
          </Field>

          <Field
            :label="t('Goals')"
            class="span-2"
          >
            <Textarea
              v-model="editForm.goals"
              class="control"
              rows="3"
              :placeholder="t('Goals')"
              style="resize:vertical;min-height:80px;padding:10px 12px;"
            />
          </Field>
        </div>
      </form>

      <template #footer>
        <Button
          variant="primary"
          icon="check"
          :loading="editSaving"
          :disabled="editSaving"
          @click="submitEdit"
        >
          {{ t('Save') }}
        </Button>
      </template>
    </Modal>

    <!-- Confirm Submit / Acknowledge -->
    <Modal
      :open="confirmOpen"
      :title="confirmTitle"
      :subtitle="confirmTarget ? `#${confirmTarget.id}` : ''"
      :width="460"
      @close="closeConfirm"
    >
      <p style="margin:0;color:rgb(var(--v-theme-text-secondary));line-height:1.5;">
        {{ confirmBody }}
      </p>

      <template #footer>
        <Button
          :variant="confirmKind === 'submit' ? 'primary' : 'primary'"
          :icon="confirmKind === 'submit' ? 'send' : 'check'"
          :loading="confirmSaving"
          :disabled="confirmSaving"
          @click="runConfirm"
        >
          {{ confirmKind === 'submit' ? t('Submit') : t('Acknowledge') }}
        </Button>
      </template>
    </Modal>

    <!-- View detail -->
    <Modal
      :open="viewOpen"
      :title="t('Performance Reviews')"
      :subtitle="viewDetail ? `#${viewDetail.id}` : ''"
      :width="640"
      @close="closeView"
    >
      <div
        v-if="viewLoading"
        class="form-grid"
      >
        <div
          class="sk-box span-2"
          style="height:14px;border-radius:4px;"
        />
        <div
          class="sk-box span-2"
          style="height:14px;border-radius:4px;"
        />
        <div
          class="sk-box span-2"
          style="height:14px;border-radius:4px;"
        />
      </div>
      <div
        v-else-if="viewDetail"
        class="form-grid"
      >
        <Field :label="t('Employee')">
          <div class="cell-strong">
            {{ nameOf(viewDetail, 'employee_name', viewDetail.employee) }}
          </div>
        </Field>
        <Field :label="t('Reviewer')">
          <div class="cell-muted">
            {{ nameOf(viewDetail, 'reviewer_name', viewDetail.reviewer) }}
          </div>
        </Field>
        <Field :label="t('Period Start')">
          <div class="cell-muted">
            {{ viewDetail.review_period_start ? formatDate(viewDetail.review_period_start) : '—' }}
          </div>
        </Field>
        <Field :label="t('Period End')">
          <div class="cell-muted">
            {{ viewDetail.review_period_end ? formatDate(viewDetail.review_period_end) : '—' }}
          </div>
        </Field>
        <Field :label="t('Rating')">
          <div class="mono cell-strong">
            {{ viewDetail.rating ?? '—' }}
          </div>
        </Field>
        <Field :label="t('Status')">
          <div>
            <Badge :tone="STATUS_TONE[viewDetail.status] || 'neutral'">
              {{ viewDetail.status ? t(`review_status_${viewDetail.status}`) : '—' }}
            </Badge>
          </div>
        </Field>
        <Field :label="t('Submitted At')">
          <div class="cell-muted">
            {{ viewDetail.submitted_at ? formatDate(viewDetail.submitted_at) : '—' }}
          </div>
        </Field>
        <Field :label="t('Acknowledged At')">
          <div class="cell-muted">
            {{ viewDetail.acknowledged_at ? formatDate(viewDetail.acknowledged_at) : '—' }}
          </div>
        </Field>
        <Field
          v-if="viewDetail.strengths"
          :label="t('Strengths')"
          class="span-2"
        >
          <div
            class="cell-muted"
            style="white-space:pre-wrap;"
          >
            {{ viewDetail.strengths }}
          </div>
        </Field>
        <Field
          v-if="viewDetail.improvements"
          :label="t('Areas for Improvement')"
          class="span-2"
        >
          <div
            class="cell-muted"
            style="white-space:pre-wrap;"
          >
            {{ viewDetail.improvements }}
          </div>
        </Field>
        <Field
          v-if="viewDetail.goals"
          :label="t('Goals')"
          class="span-2"
        >
          <div
            class="cell-muted"
            style="white-space:pre-wrap;"
          >
            {{ viewDetail.goals }}
          </div>
        </Field>
      </div>

    </Modal>

    <!-- Toast (kept consistent with the rest of the rebuilt pages) -->
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
.reviews-toolbar {
  flex-wrap: wrap;
  gap: 12px;
}
.reviews-toolbar__search {
  flex: 1 1 240px;
  max-width: 280px;
  min-width: 200px;
}
.reviews-toolbar__status {
  width: 220px;
  flex: 0 0 auto;
}
@media (max-width: 768px) {
  .reviews-toolbar__search,
  .reviews-toolbar__status {
    flex: 1 1 100%;
    width: 100%;
    max-width: none;
    min-width: 0;
  }
  :deep(.form-grid) {
    grid-template-columns: 1fr !important;
  }
  :deep(.form-grid .span-2) {
    grid-column: 1 / -1 !important;
  }
}
</style>
