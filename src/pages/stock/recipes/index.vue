<script setup lang="ts">
/* ============================================================
   ALPHA POS — Stock / Recipes
   Plain HTML + design classes (design-shell.css). Uses the
   shared DataTable primitive with column definitions, design
   Modal/Input/Select/Switch/Button/IconAction. Preserves all
   axios calls, computed filters and search/filter refs.
   ============================================================ */
import RecipeDetailDialog from '@/components/stock/recipes/RecipeDetailDialog.vue'
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
import Switch from '@/components/design/Switch.vue'

const { t } = useI18n({ useScope: 'global' })

/* ---------------- state (preserved) ---------------- */
const recipes = ref<any[]>([])
const total = ref(0)
const loading = ref(false)
const page = ref(1)
const itemsPerPage = ref(10)
const search = ref('')
const typeFilter = ref<string | undefined>(undefined)
const outputItemFilter = ref<number | undefined>(undefined)
const productionLocationFilter = ref<number | undefined>(undefined)
const showInactive = ref(false)
const showOldVersions = ref(false)
const locationsList = ref<any[]>([])

const dialog = ref(false)
const dialogMode = ref<'create' | 'edit'>('create')
const saving = ref(false)
const deleteDialog = ref(false)
const deleting = ref(false)
const selectedItem = ref<any>(null)
const detailDialog = ref(false)
const detailItem = ref<any>(null)

const itemsList = ref<any[]>([])
const unitsList = ref<any[]>([])

const recipeTypes = ['PRODUCTION', 'ASSEMBLY', 'PREPARATION', 'DISASSEMBLY']
// BE: difficulty_level is PositiveSmallIntegerField (1..5)
const difficultyLevels = [1, 2, 3, 4, 5]

const typeBadgeTone: Record<string, 'primary' | 'success' | 'warning' | 'error' | 'neutral'> = {
  PRODUCTION: 'primary',
  ASSEMBLY: 'success',
  PREPARATION: 'warning',
  DISASSEMBLY: 'error',
}

const form = ref({
  name: '',
  code: '',
  recipe_type: 'PRODUCTION',
  output_item_id: null as number | null,
  output_quantity: 1,
  output_unit_id: null as number | null,
  estimated_time_minutes: null as number | null,
  difficulty_level: 1 as number,
  notes: '',
  is_active: true,
})

const { snackbar, snackbarMsg, snackbarColor, notify } = useNotify()
const router = useRouter()

/* Navigate to the full drill-down page (ingredients, cost, availability, versions). */
function openFull(row: any) {
  if (row?.id != null)
    router.push(`/stock/recipes/${row.id}`)
}

/* Toolbar: reset every filter/search back to defaults in one click. */
const hasActiveFilters = computed(() =>
  !!search.value
  || !!typeFilter.value
  || outputItemFilter.value !== undefined
  || productionLocationFilter.value !== undefined
  || showInactive.value
  || showOldVersions.value,
)
function resetFilters() {
  search.value = ''
  typeFilter.value = undefined
  outputItemFilter.value = undefined
  productionLocationFilter.value = undefined
  showInactive.value = false
  showOldVersions.value = false
}

/* ---------------- load (preserved) ---------------- */
async function loadRecipes() {
  loading.value = true
  try {
    const params: any = { page: page.value, per_page: itemsPerPage.value }
    if (search.value)
      params.search = search.value
    if (typeFilter.value)
      params.recipe_type = typeFilter.value
    if (outputItemFilter.value)
      params.output_item_id = outputItemFilter.value
    if (productionLocationFilter.value)
      params.production_location_id = productionLocationFilter.value
    if (showInactive.value)
      params.active_only = 'false'
    if (showOldVersions.value)
      params.active_version_only = 'false'

    const res = await axios.get('/recipes/', { params })
    const d = res.data?.data ?? res.data

    recipes.value = d?.recipes ?? []
    total.value = d?.pagination?.total_items ?? d?.pagination?.total ?? recipes.value.length
  }
  catch {
    notify(t('Failed to load recipes'), 'error')
  }
  finally {
    loading.value = false
  }
}

