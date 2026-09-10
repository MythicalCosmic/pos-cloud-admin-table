<script setup lang="ts">
import { useActionDialog } from '@/composables/useActionDialog'
import { fmtNum } from '@/components/design/utils/format'
import Input from '@/components/design/Input.vue'
import PageHeader from '@/components/design/PageHeader.vue'
import FormSelect from '@/components/design/FormSelect.vue'
import axios from '@/plugins/axios'
import { useTableSelection } from '@/composables/useTableSelection'
import BulkActionBar from '@/components/design/BulkActionBar.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import Checkbox from '@/components/design/Checkbox.vue'
import Kpi from '@/components/design/Kpi.vue'
import Select from '@/components/design/Select.vue'

const { confirmAction } = useActionDialog()
const { t } = useI18n({ useScope: 'global' })

// ---- state ----
const products = ref<any[]>([])
const totalProducts = ref(0)
const loading = ref(false)
const bulkBusy = ref(false)

// Catalog-wide counters for the KPI strip (GET /products/stats).
// Loaded once on mount and refreshed after any mutation so the numbers
// never drift from what the table shows.
const stats = ref<{ total_products?: number; deleted_products?: number } | null>(null)

// Bulk selection — uses the current visible product ID list so Shift-click
// range selection respects sort/filter, not raw data order.
const selection = useTableSelection<number>(() => products.value.map(p => p.id))

const page = ref(1)
const itemsPerPage = ref(10)
const search = ref('')
const categoryFilterMulti = ref<number[]>([])
const sortBy = ref<string>('')
const includeDeleted = ref(false)
const popularFirst = ref(true)

const sortOptions = computed(() => [
  { value: '', title: t('product_sort_default') },
  { value: 'name', title: t('product_sort_name_asc') },
  { value: '-name', title: t('product_sort_name_desc') },
  { value: 'price', title: t('product_sort_price_asc') },
  { value: '-price', title: t('product_sort_price_desc') },
  { value: '-created_at', title: t('product_sort_created_desc') },
  { value: 'created_at', title: t('product_sort_created_asc') },
])

const categoriesList = ref<any[]>([])

const categoryOptions = computed(() =>
  categoriesList.value.map((c: any) => ({ title: c.name, value: c.id })),
)

// id → hex color lookup for categories
const categoryColorMap = computed(() => {
  const map: Record<number, string> = {}
  for (const c of categoriesList.value) {
    if (c.colors?.[0])
      map[c.id] = c.colors[0]
  }

  return map
})

// Dialog
const dialogOpen = ref(false)
const editingProduct = ref<any>(null)
const dialogLoading = ref(false)

// Confirm delete
const deleteDialog = ref(false)
const deletingProduct = ref<any>(null)
const deleteBusy = ref(false)

const { snackbar, snackbarMsg, snackbarColor, notify } = useNotify()

// Form
const form = ref({
  name: '',
  description: '',
  price: 0,
  category_id: null as number | null,
  color: '',
  is_instant: false,
})

// Price input display (formatted with NBSP grouping)
const priceDisplay = ref('')

function fmtPrice(n: number): string {
  if (!n)
    return ''
  return fmtNum(Math.trunc(n))
}

function onPriceInput(e: Event) {
  const input = e.target as HTMLInputElement
  const cleaned = input.value.replace(/\D/g, '')
  const num = Number(cleaned) || 0

  form.value.price = num
  priceDisplay.value = cleaned === '' ? '' : fmtPrice(num)
  nextTick(() => {
    input.value = priceDisplay.value
  })
}

// Characteristic colors
const characteristicColors = computed(() => [
  { hex: '#E53935', key: 'Spicy', label: t('Spicy') },
  { hex: '#FDD835', key: 'Cheese', label: t('Cheese') },
  { hex: '#43A047', key: 'Jalapeño', label: t('Jalapeño') },
  { hex: '#8D6E63', key: 'Grilled', label: t('Grilled') },
  { hex: '#1E88E5', key: 'Seafood', label: t('Seafood') },
  { hex: '#EC407A', key: 'Sweet', label: t('Sweet') },
  { hex: '#FB8C00', key: 'Chicken', label: t('Chicken') },
  { hex: '#00ACC1', key: 'Cold', label: t('Cold') },
  { hex: '#7CB342', key: 'Vegetarian', label: t('Vegetarian') },
  { hex: '#8E24AA', key: 'Premium', label: t('Premium') },
])

// Preview: selected category color
const previewColor = computed(() => {
  if (!form.value.category_id)
    return '#9e9e9e'

  return categoryColorMap.value[form.value.category_id] || '#9e9e9e'
})

