<script setup lang="ts">
import WorkspacePage from '@/components/design/workspace/WorkspacePage.vue'
import WorkspaceToolbar from '@/components/design/workspace/WorkspaceToolbar.vue'
import { discountsApi as axios } from '@/plugins/axios'
import Badge from '@/components/design/Badge.vue'
import Button from '@/components/design/Button.vue'
import Card from '@/components/design/Card.vue'
import DataTable, { type DataTableColumn, type DataTablePagination } from '@/components/design/DataTable.vue'
import Field from '@/components/design/Field.vue'
import IconAction from '@/components/design/IconAction.vue'
import Input from '@/components/design/Input.vue'
import Modal from '@/components/design/Modal.vue'
import MoneyInput from '@/components/design/MoneyInput.vue'
import PageHeader from '@/components/design/PageHeader.vue'
import Select from '@/components/design/Select.vue'
import Skeleton from '@/components/design/Skeleton.vue'
import Switch from '@/components/design/Switch.vue'

const { t } = useI18n({ useScope: 'global' })
const { snackbar, snackbarMsg, snackbarColor, notify } = useNotify()
const { formatCurrency, formatDateShort } = useFormatters()

// ---- state ----
const discounts = ref<any[]>([])
const total = ref(0)
const loading = ref(false)
const page = ref(1)
const itemsPerPage = ref(10)
const search = ref('')
const isActiveFilter = ref<string>('')
const typeFilter = ref<string>('')

const types = ref<any[]>([])

const dialog = ref(false)
const editing = ref<any>(null)
const saving = ref(false)

const deleteDialog = ref(false)
const deletingDiscount = ref<any>(null)

// ---- stats drawer ----
const statsDialog = ref(false)
const statsLoading = ref(false)
const statsData = ref<any>(null)
const statsDiscount = ref<any>(null)

const form = ref({
  name: '',
  code: '',
  discount_type_id: null as number | null,
  value: 0,
  min_order_amount: 0,
  max_discount_amount: null as number | null,
  usage_limit: null as number | null,
  usage_per_user: null as number | null,
  is_stackable: false,
  is_staff_only: false,
  is_active: true,
  start_date: '',
  end_date: '',
  description: '',
  secret_word: '',
})

// ---- table columns ----
const columns = computed<DataTableColumn<any>[]>(() => [
  { key: 'name', label: t('Name'), sortable: false, align: 'left' },
  { key: 'code', label: t('Code'), sortable: false, align: 'left' },
  { key: 'discount_type', label: t('Type'), sortable: false, align: 'left' },
  { key: 'value', label: t('Value'), sortable: false, align: 'right' },
  { key: 'usage', label: t('discount_col_usage'), sortable: false, align: 'left', width: 150 },
  { key: 'is_active', label: t('Status'), sortable: false, align: 'left' },
])

// ---- helpers ----
function methodTone(method?: string): 'success' | 'info' | 'neutral' {
  if (method === 'PERCENTAGE')
    return 'success'
  if (method === 'FIXED_AMOUNT')
    return 'info'
  return 'neutral'
}

function formatValue(row: any): string {
  const method = row.discount_type?.discount_method
  const value = row.value ?? 0
  if (method === 'PERCENTAGE')
    return `${value}%`
  if (method === 'FIXED_AMOUNT')
    return formatCurrency(value)
  return formatCurrency(value)
}

// Lifecycle status: goes beyond the raw is_active flag. A discount can be
// "active" yet already expired, not-yet-started, or fully redeemed — an
// operator needs to see that at a glance so a dead promo isn't mistaken
// for a live one. Mirrors the guards in DiscountService.validate_code.
type Lifecycle = 'ACTIVE' | 'INACTIVE' | 'SCHEDULED' | 'EXPIRED' | 'DEPLETED'
function lifecycleOf(row: any): Lifecycle {
  if (!row.is_active)
    return 'INACTIVE'
  const now = Date.now()
  if (row.end_date && new Date(row.end_date).getTime() < now)
    return 'EXPIRED'
  if (row.start_date && new Date(row.start_date).getTime() > now)
    return 'SCHEDULED'
  if (row.usage_limit && (row.usage_count ?? 0) >= row.usage_limit)
    return 'DEPLETED'
  return 'ACTIVE'
}