async function loadMeta() {
  try {
    const [itemsRes, unitsRes, locRes] = await Promise.all([
      axios.get('/items/', { params: { per_page: 300 } }),
      axios.get('/units/', { params: { per_page: 200 } }),
      axios.get('/locations/', { params: { per_page: 200 } }),
    ])

    const itemsD = itemsRes.data?.data ?? itemsRes.data
    itemsList.value = itemsD?.items ?? []
    const unitsD = unitsRes.data?.data ?? unitsRes.data
    unitsList.value = unitsD?.units ?? []
    const locD = locRes.data?.data ?? locRes.data
    locationsList.value = locD?.locations ?? []
  }
  catch { /* ignore */ }
}

onMounted(() => { loadRecipes(); loadMeta() })
watch([page, itemsPerPage], loadRecipes)
watch([search, typeFilter], () => { page.value = 1; loadRecipes() })
watch([outputItemFilter, productionLocationFilter, showInactive, showOldVersions], () => { page.value = 1; loadRecipes() })

/* ---------------- options (preserved) ---------------- */
const itemOptions = computed(() =>
  itemsList.value.map(i => ({ value: String(i.id), label: `${i.name} (${i.sku ?? '—'})` })),
)
const unitOptions = computed(() =>
  unitsList.value.map(u => ({ value: String(u.id), label: `${u.name} (${u.short_name})` })),
)
const locationOptions = computed(() =>
  locationsList.value.map(l => ({ value: String(l.id), label: l.name })),
)
const typeFilterOptions = computed(() =>
  recipeTypes.map(v => ({ value: v, label: t(`recipe_type_${v}`) })),
)
const recipeTypeOptions = computed(() =>
  recipeTypes.map(v => ({ value: v, label: t(`recipe_type_${v}`) })),
)
const difficultyOptions = computed(() =>
  difficultyLevels.map(v => ({ value: String(v), label: t(`difficulty_level_${v}`) })),
)

/* ---------------- create / edit / delete / toggle ---------------- */
function openCreate() {
  dialogMode.value = 'create'
  form.value = { name: '', code: '', recipe_type: 'PRODUCTION', output_item_id: null, output_quantity: 1, output_unit_id: null, estimated_time_minutes: null, difficulty_level: 1, notes: '', is_active: true }
  dialog.value = true
}

async function openEdit(item: any) {
  dialogMode.value = 'edit'
  selectedItem.value = item

  // BE list rows return output_item_name (string) + output_unit (short_name string) — no ids.
  // Fetch full detail so output_item_id / output_unit_id populate the selects.
  let detail: any = item
  try {
    const res = await axios.get(`/recipes/${item.id}/`)
    detail = res.data?.data ?? res.data ?? item
  }
  catch { /* fall back to list row */ }

  form.value = {
    name: detail.name ?? '',
    code: detail.code ?? '',
    recipe_type: detail.recipe_type ?? 'PRODUCTION',
    output_item_id: detail.output_item_id ?? detail.output_item?.id ?? null,
    output_quantity: detail.output_quantity ?? 1,
    output_unit_id: detail.output_unit_id ?? null,
    estimated_time_minutes: detail.estimated_time_minutes ?? null,
    difficulty_level: Number(detail.difficulty_level ?? 1),
    notes: detail.notes ?? '',
    is_active: detail.is_active ?? true,
  }
  dialog.value = true
}

function openDetail(item: any) {
  detailItem.value = item
  detailDialog.value = true
}

async function save() {
  saving.value = true
  try {
    const payload: any = { ...form.value }
    if (!payload.output_item_id)
      delete payload.output_item_id
    if (!payload.output_unit_id)
      delete payload.output_unit_id
    if (!payload.estimated_time_minutes)
      delete payload.estimated_time_minutes
    if (!payload.notes)
      delete payload.notes
    if (!payload.code)
      delete payload.code

    // Ensure difficulty_level is an integer for BE PositiveSmallIntegerField
    if (payload.difficulty_level != null)
      payload.difficulty_level = Number(payload.difficulty_level)

    if (dialogMode.value === 'create') {
      await axios.post('/recipes/', payload)
    }
    else {
      // BE: recipe_detail allows GET/PUT/DELETE only — PATCH returns 405
      await axios.put(`/recipes/${selectedItem.value.id}/`, payload)
    }
    notify(dialogMode.value === 'create' ? t('Recipe created') : t('Recipe updated'))
    dialog.value = false
    await loadRecipes()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error saving recipe'), 'error')
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
    await axios.delete(`/recipes/${selectedItem.value.id}/`)
    notify(t('Recipe deleted'))
    deleteDialog.value = false
    await loadRecipes()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error deleting recipe'), 'error')
  }
  finally {
    deleting.value = false
  }
}

