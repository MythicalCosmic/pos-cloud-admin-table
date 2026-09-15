<script setup lang="ts">
import WorkspacePage from '@/components/design/workspace/WorkspacePage.vue'
import WorkspaceToolbar from '@/components/design/workspace/WorkspaceToolbar.vue'

/* ============================================================
   STOCK — PRODUCTION ORDERS
   Plain HTML + design primitives. No Vuetify on this surface.

   v3 improvements:
   - Completing an order now opens a dedicated modal capturing the
     ACTUAL output quantity (required by the backend), quality result
     and notes, with a live variance readout. Previously the generic
     confirm-action posted no body, so `complete` always failed the
     backend's "Actual output quantity must be greater than zero" guard.
   - Cancel / Hold confirm modals capture an optional reason and pass it
     through (backend accepts `reason` on both actions).
   - Inline expandable rows now show the full Bill of Materials
     (ingredients + allocation status) and produced Outputs pulled from
     the detail endpoint — the operationally useful data an operator
     needs before starting or after finishing a batch.
   ============================================================ */
import type { DataTableColumn } from '@/components/design/DataTable.vue'
import { stockApi as axios } from '@/plugins/axios'
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
import { useStateAction } from '@/composables/useStateAction'
import { getStoredUserData } from '@/utils/storage'

const { t } = useI18n({ useScope: 'global' })
const { snackbar, snackbarMsg, snackbarColor, notify } = useNotify()
const { formatDateShort } = useFormatters()

// ============================================================
// State
// ============================================================
const orders = ref<any[]>([])
const total = ref(0)
const loading = ref(false)
const page = ref(1)
const itemsPerPage = ref(10)

const statusFilter = ref<string>('')
const priorityFilter = ref<string>('')
const recipeFilter = ref<string>('')
const locationFilter = ref<string>('')

const recipesList = ref<any[]>([])
const locationsList = ref<any[]>([])

const createDialog = ref(false)
const saving = ref(false)

const form = ref({
  recipe_id: '' as string,
  batch_multiplier: 1,
  source_location_id: '' as string,
  output_location_id: '' as string,
  priority: 'NORMAL',
  planned_start_date: '',
  notes: '',
})

const STATUSES = ['DRAFT', 'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELED', 'ON_HOLD'] as const
const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const

const STATUS_TONE: Record<string, 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'primary'> = {
  DRAFT: 'neutral',
  PLANNED: 'info',
  IN_PROGRESS: 'primary',
  COMPLETED: 'success',
  CANCELED: 'error',
  ON_HOLD: 'warning',
}

const PRIORITY_TONE: Record<string, 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'primary'> = {
  LOW: 'neutral',
  NORMAL: 'info',
  HIGH: 'warning',
  URGENT: 'error',
}

// Ingredient allocation status → Badge tone (Bill of Materials in expand row)
const INGREDIENT_TONE: Record<string, 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'primary'> = {
  PENDING: 'neutral',
  ALLOCATED: 'info',
  CONSUMED: 'success',
}

// Quality result → generic i18n label key (reused across the app)
const QUALITY_LABEL: Record<string, string> = {
  PASSED: 'Passed',
  FAILED: 'Failed',
  PENDING: 'Pending',
}
const QUALITY_TONE: Record<string, 'success' | 'warning' | 'error' | 'neutral'> = {
  PASSED: 'success',
  FAILED: 'error',
  PENDING: 'neutral',
}

// ============================================================
// Filter options
// ============================================================
const statusFilterOptions = computed(() => [
  { value: '', label: t('All Statuses') },
  ...STATUSES.map(v => ({ value: v, label: t(`production_status_${v}`) })),
])
const priorityFilterOptions = computed(() => [
  { value: '', label: t('All Priorities') },
  ...PRIORITIES.map(v => ({ value: v, label: t(`priority_${v}`) })),
])
const recipeFilterOptions = computed(() => [
  { value: '', label: t('All Recipes') },
  ...recipesList.value.map(r => ({ value: String(r.id), label: r.name })),
])
const locationFilterOptions = computed(() => [
  { value: '', label: t('All Locations') },
  ...locationsList.value.map(l => ({ value: String(l.id), label: l.name })),
])