function lifecycleTone(state: Lifecycle): 'success' | 'neutral' | 'info' | 'error' | 'warning' {
  switch (state) {
    case 'ACTIVE': return 'success'
    case 'SCHEDULED': return 'info'
    case 'EXPIRED': return 'error'
    case 'DEPLETED': return 'warning'
    default: return 'neutral'
  }
}

function lifecycleLabel(state: Lifecycle): string {
  if (state === 'ACTIVE')
    return t('discount_status_ACTIVE')
  if (state === 'INACTIVE')
    return t('discount_status_INACTIVE')
  return t(`discount_lifecycle_${state}`)
}

function scheduleHint(row: any): string {
  const state = lifecycleOf(row)
  if (state === 'SCHEDULED' && row.start_date)
    return t('discount_starts_hint', { date: formatDateShort(row.start_date) })
  if (state === 'EXPIRED' && row.end_date)
    return t('discount_expired_hint', { date: formatDateShort(row.end_date) })
  if (state === 'ACTIVE' && row.end_date)
    return t('discount_ends_hint', { date: formatDateShort(row.end_date) })
  return ''
}

function usagePct(row: any): number {
  if (!row.usage_limit)
    return 0
  return Math.min(100, Math.round(((row.usage_count ?? 0) / row.usage_limit) * 100))
}

function usageFillTone(row: any): string {
  const pct = usagePct(row)
  if (pct >= 100)
    return 'is-full'
  if (pct >= 80)
    return 'is-high'
  return 'is-ok'
}

// ---- load ----
async function loadDiscounts() {
  loading.value = true
  try {
    const params: any = { page: page.value, per_page: itemsPerPage.value }
    if (search.value)
      params.search = search.value
    if (isActiveFilter.value !== '')
      params.is_active = isActiveFilter.value === 'true'
    if (typeFilter.value !== '')
      params.discount_type_id = Number(typeFilter.value)
    const res = await axios.get('/discounts/', { params })
    const d = res.data?.data ?? res.data

    discounts.value = d?.discounts ?? d?.items ?? []
    total.value = d?.pagination?.total_items ?? d?.pagination?.total ?? discounts.value.length
  }
  catch {
    notify(t('Failed to load discounts'), 'error')
  }
  finally {
    loading.value = false
  }
}

async function loadTypes() {
  try {
    const res = await axios.get('/types/', { params: { per_page: 100 } })
    const d = res.data?.data ?? res.data

    types.value = d?.discount_types ?? d?.types ?? d?.items ?? []
  }
  catch { /* ignore */ }
}

onMounted(() => { loadDiscounts(); loadTypes() })
watch([page, itemsPerPage], loadDiscounts)

const debouncedSearch = useDebounceFn(() => { page.value = 1; loadDiscounts() }, 400)

watch(search, debouncedSearch)
watch(isActiveFilter, () => { page.value = 1; loadDiscounts() })
watch(typeFilter, () => { page.value = 1; loadDiscounts() })

// ---- options ----
const statusOptions = computed(() => [
  { value: 'true', label: t('discount_status_ACTIVE') },
  { value: 'false', label: t('discount_status_INACTIVE') },
])

const typeOptions = computed(() =>
  types.value.map((tp: any) => ({ value: String(tp.id), label: tp.name })),
)
const isPercentageDiscount = computed(() =>
  types.value.find((tp: any) => Number(tp.id) === form.value.discount_type_id)?.discount_method === 'PERCENTAGE',
)

// ---- CRUD ----
function openCreate() {
  editing.value = null
  form.value = {
    name: '',
    code: '',
    discount_type_id: types.value[0]?.id ?? null,
    value: 0,
    min_order_amount: 0,
    max_discount_amount: null,
    usage_limit: null,
    usage_per_user: null,
    is_stackable: false,
    is_staff_only: false,
    is_active: true,
    start_date: '',
    end_date: '',
    description: '',
    secret_word: '',
  }
  dialog.value = true
}