const { formatCurrency, formatDateShort: formatDate } = useFormatters()

// ---- KPI strip ----
async function loadStats() {
  try {
    const res = await axios.get('/products/stats')

    stats.value = res.data?.data ?? res.data ?? null
  }
  catch { /* KPI strip is non-critical — silently degrade */ }
}

const kpiTotal = computed(() => ({
  label: t('products_kpi_active'),
  value: stats.value ? (stats.value.total_products ?? null) : null,
  icon: 'package',
  tone: 'primary' as const,
  sub: t('Products'),
}))

const kpiCategories = computed(() => ({
  label: t('Categories'),
  value: categoriesList.value.length ? categoriesList.value.length : null,
  icon: 'tag',
  tone: 'info' as const,
}))

const kpiDeleted = computed(() => ({
  label: t('Deleted'),
  value: stats.value ? (stats.value.deleted_products ?? null) : null,
  icon: 'trash',
  tone: 'warning' as const,
  sub: t('products_kpi_deleted_hint'),
}))

// ---- load ----
let productsRequestId = 0

async function loadProducts() {
  const requestId = ++productsRequestId

  loading.value = true
  try {
    const params: any = { page: page.value, per_page: itemsPerPage.value }
    if (search.value)
      params.search = search.value
    if (categoryFilterMulti.value.length > 0)
      params.category_ids = categoryFilterMulti.value.join(',')
    if (sortBy.value)
      params.order_by = sortBy.value
    if (includeDeleted.value)
      params.include_deleted = true

    // Popular-first is a separate backend ordering. It must be disabled for an
    // explicit A–Z, price, or date sort; otherwise the backend uses popularity
    // and only uses order_by as a tie-breaker, which made this control appear
    // broken.
    if (!popularFirst.value || sortBy.value)
      params.popular = false

    const res = await axios.get('/products', { params })
    const d = res.data?.data
    if (requestId !== productsRequestId)
      return

    products.value = d?.products ?? []
    totalProducts.value = d?.pagination?.total_products ?? products.value.length
  }
  catch {
    if (requestId !== productsRequestId)
      return
    products.value = []
    totalProducts.value = 0
    notify(t('Failed to load products'), 'error')
  }
  finally {
    if (requestId === productsRequestId)
      loading.value = false
  }
}

async function loadCategories() {
  try {
    const res = await axios.get('/categories', { params: { per_page: 100 } })

    categoriesList.value = res.data?.data?.categories ?? []
  }
  catch { /* ignore */ }
}

onMounted(() => {
  loadProducts()
  loadCategories()
  loadStats()
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})

// Escape closes whichever modal is open (dirty-guard still applies to the
// edit dialog; the delete confirm only closes when it isn't mid-request).
function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape')
    return
  if (deleteDialog.value && !deleteBusy.value)
    deleteDialog.value = false
  else if (dialogOpen.value)
    tryCloseDialog()
}

watch(page, () => { selection.clear(); loadProducts() })
watch(itemsPerPage, () => {
  selection.clear()
  if (page.value !== 1)
    page.value = 1
  else
    loadProducts()
})

const debouncedSearch = useDebounceFn(() => {
  selection.clear()
  if (page.value !== 1)
    page.value = 1
  else
    loadProducts()
}, 400)

watch(search, debouncedSearch)

watch(categoryFilterMulti, () => {
  selection.clear()
  if (page.value !== 1)
    page.value = 1
  else
    loadProducts()
}, { deep: true })

watch(sortBy, () => {
  if (sortBy.value)
    popularFirst.value = false
  if (page.value !== 1)
    page.value = 1
  else
    loadProducts()
})

watch(includeDeleted, () => {
  if (page.value !== 1)
    page.value = 1
  else
    loadProducts()
})

watch(popularFirst, () => {
  if (page.value !== 1)
    page.value = 1
  else
    loadProducts()
})

function togglePopularFirst() {
  popularFirst.value = !popularFirst.value
  if (popularFirst.value)
    sortBy.value = ''
}

// ---- dirty tracking ----
const initialForm = ref({ name: '', description: '', price: 0, category_id: null as number | null, color: '' })
const isDirty = computed(() => JSON.stringify(form.value) !== JSON.stringify(initialForm.value))

function tryCloseDialog() {
  if (isDirty.value) {
    notify(t('Unsaved changes! Use the close button to discard.'), 'warning')

    return
  }
  dialogOpen.value = false
}

// The explicit close button discards the draft.
function forceClose() {
  dialogOpen.value = false
}

