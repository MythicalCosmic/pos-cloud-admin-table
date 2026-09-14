<script setup lang="ts">
import WorkspacePage from '@/components/design/workspace/WorkspacePage.vue'
import WorkspaceToolbar from '@/components/design/workspace/WorkspaceToolbar.vue'
import Textarea from '@/components/design/Textarea.vue'
/* ============================================================
   ALPHA POS — Recipe drill-down
   Page route: /stock/recipes/:id
   Shows recipe overview, ingredients, availability and cost
   breakdown for a single recipe with batch_multiplier control.
   Wires to:
     GET    /api/admins/stock/recipes/:id/?include_cost=true
     GET    /api/admins/stock/recipes/:id/availability/?batch_multiplier=
     GET    /api/admins/stock/recipes/:id/cost/?batch_multiplier=
     PUT    /api/admins/stock/recipes/:id/
     DELETE /api/admins/stock/recipes/:id/
     POST   /api/admins/stock/recipes/:id/ingredients/
     PUT    /api/admins/stock/recipe-ingredients/:ingredient_id/
     DELETE /api/admins/stock/recipe-ingredients/:ingredient_id/
   ============================================================ */
import { stockApi } from '@/plugins/axios'
import Badge from '@/components/design/Badge.vue'
import Button from '@/components/design/Button.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import Field from '@/components/design/Field.vue'
import IconAction from '@/components/design/IconAction.vue'
import Input from '@/components/design/Input.vue'
import Kpi from '@/components/design/Kpi.vue'
import Modal from '@/components/design/Modal.vue'
import PageHeader from '@/components/design/PageHeader.vue'
import Select from '@/components/design/Select.vue'
import StateFill from '@/components/design/StateFill.vue'
import Switch from '@/components/design/Switch.vue'

const { t } = useI18n({ useScope: 'global' })
const route = useRoute()
const router = useRouter()
const { notify } = useNotify()
const { formatCurrency, formatDate } = useFormatters()

// ---- ids ----
const recipeId = computed(() => String(route.params.id ?? ''))

// ---- state ----
const recipe = ref<any>(null)
const ingredients = computed<any[]>(() => recipe.value?.ingredients ?? [])
const availability = ref<any[]>([])
const totalCost = ref<number | null>(null)
const batchMultiplier = ref<number>(1)

const loadingRecipe = ref(false)
const loadingAvail = ref(false)
const loadingCost = ref(false)
const notFound = ref(false)

// Modals
const editOpen = ref(false)
const deleteOpen = ref(false)
const addIngOpen = ref(false)
const editIngOpen = ref(false)
const removeIngOpen = ref(false)
const selectedIng = ref<any>(null)

// Action busy flags
const saving = ref(false)
const deleting = ref(false)
const ingSaving = ref(false)
const ingDeleting = ref(false)

// Lookups for selects
const itemsList = ref<any[]>([])
const unitsList = ref<any[]>([])
const locationsList = ref<any[]>([])

// ---- enums ----
const RECIPE_TYPES = ['PRODUCTION', 'ASSEMBLY', 'PREPARATION', 'DISASSEMBLY']

const RECIPE_TYPE_TONE: Record<string, 'success' | 'warning' | 'error' | 'info' | 'primary' | 'neutral'> = {
  PRODUCTION: 'primary',
  ASSEMBLY: 'success',
  PREPARATION: 'warning',
  DISASSEMBLY: 'error',
}
function recipeTypeTone(v?: string) {
  if (!v) return 'neutral'
  return (RECIPE_TYPE_TONE[v] ?? 'neutral')
}

// derived status: active = is_active && is_active_version; etc.
const derivedStatus = computed<string>(() => {
  const r = recipe.value
  if (!r) return ''
  if (!r.is_active) return 'inactive'
  if (r.is_active && r.is_active_version) return 'active'
  if (r.approved_at) return 'approved'
  return 'draft'
})
const derivedStatusTone = computed<'success' | 'warning' | 'error' | 'info' | 'primary' | 'neutral'>(() => {
  switch (derivedStatus.value) {
    case 'active': return 'success'
    case 'approved': return 'primary'
    case 'draft': return 'warning'
    case 'inactive': return 'neutral'
    default: return 'neutral'
  }
})

// ---- formatting helpers ----
function fmtDecimal4(val: any): string {
  if (val === null || val === undefined || val === '') return '—'
  const n = Number(val)
  if (!Number.isFinite(n)) return '—'
  return n.toFixed(4).replace(/\.?0+$/, '')
}
function fmtPercent(val: any): string {
  if (val === null || val === undefined || val === '') return '0%'
  const n = Number(val)
  if (!Number.isFinite(n)) return '0%'
  return `${n.toFixed(1).replace(/\.0$/, '')}%`
}
function fmtMoney(val: any): string {
  if (val === null || val === undefined || val === '') return '—'
  return formatCurrency(val)
}

// ---- loaders ----
async function loadRecipe() {
  if (!recipeId.value) return
  loadingRecipe.value = true
  notFound.value = false
  try {
    const res = await stockApi.get(`/recipes/${recipeId.value}/`, { params: { include_cost: 'true' } })
    const d = res.data?.data ?? res.data
    recipe.value = d?.recipe ?? d
  }
  catch (e: any) {
    if (e?.response?.status === 404) {
      notFound.value = true
      recipe.value = null
    }
    else {
      notify(t('recipe_save_error'), 'error')
    }
  }
  finally {
    loadingRecipe.value = false
  }
}

async function loadAvailability() {
  if (!recipeId.value) return
  loadingAvail.value = true
  try {
    const res = await stockApi.get(`/recipes/${recipeId.value}/availability/`, {
      params: { batch_multiplier: batchMultiplier.value },
    })
    const d = res.data?.data ?? res.data
    availability.value = d?.ingredients ?? []
  }
  catch {
    availability.value = []
  }
  finally {
    loadingAvail.value = false
  }
}

