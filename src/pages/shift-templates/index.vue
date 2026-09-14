<script setup lang="ts">
import WorkspacePage from '@/components/design/workspace/WorkspacePage.vue'
import WorkspaceToolbar from '@/components/design/workspace/WorkspaceToolbar.vue'

/* ============================================================
   SHIFT TEMPLATES — recurring shift windows assigned to staff
   Built with design primitives (DataTable, Modal, Field, Input,
   Select, Switch, Button, Badge, IconAction, Card, PageHeader).
   API: /api/admins/shift-templates (default axios).
   ============================================================ */
import type { DataTableColumn } from '@/components/design/DataTable.vue'
import axios from '@/plugins/axios'
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
import Switch from '@/components/design/Switch.vue'

const { t } = useI18n({ useScope: 'global' })
const { snackbar, snackbarMsg, snackbarColor, notify } = useNotify()

// ============================================================
// State
// ============================================================
const templates = ref<any[]>([])
const loading = ref(false)

const search = ref('')
const statusFilter = ref<string>('') // '' | 'true' | 'false'
const page = ref(1)
const itemsPerPage = ref(10)

const dialogOpen = ref(false)
const editing = ref<any>(null)
const dialogLoading = ref(false)

const deleteDialog = ref(false)
const deleting = ref<any>(null)
const deleteBusy = ref(false)

const toggleConfirm = ref<{ row: any; next: boolean } | null>(null)
const togglingId = ref<number | null>(null)
const editingId = ref<number | null>(null)
const deletingId = ref<number | null>(null)

const form = ref<{ name: string; start_time: string; end_time: string; is_active: boolean }>({
  name: '',
  start_time: '',
  end_time: '',
  is_active: true,
})

const errors = ref<Record<string, string>>({})

// ============================================================
// Status enum tone
// ============================================================
const STATUS_TONE: Record<string, 'success' | 'neutral'> = {
  ACTIVE: 'success',
  INACTIVE: 'neutral',
}

// ============================================================
// Formatters
// ============================================================
// HH:MM strict 24-hour validator
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

function normalizeTime(v: any): string {
  // BE may return "HH:MM:SS" — slice to HH:MM for display + form.
  if (!v)
    return ''
  const s = String(v).trim()
  if (TIME_RE.test(s))
    return s
  const m = s.match(/^(\d{1,2}):(\d{2})/)
  if (m) {
    const h = m[1].padStart(2, '0')
    return `${h}:${m[2]}`
  }
  return s
}

function computeDuration(start: string, end: string): string {
  // Overnight wraps +24h. Returns HH:MM or "—" if either side missing.
  const s = normalizeTime(start)
  const e = normalizeTime(end)
  if (!TIME_RE.test(s) || !TIME_RE.test(e))
    return '—'
  const [sh, sm] = s.split(':').map(Number)
  const [eh, em] = e.split(':').map(Number)
  let mins = (eh * 60 + em) - (sh * 60 + sm)
  if (mins <= 0)
    mins += 24 * 60
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// ============================================================
// API
// ============================================================
async function load() {
  loading.value = true
  try {
    const res = await axios.get('/shift-templates')
    const d = res.data?.data ?? res.data
    const list = d?.shift_templates ?? d?.templates ?? d?.items ?? d?.results ?? (Array.isArray(d) ? d : [])
    templates.value = (list ?? []).map((r: any) => ({
      ...r,
      start_time: normalizeTime(r.start_time),
      end_time: normalizeTime(r.end_time),
    }))
  }
  catch {
    templates.value = []
    notify(t('Failed to load'), 'error')
  }
  finally {
    loading.value = false
  }
}

onMounted(load)

// ============================================================
// Client-side filter + paginate
// ============================================================
const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return templates.value.filter((r) => {
    if (q && !String(r.name ?? '').toLowerCase().includes(q))
      return false
    if (statusFilter.value === 'true' && r.is_active !== true)
      return false
    if (statusFilter.value === 'false' && r.is_active === true)
      return false
    return true
  })
})

const totalFiltered = computed(() => filtered.value.length)

const pagedRows = computed(() => {
  const start = (page.value - 1) * itemsPerPage.value
  return filtered.value.slice(start, start + itemsPerPage.value)
})

