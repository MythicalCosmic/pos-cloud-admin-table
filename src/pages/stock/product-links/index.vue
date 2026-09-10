<script setup lang="ts">
import adminApi, { stockApi as axios } from '@/plugins/axios'
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

const { t } = useI18n({ useScope: 'global' })

const links = ref<any[]>([])
const total = ref(0)
const loading = ref(false)
const page = ref(1)
const itemsPerPage = ref(10)
const search = ref('')
const typeFilter = ref<string | undefined>(undefined)
const activeFilter = ref<string | undefined>(undefined)

const typeFilterOptions = computed(() => [
  { value: '', label: t('product_links_all_types') },
  { value: 'RECIPE', label: t('link_type_RECIPE') },
  { value: 'DIRECT_ITEM', label: t('link_type_DIRECT_ITEM') },
  { value: 'COMPONENT_BASED', label: t('link_type_COMPONENT_BASED') },
])

const activeFilterOptions = computed(() => [
  { value: '', label: t('product_links_all_statuses') },
  { value: 'true', label: t('active_true') },
  { value: 'false', label: t('active_false') },
])

const linkTypes = ref<any[]>([])
const deductStatuses = ref<any[]>([])

const dialog = ref(false)
const saving = ref(false)
const unlinkDialog = ref(false)
const unlinking = ref(false)
const selectedItem = ref<any>(null)

// Options for selectors
const products = ref<any[]>([])
const recipes = ref<any[]>([])
const stockItems = ref<any[]>([])
const units = ref<any[]>([])

const form = ref({
  product_id: null as number | null,
  link_type: 'RECIPE',
  recipe_id: null as number | null,
  stock_item_id: null as number | null,
  quantity_per_sale: 1,
  unit_id: null as number | null,
  deduct_on_status: 'PREPARING',
})

const { notify } = useNotify()

const typeTone: Record<string, 'primary' | 'info' | 'warning' | 'neutral'> = {
  RECIPE: 'primary',
  DIRECT_ITEM: 'info',
  COMPONENT_BASED: 'warning',
}

const columns = computed<DataTableColumn<any>[]>(() => [
  { key: 'product', label: t('Product') },
  { key: 'link_type', label: t('Link Type') },
  { key: 'linked_to', label: t('Stock Item / Recipe') },
  { key: 'deduct_on_status', label: t('Deduct On') },
])

const dtPagination = computed(() => ({
  page: page.value,
  perPage: itemsPerPage.value,
  total: total.value,
  onPage: (p: number) => { page.value = p },
  onPerPage: (n: number) => { itemsPerPage.value = n; page.value = 1 },
}))

// Lookup map: product_id (number) -> product name
const productNameById = computed<Record<string, string>>(() => {
  const m: Record<string, string> = {}
  for (const p of products.value)
    m[String(p.value)] = String(p.label)
  return m
})

function resolveProductName(l: any): string {
  if (l == null)
    return ''
  if (l.product_id != null) {
    const n = productNameById.value[String(l.product_id)]
    if (n)
      return n
    return `#${l.product_id}`
  }
  return ''
}

const filteredLinks = computed(() => {
  const q = (search.value ?? '').trim().toLowerCase()
  if (!q)
    return links.value
  return links.value.filter((l: any) => {
    const product = resolveProductName(l).toLowerCase()
    const linked = (l.recipe_name ?? l.stock_item_name ?? '').toLowerCase()
    return product.includes(q) || linked.includes(q)
  })
})

async function loadLinks() {
  loading.value = true
  try {
    const params: any = { page: page.value, per_page: itemsPerPage.value }
    if (typeFilter.value)
      params.type = typeFilter.value
    if (activeFilter.value !== undefined)
      params.active = activeFilter.value

    const res = await axios.get('/product-links/', { params })
    const d = res.data?.data ?? res.data

    links.value = d?.links ?? []
    total.value = d.pagination?.total_items ?? d.pagination?.total ?? d.count ?? links.value.length
    if (d.link_types)
      linkTypes.value = d.link_types
    if (d.deduct_statuses)
      deductStatuses.value = d.deduct_statuses
  }
  catch {
    notify(t('Failed to load product links'), 'error')
  }
  finally {
    loading.value = false
  }
}

async function loadOptions() {
  try {
    const [prodRes, recRes, itemRes, unitRes] = await Promise.all([
      adminApi.get('/products', { params: { per_page: 200 } }),
      axios.get('/recipes/', { params: { per_page: 300, is_active: true } }),
      axios.get('/items/', { params: { per_page: 300 } }),
      axios.get('/units/', { params: { per_page: 200 } }),
    ])

    const prodD = prodRes.data?.data ?? prodRes.data
    const recD = recRes.data?.data ?? recRes.data
    const itemD = itemRes.data?.data ?? itemRes.data
    const unitD = unitRes.data?.data ?? unitRes.data

    products.value = (prodD?.products ?? prodD?.results ?? []).map((p: any) => ({ value: String(p.id), label: p.name }))
    recipes.value = (recD?.recipes ?? recD?.results ?? []).map((r: any) => ({ value: String(r.id), label: r.name }))
    stockItems.value = (itemD?.items ?? itemD?.results ?? []).map((i: any) => ({ value: String(i.id), label: i.name }))
    units.value = (unitD?.units ?? unitD?.results ?? []).map((u: any) => ({ value: String(u.id), label: `${u.name} (${u.short_name})` }))
  }
  catch {
    // silent — options will be empty
  }
}