async function loadCost() {
  if (!recipeId.value) return
  loadingCost.value = true
  try {
    const res = await stockApi.get(`/recipes/${recipeId.value}/cost/`, {
      params: { batch_multiplier: batchMultiplier.value },
    })
    const d = res.data?.data ?? res.data
    const tc = d?.total_cost
    totalCost.value = tc === null || tc === undefined ? null : Number(tc)
  }
  catch {
    totalCost.value = null
  }
  finally {
    loadingCost.value = false
  }
}

async function loadLookups() {
  try {
    const [itemsRes, unitsRes, locRes] = await Promise.all([
      stockApi.get('/items/', { params: { per_page: 300 } }),
      stockApi.get('/units/', { params: { per_page: 200 } }),
      stockApi.get('/locations/', { params: { per_page: 200 } }),
    ])
    const itemsD = itemsRes.data?.data ?? itemsRes.data
    const unitsD = unitsRes.data?.data ?? unitsRes.data
    const locD = locRes.data?.data ?? locRes.data
    itemsList.value = itemsD?.items ?? []
    unitsList.value = unitsD?.units ?? []
    locationsList.value = locD?.locations ?? []
  }
  catch { /* ignore */ }
}

function refreshAll() {
  loadRecipe()
  loadAvailability()
  loadCost()
}

onMounted(() => {
  refreshAll()
  loadLookups()
})

watch(() => route.params.id, () => {
  refreshAll()
})

// Debounced refetch on batch multiplier change
const debouncedBmRefetch = useDebounceFn(() => {
  loadAvailability()
  loadCost()
}, 350)
watch(batchMultiplier, () => debouncedBmRefetch())

// ---- option lists for selects ----
const itemOptions = computed(() => itemsList.value.map((i: any) => ({
  value: String(i.id),
  label: i.sku ? `${i.name} (${i.sku})` : i.name,
})))
const unitOptions = computed(() => unitsList.value.map((u: any) => ({
  value: String(u.id),
  label: u.short_name ? `${u.name} (${u.short_name})` : u.name,
})))
const locationOptions = computed(() => locationsList.value.map((l: any) => ({
  value: String(l.id),
  label: l.name,
})))

// ---- availability summary ----
const allAvailable = computed(() => {
  if (!availability.value.length) return true
  return availability.value.every((row: any) => row.is_available)
})
const availabilitySummaryKey = computed(() =>
  allAvailable.value ? 'recipe_availability_all_available' : 'recipe_availability_some_missing',
)
const availabilitySummaryTone = computed<'success' | 'warning' | 'error' | 'info' | 'primary' | 'neutral'>(() =>
  allAvailable.value ? 'success' : 'warning',
)

// ---- cost breakdown (computed client-side) ----
interface CostLine {
  id: string | number
  name: string
  scaled_quantity: number
  unit_cost: number
  subtotal: number
  share: number
}
const costLines = computed<CostLine[]>(() => {
  const rows = ingredients.value
  if (!rows.length) return []
  const subtotals = rows.map((ing: any) => {
    const qty = Number(ing.quantity) || 0
    const waste = Number(ing.waste_percentage) || 0
    const scaled = qty * (batchMultiplier.value || 1) * (1 + waste / 100)
    // RecipeIngredientService.serialize only exposes stock_item as {id, name, sku} —
    // no unit cost field is available on the nested object. Per-line subtotals are
    // therefore not computable client-side; rely on /cost/ endpoint total_cost and
    // present only the share derived from it.
    const sub = 0
    return {
      id: ing.id,
      name: ing.stock_item?.name ?? '—',
      scaled_quantity: scaled,
      unit_cost: 0,
      subtotal: sub,
    }
  })
  const sumSubtotals = subtotals.reduce((acc, x) => acc + x.subtotal, 0)
  const reference = totalCost.value !== null ? totalCost.value : sumSubtotals
  return subtotals.map(x => ({
    ...x,
    share: reference > 0 ? (x.subtotal / reference) * 100 : 0,
  }))
})

const costPerUnit = computed<number | null>(() => {
  if (totalCost.value === null) return null
  const outQty = Number(recipe.value?.output_quantity) || 0
  const denom = outQty * (batchMultiplier.value || 1)
  if (denom <= 0) return null
  return totalCost.value / denom
})

// ---- header info ----
const pageTitle = computed(() => {
  if (recipe.value?.name)
    return `${t('recipe_drill_title')} — ${recipe.value.name}`
  return t('recipe_drill_title')
})

// ---- nav ----
function goBack() {
  router.push({ name: 'stock-recipes' }).catch(() => router.push('/stock/recipes'))
}

// ---- edit recipe meta form ----
const editForm = ref<any>({})
const editErrors = ref<Record<string, string>>({})

function openEdit() {
  if (!recipe.value) return
  editForm.value = {
    name: recipe.value.name ?? '',
    instructions: recipe.value.instructions ?? '',
    notes: recipe.value.notes ?? '',
    difficulty_level: recipe.value.difficulty_level ?? '',
    estimated_time_minutes: recipe.value.estimated_time_minutes ?? '',
    production_location_id: recipe.value.production_location_id != null
      ? String(recipe.value.production_location_id)
      : '',
    is_scalable: !!recipe.value.is_scalable,
    min_batch_size: recipe.value.min_batch_size ?? 1,
    max_batch_size: recipe.value.max_batch_size ?? '',
  }
  editErrors.value = {}
  editOpen.value = true
}