async function toggleActive(item: any) {
  // BE: recipe_detail blocks PATCH and RecipeService.update() ignores is_active.
  // Deactivation lives at DELETE /recipes/{id}/. No activate endpoint is exposed,
  // so activating an inactive recipe is currently unsupported on the BE.
  if (!item.is_active) {
    notify(t('recipes_activate_unsupported'), 'error')
    return
  }
  try {
    await axios.delete(`/recipes/${item.id}/`)
    notify(t('Recipe deactivated'))
    await loadRecipes()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error updating recipe'), 'error')
  }
}

/* ---------------- columns ---------------- */
const columns = computed<DataTableColumn<any>[]>(() => [
  { key: 'code', label: t('Code'), sortable: true },
  { key: 'name', label: t('Name'), sortable: true },
  { key: 'recipe_type', label: t('Type'), sortable: true },
  { key: 'output', label: t('Output'), sortable: false },
  { key: 'output_quantity', label: t('Qty'), sortable: false, align: 'right' },
  { key: 'version', label: t('Version'), sortable: false },
  { key: 'is_active', label: t('Status'), sortable: false },
])

/* ---------------- controlled pagination for DataTable ---------------- */
const pagination = computed(() => ({
  page: page.value,
  perPage: itemsPerPage.value,
  total: total.value,
  onPage: (p: number) => { page.value = p },
  onPerPage: (n: number) => { itemsPerPage.value = n; page.value = 1 },
}))

/* ---------------- form helpers (string<->number bridge for Select) ---------------- */
const outputItemFilterStr = computed<string>({
  get: () => outputItemFilter.value === undefined ? '' : String(outputItemFilter.value),
  set: v => { outputItemFilter.value = v === '' ? undefined : Number(v) },
})
const productionLocationFilterStr = computed<string>({
  get: () => productionLocationFilter.value === undefined ? '' : String(productionLocationFilter.value),
  set: v => { productionLocationFilter.value = v === '' ? undefined : Number(v) },
})
const typeFilterStr = computed<string>({
  get: () => typeFilter.value ?? '',
  set: v => { typeFilter.value = v === '' ? undefined : v },
})

const formOutputItemStr = computed<string>({
  get: () => form.value.output_item_id == null ? '' : String(form.value.output_item_id),
  set: v => { form.value.output_item_id = v === '' ? null : Number(v) },
})
const formOutputUnitStr = computed<string>({
  get: () => form.value.output_unit_id == null ? '' : String(form.value.output_unit_id),
  set: v => { form.value.output_unit_id = v === '' ? null : Number(v) },
})
const formDifficultyStr = computed<string>({
  get: () => form.value.difficulty_level == null ? '' : String(form.value.difficulty_level),
  set: v => { form.value.difficulty_level = v === '' ? 1 : Number(v) },
})
</script>