onMounted(() => { loadLinks(); loadOptions() })
watch([page, itemsPerPage], loadLinks)
watch([typeFilter, activeFilter], () => { page.value = 1; loadLinks() })

const linkTypeOptions = computed(() => [
  { value: 'RECIPE', label: t('link_type_RECIPE') },
  { value: 'DIRECT_ITEM', label: t('link_type_DIRECT_ITEM') },
  { value: 'COMPONENT_BASED', label: t('link_type_COMPONENT_BASED') },
])

const deductStatusOptions = computed(() =>
  deductStatuses.value.length
    ? deductStatuses.value.map((s: any) => ({ value: s.value, label: t(`deduct_on_${s.value}`) }))
    : [
      { value: 'CREATED', label: t('deduct_on_CREATED') },
      { value: 'PREPARING', label: t('deduct_on_PREPARING') },
      { value: 'READY', label: t('deduct_on_READY') },
      { value: 'PAID', label: t('deduct_on_PAID') },
    ],
)

function openLink() {
  form.value = {
    product_id: null,
    link_type: 'RECIPE',
    recipe_id: null,
    stock_item_id: null,
    quantity_per_sale: 1,
    unit_id: null,
    deduct_on_status: 'PREPARING',
  }
  dialog.value = true
}

async function save() {
  saving.value = true
  try {
    if (form.value.link_type === 'RECIPE') {
      await axios.post(`/products/${form.value.product_id}/link-recipe/`, {
        recipe_id: form.value.recipe_id,
        deduct_on_status: form.value.deduct_on_status,
      })
    }
    else {
      await axios.post(`/products/${form.value.product_id}/link-item/`, {
        stock_item_id: form.value.stock_item_id,
        quantity_per_sale: form.value.quantity_per_sale,
        unit_id: form.value.unit_id,
        deduct_on_status: form.value.deduct_on_status,
      })
    }
    notify(t('Product linked'))
    dialog.value = false
    await loadLinks()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error linking product'), 'error')
  }
  finally {
    saving.value = false
  }
}

function confirmUnlink(item: any) {
  selectedItem.value = item
  unlinkDialog.value = true
}

async function doUnlink() {
  unlinking.value = true
  try {
    await axios.delete(`/products/${selectedItem.value.product_id}/unlink/`)
    notify(t('Product unlinked'))
    unlinkDialog.value = false
    await loadLinks()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error unlinking product'), 'error')
  }
  finally {
    unlinking.value = false
  }
}
</script>