async function saveEdit() {
  saving.value = true
  try {
    const payload: any = {}
    if (editForm.value.name?.trim()) payload.name = editForm.value.name.trim()
    if (editForm.value.instructions !== undefined) payload.instructions = editForm.value.instructions
    if (editForm.value.notes !== undefined) payload.notes = editForm.value.notes
    if (editForm.value.difficulty_level !== '' && editForm.value.difficulty_level !== null)
      payload.difficulty_level = Number(editForm.value.difficulty_level)
    if (editForm.value.estimated_time_minutes !== '' && editForm.value.estimated_time_minutes !== null)
      payload.estimated_time_minutes = Number(editForm.value.estimated_time_minutes)
    if (editForm.value.production_location_id)
      payload.production_location_id = Number(editForm.value.production_location_id)
    else
      payload.production_location_id = null
    payload.is_scalable = !!editForm.value.is_scalable
    if (editForm.value.min_batch_size !== '' && editForm.value.min_batch_size !== null)
      payload.min_batch_size = Number(editForm.value.min_batch_size)
    if (editForm.value.max_batch_size !== '' && editForm.value.max_batch_size !== null)
      payload.max_batch_size = Number(editForm.value.max_batch_size)

    const res = await stockApi.put(`/recipes/${recipeId.value}/`, payload)
    notify(t('recipe_save_success'))
    editOpen.value = false

    // BE quirk: PUT may return a NEW version when recipe was approved.
    const d = res.data?.data ?? res.data
    const returnedRecipe = d?.recipe ?? d
    const newId = returnedRecipe?.id
    if (newId && String(newId) !== recipeId.value) {
      router.push(`/stock/recipes/${newId}`)
    }
    else {
      await loadRecipe()
    }
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('recipe_save_error'), 'error')
  }
  finally {
    saving.value = false
  }
}

// ---- deactivate ----
function openDelete() {
  deleteOpen.value = true
}
async function confirmDelete() {
  deleting.value = true
  try {
    await stockApi.delete(`/recipes/${recipeId.value}/`)
    notify(t('recipe_save_success'))
    deleteOpen.value = false
    goBack()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('recipe_save_error'), 'error')
  }
  finally {
    deleting.value = false
  }
}

// ---- ingredient form (shared for add + edit) ----
interface IngForm {
  stock_item_id: string
  quantity: string | number
  unit_id: string
  waste_percentage: string | number
  is_optional: boolean
  is_scalable: boolean
  prep_instructions: string
  sort_order: string | number
  substitute_group: string
}
function emptyIngForm(): IngForm {
  return {
    stock_item_id: '',
    quantity: 1,
    unit_id: '',
    waste_percentage: 0,
    is_optional: false,
    is_scalable: true,
    prep_instructions: '',
    sort_order: 0,
    substitute_group: '',
  }
}
const ingForm = ref<IngForm>(emptyIngForm())
const ingErrors = ref<Record<string, string>>({})

function openAddIng() {
  ingForm.value = emptyIngForm()
  ingErrors.value = {}
  addIngOpen.value = true
}

function openEditIng(ing: any) {
  selectedIng.value = ing
  ingForm.value = {
    stock_item_id: ing.stock_item_id != null
      ? String(ing.stock_item_id)
      : (ing.stock_item?.id != null ? String(ing.stock_item.id) : ''),
    quantity: ing.quantity ?? 1,
    unit_id: ing.unit_id != null ? String(ing.unit_id) : '',
    waste_percentage: ing.waste_percentage ?? 0,
    is_optional: !!ing.is_optional,
    is_scalable: ing.is_scalable !== false,
    prep_instructions: ing.prep_instructions ?? '',
    sort_order: ing.sort_order ?? 0,
    substitute_group: ing.substitute_group ?? '',
  }
  ingErrors.value = {}
  editIngOpen.value = true
}

function validateIng(): boolean {
  const errs: Record<string, string> = {}
  if (!ingForm.value.stock_item_id) errs.stock_item_id = t('recipe_drill_pick_item')
  const q = Number(ingForm.value.quantity)
  if (!Number.isFinite(q) || q <= 0) errs.quantity = t('recipe_ingredient_quantity')
  if (!ingForm.value.unit_id) errs.unit_id = t('recipe_drill_pick_unit')
  ingErrors.value = errs
  return Object.keys(errs).length === 0
}

function buildIngPayload(isCreate: boolean) {
  const payload: any = {}
  if (ingForm.value.stock_item_id || isCreate)
    payload.stock_item_id = Number(ingForm.value.stock_item_id)
  if (ingForm.value.quantity !== '' || isCreate)
    payload.quantity = Number(ingForm.value.quantity)
  if (ingForm.value.unit_id || isCreate)
    payload.unit_id = Number(ingForm.value.unit_id)
  if (ingForm.value.waste_percentage !== '' && ingForm.value.waste_percentage !== null)
    payload.waste_percentage = Number(ingForm.value.waste_percentage)
  payload.is_optional = !!ingForm.value.is_optional
  payload.is_scalable = !!ingForm.value.is_scalable
  payload.prep_instructions = ingForm.value.prep_instructions ?? ''
  if (ingForm.value.sort_order !== '' && ingForm.value.sort_order !== null)
    payload.sort_order = Number(ingForm.value.sort_order)
  payload.substitute_group = ingForm.value.substitute_group ?? ''
  return payload
}

async function submitAddIng() {
  if (!validateIng()) return
  ingSaving.value = true
  try {
    const payload = buildIngPayload(true)
    await stockApi.post(`/recipes/${recipeId.value}/ingredients/`, payload)
    notify(t('recipe_ingredient_added'))
    addIngOpen.value = false
    refreshAll()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('recipe_save_error'), 'error')
  }
  finally {
    ingSaving.value = false
  }
}

async function submitEditIng() {
  if (!validateIng()) return
  if (!selectedIng.value?.id) return
  ingSaving.value = true
  try {
    const payload = buildIngPayload(false)
    await stockApi.put(`/recipe-ingredients/${selectedIng.value.id}/`, payload)
    notify(t('recipe_ingredient_updated'))
    editIngOpen.value = false
    refreshAll()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('recipe_save_error'), 'error')
  }
  finally {
    ingSaving.value = false
  }
}

