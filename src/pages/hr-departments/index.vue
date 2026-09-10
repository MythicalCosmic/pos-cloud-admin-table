<script setup lang="ts">
/* ============================================================
   HR DEPARTMENTS — organisational units, manager assignment
   Plain HTML + design primitives. No Vuetify on this surface.
   ============================================================ */
import type { DataTableColumn } from '@/components/design/DataTable.vue'
import defaultAxios, { hrApi as axios } from '@/plugins/axios'
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

// ============================================================
// State
// ============================================================
const items = ref<any[]>([])
const total = ref(0)
const loading = ref(false)
const page = ref(1)
const itemsPerPage = ref(10)
const search = ref('')

const dialog = ref(false)
const editing = ref<any>(null)
const saving = ref(false)
const form = ref<{ name: string; description: string; is_active: boolean; manager_id: number | null }>({
  name: '',
  description: '',
  is_active: true,
  manager_id: null,
})
const errors = ref<Record<string, string>>({})

// Filters
const statusFilter = ref<string>('') // '', 'true', 'false'

const users = ref<any[]>([])

// ============================================================
// Tone map
// ============================================================
const STATUS_TONE: Record<string, 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'primary'> = {
  ACTIVE: 'success',
  INACTIVE: 'neutral',
}

// ============================================================
// API
// ============================================================
async function loadUsers() {
  try {
    const res = await defaultAxios.get('/users', { params: { per_page: 200 } })
    const d = res.data?.data ?? res.data
    users.value = d?.users ?? d?.items ?? d ?? []
  }
  catch {
    users.value = []
  }
}

async function load() {
  loading.value = true
  try {
    const params: any = { page: page.value, per_page: itemsPerPage.value }
    if (search.value)
      params.search = search.value
    if (statusFilter.value)
      params.is_active = statusFilter.value
    const res = await axios.get('/departments/', { params })
    const d = res.data?.data ?? res.data

    items.value = d?.departments ?? d?.items ?? []
    total.value = d?.pagination?.total ?? d?.pagination?.total_items ?? items.value.length
  }
  catch {
    notify(t('Failed to load'), 'error')
  }
  finally {
    loading.value = false
  }
}

onMounted(() => { load(); loadUsers() })
watch([page, itemsPerPage], load)
watch(statusFilter, () => { page.value = 1; load() })

const debouncedSearch = useDebounceFn(() => { page.value = 1; load() }, 400)
watch(search, debouncedSearch)

// ============================================================
// Filter options
// ============================================================
const statusOptions = computed(() => [
  { value: '', label: t('department_status_filter_all') },
  { value: 'true', label: t('department_status_ACTIVE') },
  { value: 'false', label: t('department_status_INACTIVE') },
])

const managerOptions = computed(() => [
  { value: '', label: t('department_manager_select') },
  ...users.value.map((u: any) => ({
    value: String(u.id),
    label: `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || u.email || `#${u.id}`,
  })),
])

// ============================================================
// Filter chips
// ============================================================
const activeFilters = computed(() => {
  const out: { k: string; label: string; val: string; clear: () => void }[] = []
  if (statusFilter.value) {
    const v = statusFilter.value === 'true' ? 'ACTIVE' : 'INACTIVE'
    out.push({
      k: 's',
      label: t('Status'),
      val: t(`department_status_${v}`),
      clear: () => { statusFilter.value = '' },
    })
  }
  if (search.value)
    out.push({ k: 'q', label: t('Search'), val: search.value, clear: () => { search.value = '' } })
  return out
})

function clearAllFilters() {
  statusFilter.value = ''
  search.value = ''
}

// ============================================================
// Columns
// ============================================================
const columns: DataTableColumn<any>[] = [
  { key: 'name', label: t('department_col_name'), sortable: true },
  { key: 'description', label: t('department_col_description'), sortable: false },
  { key: 'manager', label: t('department_col_manager'), sortable: false, width: 200 },
  { key: 'employee_count', label: t('department_col_employee_count'), sortable: true, align: 'right', width: 130 },
  { key: 'is_active', label: t('department_col_status'), sortable: true, width: 120 },
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
  form.value = { name: '', description: '', is_active: true, manager_id: null }
  errors.value = {}
  dialog.value = true
}

