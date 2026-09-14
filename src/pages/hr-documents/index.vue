<script setup lang="ts">
import WorkspacePage from '@/components/design/workspace/WorkspacePage.vue'
import WorkspaceToolbar from '@/components/design/workspace/WorkspaceToolbar.vue'
import Textarea from '@/components/design/Textarea.vue'
/* ============================================================
   HR DOCUMENTS — employee documents (passports, contracts, certs)
   Plain HTML + design primitives (PageHeader / Card / DataTable /
   Modal / Field / Input / Select / Switch / Badge / IconAction /
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
import Switch from '@/components/design/Switch.vue'

const { t } = useI18n({ useScope: 'global' })
const { snackbar, snackbarMsg, snackbarColor, notify } = useNotify()
const { formatDate } = useFormatters()

// ============================================================
// Enums
// ============================================================
const DOC_TYPES = ['ID_CARD', 'PASSPORT', 'CONTRACT', 'CERTIFICATE', 'MEDICAL', 'OTHER'] as const
type DocType = typeof DOC_TYPES[number]

const TYPE_TONE: Record<string, 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'primary'> = {
  ID_CARD: 'info',
  PASSPORT: 'primary',
  CONTRACT: 'success',
  CERTIFICATE: 'warning',
  MEDICAL: 'error',
  OTHER: 'neutral',
}

// ============================================================
// State
// ============================================================
const items = ref<any[]>([])
const total = ref(0)
const loading = ref(false)

const page = ref(1)
const itemsPerPage = ref(10)

// Filters per spec
const search = ref('')
const employeeFilter = ref<number | string>('')
const typeFilter = ref<string>('')
const expiringOnly = ref(false)
const expiringDays = ref<number | string>(30)

// Reference data
const employees = ref<any[]>([])

// ============================================================
// API
// ============================================================
function employeeLabel(e: any): string {
  if (!e) return '—'
  const u = e.user ?? {}
  const full = `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || u.email || u.username || `#${e.id}`
  return e.position ? `${full} (${e.position})` : full
}

async function loadEmployees() {
  try {
    const res = await axios.get('/employees/', { params: { per_page: 500 } })
    const d = res.data?.data ?? res.data
    employees.value = d?.employees ?? d?.items ?? []
  }
  catch { /* ignore */ }
}

// Raw items from BE (before client-side search filtering)
const rawItems = ref<any[]>([])

async function load() {
  loading.value = true
  try {
    // NOTE: BE DocumentService.list only filters by employee_id + document_type.
    // The 'search' param is silently ignored server-side, so we don't send it
    // and instead filter on title/notes/employee name client-side via `items`.
    const params: Record<string, any> = { page: page.value, per_page: itemsPerPage.value }
    if (employeeFilter.value) params.employee_id = employeeFilter.value
    if (typeFilter.value) params.document_type = typeFilter.value

    let endpoint = '/documents/'
    if (expiringOnly.value) {
      endpoint = '/documents/expiring/'
      const d = Number(expiringDays.value)
      params.days = (Number.isFinite(d) && d > 0) ? d : 30
    }

    const res = await axios.get(endpoint, { params })
    const d = res.data?.data ?? res.data
    let arr = d?.documents ?? d?.items ?? d ?? []
    if (!Array.isArray(arr)) arr = []
    rawItems.value = arr
    total.value = d?.pagination?.total_items ?? d?.pagination?.total ?? arr.length
  }
  catch {
    notify(t('Failed to load'), 'error')
    rawItems.value = []
    total.value = 0
  }
  finally {
    loading.value = false
  }
}

// Client-side search across title/notes/employee name — BE has no search kwarg.
watch(rawItems, () => {
  applySearch()
})

function applySearch() {
  const q = search.value.trim().toLowerCase()
  if (!q) {
    items.value = rawItems.value
    return
  }
  items.value = rawItems.value.filter((r: any) => {
    const title = (r.title ?? '').toString().toLowerCase()
    const notes = (r.notes ?? '').toString().toLowerCase()
    const emp = employeeLabel(r.employee).toLowerCase()
    return title.includes(q) || notes.includes(q) || emp.includes(q)
  })
}