function openRemoveIng(ing: any) {
  selectedIng.value = ing
  removeIngOpen.value = true
}

async function confirmRemoveIng() {
  if (!selectedIng.value?.id) return
  ingDeleting.value = true
  try {
    await stockApi.delete(`/recipe-ingredients/${selectedIng.value.id}/`)
    notify(t('recipe_ingredient_removed'))
    removeIngOpen.value = false
    refreshAll()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('recipe_save_error'), 'error')
  }
  finally {
    ingDeleting.value = false
  }
}

function onBatchMultiplierInput(v: string) {
  const n = Number(v)
  if (Number.isFinite(n) && n > 0)
    batchMultiplier.value = n
}
</script>

<template>
  <WorkspacePage class="page">
    <!-- Page header -->
    <PageHeader
      :title="pageTitle"
      :subtitle="t('recipe_drill_subtitle')"
    >
      <template #actions>
        <Button
          variant="ghost"
          icon="chevleft"
          @click="goBack"
        >
          {{ t('recipe_back_to_list') }}
        </Button>
        <Button
          variant="ghost"
          icon="refresh"
          :disabled="loadingRecipe || loadingAvail || loadingCost"
          @click="refreshAll"
        >
          {{ t('recipe_action_refresh') }}
        </Button>
        <Button
          variant="primary"
          icon="pencil"
          :disabled="!recipe"
          @click="openEdit"
        >
          {{ t('recipe_action_edit') }}
        </Button>
        <IconAction
          icon="trash"
          tone="danger"
          :title="t('recipe_action_delete')"
          :disabled="!recipe"
          @click="openDelete"
        />
      </template>
    </PageHeader>

    <!-- Not-found state -->
    <div v-if="notFound" class="card" style="padding: var(--sp-6);">
      <StateFill
        icon="alert"
        :title="t('recipe_not_found')"
      />
    </div>

    <template v-else>
      <!-- KPI strip -->
      <div class="recipe-kpis" style="margin-bottom: var(--sp-5);">
        <Kpi
          :data="{
            label: t('recipe_total_cost'),
            icon: 'dollar',
            tone: 'primary',
            money: true,
            value: totalCost,
          }"
        />
        <Kpi
          :data="{
            label: t('recipe_cost_per_unit'),
            icon: 'dollar',
            tone: 'info',
            money: true,
            value: costPerUnit,
          }"
        />
        <Kpi
          :data="{
            label: t('recipe_ingredient_count'),
            icon: 'package',
            tone: 'success',
            value: recipe ? (recipe.ingredient_count ?? ingredients.length) : null,
          }"
        />
        <Kpi
          :data="{
            label: t('recipe_estimated_time'),
            icon: 'clock',
            tone: 'warning',
            value: recipe?.estimated_time_minutes ?? null,
            sub: t('recipe_estimated_time_minutes'),
          }"
        />
      </div>

      <!-- Overview card -->
      <div class="card" style="margin-bottom: var(--sp-5);">
        <div class="toolbar recipe-toolbar" style="border-bottom: 1px solid var(--border);">
          <div style="font-weight: var(--fw-semibold); font-size: var(--fs-md);">
            {{ t('recipe_overview') }}
          </div>
        </div>

        <div v-if="loadingRecipe && !recipe" style="padding: var(--sp-5);">
          <div class="sk-box" style="height: 14px; width: 60%; margin-bottom: 12px; border-radius: 4px;" />
          <div class="sk-box" style="height: 14px; width: 40%; margin-bottom: 12px; border-radius: 4px;" />
          <div class="sk-box" style="height: 14px; width: 70%; border-radius: 4px;" />
        </div>

        <div v-else-if="recipe" class="recipe-overview-grid" style="padding: var(--sp-5); gap: var(--sp-4);">
          <div>
            <div class="cell-muted" style="font-size: var(--fs-sm); margin-bottom: 4px;">
              {{ t('recipe_code') }}
            </div>
            <div class="mono">
              {{ recipe.code || '—' }}
            </div>
          </div>
          <div>
            <div class="cell-muted" style="font-size: var(--fs-sm); margin-bottom: 4px;">
              {{ t('recipe_name') }}
            </div>
            <div style="font-weight: var(--fw-semibold);">
              {{ recipe.name }}
            </div>
          </div>
          <div>
            <div class="cell-muted" style="font-size: var(--fs-sm); margin-bottom: 4px;">
              {{ t('recipe_type') }}
            </div>
            <Badge :tone="recipeTypeTone(recipe.recipe_type)">
              {{ recipe.recipe_type_display ?? (recipe.recipe_type ? t(`recipe_type_${recipe.recipe_type}`) : '—') }}
            </Badge>
          </div>
          <div>
            <div class="cell-muted" style="font-size: var(--fs-sm); margin-bottom: 4px;">
              {{ t('recipe_version') }}
            </div>
            <div class="mono">
              {{ recipe.version ?? '—' }}
            </div>
          </div>
          <div>
            <div class="cell-muted" style="font-size: var(--fs-sm); margin-bottom: 4px;">
              {{ t('recipe_output_item') }}
            </div>
            <div>
              {{ recipe.output_item?.name ?? '—' }}
            </div>
          </div>
          <div>
            <div class="cell-muted" style="font-size: var(--fs-sm); margin-bottom: 4px;">
              {{ t('recipe_output_quantity') }}
            </div>
            <div class="mono">
              {{ fmtDecimal4(recipe.output_quantity) }}
              <span v-if="recipe.output_unit" class="cell-muted" style="margin-left: 4px;">
                {{ recipe.output_unit }}
              </span>
            </div>
          </div>
          <div>
            <div class="cell-muted" style="font-size: var(--fs-sm); margin-bottom: 4px;">
              {{ t('recipe_output_unit') }}
            </div>
            <div>
              {{ recipe.output_unit ?? '—' }}
            </div>
          </div>
          <div>
            <div class="cell-muted" style="font-size: var(--fs-sm); margin-bottom: 4px;">
              {{ t('recipe_yield_percentage') }}
            </div>
            <div class="mono">
              {{ recipe.yield_percentage != null ? fmtPercent(recipe.yield_percentage) : '—' }}
            </div>
          </div>
          <div>
            <div class="cell-muted" style="font-size: var(--fs-sm); margin-bottom: 4px;">
              {{ t('recipe_difficulty_level') }}
            </div>
            <div class="mono">
              {{ recipe.difficulty_level ?? '—' }}
            </div>
          </div>
          <div>
            <div class="cell-muted" style="font-size: var(--fs-sm); margin-bottom: 4px;">
              {{ t('recipe_production_location') }}
            </div>
            <div>
              {{ recipe.production_location_name ?? '—' }}
            </div>
          </div>
          <div>
            <div class="cell-muted" style="font-size: var(--fs-sm); margin-bottom: 4px;">
              {{ t('recipe_min_batch_size') }}
            </div>
            <div class="mono">
              {{ fmtDecimal4(recipe.min_batch_size) }}
            </div>
          </div>
          <div>
            <div class="cell-muted" style="font-size: var(--fs-sm); margin-bottom: 4px;">
              {{ t('recipe_max_batch_size') }}
            </div>
            <div class="mono">
              {{ fmtDecimal4(recipe.max_batch_size) }}
            </div>
          </div>
          <div>
            <div class="cell-muted" style="font-size: var(--fs-sm); margin-bottom: 4px;">
              {{ t('Status') }}
            </div>
            <Badge :tone="derivedStatusTone">
              {{ derivedStatus ? t(`recipe_status_${derivedStatus}`) : '—' }}
            </Badge>
          </div>
          <div>
            <div class="cell-muted" style="font-size: var(--fs-sm); margin-bottom: 4px;">
              {{ t('recipe_is_scalable') }}
            </div>
            <Badge :tone="recipe.is_scalable ? 'success' : 'neutral'">
              {{ recipe.is_scalable ? t('recipe_is_scalable') : '—' }}
            </Badge>
          </div>
          <div>
            <div class="cell-muted" style="font-size: var(--fs-sm); margin-bottom: 4px;">
              {{ t('recipe_approved_at') }}
            </div>
            <div class="mono cell-muted">
              {{ recipe.approved_at ? formatDate(recipe.approved_at) : '—' }}
            </div>
          </div>
          <div>
            <div class="cell-muted" style="font-size: var(--fs-sm); margin-bottom: 4px;">
              {{ t('recipe_created_at') }}
            </div>
            <div class="mono cell-muted">
              {{ recipe.created_at ? formatDate(recipe.created_at) : '—' }}
            </div>
          </div>
          <div>
            <div class="cell-muted" style="font-size: var(--fs-sm); margin-bottom: 4px;">
              {{ t('recipe_updated_at') }}
            </div>
            <div class="mono cell-muted">
              {{ recipe.updated_at ? formatDate(recipe.updated_at) : '—' }}
            </div>
          </div>
          <div class="span-3">
            <div class="cell-muted" style="font-size: var(--fs-sm); margin-bottom: 4px;">
              {{ t('recipe_instructions') }}
            </div>
            <div v-if="recipe.instructions" style="white-space: pre-wrap;">
              {{ recipe.instructions }}
            </div>
            <div v-else class="cell-muted">
              {{ t('recipe_no_instructions') }}
            </div>
          </div>
          <div class="span-3">
            <div class="cell-muted" style="font-size: var(--fs-sm); margin-bottom: 4px;">
              {{ t('recipe_notes') }}
            </div>
            <div v-if="recipe.notes" style="white-space: pre-wrap;">
              {{ recipe.notes }}
            </div>
            <div v-else class="cell-muted">
              {{ t('recipe_no_notes') }}
            </div>
          </div>
        </div>

        <div v-else style="padding: var(--sp-5);">
          <div class="sk-box" style="height: 14px; width: 60%; border-radius: 4px;" />
        </div>
      </div>

      <!-- Ingredients card -->
      <div class="card" style="margin-bottom: var(--sp-5);">
        <div class="toolbar recipe-toolbar" style="border-bottom: 1px solid var(--border);">
          <div style="font-weight: var(--fw-semibold); font-size: var(--fs-md); margin-right: auto;">
            {{ t('recipe_ingredients') }}
          </div>
          <Button
            variant="primary"
            icon="plus"
            :disabled="!recipe"
            @click="openAddIng"
          >
            {{ t('recipe_add_ingredient') }}
          </Button>
        </div>

        <div v-if="loadingRecipe && ingredients.length === 0" style="padding: var(--sp-4) var(--sp-5);">
          <div v-for="n in 4" :key="n" class="sk-box" style="height: 36px; margin-bottom: 8px; border-radius: 6px;" />
        </div>

        <div v-else-if="ingredients.length === 0" style="padding: var(--sp-4);">
          <StateFill
            icon="inbox"
            :title="t('recipe_no_ingredients')"
            :sub="t('recipe_no_ingredients_hint')"
          >
            <div style="margin-top: 12px;">
              <Button variant="primary" icon="plus" @click="openAddIng">
                {{ t('recipe_add_ingredient') }}
              </Button>
            </div>
          </StateFill>
        </div>

        <div v-else class="tablewrap">
          <table class="dtable">
            <thead>
              <tr>
                <th class="center">
                  {{ t('recipe_ingredient_sort_order') }}
                </th>
                <th>{{ t('recipe_ingredient_item') }}</th>
                <th class="num">
                  {{ t('recipe_ingredient_quantity') }}
                </th>
                <th class="center">
                  {{ t('recipe_ingredient_unit') }}
                </th>
                <th class="num">
                  {{ t('recipe_ingredient_waste_percentage') }}
                </th>
                <th class="center">
                  {{ t('recipe_ingredient_is_optional') }}
                </th>
                <th class="num">
                  {{ t('Actions') }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="ing in ingredients" :key="ing.id">
                <td class="center mono cell-muted">
                  {{ ing.sort_order ?? '—' }}
                </td>
                <td>
                  <div class="cell-strong">
                    {{ ing.stock_item?.name ?? '—' }}
                  </div>
                  <div class="cell-muted mono" style="font-size: var(--fs-sm);">
                    {{ ing.stock_item?.sku ?? '—' }}
                  </div>
                </td>
                <td class="num mono cell-strong">
                  {{ fmtDecimal4(ing.quantity) }}
                </td>
                <td class="center">
                  {{ ing.unit ?? '—' }}
                </td>
                <td class="num mono">
                  {{ fmtPercent(ing.waste_percentage) }}
                </td>
                <td class="center">
                  <Badge :tone="ing.is_optional ? 'warning' : 'neutral'">
                    {{ ing.is_optional ? t('recipe_ingredient_is_optional') : '—' }}
                  </Badge>
                </td>
                <td class="num">
                  <div class="row-actions" @click.stop>
                    <IconAction
                      icon="pencil"
                      :title="t('recipe_edit_ingredient')"
                      @click="openEditIng(ing)"
                    />
                    <IconAction
                      icon="trash"
                      tone="danger"
                      :title="t('recipe_remove_ingredient')"
                      @click="openRemoveIng(ing)"
                    />
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Batch multiplier toolbar (shared by availability + cost) -->
      <div class="card" style="margin-bottom: var(--sp-5);">
        <WorkspaceToolbar class="toolbar recipe-bm-toolbar" style="gap: var(--sp-3); align-items: center; flex-wrap: wrap;">
          <div style="font-weight: var(--fw-semibold); font-size: var(--fs-md);">
            {{ t('recipe_batch_multiplier') }}
          </div>
          <div class="recipe-bm-input">
            <Input
              :model-value="String(batchMultiplier)"
              type="number"
              min="0.01"
              step="0.25"
              @update:model-value="(v: string) => onBatchMultiplierInput(v)"
            />
          </div>
          <Button
            variant="secondary"
            icon="refresh"
            :loading="loadingAvail || loadingCost"
            :disabled="loadingAvail || loadingCost"
            @click="() => { loadAvailability(); loadCost() }"
          >
            {{ t('recipe_recalculate') }}
          </Button>
          <div class="recipe-bm-summary">
            <Badge :tone="availabilitySummaryTone" dot>
              {{ t(availabilitySummaryKey) }}
            </Badge>
          </div>
        </WorkspaceToolbar>
      </div>

      <!-- Availability card -->
      <div class="card" style="margin-bottom: var(--sp-5);">
        <div class="toolbar recipe-toolbar" style="border-bottom: 1px solid var(--border);">
          <div style="font-weight: var(--fw-semibold); font-size: var(--fs-md); margin-right: auto;">
            {{ t('recipe_availability') }}
          </div>
          <Button
            variant="ghost"
            icon="check"
            :loading="loadingAvail"
            :disabled="loadingAvail"
            @click="loadAvailability"
          >
            {{ t('recipe_action_check_availability') }}
          </Button>
        </div>

        <div v-if="loadingAvail && availability.length === 0" style="padding: var(--sp-4) var(--sp-5);">
          <div v-for="n in 3" :key="n" class="sk-box" style="height: 36px; margin-bottom: 8px; border-radius: 6px;" />
        </div>

        <div v-else-if="availability.length === 0" style="padding: var(--sp-4);">
          <StateFill
            icon="package"
            :title="t('recipe_no_ingredients')"
          />
        </div>

        <div v-else class="tablewrap">
          <table class="dtable">
            <thead>
              <tr>
                <th>{{ t('recipe_ingredient_item') }}</th>
                <th class="num">
                  {{ t('recipe_availability_required') }}
                </th>
                <th class="num">
                  {{ t('recipe_availability_in_stock') }}
                </th>
                <th class="num">
                  {{ t('recipe_availability_shortage') }}
                </th>
                <th class="center">
                  {{ t('recipe_ingredient_unit') }}
                </th>
                <th class="center">
                  {{ t('Status') }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in availability" :key="row.stock_item_id">
                <td class="cell-strong">
                  {{ row.stock_item_name ?? '—' }}
                </td>
                <td class="num mono">
                  {{ fmtDecimal4(row.required_quantity) }}
                </td>
                <td class="num mono">
                  {{ fmtDecimal4(row.available_stock) }}
                </td>
                <td class="num mono">
                  {{ fmtDecimal4(Math.max(0, Number(row.required_quantity || 0) - Number(row.available_stock || 0))) }}
                </td>
                <td class="center">
                  {{ row.unit ?? '—' }}
                </td>
                <td class="center">
                  <Badge :tone="row.is_available ? 'success' : 'error'" dot>
                    {{ t(row.is_available ? 'recipe_availability_available' : 'recipe_availability_unavailable') }}
                  </Badge>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Cost breakdown card -->
      <div class="card">
        <div class="toolbar recipe-toolbar" style="border-bottom: 1px solid var(--border);">
          <div style="font-weight: var(--fw-semibold); font-size: var(--fs-md); margin-right: auto;">
            {{ t('recipe_cost_breakdown') }}
          </div>
          <Button
            variant="ghost"
            icon="refresh"
            :loading="loadingCost"
            :disabled="loadingCost"
            @click="loadCost"
          >
            {{ t('recipe_action_recalc_cost') }}
          </Button>
        </div>

        <div v-if="loadingCost && costLines.length === 0" style="padding: var(--sp-4) var(--sp-5);">
          <div v-for="n in 3" :key="n" class="sk-box" style="height: 36px; margin-bottom: 8px; border-radius: 6px;" />
        </div>

        <div v-else-if="costLines.length === 0" style="padding: var(--sp-4);">
          <StateFill
            icon="dollar"
            :title="t('recipe_no_ingredients')"
          />
        </div>

        <div v-else class="tablewrap">
          <table class="dtable">
            <thead>
              <tr>
                <th>{{ t('recipe_cost_line_item') }}</th>
                <th class="num">
                  {{ t('recipe_cost_line_qty') }}
                </th>
                <th class="num">
                  {{ t('recipe_cost_line_unit_cost') }}
                </th>
                <th class="num">
                  {{ t('recipe_cost_line_subtotal') }}
                </th>
                <th class="num">
                  {{ t('recipe_cost_line_share') }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="line in costLines" :key="line.id">
                <td class="cell-strong">
                  {{ line.name }}
                </td>
                <td class="num mono">
                  {{ fmtDecimal4(line.scaled_quantity) }}
                </td>
                <td class="num mono">
                  {{ fmtMoney(line.unit_cost) }}
                </td>
                <td class="num mono cell-strong">
                  {{ fmtMoney(line.subtotal) }}
                </td>
                <td class="num mono">
                  {{ fmtPercent(line.share) }}
                </td>
              </tr>
              <tr v-if="totalCost !== null">
                <td class="cell-strong">
                  {{ t('recipe_total_cost') }}
                </td>
                <td class="num" />
                <td class="num" />
                <td class="num mono cell-strong">
                  {{ fmtMoney(totalCost) }}
                </td>
                <td class="num mono cell-muted">
                  {{ t('recipe_cost_share_total') }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <!-- Edit recipe meta modal -->
    <Modal
      :open="editOpen"
      :title="t('recipe_action_edit')"
      width="min(720px, 100vw)"
      @close="editOpen = false"
      @update:open="(v: boolean) => editOpen = v"
    >
      <div class="form-grid">
        <Field :label="t('recipe_name')" :error="editErrors.name" class="span-2">
          <Input v-model="editForm.name" />
        </Field>
        <Field :label="t('recipe_difficulty_level')">
          <Input v-model="editForm.difficulty_level" type="number" min="1" max="5" step="1" />
        </Field>
        <Field :label="t('recipe_estimated_time')" :hint="t('recipe_estimated_time_minutes')">
          <Input v-model="editForm.estimated_time_minutes" type="number" min="0" step="1" />
        </Field>
        <Field :label="t('recipe_production_location')" class="span-2">
          <Select
            v-model="editForm.production_location_id"
            :options="locationOptions"
            :placeholder="t('recipe_production_location')"
          />
        </Field>
        <Field :label="t('recipe_min_batch_size')">
          <Input v-model="editForm.min_batch_size" type="number" min="0" step="0.0001" />
        </Field>
        <Field :label="t('recipe_max_batch_size')">
          <Input v-model="editForm.max_batch_size" type="number" min="0" step="0.0001" />
        </Field>
        <Field :label="t('recipe_instructions')" class="span-2">
          <Textarea
            v-model="editForm.instructions"
            class="control"
            rows="5"
            style="resize: vertical; min-height: 120px; padding: 8px 12px;"
          />
        </Field>
        <Field :label="t('recipe_notes')" class="span-2">
          <Textarea
            v-model="editForm.notes"
            class="control"
            rows="3"
            style="resize: vertical; min-height: 80px; padding: 8px 12px;"
          />
        </Field>
        <label class="row" style="gap: 10px;">
          <Switch v-model="editForm.is_scalable" />
          <span>{{ t('recipe_is_scalable') }}</span>
        </label>
      </div>

      <template #footer>
        <Button variant="ghost" @click="editOpen = false">
          {{ t('recipe_cancel') }}
        </Button>
        <Button variant="primary" :loading="saving" @click="saveEdit">
          {{ t('recipe_save_changes') }}
        </Button>
      </template>
    </Modal>

    <!-- Deactivate confirm modal -->
    <Modal
      :open="deleteOpen"
      :title="t('recipe_action_delete_confirm')"
      :width="480"
      @close="deleteOpen = false"
      @update:open="(v: boolean) => deleteOpen = v"
    >
      <p style="margin: 0; color: var(--text-secondary);">
        <strong style="color: var(--text);">{{ recipe?.name }}</strong>
      </p>

      <template #footer>
        <Button variant="ghost" @click="deleteOpen = false">
          {{ t('recipe_cancel') }}
        </Button>
        <Button variant="danger" :loading="deleting" @click="confirmDelete">
          {{ t('recipe_action_delete') }}
        </Button>
      </template>
    </Modal>

    <!-- Add ingredient modal -->
    <Modal
      :open="addIngOpen"
      :title="t('recipe_add_ingredient')"
      width="min(640px, 100vw)"
      @close="addIngOpen = false"
      @update:open="(v: boolean) => addIngOpen = v"
    >
      <div class="form-grid">
        <Field :label="t('recipe_ingredient_item')" :error="ingErrors.stock_item_id" class="span-2">
          <Select
            v-model="ingForm.stock_item_id"
            :options="itemOptions"
            :placeholder="t('recipe_drill_pick_item')"
          />
        </Field>
        <Field :label="t('recipe_ingredient_quantity')" :error="ingErrors.quantity">
          <Input v-model="ingForm.quantity" type="number" min="0.0001" step="0.0001" />
        </Field>
        <Field :label="t('recipe_ingredient_unit')" :error="ingErrors.unit_id">
          <Select
            v-model="ingForm.unit_id"
            :options="unitOptions"
            :placeholder="t('recipe_drill_pick_unit')"
          />
        </Field>
        <Field :label="t('recipe_ingredient_waste_percentage')">
          <Input v-model="ingForm.waste_percentage" type="number" min="0" max="100" step="0.1" />
        </Field>
        <Field :label="t('recipe_ingredient_sort_order')" :hint="t('recipe_ingredient_sort_order_hint')">
          <Input v-model="ingForm.sort_order" type="number" min="0" step="1" />
        </Field>
        <Field :label="t('recipe_ingredient_substitute_group')" class="span-2">
          <Input v-model="ingForm.substitute_group" />
        </Field>
        <Field :label="t('recipe_ingredient_prep_instructions')" class="span-2">
          <Textarea
            v-model="ingForm.prep_instructions"
            class="control"
            rows="3"
            style="resize: vertical; min-height: 80px; padding: 8px 12px;"
          />
        </Field>
        <label class="row" style="gap: 10px;">
          <Switch v-model="ingForm.is_optional" />
          <span>{{ t('recipe_ingredient_is_optional') }}</span>
        </label>
        <label class="row" style="gap: 10px;">
          <Switch v-model="ingForm.is_scalable" />
          <span>{{ t('recipe_ingredient_is_scalable') }}</span>
        </label>
      </div>

      <template #footer>
        <Button variant="ghost" @click="addIngOpen = false">
          {{ t('recipe_cancel') }}
        </Button>
        <Button variant="primary" :loading="ingSaving" @click="submitAddIng">
          {{ t('recipe_save_changes') }}
        </Button>
      </template>
    </Modal>

    <!-- Edit ingredient modal -->
    <Modal
      :open="editIngOpen"
      :title="t('recipe_edit_ingredient')"
      width="min(640px, 100vw)"
      @close="editIngOpen = false"
      @update:open="(v: boolean) => editIngOpen = v"
    >
      <div class="form-grid">
        <Field :label="t('recipe_ingredient_item')" :error="ingErrors.stock_item_id" class="span-2">
          <Select
            v-model="ingForm.stock_item_id"
            :options="itemOptions"
            :placeholder="t('recipe_drill_pick_item')"
          />
        </Field>
        <Field :label="t('recipe_ingredient_quantity')" :error="ingErrors.quantity">
          <Input v-model="ingForm.quantity" type="number" min="0.0001" step="0.0001" />
        </Field>
        <Field :label="t('recipe_ingredient_unit')" :error="ingErrors.unit_id">
          <Select
            v-model="ingForm.unit_id"
            :options="unitOptions"
            :placeholder="t('recipe_drill_pick_unit')"
          />
        </Field>
        <Field :label="t('recipe_ingredient_waste_percentage')">
          <Input v-model="ingForm.waste_percentage" type="number" min="0" max="100" step="0.1" />
        </Field>
        <Field :label="t('recipe_ingredient_sort_order')">
          <Input v-model="ingForm.sort_order" type="number" min="0" step="1" />
        </Field>
        <Field :label="t('recipe_ingredient_substitute_group')" class="span-2">
          <Input v-model="ingForm.substitute_group" />
        </Field>
        <Field :label="t('recipe_ingredient_prep_instructions')" class="span-2">
          <Textarea
            v-model="ingForm.prep_instructions"
            class="control"
            rows="3"
            style="resize: vertical; min-height: 80px; padding: 8px 12px;"
          />
        </Field>
        <label class="row" style="gap: 10px;">
          <Switch v-model="ingForm.is_optional" />
          <span>{{ t('recipe_ingredient_is_optional') }}</span>
        </label>
        <label class="row" style="gap: 10px;">
          <Switch v-model="ingForm.is_scalable" />
          <span>{{ t('recipe_ingredient_is_scalable') }}</span>
        </label>
      </div>

      <template #footer>
        <Button variant="ghost" @click="editIngOpen = false">
          {{ t('recipe_cancel') }}
        </Button>
        <Button variant="primary" :loading="ingSaving" @click="submitEditIng">
          {{ t('recipe_save_changes') }}
        </Button>
      </template>
    </Modal>

    <!-- Remove ingredient confirm modal -->
    <Modal
      :open="removeIngOpen"
      :title="t('recipe_remove_ingredient_confirm')"
      :width="440"
      @close="removeIngOpen = false"
      @update:open="(v: boolean) => removeIngOpen = v"
    >
      <p v-if="selectedIng" style="margin: 0; color: var(--text-secondary);">
        <strong style="color: var(--text);">
          {{ selectedIng.stock_item?.name ?? '—' }}
        </strong>
      </p>

      <template #footer>
        <Button variant="ghost" @click="removeIngOpen = false">
          {{ t('recipe_cancel') }}
        </Button>
        <Button variant="danger" :loading="ingDeleting" @click="confirmRemoveIng">
          {{ t('recipe_remove') }}
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

.recipe-kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--sp-4);
}

.recipe-overview-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.recipe-overview-grid .span-3 {
  grid-column: span 3;
}

.recipe-bm-input {
  inline-size: 160px;
  max-inline-size: 100%;
}

.recipe-toolbar {
  flex-wrap: wrap;
}

.recipe-bm-summary {
  margin-left: auto;
}

@media (max-width: 1100px) {
  .recipe-kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  .recipe-overview-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .recipe-overview-grid .span-3 {
    grid-column: span 2;
  }
}

@media (max-width: 768px) {
  .recipe-bm-input {
    inline-size: 100%;
    flex: 1 1 100%;
  }

  .recipe-bm-summary {
    margin-left: 0;
    flex: 1 1 100%;
  }

  .recipe-toolbar > * {
    min-width: 0;
  }
}

@media (max-width: 600px) {
  .recipe-overview-grid {
    grid-template-columns: 1fr;
  }

  .recipe-overview-grid .span-3 {
    grid-column: span 1;
  }
}

@media (max-width: 420px) {
  .recipe-kpis {
    grid-template-columns: 1fr;
  }
}
</style>

<route lang="yaml">
meta:
  action: manage
  subject: all
</route>