function openEdit(d: any) {
  editing.value = d
  form.value = {
    name: d.name ?? '',
    code: d.code ?? '',
    discount_type_id: d.discount_type?.id ?? d.discount_type_id ?? null,
    value: Number(d.value ?? 0),
    min_order_amount: Number(d.min_order_amount ?? 0),
    max_discount_amount: d.max_discount_amount != null ? Number(d.max_discount_amount) : null,
    usage_limit: d.usage_limit ?? null,
    usage_per_user: d.usage_per_user ?? null,
    is_stackable: d.is_stackable ?? false,
    is_staff_only: d.is_staff_only ?? false,
    is_active: d.is_active ?? true,
    start_date: d.start_date ?? '',
    end_date: d.end_date ?? '',
    description: d.description ?? '',
    // BE never returns secret_word (only has_secret_word: bool). Leave blank;
    // payload omits the field on PUT unless user types a new value.
    secret_word: '',
  }
  dialog.value = true
}

async function save() {
  saving.value = true
  try {
    // Build payload — when editing, omit secret_word if blank so we don't
    // overwrite the stored secret (BE never returns it, so it can't be repopulated).
    const payload: any = { ...form.value }
    payload.value = Number(payload.value)
    // Optional numeric caps: a blank field means "no cap / unlimited", which
    // the backend models as NULL. Send null rather than 0 so an empty usage
    // limit isn't stored as "0 uses allowed".
    for (const k of ['usage_limit', 'usage_per_user', 'max_discount_amount'] as const) {
      const v = payload[k]
      payload[k] = (v === '' || v === null || v === undefined) ? null : Number(v)
    }
    if (editing.value && !payload.secret_word)
      delete payload.secret_word
    if (editing.value)
      await axios.put(`/discounts/${editing.value.id}/`, payload)
    else
      await axios.post('/discounts/', payload)
    notify(t(editing.value ? 'Discount updated' : 'Discount created'))
    dialog.value = false
    await loadDiscounts()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
  finally {
    saving.value = false
  }
}

async function toggleActive(d: any) {
  try {
    await axios.post(`/discounts/${d.id}/toggle/`)
    notify(t('Status updated'))
    await loadDiscounts()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
}

function confirmDelete(d: any) {
  deletingDiscount.value = d
  deleteDialog.value = true
}

async function remove() {
  if (!deletingDiscount.value)
    return
  try {
    await axios.delete(`/discounts/${deletingDiscount.value.id}/`)
    notify(t('Discount deleted'))
    deleteDialog.value = false
    await loadDiscounts()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
}

// ---- stats ----
async function openStats(d: any) {
  statsDiscount.value = d
  statsData.value = null
  statsDialog.value = true
  statsLoading.value = true
  try {
    const res = await axios.get(`/discounts/${d.id}/stats/`)
    const payload = res.data?.data ?? res.data
    statsData.value = payload?.stats ?? payload
  }
  catch {
    notify(t('discount_stats_load_error'), 'error')
    statsDialog.value = false
  }
  finally {
    statsLoading.value = false
  }
}

// ---- pagination control object for DataTable ----
const pagination = computed<DataTablePagination>(() => ({
  page: page.value,
  perPage: itemsPerPage.value,
  total: total.value,
  onPage: (p: number) => { page.value = p },
  onPerPage: (n: number) => { itemsPerPage.value = n; page.value = 1 },
}))

const hasActiveFilters = computed(() =>
  !!search.value || isActiveFilter.value !== '' || typeFilter.value !== '',
)

function clearAllFilters() {
  search.value = ''
  isActiveFilter.value = ''
  typeFilter.value = ''
}
</script>

<template>
  <WorkspacePage class="page discounts-page">
    <PageHeader
      :title="t('Discounts')"
      :subtitle="t('Promo codes subtitle')"
    >
      <template #actions>
        <Button
          variant="primary"
          icon="plus"
          @click="openCreate"
        >
          {{ t('New Discount') }}
        </Button>
      </template>
    </PageHeader>

    <Card>
      <WorkspaceToolbar class="toolbar">
        <div class="toolbar__search">
          <Input
            v-model="search"
            icon="search"
            :placeholder="t('Search discounts...')"
          />
        </div>
        <div class="toolbar__filter">
          <Select
            v-model="typeFilter"
            icon="tag"
            :placeholder="t('All Types')"
            :options="typeOptions"
          />
        </div>
        <div class="toolbar__filter">
          <Select
            v-model="isActiveFilter"
            icon="filter"
            :placeholder="t('All Discount Statuses')"
            :options="statusOptions"
          />
        </div>
        <div class="toolbar__spacer" />
        <div
          v-if="hasActiveFilters"
          class="toolbar__clear"
        >
          <Button
            variant="ghost"
            @click="clearAllFilters"
          >
            {{ t('Clear filters') }}
          </Button>
        </div>
        <IconAction
          icon="refresh"
          :title="t('Refresh')"
          :disabled="loading"
          @click="loadDiscounts"
        />
      </WorkspaceToolbar>

      <DataTable
        :columns="columns"
        :rows="discounts"
        :loading="loading"
        :pagination="pagination"
        :empty-title="t('No discounts found')"
        :empty-sub="t('Create a new discount to get started')"
        empty-icon="tag"
      >
        <template #cell.discount_type="{ row }">
          <div class="cell-type">
            <span>{{ row.discount_type?.name ?? '—' }}</span>
            <Badge
              v-if="row.discount_type?.discount_method"
              :tone="methodTone(row.discount_type.discount_method)"
            >
              {{ t(`discount_method_${row.discount_type.discount_method}`) }}
            </Badge>
          </div>
        </template>

        <template #cell.value="{ row }">
          <span class="mono">{{ formatValue(row) }}</span>
        </template>

        <template #cell.usage="{ row }">
          <div class="usage-cell">
            <div class="usage-cell__top">
              <span class="mono">{{ row.usage_count ?? 0 }}</span>
              <span class="usage-cell__limit">
                {{ row.usage_limit ? `/ ${row.usage_limit}` : `· ${t('discount_usage_unlimited')}` }}
              </span>
            </div>
            <div
              v-if="row.usage_limit"
              class="usage-bar"
            >
              <div
                class="usage-bar__fill"
                :class="usageFillTone(row)"
                :style="{ width: `${usagePct(row)}%` }"
              />
            </div>
          </div>
        </template>

        <template #cell.is_active="{ row }">
          <div class="status-cell">
            <Badge
              :tone="lifecycleTone(lifecycleOf(row))"
              dot
            >
              {{ lifecycleLabel(lifecycleOf(row)) }}
            </Badge>
            <span
              v-if="scheduleHint(row)"
              class="status-cell__hint"
            >
              {{ scheduleHint(row) }}
            </span>
          </div>
        </template>

        <template #row-actions="{ row }">
          <IconAction
            icon="chart"
            :title="t('discount_view_stats')"
            @click="openStats(row)"
          />
          <IconAction
            :icon="row.is_active ? 'pause' : 'play'"
            :tone="row.is_active ? 'warning' : 'success'"
            :title="row.is_active ? t('Deactivate') : t('Activate')"
            @click="toggleActive(row)"
          />
          <IconAction
            icon="edit"
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
      </DataTable>
    </Card>

    <!-- Create / Edit Modal -->
    <Modal
      :open="dialog"
      :title="editing ? t('Edit Discount') : t('New Discount')"
      :width="640"
      :close-on-backdrop="false"
      @close="dialog = false"
    >
      <div class="form-grid">
        <Field :label="t('Name')">
          <Input
            v-model="form.name"
            :placeholder="t('Name')"
          />
        </Field>
        <Field :label="t('Code')">
          <Input
            v-model="form.code"
            :placeholder="t('Code')"
          />
        </Field>
        <Field :label="t('Type')">
          <Select
            :model-value="form.discount_type_id !== null ? String(form.discount_type_id) : ''"
            :options="typeOptions"
            :placeholder="t('Select discount type')"
            @update:model-value="(v: string) => form.discount_type_id = v ? Number(v) : null"
          />
        </Field>
        <Field :label="t('Value')">
          <MoneyInput
            v-if="!isPercentageDiscount"
            v-model="form.value"
            :placeholder="t('Value')"
          />
          <Input
            v-else
            :model-value="String(form.value)"
            type="number"
            min="0"
            step="0.01"
            :placeholder="t('Value')"
            @update:model-value="value => form.value = Number(value)"
          />
        </Field>
        <Field :label="t('Min Order Amount')">
          <MoneyInput
            v-model="form.min_order_amount"
            :placeholder="t('Min Order Amount')"
          />
        </Field>
        <Field
          :label="t('discount_max_amount')"
          :hint="t('discount_max_amount_hint')"
        >
          <MoneyInput
            v-model="form.max_discount_amount"
            :placeholder="t('discount_no_cap')"
          />
        </Field>
        <Field
          :label="t('discount_usage_limit')"
          :hint="t('discount_usage_limit_hint')"
        >
          <Input
            v-model="form.usage_limit"
            type="number"
            min="0"
            :placeholder="t('discount_usage_unlimited')"
          />
        </Field>
        <Field
          :label="t('discount_usage_per_user')"
          :hint="t('discount_usage_per_user_hint')"
        >
          <Input
            v-model="form.usage_per_user"
            type="number"
            min="0"
            :placeholder="t('discount_usage_unlimited')"
          />
        </Field>
        <Field :label="t('Starts At')">
          <Input
            v-model="form.start_date"
            type="datetime-local"
          />
        </Field>
        <Field :label="t('Ends At')">
          <Input
            v-model="form.end_date"
            type="datetime-local"
          />
        </Field>
        <Field
          :label="t('Description')"
          class="span-2"
        >
          <Input
            v-model="form.description"
            :placeholder="t('discount_description_ph')"
          />
        </Field>
        <Field
          :label="t('Secret Word (optional)')"
          class="span-2"
        >
          <Input
            v-model="form.secret_word"
            :placeholder="editing && editing.has_secret_word ? t('Leave blank to keep existing') : t('Secret Word (optional)')"
          />
        </Field>
        <Field
          :label="t('discount_stackable')"
          :hint="t('discount_stackable_hint')"
        >
          <div class="row-switch">
            <Switch v-model="form.is_stackable" />
            <span class="row-switch__label">
              {{ form.is_stackable ? t('discount_stackable_on') : t('discount_stackable_off') }}
            </span>
          </div>
        </Field>
        <Field
          :label="t('discount_staff_only')"
          :hint="t('discount_staff_only_hint')"
        >
          <div class="row-switch">
            <Switch v-model="form.is_staff_only" />
            <span class="row-switch__label">
              {{ form.is_staff_only ? t('discount_staff_only_on') : t('discount_staff_only_off') }}
            </span>
          </div>
        </Field>
        <Field
          :label="t('Active')"
          class="span-2"
        >
          <div class="row-switch">
            <Switch v-model="form.is_active" />
            <span class="row-switch__label">
              {{ form.is_active ? t('discount_status_ACTIVE') : t('discount_status_INACTIVE') }}
            </span>
          </div>
        </Field>
      </div>

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

    <!-- Stats Modal -->
    <Modal
      :open="statsDialog"
      :title="t('discount_stats_title')"
      :subtitle="statsDiscount?.name"
      :width="560"
      @close="statsDialog = false"
    >
      <div class="stats-grid">
        <div
          v-for="(tile, i) in [
            { key: 'total_uses', label: t('discount_stats_total_uses'), icon: 'refresh' },
            { key: 'order_count', label: t('discount_stats_orders'), icon: 'receipt' },
            { key: 'total_discount_given', label: t('discount_stats_given'), icon: 'coins', money: true },
          ]"
          :key="i"
          class="stat-tile"
        >
          <span class="stat-tile__label">{{ tile.label }}</span>
          <Skeleton
            v-if="statsLoading"
            :h="24"
            w="60%"
          />
          <span
            v-else
            class="stat-tile__value mono"
          >
            {{ tile.money
              ? formatCurrency(statsData?.[tile.key] ?? 0)
              : (statsData?.[tile.key] ?? 0) }}
          </span>
        </div>
      </div>

      <div class="stats-top">
        <h4 class="stats-top__title">
          {{ t('discount_stats_top_users') }}
        </h4>
        <div
          v-if="statsLoading"
          class="stats-top__list"
        >
          <div
            v-for="n in 3"
            :key="n"
            class="stats-top__row"
          >
            <Skeleton
              :h="14"
              w="40%"
            />
            <Skeleton
              :h="18"
              :w="48"
              :r="6"
            />
          </div>
        </div>
        <div
          v-else-if="statsData?.top_users?.length"
          class="stats-top__list"
        >
          <div
            v-for="u in (statsData.top_users as any[])"
            :key="u.user_id"
            class="stats-top__row"
          >
            <span class="stats-top__name">{{ (u.name || '').trim() || t('discount_stats_unknown_user') }}</span>
            <Badge tone="neutral">{{ t('discount_stats_uses_count', { count: u.use_count }) }}</Badge>
          </div>
        </div>
        <p
          v-else
          class="stats-empty"
        >
          {{ t('discount_stats_no_uses') }}
        </p>
      </div>
    </Modal>

    <!-- Delete confirm -->
    <Modal
      :open="deleteDialog"
      :title="t('Delete Discount')"
      :subtitle="t('This action cannot be undone')"
      :width="440"
      @close="deleteDialog = false"
    >
      <p class="delete-msg">
        {{ t('Delete this discount?') }}
        <strong v-if="deletingDiscount">{{ deletingDiscount.name }}</strong>
      </p>

      <template #footer>
        <Button
          variant="danger"
          icon="trash"
          @click="remove"
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
/* ── Toolbar ── */
.toolbar {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-4);
  flex-wrap: wrap;
}

.toolbar__search {
  flex: 1;
  min-width: 220px;
  max-width: 320px;
}

.toolbar__filter {
  width: 200px;
  min-width: 160px;
}

.toolbar__spacer {
  flex: 1;
}

/* ── Cells ── */
.cell-type {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

/* Usage cell — count vs limit + progress toward the cap */
.usage-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 110px;
}
.usage-cell__top {
  display: flex;
  align-items: baseline;
  gap: 5px;
  font-size: 13px;
}
.usage-cell__limit {
  color: var(--text-tertiary);
  font-size: 12px;
}
.usage-bar {
  height: 5px;
  border-radius: 99px;
  background: rgba(var(--v-theme-on-surface), 0.1);
  overflow: hidden;
}
.usage-bar__fill {
  height: 100%;
  border-radius: 99px;
}
.usage-bar__fill.is-ok {
  background: rgb(var(--v-theme-success-strong));
}
.usage-bar__fill.is-high {
  background: rgb(var(--v-theme-warning-strong));
}
.usage-bar__fill.is-full {
  background: rgb(var(--v-theme-error-strong));
}

/* Status cell — lifecycle badge + optional schedule hint */
.status-cell {
  display: flex;
  flex-direction: column;
  gap: 3px;
  align-items: flex-start;
}
.status-cell__hint {
  font-size: 11px;
  color: var(--text-tertiary);
  white-space: nowrap;
}

/* ── Form grid (modal) ── */
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--sp-3, 12px);
}
.form-grid .span-2 {
  grid-column: span 2;
}