onMounted(() => { load(); loadEmployees() })
watch([page, itemsPerPage], load)
// Search is client-side (BE ignores ?search=), debounce purely for UX.
const debouncedSearch = useDebounceFn(() => { applySearch() }, 300)
watch(search, debouncedSearch)
watch([employeeFilter, typeFilter, expiringOnly], () => { page.value = 1; load() })
const debouncedDays = useDebounceFn(() => { if (expiringOnly.value) { page.value = 1; load() } }, 400)
watch(expiringDays, debouncedDays)

// ============================================================
// Options
// ============================================================
const typeOptions = computed(() => DOC_TYPES.map(v => ({ value: v, label: t(`hrdoc_type_${v}`) })))
const employeeOptions = computed(() => employees.value.map((e: any) => ({ value: e.id, label: employeeLabel(e) })))

// ============================================================
// Form (create + edit)
// ============================================================
type FormShape = {
  employee_id: number | string
  document_type: DocType
  title: string
  file_url: string
  issue_date: string
  expiry_date: string
  notes: string
}

const blankForm = (): FormShape => ({
  employee_id: '',
  document_type: 'OTHER',
  title: '',
  file_url: '',
  issue_date: '',
  expiry_date: '',
  notes: '',
})

const formOpen = ref(false)
const editing = ref<any>(null)
const saving = ref(false)
const form = ref<FormShape>(blankForm())
const errors = ref<Record<string, string>>({})

function openCreate() {
  editing.value = null
  form.value = blankForm()
  errors.value = {}
  formOpen.value = true
}

function openEdit(row: any) {
  editing.value = row
  form.value = {
    employee_id: row.employee?.id ?? row.employee_id ?? '',
    document_type: (row.document_type ?? 'OTHER') as DocType,
    title: row.title ?? '',
    file_url: row.file_url ?? '',
    issue_date: row.issue_date ?? '',
    expiry_date: row.expiry_date ?? '',
    notes: row.notes ?? '',
  }
  errors.value = {}
  formOpen.value = true
}

function closeForm() {
  if (saving.value) return
  formOpen.value = false
}

function validate(): boolean {
  const e: Record<string, string> = {}
  if (!editing.value && !form.value.employee_id) e.employee_id = t('Required')
  if (!form.value.document_type) e.document_type = t('Required')
  if (!form.value.title || !form.value.title.trim()) e.title = t('Required')
  errors.value = e
  return Object.keys(e).length === 0
}