<template>
  <div class="page">
    <PageHeader
      :title="t('recipes_title')"
      :subtitle="t('recipes_subtitle')"
    >
      <template #actions>
        <Button
          variant="primary"
          icon="plus"
          @click="openCreate"
        >
          {{ t('Add Recipe') }}
        </Button>
      </template>
    </PageHeader>

    <div class="card">
      <!-- Toolbar (flex-wrap built into .toolbar) -->
      <div class="toolbar">
        <div class="grow toolbar-search">
          <Input
            v-model="search"
            icon="search"
            :placeholder="t('Search recipes...')"
            :aria-label="t('Search recipes...')"
          />
        </div>

        <div class="toolbar-field">
          <Select
            v-model="typeFilterStr"
            :options="typeFilterOptions"
            :placeholder="t('All Types')"
            icon="filter"
          />
        </div>

        <div class="toolbar-field">
          <Select
            v-model="outputItemFilterStr"
            :options="itemOptions"
            :placeholder="t('Output Item')"
            icon="box"
          />
        </div>

        <div class="toolbar-field">
          <Select
            v-model="productionLocationFilterStr"
            :options="locationOptions"
            :placeholder="t('Production Location')"
            icon="building"
          />
        </div>

        <label class="toolbar-toggle">
          <Switch v-model="showInactive" />
          <span>{{ t('Show inactive') }}</span>
        </label>

        <label class="toolbar-toggle">
          <Switch v-model="showOldVersions" />
          <span>{{ t('Show old versions') }}</span>
        </label>
      </div>

      <div class="card__divider" />

      <!-- Results bar: live count + one-click filter reset -->
      <div class="results-bar">
        <span class="cell-muted">
          {{ t('recipes_result_count', { count: total }) }}
        </span>
        <Button
          v-if="hasActiveFilters"
          variant="ghost"
          size="sm"
          icon="close"
          @click="resetFilters"
        >
          {{ t('recipes_reset_filters') }}
        </Button>
      </div>

      <!-- DataTable -->
      <DataTable
        :columns="columns"
        :rows="recipes"
        row-key="id"
        :loading="loading"
        :pagination="pagination"
        :per-page-options="[10, 20, 50]"
        :empty-title="t('recipes_empty_title')"
        :empty-sub="t('recipes_empty_body')"
        empty-icon="receipt"
      >
        <!-- Code -->
        <template #cell.code="{ row }">
          <span class="cell-strong mono">{{ row.code ?? '—' }}</span>
        </template>

        <!-- Name (opens full drill-down page) -->
        <template #cell.name="{ row }">
          <button
            type="button"
            class="link-name cell-strong"
            :title="t('recipe_open_full')"
            @click="openFull(row)"
          >
            {{ row.name ?? '—' }}
          </button>
        </template>

        <!-- Type badge -->
        <template #cell.recipe_type="{ row }">
          <Badge :tone="typeBadgeTone[row.recipe_type] ?? 'neutral'">
            {{ t(`recipe_type_${row.recipe_type}`) }}
          </Badge>
        </template>

        <!-- Output item name -->
        <template #cell.output="{ row }">
          <span class="cell-muted">{{ row.output_item_name ?? '—' }}</span>
        </template>

        <!-- Qty + unit -->
        <template #cell.output_quantity="{ row }">
          <span class="num-tabular">{{ row.output_quantity }}</span>
          <span class="cell-muted" style="margin-left:4px;">{{ row.output_unit ?? '' }}</span>
        </template>

        <!-- Version -->
        <template #cell.version="{ row }">
          <span class="cell-muted">{{ row.version ?? '—' }}</span>
        </template>

        <!-- Active -->
        <template #cell.is_active="{ row }">
          <Badge :tone="row.is_active ? 'success' : 'neutral'" dot>
            {{ row.is_active ? t('Active') : t('Inactive') }}
          </Badge>
        </template>

        <!-- Row actions -->
        <template #row-actions="{ row }">
          <IconAction
            icon="list"
            :title="t('View Ingredients')"
            @click="openDetail(row)"
          />
          <IconAction
            icon="chevright"
            :title="t('recipe_open_full')"
            @click="openFull(row)"
          />
          <IconAction
            icon="pencil"
            :title="t('Edit')"
            @click="openEdit(row)"
          />
          <IconAction
            :icon="row.is_active ? 'pause' : 'play'"
            :tone="row.is_active ? 'warning' : 'success'"
            :title="row.is_active ? t('Deactivate') : t('Activate')"
            @click="toggleActive(row)"
          />
          <IconAction
            icon="trash"
            tone="danger"
            :title="t('Delete')"
            @click="confirmDelete(row)"
          />
        </template>
      </DataTable>
    </div>

    <RecipeDetailDialog
      v-model="detailDialog"
      :recipe="detailItem"
    />

    <!-- ============ Create / Edit modal ============ -->
    <Modal
      :open="dialog"
      :width="640"
      :title="dialogMode === 'create' ? t('Add Recipe') : t('Edit Recipe')"
      @close="dialog = false"
    >
      <div class="form-grid">
        <div class="span-8">
          <Field :label="t('Name')">
            <Input v-model="form.name" :placeholder="t('Name')" />
          </Field>
        </div>
        <div class="span-4">
          <Field :label="t('Code')">
            <Input v-model="form.code" :placeholder="t('Code')" />
          </Field>
        </div>

        <div class="span-6">
          <Field :label="t('Type')">
            <Select
              v-model="form.recipe_type"
              :options="recipeTypeOptions"
              icon="tag"
            />
          </Field>
        </div>
        <div class="span-6">
          <Field :label="t('Difficulty')">
            <Select
              v-model="formDifficultyStr"
              :options="difficultyOptions"
              icon="star"
            />
          </Field>
        </div>

        <div class="span-8">
          <Field :label="t('Output Item')">
            <Select
              v-model="formOutputItemStr"
              :options="itemOptions"
              :placeholder="t('Output Item')"
              icon="box"
            />
          </Field>
        </div>
        <div class="span-4">
          <Field :label="t('Output Qty')">
            <Input
              v-model="form.output_quantity"
              type="number"
              step="0.01"
              :placeholder="t('Output Qty')"
            />
          </Field>
        </div>

        <div class="span-6">
          <Field :label="t('Output Unit')">
            <Select
              v-model="formOutputUnitStr"
              :options="unitOptions"
              :placeholder="t('Output Unit')"
              icon="weight"
            />
          </Field>
        </div>
        <div class="span-6">
          <Field :label="t('Est. Time (min)')">
            <Input
              v-model="form.estimated_time_minutes"
              type="number"
              :placeholder="t('Est. Time (min)')"
            />
          </Field>
        </div>

        <div class="span-12">
          <Field :label="t('Notes')">
            <Input v-model="form.notes" :placeholder="t('Notes')" />
          </Field>
        </div>

        <div v-if="dialogMode === 'edit'" class="span-12">
          <Field :label="t('Active')">
            <label class="row active-toggle">
              <Switch v-model="form.is_active" />
              <span style="font-size:13px; color:var(--text-secondary);">
                {{ form.is_active ? t('Active') : t('Inactive') }}
              </span>
            </label>
          </Field>
        </div>
      </div>

      <template #footer>
        <Button
          variant="primary"
          :loading="saving"
          :disabled="saving"
          @click="save"
        >
          {{ t('Save') }}
        </Button>
      </template>
    </Modal>

    <!-- ============ Delete confirm modal ============ -->
    <Modal
      :open="deleteDialog"
      :width="420"
      :title="t('Delete Recipe')"
      :subtitle="t('This action cannot be undone')"
      @close="deleteDialog = false"
    >
      <div class="row" style="gap:14px; align-items:flex-start;">
        <div
          class="kpi__icon t-error"
          style="width:44px; height:44px; flex:0 0 44px;"
        >
          <DesignIcon name="alert" :size="22" />
        </div>
        <div>
          <p style="margin:0; font-weight:600;">
            {{ selectedItem?.name }}
          </p>
          <p class="muted" style="margin:6px 0 0; font-size:14px; color:var(--text-secondary);">
            {{ t('recipes_delete_body') }}
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

    <VSnackbar
      v-model="snackbar"
      :color="snackbarColor"
      :timeout="3000"
    >
      {{ snackbarMsg }}
    </VSnackbar>
  </div>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
}