<template>
  <div class="page">
    <PageHeader
      :title="t('product_links_title')"
      :subtitle="t('product_links_subtitle')"
    />

    <div class="card">
      <div
        class="toolbar"
        style="flex-wrap: wrap;"
      >
        <div class="grow toolbar-search">
          <Input
            v-model="search"
            icon="search"
            :placeholder="t('product_links_search_placeholder')"
            :aria-label="t('product_links_search_placeholder')"
          />
        </div>

        <div class="toolbar-select toolbar-select--type">
          <Select
            :model-value="typeFilter ?? ''"
            :placeholder="t('product_links_all_types')"
            :options="typeFilterOptions"
            @update:model-value="(v: string) => typeFilter = v ? v : undefined"
          />
        </div>

        <div class="toolbar-select toolbar-select--status">
          <Select
            :model-value="activeFilter ?? ''"
            :placeholder="t('product_links_all_statuses')"
            :options="activeFilterOptions"
            @update:model-value="(v: string) => activeFilter = v ? v : undefined"
          />
        </div>

        <div class="toolbar-spacer" />

        <Button
          variant="primary"
          icon="link"
          @click="openLink"
        >
          {{ t('Link Product') }}
        </Button>
      </div>

      <div class="card__divider" />

      <DataTable
        :columns="columns"
        :rows="filteredLinks"
        row-key="id"
        :loading="loading"
        :pagination="dtPagination"
        :per-page-options="[10, 25, 50, 100]"
      >
        <template #cell.product="{ row }">
          <span class="cell-strong">{{ resolveProductName(row) || '—' }}</span>
        </template>

        <template #cell.link_type="{ row }">
          <Badge :tone="(typeTone[row.link_type] ?? 'neutral') as any">
            {{ row.link_type ? t(`link_type_${row.link_type}`) : '—' }}
          </Badge>
        </template>

        <template #cell.linked_to="{ row }">
          <span>{{ row.recipe_name ?? row.stock_item_name ?? '—' }}</span>
        </template>

        <template #cell.deduct_on_status="{ row }">
          <Badge tone="info">
            {{ row.deduct_on_status ? t(`deduct_on_${row.deduct_on_status}`) : '—' }}
          </Badge>
        </template>

        <template #row-actions="{ row }">
          <IconAction
            icon="unlink"
            tone="danger"
            :title="t('Unlink')"
            @click.stop="confirmUnlink(row)"
          />
        </template>

        <template #empty>
          <StateFill
            icon="inbox"
            :title="t('product_links_empty_title')"
            :sub="t('product_links_empty_sub')"
          />
        </template>
      </DataTable>
    </div>

    <!-- ============ LINK PRODUCT MODAL ============ -->
    <Modal
      :open="dialog"
      :width="540"
      :title="t('Link Product')"
      @close="dialog = false"
    >
      <div class="form-grid">
        <div class="form-grid__full">
          <Field :label="t('Product')">
            <Select
              :model-value="form.product_id != null ? String(form.product_id) : ''"
              :options="products"
              :placeholder="t('Select product')"
              @update:model-value="(v: string) => form.product_id = v ? Number(v) : null"
            />
          </Field>
        </div>

        <Field :label="t('Link Type')">
          <Select
            v-model="form.link_type"
            :options="linkTypeOptions"
          />
        </Field>

        <Field :label="t('Deduct On')">
          <Select
            v-model="form.deduct_on_status"
            :options="deductStatusOptions"
          />
        </Field>

        <template v-if="form.link_type === 'RECIPE'">
          <div class="form-grid__full">
            <Field :label="t('Recipe')">
              <Select
                :model-value="form.recipe_id != null ? String(form.recipe_id) : ''"
                :options="recipes"
                :placeholder="t('Select recipe')"
                @update:model-value="(v: string) => form.recipe_id = v ? Number(v) : null"
              />
            </Field>
          </div>
        </template>

        <template v-if="form.link_type === 'DIRECT_ITEM'">
          <div class="form-grid__full">
            <Field :label="t('Stock Item')">
              <Select
                :model-value="form.stock_item_id != null ? String(form.stock_item_id) : ''"
                :options="stockItems"
                :placeholder="t('Select stock item')"
                @update:model-value="(v: string) => form.stock_item_id = v ? Number(v) : null"
              />
            </Field>
          </div>

          <Field :label="t('Quantity per Sale')">
            <Input
              v-model="form.quantity_per_sale"
              type="number"
              step="0.01"
              min="0.01"
            />
          </Field>

          <Field :label="t('Unit')">
            <Select
              :model-value="form.unit_id != null ? String(form.unit_id) : ''"
              :options="units"
              :placeholder="t('Select unit')"
              @update:model-value="(v: string) => form.unit_id = v ? Number(v) : null"
            />
          </Field>
        </template>
      </div>

      <template #footer>
        <Button
          variant="primary"
          :loading="saving"
          :disabled="!form.product_id || saving"
          @click="save"
        >
          {{ t('Save') }}
        </Button>
      </template>
    </Modal>

    <!-- ============ UNLINK CONFIRM MODAL ============ -->
    <Modal
      :open="unlinkDialog"
      :width="440"
      :title="t('Unlink Product')"
      @close="unlinkDialog = false"
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
            {{ resolveProductName(selectedItem) }}
          </p>
          <p
            class="muted"
            style="margin: 6px 0 0; font-size: 14px;"
          >
            {{ t('Are you sure you want to unlink') }}
          </p>
        </div>
      </div>

      <template #footer>
        <Button
          variant="danger"
          :loading="unlinking"
          :disabled="unlinking"
          @click="doUnlink"
        >
          {{ t('Unlink') }}
        </Button>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--sp-4);
}
.form-grid__full {
  grid-column: 1 / -1;
}

.toolbar-search {
  min-width: 220px;
  max-width: 280px;
}
.toolbar-select--type {
  min-width: 180px;
}
.toolbar-select--status {
  min-width: 160px;
}
.toolbar-spacer {
  flex: 1;
}

@media (max-width: 900px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
  .toolbar-select {
    width: 100%;
    min-width: 0 !important;
  }
}

@media (max-width: 768px) {
  .toolbar-search {
    width: 100%;
    min-width: 0;
    max-width: none;
    flex: 1 1 100%;
  }
  .toolbar-select,
  .toolbar-select--type,
  .toolbar-select--status {
    width: 100%;
    min-width: 0 !important;
    flex: 1 1 100%;
  }
  .toolbar-spacer {
    display: none;
  }
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>

<route lang="yaml">
name: stock-product-links
meta:
  action: manage
  subject: all
</route>
