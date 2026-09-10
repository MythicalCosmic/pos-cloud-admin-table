<script setup lang="ts">
/* ============================================================
   HR LEAVE TYPES — categories, quotas, approval rules
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
// State
// ============================================================
const items = ref<any[]>([])
const total = ref(0)
const loading = ref(false)

const page = ref(1)
const itemsPerPage = ref(10)

// Filters per spec
const isActiveFilter = ref<string>('') // server: ?is_active=true|false
const isPaidFilter = ref<string>('')   // client-side only
const requiresApprovalFilter = ref<string>('') // client-side only
const search = ref<string>('') // client-side q

// ============================================================
// Tone maps
// ============================================================
const PAID_TONE: Record<string, 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'primary'> = {
  YES: 'success',
  NO: 'neutral',
}
const APPROVAL_TONE: Record<string, 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'primary'> = {
  YES: 'warning',
  NO: 'neutral',
}
const STATUS_TONE: Record<string, 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'primary'> = {
  ACTIVE: 'success',
  INACTIVE: 'neutral',
}

// ============================================================
// API
// ============================================================
async function load() {
  loading.value = true
  try {
    const params: Record<string, any> = { page: page.value, per_page: itemsPerPage.value }
    if (isActiveFilter.value)
      params.is_active = isActiveFilter.value
    const res = await axios.get('/leave-types/', { params })
    const d = res.data?.data ?? res.data
    items.value = d?.leave_types ?? d?.items ?? []
    total.value = d?.pagination?.total_items ?? d?.pagination?.total ?? items.value.length
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
watch(isActiveFilter, () => { page.value = 1; load() })

// ============================================================
// Client-side filter + search across name / short_name
// ============================================================
const filteredItems = computed(() => {
  let rows = items.value
  const q = search.value.trim().toLowerCase()
  if (q) {
    rows = rows.filter((r: any) => {
      const name = String(r.name ?? '').toLowerCase()
      const sn = String(r.short_name ?? '').toLowerCase()
      return name.includes(q) || sn.includes(q)
    })
  }
  if (isPaidFilter.value !== '') {
    const want = isPaidFilter.value === 'true'
    rows = rows.filter((r: any) => Boolean(r.is_paid) === want)
  }
  if (requiresApprovalFilter.value !== '') {
    const want = requiresApprovalFilter.value === 'true'
    rows = rows.filter((r: any) => Boolean(r.requires_approval) === want)
  }
  return rows
})

// ============================================================
// Filter chips
// ============================================================
const activeFilters = computed(() => {
  const out: { k: string; label: string; val: string; clear: () => void }[] = []
  if (isActiveFilter.value) {
    const v = isActiveFilter.value === 'true' ? 'ACTIVE' : 'INACTIVE'
    out.push({
      k: 'a',
      label: t('leave_type_col_is_active'),
      val: t(`leave_type_status_${v}`),
      clear: () => { isActiveFilter.value = '' },
    })
  }
  if (isPaidFilter.value) {
    const v = isPaidFilter.value === 'true' ? 'YES' : 'NO'
    out.push({
      k: 'p',
      label: t('leave_type_col_is_paid'),
      val: t(`leave_type_paid_${v}`),
      clear: () => { isPaidFilter.value = '' },
    })
  }
  if (requiresApprovalFilter.value) {
    const v = requiresApprovalFilter.value === 'true' ? 'YES' : 'NO'
    out.push({
      k: 'r',
      label: t('leave_type_col_requires_approval'),
      val: t(`leave_type_approval_${v}`),
      clear: () => { requiresApprovalFilter.value = '' },
    })
  }
  if (search.value)
    out.push({ k: 'q', label: t('Search'), val: search.value, clear: () => { search.value = '' } })
  return out
})

function clearAllFilters() {
  isActiveFilter.value = ''
  isPaidFilter.value = ''
  requiresApprovalFilter.value = ''
  search.value = ''
}

// ============================================================
// Filter options
// ============================================================
const isActiveOptions = computed(() => [
  { value: '', label: t('leave_type_active_filter_all') },
  { value: 'true', label: t('leave_type_active_filter_active') },
  { value: 'false', label: t('leave_type_active_filter_inactive') },
])
const isPaidOptions = computed(() => [
  { value: '', label: t('leave_type_paid_filter_all') },
  { value: 'true', label: t('leave_type_paid_filter_paid') },
  { value: 'false', label: t('leave_type_paid_filter_unpaid') },
])
const requiresApprovalOptions = computed(() => [
  { value: '', label: t('leave_type_approval_filter_all') },
  { value: 'true', label: t('leave_type_approval_filter_yes') },
  { value: 'false', label: t('leave_type_approval_filter_no') },
])

// ============================================================
// Columns
// ============================================================
const columns: DataTableColumn<any>[] = [
  { key: 'name', label: t('leave_type_col_name'), sortable: true },
  { key: 'short_name', label: t('leave_type_col_short_name'), sortable: true, width: 120 },
  { key: 'is_paid', label: t('leave_type_col_is_paid'), sortable: true, width: 130 },
  { key: 'annual_quota', label: t('leave_type_col_annual_quota'), sortable: true, align: 'right', width: 140 },
  { key: 'max_carryover', label: t('leave_type_col_max_carryover'), sortable: true, align: 'right', width: 150 },
  { key: 'requires_approval', label: t('leave_type_col_requires_approval'), sortable: true, width: 150 },
  { key: 'is_active', label: t('leave_type_col_is_active'), sortable: true, width: 130 },
  { key: 'created_at', label: t('leave_type_col_created_at'), sortable: true, width: 160 },
]

const tablePagination = computed(() => ({
  page: page.value,
  perPage: itemsPerPage.value,
  total: total.value,
  onPage: (n: number) => { page.value = n },
  onPerPage: (n: number) => { itemsPerPage.value = n; page.value = 1 },
}))

// ============================================================
// Create / Edit modal
// ============================================================
type FormShape = {
  name: string
  short_name: string
  annual_quota: number
  max_carryover: number
  is_paid: boolean
  requires_approval: boolean
  is_active: boolean
}

const blankForm = (): FormShape => ({
  name: '',
  short_name: '',
  annual_quota: 0,
  max_carryover: 0,
  is_paid: true,
  requires_approval: true,
  is_active: true,
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
    name: row.name ?? '',
    short_name: row.short_name ?? '',
    annual_quota: Number(row.annual_quota ?? 0),
    max_carryover: Number(row.max_carryover ?? 0),
    is_paid: Boolean(row.is_paid),
    requires_approval: Boolean(row.requires_approval),
    is_active: row.is_active ?? true,
  }
  errors.value = {}
  formOpen.value = true
}

function closeForm() {
  if (saving.value)
    return
  formOpen.value = false
  editing.value = null
}

function validate(): boolean {
  const e: Record<string, string> = {}
  if (!form.value.name.trim())
    e.name = t('Required')
  if (form.value.name.length > 100)
    e.name = t('Too long')
  if (form.value.short_name.length > 20)
    e.short_name = t('Too long')
  if (Number(form.value.annual_quota) < 0)
    e.annual_quota = t('Required')
  if (Number(form.value.max_carryover) < 0)
    e.max_carryover = t('Required')
  errors.value = e
  return Object.keys(e).length === 0
}

async function submit() {
  if (!validate())
    return
  saving.value = true
  try {
    const payload: any = {
      name: form.value.name.trim(),
      short_name: form.value.short_name.trim(),
      annual_quota: Number(form.value.annual_quota) || 0,
      max_carryover: Number(form.value.max_carryover) || 0,
      is_paid: !!form.value.is_paid,
      requires_approval: !!form.value.requires_approval,
    }
    if (editing.value) {
      payload.is_active = !!form.value.is_active
      await axios.put(`/leave-types/${editing.value.id}/`, payload)
      notify(t('leave_type_toast_updated'))
    }
    else {
      await axios.post('/leave-types/', payload)
      notify(t('leave_type_toast_created'))
    }
    formOpen.value = false
    editing.value = null
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
// Deactivate (soft-delete) confirm modal
// ============================================================
const confirmOpen = ref(false)
const confirmRow = ref<any>(null)
const deleting = ref(false)

function askDeactivate(row: any) {
  confirmRow.value = row
  confirmOpen.value = true
}

function closeConfirm() {
  if (deleting.value)
    return
  confirmOpen.value = false
  confirmRow.value = null
}

async function doDeactivate() {
  if (!confirmRow.value)
    return
  deleting.value = true
  try {
    await axios.delete(`/leave-types/${confirmRow.value.id}/`)
    notify(t('leave_type_toast_deactivated'))
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
// ESC handler — Modal already wires its own ESC, but cover both
// open modals deterministically.
// ============================================================
function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape')
    return
  if (confirmOpen.value) { closeConfirm(); e.preventDefault(); return }
  if (formOpen.value) { closeForm(); e.preventDefault() }
}

onMounted(() => { window.addEventListener('keydown', onKeydown) })
onBeforeUnmount(() => { window.removeEventListener('keydown', onKeydown) })

// ============================================================
// Helpers
// ============================================================
function fmtInt(n: any): string {
  if (n === null || n === undefined || n === '')
    return '—'
  const v = Number(n)
  if (Number.isNaN(v))
    return '—'
  return String(Math.round(v))
}
</script>

<template>
  <div class="page">
    <PageHeader
      :title="t('leave_types_title')"
      :subtitle="t('leave_types_subtitle')"
    >
      <template #actions>
        <Button
          variant="ghost"
          icon="refresh"
          :disabled="loading"
          @click="load"
        >
          {{ t('leave_type_action_refresh') }}
        </Button>
        <Button
          variant="primary"
          icon="plus"
          @click="openCreate"
        >
          {{ t('leave_type_action_create') }}
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
            v-model="isActiveFilter"
            icon="filter"
            :placeholder="t('leave_type_col_is_active')"
            :options="isActiveOptions"
          />
        </div>
        <div class="tb-filter">
          <Select
            v-model="isPaidFilter"
            icon="dollar"
            :placeholder="t('leave_type_col_is_paid')"
            :options="isPaidOptions"
          />
        </div>
        <div class="tb-filter tb-filter--wide">
          <Select
            v-model="requiresApprovalFilter"
            icon="checkcircle"
            :placeholder="t('leave_type_col_requires_approval')"
            :options="requiresApprovalOptions"
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
        :rows="filteredItems"
        row-key="id"
        :loading="loading"
        :pagination="tablePagination"
        :initial-sort="{ key: 'created_at', dir: 'desc' }"
      >
        <template #cell.name="{ row }">
          <span class="cell-strong">{{ row.name || '—' }}</span>
        </template>

        <template #cell.short_name="{ row }">
          <span class="mono cell-muted">{{ row.short_name || '—' }}</span>
        </template>

        <template #cell.is_paid="{ row }">
          <Badge :tone="PAID_TONE[row.is_paid ? 'YES' : 'NO']">
            {{ t(`leave_type_paid_${row.is_paid ? 'YES' : 'NO'}`) }}
          </Badge>
        </template>

        <template #cell.annual_quota="{ row }">
          <span class="mono">{{ fmtInt(row.annual_quota) }}</span>
        </template>

        <template #cell.max_carryover="{ row }">
          <span class="mono">{{ fmtInt(row.max_carryover) }}</span>
        </template>

        <template #cell.requires_approval="{ row }">
          <Badge :tone="APPROVAL_TONE[row.requires_approval ? 'YES' : 'NO']">
            {{ t(`leave_type_approval_${row.requires_approval ? 'YES' : 'NO'}`) }}
          </Badge>
        </template>

        <template #cell.is_active="{ row }">
          <Badge :tone="STATUS_TONE[row.is_active ? 'ACTIVE' : 'INACTIVE']">
            {{ t(`leave_type_status_${row.is_active ? 'ACTIVE' : 'INACTIVE'}`) }}
          </Badge>
        </template>

        <template #cell.created_at="{ row }">
          <span class="cell-muted">{{ row.created_at ? formatDate(row.created_at) : '—' }}</span>
        </template>

        <template #row-actions="{ row }">
          <IconAction
            icon="pencil"
            :title="t('leave_type_action_edit')"
            @click="openEdit(row)"
          />
          <IconAction
            icon="trash"
            tone="danger"
            :title="t('leave_type_action_deactivate')"
            :disabled="!row.is_active"
            @click="askDeactivate(row)"
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
              {{ t('leave_type_empty_title') }}
            </div>
            <div class="statefill__sub">
              {{ t('leave_type_empty_hint') }}
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
                {{ t('leave_type_action_create') }}
              </Button>
            </div>
          </div>
        </template>
      </DataTable>
    </Card>

    <!-- Create / Edit modal -->
    <Modal
      :open="formOpen"
      :title="editing ? t('leave_type_modal_edit_title') : t('leave_type_modal_create_title')"
      :subtitle="editing ? (editing.name || '') : t('leave_types_subtitle')"
      :width="640"
      @close="closeForm"
    >
      <form @submit.prevent="submit">
        <div class="form-grid">
          <Field
            :label="t('leave_type_field_name')"
            class="span-2"
            :error="errors.name"
          >
            <Input
              v-model="form.name"
              :error="!!errors.name"
              :placeholder="t('leave_type_field_name')"
            />
          </Field>

          <Field
            :label="t('leave_type_field_short_name')"
            class="span-2"
            :error="errors.short_name"
            :hint="t('leave_type_short_name_hint')"
          >
            <Input
              v-model="form.short_name"
              :error="!!errors.short_name"
              :placeholder="t('leave_type_short_name_placeholder')"
            />
          </Field>

          <Field
            :label="t('leave_type_field_annual_quota')"
            :error="errors.annual_quota"
            :hint="t('leave_type_quota_hint')"
          >
            <Input
              v-model="form.annual_quota"
              type="number"
              icon="calendar"
              :error="!!errors.annual_quota"
              :placeholder="t('leave_type_qty_placeholder')"
              inputmode="numeric"
            />
          </Field>

          <Field
            :label="t('leave_type_field_max_carryover')"
            :error="errors.max_carryover"
            :hint="t('leave_type_carryover_hint')"
          >
            <Input
              v-model="form.max_carryover"
              type="number"
              icon="calendar"
              :error="!!errors.max_carryover"
              :placeholder="t('leave_type_qty_placeholder')"
              inputmode="numeric"
            />
          </Field>

          <Field :label="t('leave_type_field_is_paid')">
            <Switch v-model="form.is_paid" />
          </Field>

          <Field :label="t('leave_type_field_requires_approval')">
            <Switch v-model="form.requires_approval" />
          </Field>

          <Field
            v-if="editing"
            :label="t('leave_type_field_is_active')"
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
          @click="submit"
        >
          {{ t('Save') }}
        </Button>
      </template>
    </Modal>

    <!-- Deactivate confirm modal -->
    <Modal
      :open="confirmOpen"
      :title="t('leave_type_action_deactivate')"
      :subtitle="confirmRow ? (confirmRow.name || '') : ''"
      :width="460"
      @close="closeConfirm"
    >
      <div style="padding:4px 2px 8px;color:rgb(var(--v-theme-text-secondary));">
        {{ t('leave_type_confirm_deactivate') }}
      </div>

      <template #footer>
        <Button
          variant="danger"
          icon="trash"
          :loading="deleting"
          :disabled="deleting"
          @click="doDeactivate"
        >
          {{ t('leave_type_action_deactivate') }}
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
  max-width: 300px;
}

.tb-filter {
  width: 200px;
}

.tb-filter--wide {
  width: 220px;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.form-grid .span-2 {
  grid-column: span 2;
}

@media (max-width: 768px) {
  .tb-search,
  .tb-filter,
  .tb-filter--wide {
    width: 100%;
    max-width: 100%;
    min-width: 0;
    flex: 1 1 100%;
  }

  .form-grid {
    grid-template-columns: 1fr;
  }

  .form-grid .span-2 {
    grid-column: span 1;
  }
}
</style>