/* Recipe name acts as a link to the full drill-down page */
.link-name {
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  border-radius: 3px;
}
.link-name:hover {
  color: rgb(var(--v-theme-primary));
  text-decoration: underline;
  text-underline-offset: 2px;
}
.link-name:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}

/* Slim bar between the toolbar and the table */
.results-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px var(--sp-4, 16px);
  min-height: 44px;
  flex-wrap: wrap;
}

/* Search input wrapper — bounded on desktop, full-width on phone */
.toolbar-search {
  min-width: 220px;
  max-width: 320px;
}

/* Toolbar fields: fixed min on desktop, drop to 100% on mobile */
.toolbar-field {
  width: 200px;
  min-width: 180px;
}

.toolbar-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;
}

.active-toggle {
  gap: 10px;
  cursor: pointer;
  padding-top: 4px;
  flex-wrap: wrap;
  overflow-wrap: anywhere;
}

/* Form grid — 12-col on desktop, single column on mobile */
.form-grid {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: var(--sp-4);
}
.form-grid .span-4  { grid-column: span 4; }
.form-grid .span-6  { grid-column: span 6; }
.form-grid .span-8  { grid-column: span 8; }
.form-grid .span-12 { grid-column: span 12; }

/* Canonical phone breakpoint = 768px */
@media (max-width: 768px) {
  .toolbar-search {
    max-width: none;
    min-width: 0;
    flex: 1 1 100%;
  }
  .toolbar-field {
    width: 100%;
    min-width: 0;
    flex: 1 1 100%;
  }
  .form-grid {
    grid-template-columns: 1fr;
  }
  .form-grid .span-4,
  .form-grid .span-6,
  .form-grid .span-8,
  .form-grid .span-12 {
    grid-column: auto;
  }
}
</style>

<route lang="yaml">
name: stock-recipes
meta:
  action: manage
  subject: all
</route>