async function save() {
  if (!validate()) return
  saving.value = true
  try {
    const payload: any = {
      document_type: form.value.document_type,
      title: form.value.title.trim(),
    }
    if (form.value.file_url) payload.file_url = form.value.file_url
    if (form.value.issue_date) payload.issue_date = form.value.issue_date
    if (form.value.expiry_date) payload.expiry_date = form.value.expiry_date
    if (form.value.notes) payload.notes = form.value.notes

    if (editing.value) {
      await axios.put(`/documents/${editing.value.id}/`, payload)
      notify(t('Saved'))
    }
    else {
      payload.employee_id = form.value.employee_id
      await axios.post('/documents/', payload)
      notify(t('Saved'))
    }
    formOpen.value = false
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
// Verify modal
// ============================================================
const verifyOpen = ref(false)
const verifying = ref<any>(null)
const verifyBusy = ref(false)

function askVerify(row: any) {
  verifying.value = row
  verifyOpen.value = true
}

function closeVerify() {
  if (verifyBusy.value) return
  verifyOpen.value = false
  verifying.value = null
}

async function doVerify() {
  if (!verifying.value) return
  verifyBusy.value = true
  try {
    await axios.post(`/documents/${verifying.value.id}/verify/`, {})
    notify(t('Saved'))
    verifyOpen.value = false
    verifying.value = null
    await load()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
  finally {
    verifyBusy.value = false
  }
}

// ============================================================
// Delete modal
// ============================================================
const deleteOpen = ref(false)
const deleting = ref<any>(null)
const deleteBusy = ref(false)

function askDelete(row: any) {
  deleting.value = row
  deleteOpen.value = true
}

function closeDelete() {
  if (deleteBusy.value) return
  deleteOpen.value = false
  deleting.value = null
}

async function doDelete() {
  if (!deleting.value) return
  deleteBusy.value = true
  try {
    await axios.delete(`/documents/${deleting.value.id}/`)
    notify(t('Deleted'))
    deleteOpen.value = false
    deleting.value = null
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
// Download
// ============================================================
function doDownload(row: any) {
  if (!row?.file_url) {
    notify(t('hr_documents_no_file'), 'error')
    return
  }
  // Hit the backend download endpoint; fallback to direct file_url
  const url = `/documents/file/employee_document/${row.id}/`
  // Use the configured axios base + open via window
  const base = (axios.defaults.baseURL ?? '').replace(/\/$/, '')
  const full = base + url
  window.open(full, '_blank')
}

// ============================================================
// Filter chips
// ============================================================
const activeFilters = computed(() => {
  const out: { k: string; label: string; val: string; clear: () => void }[] = []
  if (search.value)
    out.push({ k: 'q', label: t('Search'), val: search.value, clear: () => { search.value = '' } })
  if (employeeFilter.value) {
    const emp = employees.value.find((e: any) => String(e.id) === String(employeeFilter.value))
    out.push({ k: 'emp', label: t('hr_documents_employee'), val: emp ? employeeLabel(emp) : String(employeeFilter.value), clear: () => { employeeFilter.value = '' } })
  }
  if (typeFilter.value)
    out.push({ k: 't', label: t('hr_documents_type'), val: t(`hrdoc_type_${typeFilter.value}`), clear: () => { typeFilter.value = '' } })
  if (expiringOnly.value)
    out.push({ k: 'exp', label: t('hr_documents_expiring_switch'), val: t('hr_documents_expiring_within', { days: expiringDays.value }), clear: () => { expiringOnly.value = false } })
  return out
})

function clearAllFilters() {
  search.value = ''
  employeeFilter.value = ''
  typeFilter.value = ''
  expiringOnly.value = false
  expiringDays.value = 30
}

// ============================================================
// Columns
// ============================================================
const columns: DataTableColumn<any>[] = [
  { key: 'id', label: t('ID'), sortable: true, width: 80 },
  { key: 'employee', label: t('hr_documents_employee'), sortable: false },
  { key: 'document_type', label: t('hr_documents_type'), sortable: true, width: 140 },
  { key: 'title', label: t('hr_documents_title_label'), sortable: true },
  { key: 'issue_date', label: t('hr_documents_issue_date'), sortable: true, width: 130 },
  { key: 'expiry_date', label: t('hr_documents_expiry_date'), sortable: true, width: 130 },
  { key: 'is_verified', label: t('hr_documents_verified'), sortable: true, width: 120 },
  { key: 'verified_by', label: t('hr_documents_verified_by'), sortable: false, width: 160 },
  { key: 'uploaded_at', label: t('hr_documents_uploaded_at'), sortable: true, width: 150 },
]

const tablePagination = computed(() => ({
  page: page.value,
  perPage: itemsPerPage.value,
  total: total.value,
  onPage: (n: number) => { page.value = n },
  onPerPage: (n: number) => { itemsPerPage.value = n; page.value = 1 },
}))

function personName(p: any): string {
  if (!p) return '—'
  if (typeof p === 'string') return p
  const full = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim()
  return full || p.email || p.username || `#${p.id ?? ''}` || '—'
}

// ESC handler
function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  if (deleteOpen.value) { closeDelete(); e.preventDefault(); return }
  if (verifyOpen.value) { closeVerify(); e.preventDefault(); return }
  if (formOpen.value) { closeForm(); e.preventDefault() }
}

onMounted(() => { window.addEventListener('keydown', onKeydown) })
onBeforeUnmount(() => { window.removeEventListener('keydown', onKeydown) })
</script>

<template>
  <WorkspacePage class="page">
    <PageHeader
      :title="t('hr_documents_title')"
      :subtitle="t('hr_documents_subtitle')"
    >
      <template #actions>
        <Button
          variant="secondary"
          icon="alert"
          @click="expiringOnly = !expiringOnly"
        >
          {{ t('hr_documents_expiring_switch') }}
        </Button>
        <Button
          variant="primary"
          icon="plus"
          @click="openCreate"
        >
          {{ t('hr_documents_new') }}
        </Button>
      </template>
    </PageHeader>

    <!-- Toolbar + table -->
    <Card>
      <WorkspaceToolbar class="toolbar hr-docs-toolbar">
        <div class="tb-search">
          <Input
            v-model="search"
            icon="search"
            :placeholder="t('hr_documents_search_ph')"
          />
        </div>
        <div class="tb-select tb-select--wide">
          <Select
            v-model="employeeFilter"
            icon="employee"
            :placeholder="t('hr_documents_employee')"
            :options="employeeOptions"
          />
        </div>
        <div class="tb-select">
          <Select
            v-model="typeFilter"
            icon="filter"
            :placeholder="t('hr_documents_type')"
            :options="typeOptions"
          />
        </div>
        <div class="tb-switch">
          <Switch
            v-model="expiringOnly"
            :aria-label="t('hr_documents_expiring_switch')"
          />
          <span class="tertiary" style="font-size:13px;">{{ t('hr_documents_expiring_switch') }}</span>
        </div>
        <div
          v-if="expiringOnly"
          class="tb-days"
        >
          <Input
            v-model="expiringDays"
            icon="clock"
            type="number"
            :placeholder="t('hr_documents_expiring_days')"
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
        :initial-sort="{ key: 'uploaded_at', dir: 'desc' }"
      >
        <template #cell.id="{ row }">
          <span class="mono cell-muted">#{{ row.id }}</span>
        </template>

        <template #cell.employee="{ row }">
          <span class="cell-strong">{{ employeeLabel(row.employee) }}</span>
        </template>

        <template #cell.document_type="{ row }">
          <Badge :tone="TYPE_TONE[row.document_type] || 'neutral'">
            {{ row.document_type ? t(`hrdoc_type_${row.document_type}`) : '—' }}
          </Badge>
        </template>

        <template #cell.title="{ row }">
          <span class="cell-strong">{{ row.title || '—' }}</span>
        </template>

        <template #cell.issue_date="{ row }">
          <span class="cell-muted">{{ row.issue_date ? formatDate(row.issue_date) : '—' }}</span>
        </template>

        <template #cell.expiry_date="{ row }">
          <span class="cell-muted">{{ row.expiry_date ? formatDate(row.expiry_date) : '—' }}</span>
        </template>

        <template #cell.is_verified="{ row }">
          <Badge :tone="row.is_verified ? 'success' : 'warning'">
            {{ row.is_verified ? t('hrdoc_verified_YES') : t('hrdoc_verified_NO') }}
          </Badge>
        </template>

        <template #cell.verified_by="{ row }">
          <span class="cell-muted">{{ personName(row.verified_by) }}</span>
        </template>

        <template #cell.uploaded_at="{ row }">
          <span class="cell-muted">{{ row.uploaded_at ? formatDate(row.uploaded_at) : '—' }}</span>
        </template>

        <template #row-actions="{ row }">
          <IconAction
            v-if="!row.is_verified"
            icon="checkcircle"
            tone="success"
            :title="t('hr_documents_verify')"
            @click="askVerify(row)"
          />
          <IconAction
            v-if="row.file_url"
            icon="download"
            tone="primary"
            :title="t('hr_documents_download')"
            @click="doDownload(row)"
          />
          <IconAction
            icon="pencil"
            :title="t('Edit')"
            @click="openEdit(row)"
          />
          <IconAction
            icon="trash"
            tone="danger"
            :title="t('Delete')"
            @click="askDelete(row)"
          />
        </template>

        <template #empty>
          <div class="statefill">
            <div class="statefill__icon">
              <DesignIcon
                name="inbox"
                :size="24"
              />
            </div>
            <div class="statefill__title">
              {{ t('hr_documents_empty') }}
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
                {{ t('hr_documents_new') }}
              </Button>
            </div>
          </div>
        </template>
      </DataTable>
    </Card>

    <!-- Create / Edit modal -->
    <Modal
      :open="formOpen"
      :title="editing ? t('hr_documents_edit') : t('hr_documents_new')"
      :subtitle="editing ? t('hr_documents_title') : t('hr_documents_subtitle')"
      :width="640"
      @close="closeForm"
    >
      <form @submit.prevent="save">
        <div class="form-grid">
          <Field
            v-if="!editing"
            :label="t('hr_documents_employee')"
            class="span-2"
            :error="errors.employee_id"
          >
            <Select
              v-model="form.employee_id"
              :options="employeeOptions"
              :error="!!errors.employee_id"
              :placeholder="t('hr_documents_employee')"
            />
          </Field>

          <Field
            :label="t('hr_documents_type')"
            :error="errors.document_type"
          >
            <Select
              v-model="form.document_type"
              :options="typeOptions"
              :error="!!errors.document_type"
            />
          </Field>

          <Field
            :label="t('hr_documents_title_label')"
            :error="errors.title"
          >
            <Input
              v-model="form.title"
              :error="!!errors.title"
              :placeholder="t('hr_documents_title_label')"
              :maxlength="200"
            />
          </Field>

          <Field
            :label="t('hr_documents_file_url')"
            class="span-2"
            :hint="t('hr_documents_no_file')"
          >
            <Input
              v-model="form.file_url"
              :placeholder="t('hr_documents_file_url')"
              :maxlength="500"
            />
          </Field>

          <Field
            :label="t('hr_documents_issue_date')"
          >
            <Input
              v-model="form.issue_date"
              icon="calendar"
              type="date"
              :aria-label="t('hr_documents_issue_date')"
            />
          </Field>

          <Field
            :label="t('hr_documents_expiry_date')"
          >
            <Input
              v-model="form.expiry_date"
              icon="calendar"
              type="date"
              :aria-label="t('hr_documents_expiry_date')"
            />
          </Field>

          <Field
            :label="t('hr_documents_notes')"
            class="span-2"
          >
            <Textarea
              v-model="form.notes"
              class="control"
              rows="3"
              :placeholder="t('hr_documents_notes')"
              style="resize:vertical;min-height:80px;padding:10px 12px;"
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

    <!-- Verify confirm -->
    <Modal
      :open="verifyOpen"
      :title="t('hr_documents_verify')"
      :subtitle="verifying ? verifying.title : ''"
      :width="440"
      @close="closeVerify"
    >
      <div style="padding:4px 2px;">
        {{ t('hr_documents_verify_confirm') }}
      </div>
      <template #footer>
        <Button
          variant="primary"
          icon="checkcircle"
          :loading="verifyBusy"
          :disabled="verifyBusy"
          @click="doVerify"
        >
          {{ t('hr_documents_verify') }}
        </Button>
      </template>
    </Modal>

    <!-- Delete confirm -->
    <Modal
      :open="deleteOpen"
      :title="t('Delete')"
      :subtitle="deleting ? deleting.title : ''"
      :width="440"
      @close="closeDelete"
    >
      <div style="padding:4px 2px;">
        {{ t('hr_documents_delete_confirm') }}
      </div>
      <template #footer>
        <Button
          variant="danger"
          icon="trash"
          :loading="deleteBusy"
          :disabled="deleteBusy"
          @click="doDelete"
        >
          {{ t('Delete') }}
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

<style scoped>
.hr-docs-toolbar {
  flex-wrap: wrap;
}
.tb-search { flex: 1; max-width: 300px; min-width: 200px; }
.tb-select { width: 200px; }
.tb-select--wide { width: 240px; }
.tb-switch { display: flex; align-items: center; gap: 8px; }
.tb-days { width: 130px; }

@media (max-width: 900px) {
  .tb-search,
  .tb-select,
  .tb-select--wide,
  .tb-days {
    width: 100%;
    max-width: none;
    flex: 1 1 100%;
  }
  .tb-switch {
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

<route lang="yaml">
meta:
  action: manage
  subject: all
</route>