const recipeFormOptions = computed(() =>
  recipesList.value.map(r => ({ value: String(r.id), label: r.name })),
)
const locationFormOptions = computed(() =>
  locationsList.value.map(l => ({ value: String(l.id), label: l.name })),
)
const priorityFormOptions = computed(() =>
  PRIORITIES.map(v => ({ value: v, label: t(`priority_${v}`) })),
)
const qualityFormOptions = computed(() =>
  (['PASSED', 'FAILED', 'PENDING'] as const).map(v => ({ value: v, label: t(QUALITY_LABEL[v]) })),
)

const hasActiveFilters = computed(() =>
  !!(statusFilter.value || priorityFilter.value || recipeFilter.value || locationFilter.value),
)
function clearFilters() {
  statusFilter.value = ''
  priorityFilter.value = ''
  recipeFilter.value = ''
  locationFilter.value = ''
}

// ============================================================
// API
// ============================================================
async function loadOrders() {
  loading.value = true
  try {
    const params: any = { page: page.value, per_page: itemsPerPage.value }
    if (statusFilter.value)
      params.status = statusFilter.value
    if (priorityFilter.value)
      params.priority = priorityFilter.value
    if (recipeFilter.value)
      params.recipe_id = recipeFilter.value
    if (locationFilter.value)
      params.location_id = locationFilter.value

    const res = await axios.get('/production-orders/', { params })
    const d = res.data?.data ?? res.data

    orders.value = d?.orders ?? []
    total.value = d?.pagination?.total ?? d?.pagination?.total_items ?? orders.value.length
    // Invalidate per-row detail cache whenever the list reloads so expanded
    // rows refetch fresh detail after pagination / filter / action changes.
    detailCache.value = {}
    detailLoading.value = {}
  }
  catch {
    notify(t('Failed to load production orders'), 'error')
  }
  finally {
    loading.value = false
  }
}

async function loadMeta() {
  try {
    const [recRes, locRes] = await Promise.all([
      axios.get('/recipes/', { params: { per_page: 300, is_active: true } }),
      axios.get('/locations/', { params: { per_page: 200 } }),
    ])

    const recD = recRes.data?.data ?? recRes.data
    const locD = locRes.data?.data ?? locRes.data

    recipesList.value = recD?.recipes ?? []
    locationsList.value = locD?.locations ?? []
  }
  catch { /* ignore */ }
}

onMounted(() => { loadOrders(); loadMeta() })
watch([page, itemsPerPage], loadOrders)
watch([statusFilter, priorityFilter, recipeFilter, locationFilter], () => { page.value = 1; loadOrders() })

// ============================================================
// Create
// ============================================================
function openCreate() {
  form.value = {
    recipe_id: '',
    batch_multiplier: 1,
    source_location_id: '',
    output_location_id: '',
    priority: 'NORMAL',
    planned_start_date: '',
    notes: '',
  }
  createDialog.value = true
}

function closeCreate() {
  if (saving.value)
    return
  createDialog.value = false
}

async function createOrder() {
  if (!form.value.recipe_id) {
    notify(t('Recipe is required'), 'error')

    return
  }
  if (!form.value.source_location_id || !form.value.output_location_id) {
    notify(t('Source and output locations are required'), 'error')

    return
  }
  saving.value = true
  try {
    const userData = getStoredUserData()
    const payload: any = {
      recipe_id: Number(form.value.recipe_id),
      batch_multiplier: form.value.batch_multiplier,
      source_location_id: Number(form.value.source_location_id),
      output_location_id: Number(form.value.output_location_id),
      priority: form.value.priority,
      created_by_id: userData.id,
    }
    if (form.value.planned_start_date)
      payload.planned_start = new Date(form.value.planned_start_date).toISOString()
    if (form.value.notes)
      payload.notes = form.value.notes
    await axios.post('/production-orders/', payload)
    notify(t('Production order created'))
    createDialog.value = false
    await loadOrders()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error creating order'), 'error')
  }
  finally {
    saving.value = false
  }
}