/* ── Form switch row ── */
.row-switch {
  display: flex;
  align-items: center;
  gap: 10px;
}
.row-switch__label {
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 500;
}

/* ── Stats modal ── */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--sp-3, 12px);
}
.stat-tile {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: var(--sp-3, 12px);
  border: 1px solid var(--border);
  border-radius: var(--r-sm, 8px);
  background: var(--surface-2, rgba(var(--v-theme-on-surface), 0.02));
}
.stat-tile__label {
  font-size: 12px;
  color: var(--text-tertiary);
  font-weight: 500;
}
.stat-tile__value {
  font-size: 20px;
  font-weight: 700;
  color: var(--text);
}
.stats-top {
  margin-top: var(--sp-4, 16px);
}
.stats-top__title {
  margin: 0 0 var(--sp-2, 8px);
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}
.stats-top__list {
  display: flex;
  flex-direction: column;
}
.stats-top__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
}
.stats-top__row:last-child {
  border-bottom: none;
}
.stats-top__name {
  font-size: 13px;
  color: var(--text);
}
.stats-empty {
  margin: 0;
  padding: var(--sp-3, 12px) 0;
  font-size: 13px;
  color: var(--text-tertiary);
  text-align: center;
}

/* ── Delete message ── */
.delete-msg {
  margin: 0;
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.5;
}
.delete-msg strong {
  color: var(--text);
}

/* ── Responsive ── */
@media (max-width: 768px) {
  .toolbar__search,
  .toolbar__filter {
    flex: 1 1 100%;
    max-width: 100%;
    min-width: 0;
    width: 100%;
  }
  .toolbar__spacer {
    display: none;
  }
  .toolbar__clear {
    margin-left: 0;
  }
  .form-grid {
    grid-template-columns: 1fr;
  }
  .form-grid .span-2 {
    grid-column: span 1;
  }
  .stats-grid {
    grid-template-columns: 1fr;
  }
}
</style>

<route lang="yaml">
meta:
  action: manage
  subject: all
</route>