watch([search, statusFilter], () => { page.value = 1 })

// ============================================================
// Dialog
// ============================================================
function openCreate() {
  editing.value = null
  form.value = { name: '', start_time: '', end_time: '', is_active: true }
  errors.value = {}
  dialogOpen.value = true
}

function openEdit(row: any) {
  if (editingId.value !== null)
    return
  editingId.value = row.id
  editing.value = row
  form.value = {
    name: row.name ?? '',
    start_time: normalizeTime(row.start_time),
    end_time: normalizeTime(row.end_time),
    is_active: row.is_active ?? true,
  }
  errors.value = {}
  dialogOpen.value = true
}

function closeDialog() {
  if (dialogLoading.value)
    return
  dialogOpen.value = false
  editingId.value = null
}

function validateForm(): boolean {
  const e: Record<string, string> = {}
  if (!form.value.name.trim())
    e.name = t('shift_template_error_required')
  if (!form.value.start_time)
    e.start_time = t('shift_template_error_required')
  else if (!TIME_RE.test(form.value.start_time))
    e.start_time = t('shift_template_error_time_format')
  if (!form.value.end_time)
    e.end_time = t('shift_template_error_required')
  else if (!TIME_RE.test(form.value.end_time))
    e.end_time = t('shift_template_error_time_format')
  errors.value = e
  return Object.keys(e).length === 0
}

