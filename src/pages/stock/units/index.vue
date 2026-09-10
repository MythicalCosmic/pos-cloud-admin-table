<script setup lang="ts">
import { stockApi as axios } from '@/plugins/axios'
import Badge from '@/components/design/Badge.vue'
import Button from '@/components/design/Button.vue'
import DataTable, { type DataTableColumn } from '@/components/design/DataTable.vue'
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

const units = ref<any[]>([])
const total = ref(0)
const loading = ref(false)
const page = ref(1)
const itemsPerPage = ref(10)
const search = ref('')
const typeFilter = ref<string | undefined>(undefined)

const dialog = ref(false)
const dialogMode = ref<'create' | 'edit'>('create')
const saving = ref(false)
const deleteDialog = ref(false)
const deleting = ref(false)
const selectedItem = ref<any>(null)

const unitTypes = ['WEIGHT', 'VOLUME', 'COUNT', 'LENGTH', 'TIME']
const unitTypeItems = computed(() =>
  unitTypes.map(v => ({ value: v, label: t(`unit_type_${v}`) })),
)
const typeFilterOptions = computed(() => [
  { value: '', label: t('All Types') },
  ...unitTypeItems.value,
])

const filteredUnits = computed(() => {
  const q = (search.value ?? '').trim().toLowerCase()
  if (!q)
    return units.value
  return units.value.filter(
    (u: any) =>
      (u.name ?? '').toLowerCase().includes(q)
      || (u.short_name ?? '').toLowerCase().includes(q),
  )
})

const typeTone: Record<string, 'primary' | 'info' | 'success' | 'warning' | 'neutral'> = {
  WEIGHT: 'primary',
  VOLUME: 'info',
  COUNT: 'success',
  LENGTH: 'warning',
  TIME: 'neutral',
}

const form = ref({
  name: '',
  short_name: '',
  unit_type: 'COUNT',
  is_base_unit: false,
  base_unit_id: null as number | null,
  conversion_factor: 1,
  decimal_places: 2,
  is_active: true,
})

const { notify } = useNotify()

const columns = computed<DataTableColumn<any>[]>(() => [
  { key: 'name', label: t('Name') },
  { key: 'short_name', label: t('Short') },
  { key: 'unit_type', label: t('Type') },
  { key: 'is_base_unit', label: t('Base Unit') },
  { key: 'conversion_factor', label: t('Conversion'), align: 'right' },
  { key: 'decimal_places', label: t('Decimals'), align: 'right' },
  { key: 'is_active', label: t('Status') },
])

const dtPagination = computed(() => ({
  page: page.value,
  perPage: itemsPerPage.value,
  total: total.value,
  onPage: (p: number) => { page.value = p },
  onPerPage: (n: number) => { itemsPerPage.value = n; page.value = 1 },
}))

async function loadUnits() {
  loading.value = true
  try {
    const params: any = { page: page.value, per_page: itemsPerPage.value }
    if (typeFilter.value)
      params.type = typeFilter.value

    const res = await axios.get('/units/', { params })
    const d = res.data?.data ?? res.data

    units.value = d?.units ?? []
    total.value = d?.count ?? units.value.length
  }
  catch {
    notify(t('Failed to load units'), 'error')
  }
  finally {
    loading.value = false
  }
}

onMounted(() => {
  loadUnits()
  loadAllUnits()
})
watch([page, itemsPerPage], loadUnits)
watch(typeFilter, () => { page.value = 1; loadUnits() })

function openCreate() {
  dialogMode.value = 'create'
  form.value = {
    name: '',
    short_name: '',
    unit_type: 'COUNT',
    is_base_unit: false,
    base_unit_id: null,
    conversion_factor: 1,
    decimal_places: 2,
    is_active: true,
  }
  dialog.value = true
}

function openEdit(item: any) {
  dialogMode.value = 'edit'
  selectedItem.value = item
  form.value = {
    name: item.name ?? '',
    short_name: item.short_name ?? '',
    unit_type: item.unit_type ?? 'COUNT',
    is_base_unit: item.is_base_unit ?? false,
    base_unit_id: item.base_unit_id ?? null,
    conversion_factor: item.conversion_factor ?? 1,
    decimal_places: item.decimal_places ?? 2,
    is_active: item.is_active ?? true,
  }
  dialog.value = true
}