// ---- CRUD ----
function openCreate() {
  editingProduct.value = null
  form.value = { name: '', description: '', price: 0, category_id: null, color: '', is_instant: false }
  initialForm.value = { ...form.value }
  priceDisplay.value = ''
  dialogOpen.value = true
}

function openEdit(product: any) {
  editingProduct.value = product
  form.value = {
    name: product.name ?? '',
    description: product.description ?? '',
    price: product.price ?? 0,
    category_id: product.category?.id ?? product.category_id ?? null,
    color: product.colors?.[0] ?? '',
    is_instant: product.is_instant ?? false,
  }
  initialForm.value = { ...form.value }
  priceDisplay.value = fmtPrice(form.value.price)
  dialogOpen.value = true
}

async function saveProduct() {
  dialogLoading.value = true
  try {
    const payload = {
      name: form.value.name,
      description: form.value.description,
      price: form.value.price,
      category_id: form.value.category_id,
      colors: form.value.color ? [form.value.color] : [],
      is_instant: form.value.is_instant,
    }

    if (editingProduct.value) {
      await axios.patch(`/products/${editingProduct.value.id}`, payload)
      notify(t('Product updated'))
    }
    else {
      await axios.post('/products', payload)
      notify(t('Product created'))
    }
    dialogOpen.value = false
    await loadProducts()
    loadStats()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error saving product'), 'error')
  }
  finally {
    dialogLoading.value = false
  }
}

const deleteConfirmBtn = ref<HTMLButtonElement | null>(null)

function confirmDelete(product: any) {
  deletingProduct.value = product
  deleteDialog.value = true
  nextTick(() => {
    deleteConfirmBtn.value?.focus()
  })
}

async function restoreProduct(product: any) {
  try {
    await axios.post(`/products/${product.id}/restore`)
    notify(t('Product restored'))
    await loadProducts()
    loadStats()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error restoring product'), 'error')
  }
}

async function deleteProduct() {
  if (!deletingProduct.value)
    return
  deleteBusy.value = true
  try {
    await axios.delete(`/products/${deletingProduct.value.id}`)
    notify(t('Product deleted'))
    deleteDialog.value = false
    await loadProducts()
    loadStats()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error deleting product'), 'error')
  }
  finally {
    deleteBusy.value = false
  }
}

// ---- Bulk actions (BulkActionBar) ----
async function bulkDelete() {
  if (bulkBusy.value)
    return
  const ids = Array.from(selection.selected.value)
  if (!ids.length)
    return
  if (!await confirmAction({ title: t('Delete {n} products?', { n: ids.length }), confirmLabel: t('Delete'), danger: true }))
    return
  bulkBusy.value = true
  try {
    await axios.post('/products/bulk-delete', { ids })
    selection.clear()
    await loadProducts()
    loadStats()

    // Sonner undo toast — one click restores the deleted IDs via bulk-restore.
    const { toast: sonner } = await import('vue-sonner')

    sonner.success(t('Deleted {n} products', { n: ids.length }), {
      duration: 7000,
      action: {
        label: t('Undo'),
        onClick: async () => {
          try {
            await axios.post('/products/bulk-restore', { ids })
            notify(t('Restored {n} products', { n: ids.length }))
            await loadProducts()
            loadStats()
          }
          catch (e: any) {
            notify(e?.response?.data?.message ?? t('Error restoring products'), 'error')
          }
        },
      },
    })
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error deleting products'), 'error')
  }
  finally {
    bulkBusy.value = false
  }
}

async function bulkRestore() {
  const ids = Array.from(selection.selected.value)
  if (!ids.length)
    return
  bulkBusy.value = true
  try {
    await axios.post('/products/bulk-restore', { ids })
    notify(t('Restored {n} products', { n: ids.length }))
    selection.clear()
    await loadProducts()
    loadStats()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error restoring products'), 'error')
  }
  finally {
    bulkBusy.value = false
  }
}

// ---- Active filter chips ----
const activeFilters = computed(() => {
  const list: { k: string; label: string; val: string; clear: () => void }[] = []
  if (search.value)
    list.push({ k: 'q', label: t('Search'), val: search.value, clear: () => { search.value = '' } })
  if (categoryFilterMulti.value.length > 0) {
    const names = categoryFilterMulti.value
      .map((id: number) => categoriesList.value.find((c: any) => c.id === id)?.name ?? String(id))
      .join(', ')

    list.push({
      k: 'cm',
      label: t('Categories'),
      val: names,
      clear: () => { categoryFilterMulti.value = [] },
    })
  }
  if (sortBy.value) {
    const opt = sortOptions.value.find((s: any) => s.value === sortBy.value)

    list.push({
      k: 'sort',
      label: t('Sort by'),
      val: opt?.title ?? sortBy.value,
      clear: () => { sortBy.value = '' },
    })
  }
  if (includeDeleted.value) {
    list.push({
      k: 'inc-del',
      label: t('Include deleted'),
      val: t('On'),
      clear: () => { includeDeleted.value = false },
    })
  }
  if (!popularFirst.value) {
    list.push({
      k: 'pop',
      label: t('Popular first'),
      val: t('Off'),
      clear: () => { popularFirst.value = true },
    })
  }
  return list
})