// ============================================================
// Status transitions (plan / start / cancel / hold / resume)
// Complete is handled separately — it needs an output quantity.
// ============================================================
const actionTitleKey: Record<string, string> = {
  plan: 'Plan Order',
  start: 'Start Production',
  cancel: 'Cancel Order',
  hold: 'Put on Hold',
  resume: 'Resume Order',
}

// We reuse the composable's dialog state refs but drive the POST ourselves so
// cancel / hold can attach an optional reason (the shared doAction sends no body).
const { actionDialog, actionItem, actionType, actioning, openAction } = useStateAction('/production-orders/', loadOrders, notify, t, axios)
const actionReason = ref('')

function openConfirm(row: any, type: string) {
  actionReason.value = ''
  openAction(row, type)
}

const actionNeedsReason = computed(() => actionType.value === 'cancel' || actionType.value === 'hold')

async function runConfirm() {
  if (!actionItem.value)
    return
  actioning.value = true
  try {
    const body: any = {}
    if (actionNeedsReason.value && actionReason.value.trim())
      body.reason = actionReason.value.trim()
    await axios.post(`/production-orders/${actionItem.value.id}/${actionType.value}/`, body)
    notify(t('Updated'))
    actionDialog.value = false
    await loadOrders()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
  finally {
    actioning.value = false
  }
}

function canPlan(item: any) { return item.status === 'DRAFT' }
function canStart(item: any) { return item.status === 'PLANNED' }
function canComplete(item: any) { return item.status === 'IN_PROGRESS' }
function canHold(item: any) { return item.status === 'IN_PROGRESS' }
function canResume(item: any) { return item.status === 'ON_HOLD' }
function canCancel(item: any) { return !['COMPLETED', 'CANCELED'].includes(item.status) }

// ============================================================
// Complete production (dedicated modal — captures actual yield)
// ============================================================
const completeDialog = ref(false)
const completing = ref(false)
const completeItem = ref<any>(null)
const completeForm = ref({
  actual_output_qty: '' as string | number,
  quality_status: 'PASSED',
  notes: '',
})

function openComplete(row: any) {
  completeItem.value = row
  completeForm.value = {
    actual_output_qty: row.expected_output_qty ?? '',
    quality_status: 'PASSED',
    notes: '',
  }
  completeDialog.value = true
}

function closeComplete() {
  if (completing.value)
    return
  completeDialog.value = false
}

const completeVariance = computed(() => {
  const exp = Number(completeItem.value?.expected_output_qty ?? 0)
  const act = Number(completeForm.value.actual_output_qty ?? 0)
  if (!exp || !act)
    return null
  const diff = act - exp
  const pct = exp ? (diff / exp) * 100 : 0

  return { diff, pct }
})

async function submitComplete() {
  const qty = Number(completeForm.value.actual_output_qty)
  if (!qty || qty <= 0) {
    notify(t('Actual output must be greater than zero'), 'error')

    return
  }
  completing.value = true
  try {
    const payload: any = {
      actual_output_qty: qty,
      quality_status: completeForm.value.quality_status,
    }
    if (completeForm.value.notes)
      payload.notes = completeForm.value.notes
    await axios.post(`/production-orders/${completeItem.value.id}/complete/`, payload)
    notify(t('Production completed'))
    completeDialog.value = false
    await loadOrders()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
  finally {
    completing.value = false
  }
}

// ============================================================
// Columns
// ============================================================
const columns: DataTableColumn<any>[] = [
  { key: 'order_number', label: t('Order #'), sortable: false },
  { key: 'recipe_name', label: t('Recipe'), sortable: false },
  { key: 'status', label: t('Status'), sortable: false, width: 130 },
  { key: 'priority', label: t('Priority'), sortable: false, width: 110 },
  { key: 'output', label: t('Output'), sortable: false, align: 'right', width: 140 },
  { key: 'planned_start', label: t('Planned Start'), sortable: false, width: 140 },
]

const tablePagination = computed(() => ({
  page: page.value,
  perPage: itemsPerPage.value,
  total: total.value,
  onPage: (n: number) => { page.value = n },
  onPerPage: (n: number) => { itemsPerPage.value = n; page.value = 1 },
}))

// ============================================================
// Helpers
// ============================================================
function recipeName(row: any): string {
  return row.recipe_name ?? row.recipe?.name ?? '—'
}
function outputUnit(row: any): string {
  return typeof row.output_unit === 'string' ? row.output_unit : row.output_unit?.short_name ?? ''
}
function locationName(loc: any): string {
  return typeof loc === 'string' ? loc : (loc?.name ?? '—')
}
function outputKind(out: any): string {
  if (out.is_waste)
    return t('Waste')
  if (out.is_byproduct)
    return t('By-product')

  return t('Primary')
}

// ============================================================
// Expand row detail cache (list endpoint returns serialize_brief —
// ingredients / outputs / locations live only on the detail record).
// ============================================================
const detailCache = ref<Record<string | number, any>>({})
const detailLoading = ref<Record<string | number, boolean>>({})

async function ensureDetail(row: any) {
  if (!row?.id)
    return
  if (detailCache.value[row.id] || detailLoading.value[row.id])
    return
  detailLoading.value[row.id] = true
  try {
    const res = await axios.get(`/production-orders/${row.id}/`)
    const d = res.data?.data ?? res.data
    detailCache.value[row.id] = d?.order ?? d
  }
  catch { /* expanded row falls back to brief data */ }
  finally {
    detailLoading.value[row.id] = false
  }
}

// ============================================================
// ESC handler
// ============================================================
function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape')
    return
  if (actionDialog.value) { actionDialog.value = false; e.preventDefault(); return }
  if (completeDialog.value) { closeComplete(); e.preventDefault(); return }
  if (createDialog.value) { closeCreate(); e.preventDefault() }
}

onMounted(() => { window.addEventListener('keydown', onKeydown) })
onBeforeUnmount(() => { window.removeEventListener('keydown', onKeydown) })
</script>

<template>
  <WorkspacePage class="page">
    <PageHeader
      :title="t('Production Orders')"
      :subtitle="t('production_orders_subtitle')"
    >
      <template #actions>
        <Button
          variant="primary"
          icon="plus"
          @click="openCreate"
        >
          {{ t('New Order') }}
        </Button>
      </template>
    </PageHeader>

    <Card>
      <!-- Toolbar -->
      <WorkspaceToolbar class="toolbar toolbar--wrap">
        <div class="tb-filter tb-filter--wide">
          <Select
            v-model="recipeFilter"
            icon="filter"
            :placeholder="t('All Recipes')"
            :options="recipeFilterOptions"
          />
        </div>
        <div class="tb-filter">
          <Select
            v-model="locationFilter"
            icon="filter"
            :placeholder="t('All Locations')"
            :options="locationFilterOptions"
          />
        </div>
        <div class="tb-filter">
          <Select
            v-model="statusFilter"
            icon="filter"
            :placeholder="t('All Statuses')"
            :options="statusFilterOptions"
          />
        </div>
        <div class="tb-filter">
          <Select
            v-model="priorityFilter"
            icon="filter"
            :placeholder="t('All Priorities')"
            :options="priorityFilterOptions"
          />
        </div>
        <Button
          v-if="hasActiveFilters"
          variant="ghost"
          icon="close"
          class="tb-clear"
          @click="clearFilters"
        >
          {{ t('Clear') }}
        </Button>
      </WorkspaceToolbar>

      <div class="card__divider" />

      <DataTable
        :columns="columns"
        :rows="orders"
        row-key="id"
        :loading="loading"
        :pagination="tablePagination"
        expandable
        :empty-title="t('production_orders_empty_title')"
        :empty-sub="t('production_orders_empty_hint')"
        empty-icon="package"
      >
        <template #cell.order_number="{ row }">
          <span class="cell-strong">{{ row.order_number }}</span>
        </template>

        <template #cell.recipe_name="{ row }">
          {{ recipeName(row) }}
        </template>

        <template #cell.status="{ row }">
          <Badge :tone="STATUS_TONE[row.status] ?? 'neutral'">
            {{ t(`production_status_${row.status}`) }}
          </Badge>
        </template>

        <template #cell.priority="{ row }">
          <Badge :tone="PRIORITY_TONE[row.priority] ?? 'neutral'">
            {{ t(`priority_${row.priority}`) }}
          </Badge>
        </template>

        <template #cell.output="{ row }">
          <span class="mono">{{ row.expected_output_qty ?? '—' }}</span>
          <span
            v-if="outputUnit(row)"
            class="cell-muted"
          > {{ outputUnit(row) }}</span>
        </template>

        <template #cell.planned_start="{ row }">
          {{ formatDateShort(row.planned_start ?? row.planned_start_date) }}
        </template>

        <template #row-actions="{ row }">
          <IconAction
            v-if="canPlan(row)"
            icon="calendar"
            tone="primary"
            :title="t('Plan')"
            @click="openConfirm(row, 'plan')"
          />
          <IconAction
            v-if="canStart(row)"
            icon="play"
            tone="success"
            :title="t('Start')"
            @click="openConfirm(row, 'start')"
          />
          <IconAction
            v-if="canComplete(row)"
            icon="check"
            tone="primary"
            :title="t('Complete')"
            @click="openComplete(row)"
          />
          <IconAction
            v-if="canHold(row)"
            icon="pause"
            tone="warning"
            :title="t('Hold')"
            @click="openConfirm(row, 'hold')"
          />
          <IconAction
            v-if="canResume(row)"
            icon="play"
            tone="success"
            :title="t('Resume')"
            @click="openConfirm(row, 'resume')"
          />
          <IconAction
            v-if="canCancel(row)"
            icon="close"
            tone="danger"
            :title="t('Cancel')"
            @click="openConfirm(row, 'cancel')"
          />
        </template>

        <!-- Inline expand: full recipe metadata + Bill of Materials + Outputs.
             Detail is fetched lazily on first expand of each row. -->
        <template #expanded="{ row }">
          {{ (ensureDetail(row), '') }}
          <div class="prod-expand">
            <div class="prod-expand__meta">
              <span>
                <span class="cell-muted">{{ t('Recipe') }}: </span>
                <strong>{{ recipeName(detailCache[row.id] ?? row) }}</strong>
              </span>
              <span>
                <span class="cell-muted">{{ t('Multiplier') }}: </span>
                <strong>×{{ (detailCache[row.id] ?? row).batch_multiplier ?? 1 }}</strong>
              </span>
              <span v-if="detailCache[row.id]?.source_location">
                <span class="cell-muted">{{ t('Source') }}: </span>
                <strong>{{ locationName(detailCache[row.id].source_location) }}</strong>
              </span>
              <span v-if="detailCache[row.id]?.output_location">
                <span class="cell-muted">{{ t('Output') }}: </span>
                <strong>{{ locationName(detailCache[row.id].output_location) }}</strong>
              </span>
              <span>
                <span class="cell-muted">{{ t('Expected Output') }}: </span>
                <strong class="mono">{{ (detailCache[row.id] ?? row).expected_output_qty ?? '—' }} {{ outputUnit(detailCache[row.id] ?? row) }}</strong>
              </span>
              <span v-if="(detailCache[row.id] ?? row).actual_output_qty">
                <span class="cell-muted">{{ t('Actual Output') }}: </span>
                <strong class="mono">{{ (detailCache[row.id] ?? row).actual_output_qty }} {{ outputUnit(detailCache[row.id] ?? row) }}</strong>
              </span>
            </div>

            <!-- Bill of Materials -->
            <div class="prod-block">
              <div class="prod-block__title">
                <DesignIcon
                  name="package"
                  :size="15"
                />
                {{ t('Bill of Materials') }}
              </div>
              <div class="prod-lines-wrap">
                <table class="prod-lines">
                  <thead>
                    <tr>
                      <th>{{ t('Item') }}</th>
                      <th class="num">
                        {{ t('Planned Qty') }}
                      </th>
                      <th class="num">
                        {{ t('Actual Qty') }}
                      </th>
                      <th>{{ t('Status') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="(ing, idx) in ((detailCache[row.id]?.ingredients ?? []) as any[])"
                      :key="idx"
                    >
                      <td>{{ ing.stock_item_name ?? '—' }}</td>
                      <td class="num mono">
                        {{ ing.planned_quantity ?? '—' }}<span class="cell-muted"> {{ ing.unit }}</span>
                      </td>
                      <td class="num mono">
                        {{ ing.actual_quantity ?? '—' }}<span
                          v-if="ing.actual_quantity"
                          class="cell-muted"
                        > {{ ing.unit }}</span>
                      </td>
                      <td>
                        <Badge :tone="INGREDIENT_TONE[ing.status] ?? 'neutral'">
                          {{ t(`prod_ing_status_${ing.status}`) }}
                        </Badge>
                      </td>
                    </tr>
                    <tr v-if="detailLoading[row.id] && !detailCache[row.id]">
                      <td
                        colspan="4"
                        class="prod-lines__empty"
                      >
                        {{ t('Loading...') }}
                      </td>
                    </tr>
                    <tr v-else-if="!detailCache[row.id]?.ingredients?.length">
                      <td
                        colspan="4"
                        class="prod-lines__empty"
                      >
                        {{ t('production_no_ingredients') }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Outputs (only once produced) -->
            <div
              v-if="detailCache[row.id]?.outputs?.length"
              class="prod-block"
            >
              <div class="prod-block__title">
                <DesignIcon
                  name="box"
                  :size="15"
                />
                {{ t('Outputs') }}
              </div>
              <div class="prod-lines-wrap">
                <table class="prod-lines">
                  <thead>
                    <tr>
                      <th>{{ t('Item') }}</th>
                      <th>{{ t('Type') }}</th>
                      <th class="num">
                        {{ t('Qty') }}
                      </th>
                      <th>{{ t('Quality') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="(out, idx) in ((detailCache[row.id]?.outputs ?? []) as any[])"
                      :key="idx"
                    >
                      <td>{{ out.stock_item_name ?? '—' }}</td>
                      <td>{{ outputKind(out) }}</td>
                      <td class="num mono">
                        {{ out.quantity ?? '—' }}<span class="cell-muted"> {{ out.unit }}</span>
                      </td>
                      <td>
                        <Badge :tone="QUALITY_TONE[out.quality_status] ?? 'neutral'">
                          {{ t(QUALITY_LABEL[out.quality_status] ?? out.quality_status) }}
                        </Badge>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div
              v-if="detailCache[row.id]?.notes"
              class="prod-notes"
            >
              <span class="cell-muted">{{ t('Notes') }}: </span>{{ detailCache[row.id].notes }}
            </div>
          </div>
        </template>
      </DataTable>
    </Card>

    <!-- Create Modal -->
    <Modal
      :open="createDialog"
      :title="t('New Production Order')"
      :subtitle="t('production_orders_subtitle')"
      @close="closeCreate"
    >
      <form @submit.prevent="createOrder">
        <div class="form-grid">
          <Field
            :label="t('Recipe')"
            class="span-2"
          >
            <Select
              v-model="form.recipe_id"
              :options="recipeFormOptions"
              :placeholder="t('production_orders_pick_recipe')"
            />
          </Field>

          <Field :label="t('Batch Multiplier')">
            <Input
              v-model.number="form.batch_multiplier"
              type="number"
            />
          </Field>

          <Field :label="t('Priority')">
            <Select
              v-model="form.priority"
              :options="priorityFormOptions"
            />
          </Field>

          <Field :label="t('Source Location *')">
            <Select
              v-model="form.source_location_id"
              :options="locationFormOptions"
              :placeholder="t('production_orders_pick_source')"
            />
          </Field>

          <Field :label="t('Output Location *')">
            <Select
              v-model="form.output_location_id"
              :options="locationFormOptions"
              :placeholder="t('production_orders_pick_output')"
            />
          </Field>

          <Field :label="t('Planned Start')">
            <Input
              v-model="form.planned_start_date"
              type="date"
            />
          </Field>

          <Field
            :label="t('Notes')"
            class="span-2"
          >
            <Input
              v-model="form.notes"
              :placeholder="t('production_orders_notes_placeholder')"
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
          @click="createOrder"
        >
          {{ t('Create') }}
        </Button>
      </template>
    </Modal>

    <!-- Complete Production Modal -->
    <Modal
      :open="completeDialog"
      :title="t('Complete Production')"
      :subtitle="completeItem?.order_number ?? ''"
      :width="480"
      :close-on-backdrop="false"
      @close="closeComplete"
    >
      <p class="prod-complete__hint">
        {{ t('production_complete_hint') }}
      </p>
      <form @submit.prevent="submitComplete">
        <div class="form-grid">
          <Field :label="t('Expected Output')">
            <Input
              :model-value="`${completeItem?.expected_output_qty ?? ''} ${outputUnit(completeItem ?? {})}`"
              disabled
            />
          </Field>

          <Field :label="t('Actual Output') + ' *'">
            <Input
              v-model.number="completeForm.actual_output_qty"
              type="number"
              icon="package"
            />
          </Field>

          <Field :label="t('Quality Status')">
            <Select
              v-model="completeForm.quality_status"
              :options="qualityFormOptions"
            />
          </Field>

          <Field :label="t('Notes')">
            <Input
              v-model="completeForm.notes"
              :placeholder="t('production_orders_notes_placeholder')"
            />
          </Field>

          <div
            v-if="completeVariance"
            class="prod-variance span-2"
            :class="completeVariance.diff < 0 ? 't-warn' : (completeVariance.diff > 0 ? 't-up' : 't-flat')"
          >
            <DesignIcon
              :name="completeVariance.diff < 0 ? 'arrowdown' : (completeVariance.diff > 0 ? 'arrowup' : 'check')"
              :size="16"
            />
            <span>
              {{ t('Variance') }}:
              <strong class="mono">{{ completeVariance.diff > 0 ? '+' : '' }}{{ completeVariance.diff.toFixed(2) }} {{ outputUnit(completeItem ?? {}) }}</strong>
              <span class="cell-muted">({{ completeVariance.pct > 0 ? '+' : '' }}{{ completeVariance.pct.toFixed(1) }}%)</span>
            </span>
          </div>
        </div>
      </form>

      <template #footer>
        <Button
          variant="primary"
          icon="check"
          :loading="completing"
          :disabled="completing"
          @click="submitComplete"
        >
          {{ t('Complete') }}
        </Button>
      </template>
    </Modal>

    <!-- Action Confirm Modal (plan / start / cancel / hold / resume) -->
    <Modal
      :open="actionDialog"
      :title="actionType ? t(actionTitleKey[actionType] ?? actionType) : ''"
      :subtitle="actionItem?.order_number ?? ''"
      :width="440"
      @close="actionDialog = false"
    >
      <div class="row prod-confirm">
        <div
          class="kpi__icon"
          :class="actionType === 'cancel' ? 't-error' : 't-warning'"
          style="width:44px;height:44px;flex:0 0 44px;"
        >
          <DesignIcon
            :name="actionType === 'cancel' ? 'alert' : 'info'"
            :size="22"
          />
        </div>
        <div class="prod-confirm__body">
          <p style="margin:0;">
            {{ t('Confirm action for order') }}
            <strong>{{ actionItem?.order_number }}</strong>
          </p>
          <Field
            v-if="actionNeedsReason"
            :label="t('Reason for cancellation')"
            class="prod-confirm__reason"
          >
            <Input
              v-model="actionReason"
              :placeholder="t('Optional reason')"
            />
          </Field>
        </div>
      </div>

      <template #footer>
        <Button
          :variant="actionType === 'cancel' ? 'danger' : 'primary'"
          icon="check"
          :loading="actioning"
          :disabled="actioning"
          @click="runConfirm"
        >
          {{ t('Confirm') }}
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

<route lang="yaml">
name: stock-production-orders
meta:
  action: manage
  subject: all
</route>

<style scoped>
/* ============================================================
   Toolbar — wraps onto multiple rows, filters collapse on mobile
   ============================================================ */
.toolbar--wrap {
  flex-wrap: wrap;
}

.tb-filter {
  width: 180px;
  min-width: 0;
}

.tb-filter--wide {
  width: 220px;
}

.tb-clear {
  margin-inline-start: auto;
}

/* ============================================================
   Create / Complete form grid
   ============================================================ */
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.form-grid .span-2 {
  grid-column: span 2;
}

/* ============================================================
   Expanded detail — metadata + BOM / outputs tables
   ============================================================ */
.prod-expand {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.prod-expand__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 18px;
  font-size: 13px;
  line-height: 1.5;
}

.prod-block__title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgb(var(--v-theme-text-secondary));
  margin-block-end: 6px;
}

.prod-lines-wrap {
  overflow-x: auto;
  width: 100%;
}

.prod-lines {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  min-width: 460px;
}

.prod-lines th,
.prod-lines td {
  padding: 7px 10px;
  border-bottom: 1px solid rgb(var(--v-theme-neutral-border));
  text-align: left;
}

.prod-lines th {
  font-size: 12px;
  font-weight: 600;
  color: rgb(var(--v-theme-text-secondary));
}

.prod-lines th.num,
.prod-lines td.num {
  text-align: right;
}

.prod-lines__empty {
  text-align: center !important;
  padding: 16px;
  color: rgb(var(--v-theme-text-secondary));
}

.prod-notes {
  font-size: 13px;
  color: rgb(var(--v-theme-text-secondary));
}

/* ============================================================
   Confirm modal
   ============================================================ */
.prod-confirm {
  gap: 14px;
  align-items: flex-start;
  display: flex;
}

.prod-confirm__body {
  flex: 1 1 0;
  min-width: 0;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.prod-confirm__reason {
  margin-block-start: 12px;
}

/* ============================================================
   Complete modal — hint + live variance chip
   ============================================================ */
.prod-complete__hint {
  margin: 0 0 14px;
  font-size: 13px;
  color: rgb(var(--v-theme-text-secondary));
}

.prod-variance {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 13px;
  background: rgba(var(--v-theme-on-surface), 0.03);
}

.prod-variance.t-up {
  color: rgb(var(--v-theme-success));
  background: rgba(var(--v-theme-success), 0.08);
}

.prod-variance.t-warn {
  color: rgb(var(--v-theme-warning));
  background: rgba(var(--v-theme-warning), 0.08);
}

.prod-variance.t-flat {
  color: rgb(var(--v-theme-text-secondary));
}

/* ============================================================
   Mobile collapse
   ============================================================ */
@media (max-width: 900px) {
  .tb-filter,
  .tb-filter--wide {
    width: 100%;
    flex: 1 1 100%;
  }

  .tb-clear {
    margin-inline-start: 0;
  }

  .form-grid {
    grid-template-columns: 1fr;
  }

  .form-grid .span-2 {
    grid-column: span 1;
  }

  .prod-expand__meta {
    gap: 6px 16px;
  }
}
</style>