async function save() {
  saving.value = true
  try {
    const payload: any = { ...form.value }
    if (payload.is_base_unit)
      delete payload.base_unit_id
    if (!payload.base_unit_id)
      delete payload.base_unit_id
    if (dialogMode.value === 'create') {
      // Backend create() has no is_active param — sending it throws 500.
      delete payload.is_active
      await axios.post('/units/', payload)
    }
    else {
      // Unit detail route allows GET/PUT/DELETE (not PATCH).
      await axios.put(`/units/${selectedItem.value.id}/`, payload)
    }
    notify(dialogMode.value === 'create' ? t('Unit created') : t('Unit updated'))
    dialog.value = false
    await loadUnits()
    await loadAllUnits()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error saving unit'), 'error')
  }
  finally {
    saving.value = false
  }
}

function confirmDelete(item: any) {
  selectedItem.value = item
  deleteDialog.value = true
}

async function doDelete() {
  deleting.value = true
  try {
    await axios.delete(`/units/${selectedItem.value.id}/`)
    notify(t('Unit deleted'))
    deleteDialog.value = false
    await loadUnits()
    await loadAllUnits()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error deleting unit'), 'error')
  }
  finally {
    deleting.value = false
  }
}

// base unit options for same type
const baseUnitOptions = computed(() => [
  { value: '', label: t('Select base unit') },
  ...units.value
    .filter(
      u =>
        u.is_base_unit
        && u.unit_type === form.value.unit_type
        && (selectedItem.value ? u.id !== selectedItem.value.id : true),
    )
    .map(u => ({ value: String(u.id), label: `${u.name} (${u.short_name})` })),
])

// ============================================================
// CONVERSION CALCULATOR
// ============================================================
const allUnits = ref<any[]>([])

async function loadAllUnits() {
  try {
    const res = await axios.get('/units/', { params: { per_page: 500 } })
    const d = res.data?.data ?? res.data
    allUnits.value = d?.units ?? []
  }
  catch {
    allUnits.value = []
  }
}

const convForm = ref({
  quantity: '' as string,
  unit_type: '' as string,
  from_unit_id: '' as string,
  to_unit_id: '' as string,
})
const convErrors = ref<Record<string, string>>({})
const converting = ref(false)
const convResult = ref<{
  result: string
  details: {
    from_quantity: string
    from_unit: string
    to_quantity: string
    to_unit: string
    base_quantity: string
  }
} | null>(null)

interface HistoryEntry {
  id: number
  timestamp: string
  from_quantity: string
  from_unit: string
  to_quantity: string
  to_unit: string
  base_quantity: string
}
const history = ref<HistoryEntry[]>([])
let historySeq = 0

// derive from_unit's type if convForm.unit_type is blank
const effectiveTypeFilter = computed(() => {
  if (convForm.value.unit_type)
    return convForm.value.unit_type
  const from = allUnits.value.find(u => String(u.id) === String(convForm.value.from_unit_id))
  return from?.unit_type ?? ''
})

const convTypeOptions = computed(() => [
  { value: '', label: t('units_ext_all_types') },
  ...unitTypes.map(v => ({ value: v, label: t(`unit_type_${v}`) })),
])

const convFromUnitOptions = computed(() => {
  const type = convForm.value.unit_type
  const list = type
    ? allUnits.value.filter(u => u.unit_type === type)
    : allUnits.value
  return list.map(u => ({
    value: String(u.id),
    label: `${u.name} (${u.short_name})`,
  }))
})

const convToUnitOptions = computed(() => {
  const type = effectiveTypeFilter.value
  const list = type
    ? allUnits.value.filter(u => u.unit_type === type)
    : allUnits.value
  return list.map(u => ({
    value: String(u.id),
    label: `${u.name} (${u.short_name})`,
  }))
})

const fromUnitObj = computed(() => allUnits.value.find(u => String(u.id) === String(convForm.value.from_unit_id)) ?? null)
const toUnitObj = computed(() => allUnits.value.find(u => String(u.id) === String(convForm.value.to_unit_id)) ?? null)