async function save() {
  if (!validateForm()) {
    notify(Object.values(errors.value)[0], 'error')
    return
  }
  dialogLoading.value = true
  try {
    const payload: any = {
      name: form.value.name.trim(),
      start_time: form.value.start_time,
      end_time: form.value.end_time,
    }
    if (editing.value)
      payload.is_active = form.value.is_active

    if (editing.value) {
      await axios.put(`/shift-templates/${editing.value.id}`, payload)
      notify(t('shift_template_toast_updated'))
    }
    else {
      await axios.post('/shift-templates', payload)
      notify(t('shift_template_toast_created'))
    }
    dialogOpen.value = false
    editingId.value = null
    await load()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
  finally {
    dialogLoading.value = false
  }
}

// ============================================================
// Toggle active (confirm)
// ============================================================
function requestToggle(row: any) {
  if (togglingId.value !== null)
    return
  toggleConfirm.value = { row, next: !row.is_active }
}

function cancelToggle() {
  toggleConfirm.value = null
}

async function confirmToggle() {
  if (!toggleConfirm.value)
    return
  const { row, next } = toggleConfirm.value
  toggleConfirm.value = null
  togglingId.value = row.id
  try {
    await axios.put(`/shift-templates/${row.id}`, {
      name: row.name,
      start_time: normalizeTime(row.start_time),
      end_time: normalizeTime(row.end_time),
      is_active: next,
    })
    notify(t('shift_template_toast_updated'))
    await load()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
  finally {
    togglingId.value = null
  }
}

// ============================================================
// Delete (confirm)
// ============================================================
function confirmDelete(row: any) {
  if (deletingId.value !== null)
    return
  deletingId.value = row.id
  deleting.value = row
  deleteDialog.value = true
}

function closeDeleteDialog() {
  if (deleteBusy.value)
    return
  deleteDialog.value = false
  deletingId.value = null
}

async function doDelete() {
  if (!deleting.value)
    return
  deleteBusy.value = true
  try {
    await axios.delete(`/shift-templates/${deleting.value.id}`)
    notify(t('shift_template_toast_deleted'))
    deleteDialog.value = false
    deletingId.value = null
    await load()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
  finally {
    deleteBusy.value = false
  }
}

// ============================================================
// Filter chips
// ============================================================
const activeFilters = computed(() => {
  const out: { k: string; label: string; val: string; clear: () => void }[] = []
  if (search.value)
    out.push({ k: 'q', label: t('Search'), val: search.value, clear: () => { search.value = '' } })
  if (statusFilter.value) {
    const map: Record<string, string> = {
      true: t('shift_templates_status_active_only'),
      false: t('shift_templates_status_inactive_only'),
    }
    out.push({ k: 's', label: t('Status'), val: map[statusFilter.value] ?? statusFilter.value, clear: () => { statusFilter.value = '' } })
  }
  return out
})

function clearAllFilters() {
  search.value = ''
  statusFilter.value = ''
}

// ============================================================
// DataTable columns
// ============================================================
const columns: DataTableColumn<any>[] = [
  { key: 'name', label: t('shift_template_col_name'), sortable: true },
  { key: 'start_time', label: t('shift_template_col_start'), sortable: true, width: 120 },
  { key: 'end_time', label: t('shift_template_col_end'), sortable: true, width: 120 },
  { key: 'duration', label: t('shift_template_col_duration'), sortable: false, width: 130, sortValue: (r: any) => computeDuration(r.start_time, r.end_time) },
  { key: 'is_active', label: t('shift_template_col_status'), sortable: true, width: 130 },
]

const statusFilterOptions = computed(() => [
  { value: 'true', label: t('shift_templates_status_active_only') },
  { value: 'false', label: t('shift_templates_status_inactive_only') },
])

const tablePagination = computed(() => ({
  page: page.value,
  perPage: itemsPerPage.value,
  total: totalFiltered.value,
  onPage: (n: number) => { page.value = n },
  onPerPage: (n: number) => { itemsPerPage.value = n; page.value = 1 },
}))

// ============================================================
// ESC handler — close whichever modal is open, top-most first.
// ============================================================
function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape')
    return
  if (toggleConfirm.value) {
    cancelToggle()
    e.preventDefault()
    return
  }
  if (deleteDialog.value) {
    if (!deleteBusy.value) {
      deleteDialog.value = false
      deletingId.value = null
      e.preventDefault()
    }
    return
  }
  if (dialogOpen.value) {
    closeDialog()
    e.preventDefault()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <WorkspacePage class="page">
    <!-- Page header -->
    <PageHeader
      :title="t('shift_templates_title')"
      :subtitle="t('shift_templates_subtitle')"
    >
      <template #actions>
        <Button
          variant="ghost"
          icon="refresh"
          :disabled="loading"
          @click="load"
        >
          {{ t('shift_template_action_refresh') }}
        </Button>
        <Button
          variant="primary"
          icon="plus"
          @click="openCreate"
        >
          {{ t('shift_template_action_create') }}
        </Button>
      </template>
    </PageHeader>

    <!-- Toolbar + table -->
    <Card>
      <WorkspaceToolbar class="toolbar shift-tpl-toolbar">
        <!-- Search -->
        <div class="shift-tpl-toolbar__search">
          <Input
            v-model="search"
            icon="search"
            :placeholder="t('shift_templates_search')"
          />
        </div>

        <!-- Status -->
        <div class="shift-tpl-toolbar__status">
          <Select
            v-model="statusFilter"
            icon="filter"
            :placeholder="t('shift_templates_status_all')"
            :options="statusFilterOptions"
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
          >{{ t('shift_template_filters_label') }}</span>
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
        :rows="pagedRows"
        row-key="id"
        :loading="loading"
        :pagination="tablePagination"
        :initial-sort="{ key: 'name', dir: 'asc' }"
      >
        <!-- Cell renderers -->
        <template #cell.name="{ row }">
          <span class="cell-strong nowrap">{{ row.name }}</span>
        </template>

        <template #cell.start_time="{ row }">
          <span class="mono">{{ normalizeTime(row.start_time) || '—' }}</span>
        </template>

        <template #cell.end_time="{ row }">
          <span class="mono">{{ normalizeTime(row.end_time) || '—' }}</span>
        </template>

        <template #cell.duration="{ row }">
          <span class="mono cell-muted">{{ computeDuration(row.start_time, row.end_time) }}</span>
        </template>

        <template #cell.is_active="{ row }">
          <Badge
            :tone="STATUS_TONE[row.is_active ? 'ACTIVE' : 'INACTIVE']"
            dot
          >
            {{ t(`shift_template_status_${row.is_active ? 'ACTIVE' : 'INACTIVE'}`) }}
          </Badge>
        </template>

        <!-- Row actions -->
        <template #row-actions="{ row }">
          <IconAction
            :icon="togglingId === row.id ? 'refresh' : (row.is_active ? 'pause' : 'play')"
            tone="warning"
            :title="row.is_active ? t('Suspend') : t('Activate')"
            :disabled="togglingId === row.id"
            :class="{ 'is-busy': togglingId === row.id, 'iconspin-wrap': togglingId === row.id }"
            @click="requestToggle(row)"
          />
          <IconAction
            icon="edit"
            tone="primary"
            :title="t('shift_template_action_edit')"
            :disabled="editingId === row.id"
            @click="openEdit(row)"
          />
          <IconAction
            icon="trash"
            tone="danger"
            :title="t('shift_template_action_delete')"
            :disabled="deletingId === row.id"
            @click="confirmDelete(row)"
          />
        </template>

        <!-- Empty state -->
        <template #empty>
          <StateFill
            icon="clock"
            :title="activeFilters.length > 0 ? t('shift_template_empty_title') : t('shift_template_empty_title')"
            :sub="t('shift_template_empty_hint')"
          >
            <template #action>
              <div style="margin-top:12px;display:flex;gap:8px;justify-content:center;">
                <Button
                  v-if="activeFilters.length > 0"
                  variant="ghost"
                  @click="clearAllFilters"
                >
                  {{ t('Clear filters') }}
                </Button>
                <Button
                  variant="primary"
                  icon="plus"
                  @click="openCreate"
                >
                  {{ t('shift_template_action_create') }}
                </Button>
              </div>
            </template>
          </StateFill>
        </template>
      </DataTable>
    </Card>

    <!-- Create / Edit modal -->
    <Modal
      :open="dialogOpen"
      :title="editing ? t('shift_template_modal_edit_title') : t('shift_template_modal_create_title')"
      :subtitle="t('shift_templates_subtitle')"
      :width="520"
      @close="closeDialog"
    >
      <form @submit.prevent="save">
        <div class="form-grid">
          <!-- Name -->
          <Field
            :label="t('shift_template_field_name')"
            class="span-2"
            :error="errors.name"
          >
            <Input
              v-model="form.name"
              :placeholder="t('shift_template_placeholder_name')"
              :error="!!errors.name"
            />
          </Field>

          <!-- Start time -->
          <Field
            :label="t('shift_template_field_start_time')"
            :error="errors.start_time"
            :hint="!errors.start_time ? t('shift_template_note_time_24h') : undefined"
          >
            <Input
              v-model="form.start_time"
              :error="errors.start_time"
              icon="clock"
              type="time"
              step="60"
              :placeholder="t('shift_template_time_placeholder')"
            />
          </Field>

          <!-- End time -->
          <Field
            :label="t('shift_template_field_end_time')"
            :error="errors.end_time"
            :hint="!errors.end_time ? t('shift_template_note_time_24h') : undefined"
          >
            <Input
              v-model="form.end_time"
              :error="errors.end_time"
              icon="clock"
              type="time"
              step="60"
              :placeholder="t('shift_template_time_placeholder')"
            />
          </Field>

          <!-- Duration preview -->
          <Field
            v-if="form.start_time && form.end_time"
            :label="t('shift_template_col_duration')"
            class="span-2"
          >
            <div
              class="row"
              style="gap:8px;align-items:center;height:42px;"
            >
              <span class="mono cell-strong">{{ computeDuration(form.start_time, form.end_time) }}</span>
            </div>
          </Field>

          <!-- Is active (edit only) -->
          <Field
            v-if="editing"
            :label="t('shift_template_field_is_active')"
            class="span-2"
          >
            <div
              class="row"
              style="gap:10px;align-items:center;height:42px;"
            >
              <Switch v-model="form.is_active" />
              <span style="font-size:14px;font-weight:500;color:var(--text-secondary);">
                {{ t(`shift_template_status_${form.is_active ? 'ACTIVE' : 'INACTIVE'}`) }}
              </span>
            </div>
          </Field>
        </div>
      </form>

      <template #footer>
        <Button
          variant="ghost"
          :disabled="dialogLoading"
          @click="closeDialog"
        >
          {{ t('shift_template_cancel') }}
        </Button>
        <Button
          variant="primary"
          icon="check"
          :loading="dialogLoading"
          :disabled="dialogLoading"
          @click="save"
        >
          {{ t('shift_template_save') }}
        </Button>
      </template>
    </Modal>

    <!-- Delete confirm modal -->
    <Modal
      :open="deleteDialog"
      :title="t('shift_template_action_delete')"
      :subtitle="t('shift_template_confirm_delete')"
      :width="440"
      @close="closeDeleteDialog"
    >
      <div
        class="row"
        style="gap:14px;align-items:flex-start;"
      >
        <div
          class="kpi__icon t-error"
          style="width:44px;height:44px;flex:0 0 44px;"
        >
          <DesignIcon
            name="alert"
            :size="22"
          />
        </div>
        <div>
          <p style="margin:0;font-weight:600;">
            {{ deleting?.name }}
          </p>
          <p
            class="muted"
            style="margin:6px 0 0;font-size:14px;"
          >
            {{ t('shift_template_confirm_delete') }}
          </p>
        </div>
      </div>

      <template #footer>
        <Button
          variant="ghost"
          :disabled="deleteBusy"
          @click="closeDeleteDialog"
        >
          {{ t('shift_template_cancel') }}
        </Button>
        <Button
          variant="danger"
          icon="trash"
          :loading="deleteBusy"
          :disabled="deleteBusy"
          @click="doDelete"
        >
          {{ t('shift_template_action_delete') }}
        </Button>
      </template>
    </Modal>

    <!-- Toggle confirm modal -->
    <Modal
      :open="!!toggleConfirm"
      :title="t('shift_template_action_toggle_active')"
      :subtitle="t('shift_template_confirm_toggle')"
      :width="440"
      @close="cancelToggle"
    >
      <div
        v-if="toggleConfirm"
        class="row"
        style="gap:14px;align-items:flex-start;"
      >
        <div
          class="kpi__icon t-warning"
          style="width:44px;height:44px;flex:0 0 44px;"
        >
          <DesignIcon
            name="alert"
            :size="22"
          />
        </div>
        <div>
          <p style="margin:0;font-weight:600;">
            {{ toggleConfirm.row.name }}
          </p>
          <p
            class="muted"
            style="margin:6px 0 0;font-size:14px;"
          >
            {{ t(`shift_template_status_${toggleConfirm.next ? 'ACTIVE' : 'INACTIVE'}`) }}
          </p>
        </div>
      </div>

      <template #footer>
        <Button
          variant="ghost"
          @click="cancelToggle"
        >
          {{ t('shift_template_cancel') }}
        </Button>
        <Button
          variant="primary"
          @click="confirmToggle"
        >
          {{ t('shift_template_save') }}
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
  </WorkspacePage>
</template>

<style scoped>
.iconspin-wrap :deep(svg) {
  animation: shift-tpl-spin 0.85s linear infinite;
}
@keyframes shift-tpl-spin {
  to { transform: rotate(360deg); }
}
.iconaction.is-busy {
  cursor: progress;
  opacity: 0.7;
}

/* Toolbar — responsive */
.shift-tpl-toolbar {
  flex-wrap: wrap;
  gap: 12px;
}
.shift-tpl-toolbar__search {
  flex: 1 1 240px;
  max-width: 320px;
  min-width: 0;
}
.shift-tpl-toolbar__status {
  flex: 0 0 200px;
  min-width: 0;
}

@media (max-width: 900px) {
  .shift-tpl-toolbar__search,
  .shift-tpl-toolbar__status {
    flex: 1 1 100%;
    max-width: 100%;
  }
  /* Collapse 2-col form grid to 1 col */
  :deep(.form-grid) {
    grid-template-columns: 1fr !important;
  }
  :deep(.form-grid .span-2) {
    grid-column: span 1 !important;
  }
}

/* Phone — modal sheet rows (delete/toggle confirm) must wrap so the
   44px fixed-width icon doesn't crowd the text on narrow viewports.
   Modal primitive already collapses to bottom sheet at <=768 via
   design-responsive.css (max-width:100%, max-height:92dvh). */
@media (max-width: 768px) {
  :deep(.modal__body .row) {
    flex-wrap: wrap;
  }
  /* Drop the inline fixed height on duration/switch preview rows
     so they breathe on small screens without clipping. */
  :deep(.form-grid .row[style*="height:42px"]) {
    height: auto !important;
    min-height: 42px;
  }
}
</style>

<route lang="yaml">
meta:
  action: manage
  subject: all
</route>