function openEdit(d: any) {
  editing.value = d
  form.value = {
    name: d.name ?? '',
    description: d.description ?? '',
    is_active: d.is_active ?? true,
    manager_id: d.manager?.id ?? d.manager_id ?? null,
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
  if (!form.value.name.trim())
    e.name = t('Required')
  errors.value = e
  return Object.keys(e).length === 0
}

async function save() {
  if (!validate())
    return
  saving.value = true
  try {
    const payload: any = {
      name: form.value.name.trim(),
      description: form.value.description,
      is_active: !!form.value.is_active,
      manager_id: form.value.manager_id,
    }
    if (editing.value)
      await axios.put(`/departments/${editing.value.id}/`, payload)
    else
      await axios.post('/departments/', payload)
    notify(editing.value ? t('department_toast_updated') : t('department_toast_created'))
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
const confirmOpen = ref(false)
const confirmRow = ref<any>(null)
const deleting = ref(false)

function askDelete(row: any) {
  confirmRow.value = row
  confirmOpen.value = true
}

function closeConfirm() {
  if (deleting.value)
    return
  confirmOpen.value = false
  confirmRow.value = null
}

async function doDelete() {
  if (!confirmRow.value)
    return
  deleting.value = true
  try {
    await axios.delete(`/departments/${confirmRow.value.id}/`)
    notify(t('department_toast_deleted'))
    confirmOpen.value = false
    confirmRow.value = null
    await load()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
  finally {
    deleting.value = false
  }
}

// ============================================================
// Form-modal binding for manager_id (Select uses string values)
// ============================================================
const managerIdStr = computed({
  get: () => form.value.manager_id == null ? '' : String(form.value.manager_id),
  set: (v: string) => { form.value.manager_id = v ? Number(v) : null },
})

// ============================================================
// Helpers
// ============================================================
function managerName(row: any): string {
  const m = row?.manager
  if (!m)
    return '—'
  const full = `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim()
  return full || '—'
}

// ============================================================
// ESC handler
// ============================================================
function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape')
    return
  if (confirmOpen.value) { closeConfirm(); e.preventDefault(); return }
  if (dialog.value) { closeForm(); e.preventDefault() }
}

onMounted(() => { window.addEventListener('keydown', onKeydown) })
onBeforeUnmount(() => { window.removeEventListener('keydown', onKeydown) })
</script>

<template>
  <div class="page">
    <PageHeader
      :title="t('Departments')"
      :subtitle="t('department_subtitle')"
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
          {{ t('New Department') }}
        </Button>
      </template>
    </PageHeader>

    <!-- Toolbar + table -->
    <Card>
      <div class="toolbar toolbar--wrap">
        <div class="tb-search">
          <Input
            v-model="search"
            icon="search"
            :placeholder="t('Search')"
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
        <template #cell.name="{ row }">
          <span class="cell-strong">{{ row.name || '—' }}</span>
        </template>

        <template #cell.description="{ row }">
          <span class="cell-muted">{{ row.description || '—' }}</span>
        </template>

        <template #cell.manager="{ row }">
          <span>{{ managerName(row) }}</span>
        </template>

        <template #cell.employee_count="{ row }">
          <span class="mono">{{ row.employee_count ?? 0 }}</span>
        </template>

        <template #cell.is_active="{ row }">
          <Badge :tone="STATUS_TONE[row.is_active ? 'ACTIVE' : 'INACTIVE']">
            {{ t(`department_status_${row.is_active ? 'ACTIVE' : 'INACTIVE'}`) }}
          </Badge>
        </template>

        <template #row-actions="{ row }">
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
                name="users"
                :size="24"
              />
            </div>
            <div class="statefill__title">
              {{ t('department_empty_title') }}
            </div>
            <div class="statefill__sub">
              {{ t('department_empty_hint') }}
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
                {{ t('New Department') }}
              </Button>
            </div>
          </div>
        </template>
      </DataTable>
    </Card>

    <!-- Create / Edit modal -->
    <Modal
      :open="dialog"
      :title="editing ? t('Edit Department') : t('New Department')"
      :subtitle="editing ? (editing.name || '') : t('department_subtitle')"
      :width="560"
      @close="closeForm"
    >
      <form @submit.prevent="save">
        <div class="form-grid">
          <Field
            :label="t('Name')"
            class="span-2"
            :error="errors.name"
          >
            <Input
              v-model="form.name"
              :error="!!errors.name"
              :placeholder="t('department_name_placeholder')"
            />
          </Field>

          <Field
            :label="t('Description')"
            class="span-2"
          >
            <Input
              v-model="form.description"
              :placeholder="t('department_description_placeholder')"
            />
          </Field>

          <Field
            :label="t('Manager')"
            class="span-2"
          >
            <Select
              v-model="managerIdStr"
              :options="managerOptions"
              :placeholder="t('department_manager_select')"
            />
          </Field>

          <Field
            :label="t('Active')"
            class="span-2"
          >
            <Switch v-model="form.is_active" />
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
      :open="confirmOpen"
      :title="t('department_modal_delete_title')"
      :subtitle="confirmRow ? (confirmRow.name || '') : ''"
      :width="440"
      @close="closeConfirm"
    >
      <div style="padding:4px 2px 8px;color:rgb(var(--v-theme-text-secondary));">
        {{ t('department_confirm_delete') }}
      </div>

      <template #footer>
        <Button
          variant="danger"
          icon="trash"
          :loading="deleting"
          :disabled="deleting"
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

<route lang="yaml">
meta:
  action: manage
  subject: all
</route>

<style scoped>
.toolbar--wrap {
  flex-wrap: wrap;
}

.tb-search {
  flex: 1;
  min-width: 220px;
  max-width: 320px;
}

.tb-filter {
  width: 200px;
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
  .tb-search,
  .tb-filter {
    width: 100%;
    max-width: 100%;
    flex: 1 1 100%;
  }
}

@media (max-width: 768px) {
  .tb-search,
  .tb-filter {
    width: 100%;
    max-width: 100%;
    flex: 1 1 100%;
  }

  .form-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .form-grid .span-2 {
    grid-column: span 1;
  }
}
</style>