// clear to_unit if it no longer fits the from_unit type
watch(() => convForm.value.from_unit_id, (newId) => {
  if (!newId) {
    convForm.value.to_unit_id = ''
    return
  }
  if (!convForm.value.to_unit_id)
    return
  const from = allUnits.value.find(u => String(u.id) === String(newId))
  const to = allUnits.value.find(u => String(u.id) === String(convForm.value.to_unit_id))
  if (from && to && from.unit_type !== to.unit_type)
    convForm.value.to_unit_id = ''
})

// when unit_type filter changes, drop selections that don't match
watch(() => convForm.value.unit_type, (newType) => {
  if (!newType)
    return
  const from = allUnits.value.find(u => String(u.id) === String(convForm.value.from_unit_id))
  if (from && from.unit_type !== newType)
    convForm.value.from_unit_id = ''
  const to = allUnits.value.find(u => String(u.id) === String(convForm.value.to_unit_id))
  if (to && to.unit_type !== newType)
    convForm.value.to_unit_id = ''
})

function validateConvert(): boolean {
  const e: Record<string, string> = {}
  const qty = Number(convForm.value.quantity)
  if (convForm.value.quantity === '' || Number.isNaN(qty) || qty <= 0)
    e.quantity = t('units_ext_invalid_quantity')
  if (!convForm.value.from_unit_id)
    e.from_unit_id = t('units_ext_required')
  if (!convForm.value.to_unit_id)
    e.to_unit_id = t('units_ext_required')
  if (convForm.value.from_unit_id
    && convForm.value.to_unit_id
    && convForm.value.from_unit_id === convForm.value.to_unit_id)
    e.to_unit_id = t('units_ext_same_unit')
  if (fromUnitObj.value && toUnitObj.value
    && fromUnitObj.value.unit_type !== toUnitObj.value.unit_type)
    e.to_unit_id = t('units_ext_type_mismatch')
  convErrors.value = e
  return Object.keys(e).length === 0
}

async function doConvert() {
  if (converting.value)
    return
  if (!validateConvert())
    return
  converting.value = true
  try {
    const payload = {
      quantity: Number(convForm.value.quantity),
      from_unit_id: Number(convForm.value.from_unit_id),
      to_unit_id: Number(convForm.value.to_unit_id),
    }
    const res = await axios.post('/units/convert/', payload)
    const d = res.data?.data ?? res.data
    const result = String(d?.result ?? '')
    const details = d?.details ?? {}
    convResult.value = {
      result,
      details: {
        from_quantity: String(details.from_quantity ?? convForm.value.quantity),
        from_unit: String(details.from_unit ?? fromUnitObj.value?.short_name ?? ''),
        to_quantity: String(details.to_quantity ?? result),
        to_unit: String(details.to_unit ?? toUnitObj.value?.short_name ?? ''),
        base_quantity: String(details.base_quantity ?? ''),
      },
    }
    history.value.unshift({
      id: ++historySeq,
      timestamp: new Date().toISOString(),
      ...convResult.value.details,
    })
    if (history.value.length > 20)
      history.value.length = 20
    notify(t('units_ext_success'))
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('units_ext_error'), 'error')
  }
  finally {
    converting.value = false
  }
}

function swapUnits() {
  const tmp = convForm.value.from_unit_id
  convForm.value.from_unit_id = convForm.value.to_unit_id
  convForm.value.to_unit_id = tmp
}

function resetConvert() {
  convForm.value = { quantity: '', unit_type: '', from_unit_id: '', to_unit_id: '' }
  convErrors.value = {}
  convResult.value = null
}

async function copyResult() {
  if (!convResult.value)
    return
  try {
    await navigator.clipboard.writeText(convResult.value.result)
    notify(t('units_ext_copied'))
  }
  catch {
    notify(t('units_ext_error'), 'error')
  }
}

function clearHistory() {
  history.value = []
}

function fmtTime(iso: string) {
  try {
    const d = new Date(iso)
    return d.toLocaleString()
  }
  catch {
    return iso
  }
}
</script>