function clearAll() {
  search.value = ''
  categoryFilterMulti.value = []
  sortBy.value = ''
  includeDeleted.value = false
  popularFirst.value = true
}

// ---- Pagination ----
const totalPages = computed(() => Math.max(1, Math.ceil(totalProducts.value / itemsPerPage.value)))
const pageStart = computed(() => totalProducts.value === 0 ? 0 : (page.value - 1) * itemsPerPage.value + 1)
const pageEnd = computed(() => Math.min(totalProducts.value, page.value * itemsPerPage.value))

const pageList = computed<(number | '…')[]>(() => {
  const tp = totalPages.value
  const cp = page.value
  const arr: (number | '…')[] = []
  if (tp <= 7) {
    for (let i = 1; i <= tp; i++) arr.push(i)
    return arr
  }
  const add = (n: number | '…') => arr.push(n)

  add(1)
  if (cp > 4)
    add('…')
  const start = Math.max(2, cp - 1)
  const end = Math.min(tp - 1, cp + 1)
  for (let i = start; i <= end; i++) add(i)
  if (cp < tp - 3)
    add('…')
  add(tp)
  return arr
})

function goPage(p: number | '…') {
  if (p === '…' || p === page.value || p < 1 || p > totalPages.value)
    return
  page.value = p
}
</script>