<template>
  <div class="page">
    <PageHeader
      :title="t('units_ext_title')"
      :subtitle="t('units_ext_subtitle')"
    />

    <!-- ============ CONVERSION CALCULATOR ============ -->
    <div
      class="card"
      style="margin-bottom: var(--sp-5);"
    >
      <div
        class="toolbar"
        style="border-bottom: 1px solid var(--border); flex-wrap: wrap;"
      >
        <div style="flex: 1; min-width: 0;">
          <div
            class="kpi__label"
            style="font-weight: var(--fw-semibold); color: var(--text);"
          >
            {{ t('units_ext_title') }}
          </div>
          <div
            class="page__subtitle"
            style="margin-top: 2px;"
          >
            {{ t('units_ext_subtitle') }}
          </div>
        </div>
      </div>

      <form
        class="conv-form"
        @submit.prevent="doConvert"
      >
        <!-- Unit type filter -->
        <Field :label="t('units_ext_unit_type')">
          <Select
            v-model="convForm.unit_type"
            :options="convTypeOptions"
            :placeholder="t('units_ext_all_types')"
          />
        </Field>

        <!-- Quantity -->
        <Field
          :label="t('units_ext_quantity')"
          :error="convErrors.quantity"
        >
          <Input
            v-model="convForm.quantity"
            type="number"
            step="any"
            min="0"
            :placeholder="t('units_quantity_placeholder')"
            :error="!!convErrors.quantity"
          />
        </Field>

        <!-- From unit -->
        <Field
          :label="t('units_ext_from_unit')"
          :error="convErrors.from_unit_id"
        >
          <Select
            v-model="convForm.from_unit_id"
            :options="convFromUnitOptions"
            :placeholder="t('units_ext_from_unit')"
            :error="!!convErrors.from_unit_id"
          />
        </Field>

        <!-- To unit -->
        <Field
          :label="t('units_ext_to_unit')"
          :error="convErrors.to_unit_id"
        >
          <Select
            v-model="convForm.to_unit_id"
            :options="convToUnitOptions"
            :placeholder="t('units_ext_to_unit')"
            :error="!!convErrors.to_unit_id"
          />
        </Field>

        <!-- Action buttons -->
        <div class="conv-actions">
          <Button
            type="button"
            variant="ghost"
            icon="close"
            @click="resetConvert"
          >
            {{ t('units_ext_reset') }}
          </Button>
          <Button
            type="button"
            variant="ghost"
            icon="refresh"
            :disabled="!convForm.from_unit_id || !convForm.to_unit_id"
            @click="swapUnits"
          >
            {{ t('units_ext_swap') }}
          </Button>
          <Button
            type="submit"
            variant="primary"
            icon-right="chevright"
            :loading="converting"
            :disabled="converting"
          >
            {{ t('units_ext_convert') }}
          </Button>
        </div>

        <!-- Result panel -->
        <div class="conv-result-wrap">
          <div
            v-if="convResult"
            class="conv-result"
          >
            <div class="conv-result__header">
              <div
                class="kpi__label"
                style="color: var(--text); font-weight: var(--fw-semibold);"
              >
                {{ t('units_ext_result') }}
              </div>
              <IconAction
                icon="copy"
                tone="primary"
                :title="t('units_ext_copy')"
                @click="copyResult"
              />
            </div>

            <div class="conv-result__grid">
              <!-- from -->
              <div class="conv-result__cell">
                <div
                  class="page__subtitle"
                  style="font-size: var(--fs-sm);"
                >
                  {{ t('units_ext_from_quantity') }}
                </div>
                <div class="conv-result__value">
                  <span class="mono conv-result__num">{{ convResult.details.from_quantity }}</span>
                  <Badge tone="neutral">
                    {{ convResult.details.from_unit }}
                  </Badge>
                </div>
              </div>

              <!-- arrow -->
              <div class="conv-result__arrow">
                <DesignIcon
                  name="chevright"
                  :size="22"
                />
              </div>

              <!-- to -->
              <div class="conv-result__cell">
                <div
                  class="page__subtitle"
                  style="font-size: var(--fs-sm);"
                >
                  {{ t('units_ext_to_quantity') }}
                </div>
                <div class="conv-result__value">
                  <span class="mono conv-result__num conv-result__num--primary">{{ convResult.details.to_quantity }}</span>
                  <Badge tone="primary">
                    {{ convResult.details.to_unit }}
                  </Badge>
                </div>
              </div>

              <!-- base -->
              <div class="conv-result__cell">
                <div
                  class="page__subtitle"
                  style="font-size: var(--fs-sm);"
                >
                  {{ t('units_ext_base_quantity') }}
                </div>
                <div class="conv-result__value">
                  <span class="mono conv-result__base">{{ convResult.details.base_quantity || '—' }}</span>
                  <Badge tone="neutral">
                    {{ t('units_ext_base_unit_badge') }}
                  </Badge>
                </div>
              </div>
            </div>
          </div>

          <StateFill
            v-else
            icon="sliders"
            :title="t('units_ext_no_result')"
          />
        </div>
      </form>
    </div>

    <!-- ============ RECENT CONVERSIONS HISTORY ============ -->
    <div
      class="card"
      style="margin-bottom: var(--sp-5);"
    >
      <div
        class="toolbar"
        style="flex-wrap: wrap;"
      >
        <div style="flex: 1; min-width: 0;">
          <div
            class="kpi__label"
            style="color: var(--text); font-weight: var(--fw-semibold);"
          >
            {{ t('units_ext_history') }}
          </div>
        </div>
        <Button
          v-if="history.length"
          variant="ghost"
          icon="trash"
          @click="clearHistory"
        >
          {{ t('units_ext_history_clear') }}
        </Button>
      </div>
      <div class="card__divider" />

      <div
        v-if="history.length === 0"
        style="padding: var(--sp-2) 0;"
      >
        <StateFill
          icon="inbox"
          :title="t('units_ext_history_empty')"
        />
      </div>
      <div
        v-else
        class="hist-wrap"
      >
        <div class="hist-head">
          <span>{{ t('units_ext_time') }}</span>
          <span style="text-align: right;">{{ t('units_ext_from_quantity') }}</span>
          <span>{{ t('units_ext_from_unit') }}</span>
          <span style="text-align: right;">{{ t('units_ext_to_quantity') }}</span>
          <span>{{ t('units_ext_to_unit') }}</span>
          <span style="text-align: right;">{{ t('units_ext_base_quantity') }}</span>
        </div>
        <div
          v-for="row in history"
          :key="row.id"
          class="hist-row"
        >
          <span
            class="mono"
            style="color: var(--text-secondary); font-size: var(--fs-sm);"
          >{{ fmtTime(row.timestamp) }}</span>
          <span
            class="mono"
            style="text-align: right;"
          >{{ row.from_quantity }}</span>
          <span>
            <Badge tone="neutral">{{ row.from_unit }}</Badge>
          </span>
          <span
            class="mono"
            style="text-align: right; font-weight: var(--fw-semibold); color: rgb(var(--v-theme-primary));"
          >{{ row.to_quantity }}</span>
          <span>
            <Badge tone="primary">{{ row.to_unit }}</Badge>
          </span>
          <span
            class="mono"
            style="text-align: right; color: var(--text-tertiary);"
          >{{ row.base_quantity || '—' }}</span>
        </div>
      </div>
    </div>

    <!-- ============ UNITS CRUD ============ -->
    <div class="card">
      <div
        class="toolbar"
        style="flex-wrap: wrap;"
      >
        <div class="grow toolbar-search">
          <Input
            v-model="search"
            icon="search"
            :placeholder="t('Search units...')"
            :aria-label="t('Search units...')"
          />
        </div>

        <div class="toolbar-select toolbar-type-filter">
          <Select
            :model-value="typeFilter ?? ''"
            :placeholder="t('All Types')"
            :options="typeFilterOptions"
            @update:model-value="(v: string) => typeFilter = v ? v : undefined"
          />
        </div>

        <div style="flex: 1;" />

        <Button
          variant="primary"
          icon="plus"
          @click="openCreate"
        >
          {{ t('Add Unit') }}
        </Button>
      </div>

      <div class="card__divider" />

      <DataTable
        :columns="columns"
        :rows="filteredUnits"
        row-key="id"
        :loading="loading"
        :pagination="dtPagination"
        :per-page-options="[10, 25, 50, 100]"
      >
        <template #cell.name="{ row }">
          <span class="cell-strong">{{ row.name }}</span>
        </template>

        <template #cell.short_name="{ row }">
          <span class="mono">{{ row.short_name }}</span>
        </template>

        <template #cell.unit_type="{ row }">
          <Badge :tone="(typeTone[row.unit_type] ?? 'neutral') as any">
            {{ row.unit_type ? t(`unit_type_${row.unit_type}`) : '—' }}
          </Badge>
        </template>

        <template #cell.is_base_unit="{ row }">
          <Badge
            v-if="row.is_base_unit"
            tone="primary"
          >
            {{ t('units_ext_base_unit_badge') }}
          </Badge>
          <span
            v-else
            class="cell-muted"
          >{{ row.base_unit?.short_name ?? '—' }}</span>
        </template>

        <template #cell.conversion_factor="{ row }">
          <span class="mono">{{ row.is_base_unit ? '1' : row.conversion_factor }}</span>
        </template>

        <template #cell.decimal_places="{ row }">
          <span class="mono">{{ row.decimal_places }}</span>
        </template>

        <template #cell.is_active="{ row }">
          <Badge
            :tone="row.is_active ? 'success' : 'neutral'"
            dot
          >
            {{ row.is_active ? t('Active') : t('Inactive') }}
          </Badge>
        </template>

        <template #row-actions="{ row }">
          <IconAction
            icon="edit"
            :title="t('Edit')"
            @click.stop="openEdit(row)"
          />
          <IconAction
            icon="trash"
            tone="danger"
            :title="t('Delete')"
            @click.stop="confirmDelete(row)"
          />
        </template>

        <template #empty>
          <StateFill
            icon="inbox"
            :title="t('units_no_results_title')"
            :sub="t('units_no_results_sub')"
          />
        </template>
      </DataTable>
    </div>

    <!-- ============ CREATE / EDIT MODAL ============ -->
    <Modal
      :open="dialog"
      :width="540"
      :title="dialogMode === 'create' ? t('Add Unit') : t('Edit Unit')"
      @close="dialog = false"
    >
      <div
        class="grid cols-2 unit-modal-grid"
        style="gap: var(--sp-4);"
      >
        <Field :label="t('Name')">
          <Input
            v-model="form.name"
            required
          />
        </Field>

        <Field :label="t('Short Name')">
          <Input
            v-model="form.short_name"
            required
          />
        </Field>

        <Field :label="t('Type')">
          <Select
            v-model="form.unit_type"
            :options="unitTypeItems"
          />
        </Field>

        <Field :label="t('Decimal Places')">
          <Input
            v-model="form.decimal_places"
            type="number"
            min="0"
            max="6"
          />
        </Field>

        <div style="grid-column: span 2;">
          <Field
            :label="t('Base Unit')"
            :hint="t('This is the base unit for its type')"
          >
            <Switch v-model="form.is_base_unit" />
          </Field>
        </div>

        <template v-if="!form.is_base_unit">
          <Field :label="t('Base Unit')">
            <Select
              :model-value="form.base_unit_id != null ? String(form.base_unit_id) : ''"
              :placeholder="t('Select base unit')"
              :options="baseUnitOptions"
              @update:model-value="(v: string) => form.base_unit_id = v ? Number(v) : null"
            />
          </Field>

          <Field :label="t('Conversion Factor')">
            <Input
              v-model="form.conversion_factor"
              type="number"
              step="0.001"
            />
          </Field>
        </template>

        <div
          v-if="dialogMode === 'edit'"
          style="grid-column: span 2;"
        >
          <Field :label="t('Active')">
            <Switch v-model="form.is_active" />
          </Field>
        </div>
      </div>

      <template #footer>
        <Button
          variant="primary"
          :loading="saving"
          :disabled="!form.name || !form.short_name || saving"
          @click="save"
        >
          {{ t('Save') }}
        </Button>
      </template>
    </Modal>

    <!-- ============ DELETE CONFIRM MODAL ============ -->
    <Modal
      :open="deleteDialog"
      :width="440"
      :title="t('Delete Unit')"
      @close="deleteDialog = false"
    >
      <div
        class="row"
        style="gap: 14px; align-items: flex-start;"
      >
        <div
          class="kpi__icon t-error"
          style="width: 44px; height: 44px; flex: 0 0 44px;"
        >
          <DesignIcon
            name="alert"
            :size="22"
          />
        </div>
        <div>
          <p style="margin: 0; font-weight: 600;">
            {{ selectedItem?.name }}
          </p>
          <p
            class="muted"
            style="margin: 6px 0 0; font-size: 14px;"
          >
            {{ t('Are you sure you want to delete') }}
          </p>
        </div>
      </div>

      <template #footer>
        <Button
          variant="danger"
          :loading="deleting"
          :disabled="deleting"
          @click="doDelete"
        >
          {{ t('Delete') }}
        </Button>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.conv-form {
  padding: var(--sp-5);
  display: grid;
  gap: var(--sp-4);
  grid-template-columns: repeat(4, 1fr);
}
.conv-form > .field {
  min-width: 0;
}
.conv-actions {
  grid-column: 1 / -1;
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  flex-wrap: wrap;
}
.conv-result-wrap {
  grid-column: 1 / -1;
}
.conv-result {
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  padding: var(--sp-4);
  background: rgb(var(--v-theme-surface-inset));
}
.conv-result__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--sp-3);
  gap: var(--sp-2);
}
.conv-result__grid {
  display: grid;
  gap: var(--sp-3);
  grid-template-columns: 1fr 40px 1fr 1fr;
  align-items: center;
}
.conv-result__cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.conv-result__value {
  display: flex;
  align-items: baseline;
  gap: 6px;
  flex-wrap: wrap;
}
.conv-result__num {
  font-size: 22px;
  font-weight: var(--fw-semibold);
}
.conv-result__num--primary {
  font-size: 26px;
  color: rgb(var(--v-theme-primary));
}
.conv-result__base {
  font-size: 16px;
  color: var(--text-secondary);
}
.conv-result__arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
}

.hist-wrap {
  padding: 0 var(--sp-5) var(--sp-4);
  display: flex;
  flex-direction: column;
  overflow-x: auto;
}
.hist-head,
.hist-row {
  display: grid;
  grid-template-columns: 160px 1fr 1fr 1fr 1fr 1fr;
  gap: var(--sp-3);
  padding: var(--sp-3) 0;
  border-bottom: 1px solid var(--border);
  min-width: 720px;
}
.hist-head {
  font-size: var(--fs-label);
  color: var(--text-tertiary);
  font-weight: var(--fw-semibold);
  letter-spacing: 0.02em;
  text-transform: uppercase;
}
.hist-row {
  align-items: center;
}

.toolbar-search {
  min-width: 220px;
  max-width: 280px;
}
.toolbar-type-filter {
  min-width: 160px;
}

@media (max-width: 1100px) {
  .conv-form {
    grid-template-columns: repeat(2, 1fr);
  }
  .conv-result__grid {
    grid-template-columns: 1fr 1fr;
  }
  .conv-result__arrow {
    display: none;
  }
}

@media (max-width: 900px) {
  .conv-form {
    grid-template-columns: 1fr;
  }
  .conv-result__grid {
    grid-template-columns: 1fr;
  }
  .toolbar-select {
    width: 100%;
  }
}

@media (max-width: 768px) {
  .toolbar-search {
    flex: 1 1 100%;
    min-width: 0;
    max-width: none;
    width: 100%;
  }
  .toolbar-type-filter {
    flex: 1 1 100%;
    min-width: 0;
    width: 100%;
  }
  .unit-modal-grid {
    grid-template-columns: 1fr !important;
  }
  .unit-modal-grid > [style*="grid-column: span 2"] {
    grid-column: span 1 !important;
  }
  .hist-head,
  .hist-row {
    grid-template-columns: 140px repeat(5, minmax(96px, 1fr));
  }
}

@media (max-width: 420px) {
  .hist-head,
  .hist-row {
    min-width: 640px;
  }
}
</style>

<route lang="yaml">
name: stock-units
meta:
  action: manage
  subject: all
</route>