<template>
  <div class="page">
    <!-- ============== HEAD ============== -->
    <PageHeader
      :title="t('Products')"
      :subtitle="t('Catalog of products served at the POS')"
    >
      <template #actions>
        <button
          class="btn btn--primary"
          @click="openCreate"
        >
          <svg
            class="ic"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <line
              x1="12"
              y1="5"
              x2="12"
              y2="19"
            />
            <line
              x1="5"
              y1="12"
              x2="19"
              y2="12"
            />
          </svg>
          {{ t('Add Product') }}
        </button>
      </template>
    </PageHeader>

    <!-- ============== KPI STRIP ============== -->
    <div
      class="grid cols-3 products-kpis"
      style="margin-bottom: var(--sp-5);"
    >
      <Kpi :data="kpiTotal" />
      <Kpi :data="kpiCategories" />
      <!-- Deleted KPI doubles as a shortcut: click to surface soft-deleted rows -->
      <div
        class="products-kpi-click"
        :class="{ 'is-active': includeDeleted }"
        role="button"
        tabindex="0"
        :title="t('products_kpi_deleted_hint')"
        @click="includeDeleted = !includeDeleted"
        @keydown.enter.prevent="includeDeleted = !includeDeleted"
        @keydown.space.prevent="includeDeleted = !includeDeleted"
      >
        <Kpi :data="kpiDeleted" />
      </div>
    </div>

    <!-- ============== CARD ============== -->
    <div class="card">
      <!-- Toolbar -->
      <div
        class="toolbar products-toolbar"
        style="flex-wrap:wrap;"
      >
        <div
          class="grow products-toolbar__search"
          style="max-width:280px;"
        >
          <Input
            v-model="search"
            icon="search"
            type="text"
            :placeholder="t('Search')"
          />
        </div>

        <div
          class="products-toolbar__select"
          style="width:220px;"
        >
          <Select
            v-model="sortBy"
            icon="filter"
            :placeholder="t('Sort')"
            :options="sortOptions.map(opt => ({ value: opt.value, label: opt.title }))"
          />
        </div>

        <div
          class="products-toolbar__select"
          style="min-width:200px;"
        >
          <FormSelect
            v-model="categoryFilterMulti"
            :items="categoryOptions"
            item-title="title"
            item-value="value"
            :label="t('Filter by multiple categories')"
            multiple
            chips
            closable-chips
            hide-details
            density="compact"
            variant="outlined"
          />
        </div>

        <div
          class="row"
          style="gap:8px;cursor:pointer;align-items:center;"
          :title="t('Show soft-deleted products')"
          @click="includeDeleted = !includeDeleted"
        >
          <div
            class="switch"
            :class="{ 'is-on': includeDeleted }"
          />
          <span style="font-size:13px;">{{ t('Include deleted') }}</span>
        </div>

        <div
          class="row"
          style="gap:8px;cursor:pointer;align-items:center;"
          :title="t('Order best-sellers first')"
          @click="togglePopularFirst"
        >
          <div
            class="switch"
            :class="{ 'is-on': popularFirst }"
          />
          <span style="font-size:13px;">{{ t('Popular first') }}</span>
        </div>
      </div>

      <!-- Active filter chips -->
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
              <svg
                viewBox="0 0 24 24"
                width="13"
                height="13"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <line
                  x1="18"
                  y1="6"
                  x2="6"
                  y2="18"
                />
                <line
                  x1="6"
                  y1="6"
                  x2="18"
                  y2="18"
                />
              </svg>
            </button>
          </span>
          <button
            class="chip--clear"
            @click="clearAll"
          >
            {{ t('Clear all') }}
          </button>
        </div>
      </div>

      <div class="card__divider" />

      <!-- Table -->
      <div class="tablewrap">
        <table class="dtable">
          <thead>
            <tr>
              <th style="width: 28px; text-align: center;">
                <Checkbox
                  :model-value="selection.allSelected.value"
                  :indeterminate="selection.someSelected.value"
                  @update:model-value="(v: boolean) => (v ? selection.selectAll() : selection.clear())"
                />
              </th>
              <th style="width:80px;">
                {{ t('ID') }}
              </th>
              <th>{{ t('Name') }}</th>
              <th>{{ t('Price') }}</th>
              <th>{{ t('Category') }}</th>
              <th>{{ t('Created') }}</th>
              <th>{{ t('Updated') }}</th>
              <th class="num">
                {{ t('Actions') }}
              </th>
            </tr>
          </thead>
          <tbody>
            <!-- Skeleton rows -->
            <template v-if="loading && products.length === 0">
              <tr
                v-for="n in itemsPerPage"
                :key="`sk-${n}`"
              >
                <td style="text-align: center;">
                  <div
                    class="skel"
                    style="width:14px;height:14px;border-radius:3px;margin:0 auto;"
                  />
                </td>
                <td>
                  <div
                    class="skel"
                    style="width:30px;height:13px;"
                  />
                </td>
                <td>
                  <div
                    class="row"
                    style="gap:8px;"
                  >
                    <div
                      class="skel"
                      style="width:10px;height:10px;border-radius:50%;flex:0 0 10px;"
                    />
                    <div
                      class="skel"
                      style="width:140px;height:13px;"
                    />
                  </div>
                </td>
                <td>
                  <div
                    class="skel"
                    style="width:80px;height:13px;"
                  />
                </td>
                <td>
                  <div
                    class="skel"
                    style="width:90px;height:22px;border-radius:12px;"
                  />
                </td>
                <td>
                  <div
                    class="skel"
                    style="width:90px;height:13px;"
                  />
                </td>
                <td>
                  <div
                    class="skel"
                    style="width:90px;height:13px;"
                  />
                </td>
                <td>
                  <div
                    class="row"
                    style="justify-content:flex-end;gap:4px;"
                  >
                    <div
                      class="skel"
                      style="width:28px;height:28px;border-radius:50%;"
                    />
                    <div
                      class="skel"
                      style="width:28px;height:28px;border-radius:50%;"
                    />
                  </div>
                </td>
              </tr>
            </template>

            <!-- Empty -->
            <tr v-else-if="!loading && products.length === 0">
              <td
                colspan="8"
                style="padding:0;"
              >
                <div class="statefill">
                  <div class="statefill__icon">
                    <svg
                      viewBox="0 0 24 24"
                      width="24"
                      height="24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
                      <line
                        x1="3"
                        y1="6"
                        x2="21"
                        y2="6"
                      />
                      <path d="M16 10a4 4 0 0 1-8 0" />
                    </svg>
                  </div>
                  <div class="statefill__title">
                    {{ activeFilters.length > 0 ? t('No products match your filters') : t('No products yet') }}
                  </div>
                  <div
                    v-if="activeFilters.length > 0"
                    style="margin-top:12px;"
                  >
                    <button
                      class="btn btn--secondary btn--sm"
                      @click="clearAll"
                    >
                      {{ t('Clear all') }}
                    </button>
                  </div>
                  <div
                    v-else
                    style="margin-top:12px;"
                  >
                    <button
                      class="btn btn--primary btn--sm"
                      @click="openCreate"
                    >
                      <svg
                        class="ic"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <line
                          x1="12"
                          y1="5"
                          x2="12"
                          y2="19"
                        />
                        <line
                          x1="5"
                          y1="12"
                          x2="19"
                          y2="12"
                        />
                      </svg>
                      {{ t('Add Product') }}
                    </button>
                  </div>
                </div>
              </td>
            </tr>

            <!-- Real rows -->
            <tr
              v-for="p in products"
              v-else
              :key="p.id"
              :class="{ 'is-selected': selection.isSelected(p.id) }"
            >
              <td
                style="text-align: center; cursor: pointer;"
                @click.stop="selection.toggle(p.id, $event)"
              >
                <Checkbox :model-value="selection.isSelected(p.id)" />
              </td>
              <td>
                <span class="mono cell-muted">#{{ p.id }}</span>
              </td>
              <td>
                <div
                  class="row"
                  style="gap:10px;"
                >
                  <div
                    :style="{ background: categoryColorMap[p.category?.id] || 'var(--border-strong)' }"
                    style="width:10px;height:10px;border-radius:3px;flex:0 0 10px;"
                  />
                  <span
                    class="cell-strong"
                    :title="p.description || ''"
                  >{{ p.name }}</span>
                  <span
                    v-if="p.is_instant"
                    class="badge t-warning"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="11"
                      height="11"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                    </svg>
                    {{ t('product_is_instant_label') }}
                  </span>
                  <span
                    v-if="p.is_deleted"
                    class="badge t-neutral"
                  >
                    {{ t('Deleted') }}
                  </span>
                </div>
              </td>
              <td>
                <span class="mono cell-strong">{{ formatCurrency(p.price) }}</span>
              </td>
              <td>
                <span
                  v-if="p.category"
                  class="badge t-neutral"
                  :style="categoryColorMap[p.category.id]
                    ? { backgroundColor: `${categoryColorMap[p.category.id]}28`, color: categoryColorMap[p.category.id], borderColor: `${categoryColorMap[p.category.id]}40` }
                    : {}"
                >
                  {{ p.category.name }}
                </span>
                <span
                  v-else
                  class="tertiary"
                >—</span>
              </td>
              <td>
                <span class="mono cell-muted nowrap">{{ formatDate(p.created_at) }}</span>
              </td>
              <td>
                <span class="mono cell-muted nowrap">{{ formatDate(p.updated_at) }}</span>
              </td>
              <td>
                <div
                  class="row"
                  style="justify-content:flex-end;gap:2px;"
                >
                  <template v-if="p.is_deleted">
                    <button
                      class="iconaction is-primary"
                      :title="t('Restore')"
                      @click="restoreProduct(p)"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="18"
                        height="18"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <polyline points="1 4 1 10 7 10" />
                        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                      </svg>
                    </button>
                  </template>
                  <template v-else>
                    <button
                      class="iconaction is-primary"
                      :title="t('Edit')"
                      @click="openEdit(p)"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="18"
                        height="18"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z" />
                      </svg>
                    </button>
                    <button
                      class="iconaction is-danger"
                      :title="t('Delete')"
                      @click="confirmDelete(p)"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="18"
                        height="18"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </template>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      <div
        v-if="totalProducts > 0"
        class="pagination"
      >
        <div
          class="row"
          style="gap: 8px; align-items: center;"
        >
          <span>{{ t('Rows per page') }}:</span>
          <Select
            :model-value="String(itemsPerPage)"
            :options="[10, 25, 50, 100].map(n => ({ value: String(n), label: String(n) }))"
            size="sm"
            style="width: 84px;"
            @update:model-value="itemsPerPage = Number($event)"
          />
        </div>
        <span class="pagination__spacer" />
        <span class="muted">
          {{ t('pagination_range', { start: pageStart, end: pageEnd, total: totalProducts }) }}
        </span>
        <div class="pglist">
          <button
            class="pgbtn"
            :disabled="page <= 1"
            @click="goPage(page - 1)"
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button
            v-for="(p, i) in pageList"
            :key="`pg-${i}-${p}`"
            class="pgbtn"
            :class="{ 'is-active': p === page }"
            :disabled="p === '…'"
            @click="goPage(p)"
          >
            {{ p }}
          </button>
          <button
            class="pgbtn"
            :disabled="page >= totalPages"
            @click="goPage(page + 1)"
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- ============== CREATE / EDIT MODAL ============== -->
    <div
      v-if="dialogOpen"
      class="overlay"
      @mousedown.self="tryCloseDialog"
    >
      <form
        class="modal"
        style="width:min(560px, 92vw); max-width:560px;"
        @submit.prevent="saveProduct"
      >
        <div class="modal__head">
          <div style="flex:1;min-width:0;">
            <h2 class="modal__title">
              {{ editingProduct ? t('Edit Product') : t('Add Product') }}
            </h2>
            <div class="modal__sub">
              {{ editingProduct ? editingProduct.name : t('Catalog of products served at the POS') }}
            </div>
          </div>
          <button
            type="button"
            class="iconaction"
            :title="t('Close')"
            @click="forceClose"
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <line
                x1="18"
                y1="6"
                x2="6"
                y2="18"
              />
              <line
                x1="6"
                y1="6"
                x2="18"
                y2="18"
              />
            </svg>
          </button>
        </div>

        <div class="modal__body">
          <!-- POS Preview -->
          <div class="pos-preview">
            <span
              class="field__label"
              style="display:block;margin-bottom:8px;"
            >{{ t('POS Preview') }}</span>
            <div class="pos-preview__cards">
              <div
                class="pos-product-card"
                :style="{ backgroundColor: previewColor }"
              >
                <div class="pos-product-card__name">
                  {{ form.name || t('Name') }}
                </div>
                <div class="pos-product-card__price">
                  {{ form.price ? `${formatCurrency(form.price)}\u202f${t('currency_short')}` : `0\u202f${t('currency_short')}` }}
                </div>
                <div
                  v-if="form.color"
                  class="pos-product-card__stripe"
                  :style="{ backgroundColor: form.color }"
                />
              </div>
            </div>
          </div>

          <div class="form-grid">
            <div class="field span-2">
              <label class="field__label">{{ t('Name') }}</label>
              <Input
                v-model="form.name"
                type="text"
              />
            </div>

            <div class="field span-2">
              <label class="field__label">{{ t('Description') }}</label>
              <Input
                v-model="form.description"
                type="text"
              />
            </div>

            <div class="field span-2">
              <label class="field__label">{{ t('Instant — skip the kitchen / KDS') }}</label>
              <div
                class="row"
                style="gap:12px;justify-content:space-between;cursor:pointer;"
                @click="form.is_instant = !form.is_instant"
              >
                <span
                  class="field__hint"
                  style="flex:1;"
                >{{ t('Cold drinks, packaged items, etc. Skips PREPARING; never appears on chef display.') }}</span>
                <div
                  class="switch"
                  :class="{ 'is-on': form.is_instant }"
                />
              </div>
            </div>

            <div class="field">
              <label class="field__label">{{ t('Price') }}</label>
              <Input
                type="text"
                inputmode="numeric"
                :model-value="priceDisplay"
                @input="onPriceInput"
              />
            </div>

            <div class="field">
              <label class="field__label">{{ t('Category') }}</label>
              <Select
                :model-value="form.category_id == null ? '' : String(form.category_id)"
                :placeholder="t('Choose category')"
                :options="categoryOptions.map(opt => ({ value: String(opt.value), label: opt.title }))"
                @update:model-value="form.category_id = $event ? Number($event) : null"
              />
            </div>

            <div class="field span-2">
              <label class="field__label">{{ t('Product Color') }}</label>
              <div class="char-colors">
                <button
                  v-for="c in characteristicColors"
                  :key="c.key"
                  type="button"
                  class="char-dot"
                  :class="{ 'char-dot--active': form.color === c.hex }"
                  :style="{ backgroundColor: c.hex }"
                  :title="c.label"
                  @click="form.color = form.color === c.hex ? '' : c.hex"
                />
                <button
                  v-if="form.color"
                  type="button"
                  class="char-dot char-dot--clear"
                  :title="t('Clear')"
                  @click="form.color = ''"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="14"
                    height="14"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <line
                      x1="18"
                      y1="6"
                      x2="6"
                      y2="18"
                    />
                    <line
                      x1="6"
                      y1="6"
                      x2="18"
                      y2="18"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="modal__foot">
          <button
            type="submit"
            class="btn btn--primary"
            :class="{ 'is-loading': dialogLoading }"
            :disabled="dialogLoading"
          >
            <svg
              class="ic"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            {{ t('Save') }}
          </button>
        </div>
      </form>
    </div>

    <!-- ============== DELETE CONFIRM MODAL ============== -->
    <div
      v-if="deleteDialog"
      class="overlay"
      @mousedown.self="() => { if (!deleteBusy) deleteDialog = false }"
    >
      <div
        class="modal"
        style="width:min(440px, 92vw); max-width:440px;"
      >
        <div class="modal__head">
          <div style="flex:1;min-width:0;">
            <h2 class="modal__title">
              {{ t('Delete Product') }}
            </h2>
          </div>
          <button
            class="iconaction"
            :title="t('Close')"
            :disabled="deleteBusy"
            @click="deleteDialog = false"
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <line
                x1="18"
                y1="6"
                x2="6"
                y2="18"
              />
              <line
                x1="6"
                y1="6"
                x2="18"
                y2="18"
              />
            </svg>
          </button>
        </div>

        <div class="modal__body">
          <div
            class="row"
            style="gap:14px;align-items:flex-start;"
          >
            <div
              class="kpi__icon t-error"
              style="width:44px;height:44px;flex:0 0 44px;"
            >
              <svg
                viewBox="0 0 24 24"
                width="22"
                height="22"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                <line
                  x1="12"
                  y1="9"
                  x2="12"
                  y2="13"
                />
                <line
                  x1="12"
                  y1="17"
                  x2="12.01"
                  y2="17"
                />
              </svg>
            </div>
            <div>
              <p style="margin:0;font-weight:600;">
                {{ deletingProduct?.name }} {{ t('will be removed.') }}
              </p>
              <p
                class="muted"
                style="margin:6px 0 0;font-size:14px;"
              >
                {{ t('Are you sure you want to delete this product?') }}
              </p>
            </div>
          </div>
        </div>

        <div class="modal__foot">
          <button
            ref="deleteConfirmBtn"
            class="btn btn--danger"
            :class="{ 'is-loading': deleteBusy }"
            :disabled="deleteBusy"
            @click="deleteProduct"
          >
            <svg
              class="ic"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            {{ t('Delete') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Snackbar (Vuetify allowed off-page for global toast) -->
    <VSnackbar
      v-model="snackbar"
      :color="snackbarColor"
      :timeout="3000"
    >
      {{ snackbarMsg }}
    </VSnackbar>

    <!-- Floating bulk-action bar — appears when rows are checked. -->
    <BulkActionBar
      :count="selection.count.value"
      @clear="selection.clear()"
    >
      <button
        v-if="includeDeleted"
        type="button"
        :disabled="bulkBusy"
        @click="bulkRestore"
      >
        <DesignIcon
          name="restore"
          :size="14"
        />
        {{ t('Restore') }}
      </button>
      <button
        type="button"
        class="is-danger"
        :disabled="bulkBusy"
        @click="bulkDelete"
      >
        <DesignIcon
          name="trash"
          :size="14"
        />
        {{ t('Delete') }}
      </button>
    </BulkActionBar>
  </div>
</template>

<style scoped>
/* ── POS Preview ── */
.pos-preview {
  background: var(--surface-inset);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  padding: 14px;
  margin-bottom: var(--sp-4);
}

.pos-preview__cards {
  display: flex;
  gap: 10px;
}

.pos-product-card {
  width: 100%;
  max-width: 220px;
  border-radius: 8px;
  padding: 12px 16px;
  text-align: center;
  color: #fff;
  position: relative;
  overflow: hidden;
}

.pos-product-card__name {
  font-size: 0.875rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pos-product-card__price {
  font-size: 0.75rem;
  opacity: 0.85;
  margin-top: 2px;
}

.pos-product-card__stripe {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 4px;
}

/* ── Characteristic colors ── */
.char-colors {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.char-dot {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  transition: transform 0.12s, border-color 0.12s, box-shadow 0.12s;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.char-dot:hover {
  transform: scale(1.15);
}

.char-dot--active {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px var(--primary-weak-2);
}

.char-dot--clear {
  background: var(--surface-inset);
  color: var(--text-secondary);
  border: 1px solid var(--border-strong);
}

/* ── Clickable "Deleted" KPI (shortcut to include-deleted view) ── */
.products-kpi-click {
  cursor: pointer;
  border-radius: var(--r-lg, 14px);
  transition: transform 0.12s ease, box-shadow 0.12s ease;
  outline: none;
}

.products-kpi-click:hover {
  transform: translateY(-1px);
}

.products-kpi-click:focus-visible {
  box-shadow: 0 0 0 2px var(--primary);
}

.products-kpi-click.is-active :deep(.kpi) {
  border-color: var(--warning, #f0ad4e);
  box-shadow: 0 0 0 1px var(--warning, #f0ad4e) inset;
}

/* ── Responsive toolbar / modals ── */
.products-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.tablewrap {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

@media (max-width: 768px) {
  .products-toolbar__search,
  .products-toolbar__select {
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
    flex: 1 1 100%;
  }
  .form-grid {
    grid-template-columns: 1fr !important;
  }
  .form-grid .span-2 {
    grid-column: 1 / -1 !important;
  }
}
</style>

<route lang="yaml">
meta:
  action: manage
  subject: all
</route>
