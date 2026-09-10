<script setup lang="ts">
/* ============================================================
   ALPHA POS — Stock Categories
   Design-system primitives only (no Vuetify on the page itself)
   - Filters: search, type, parent, tree view
   - DataTable with controlled pagination + row actions
   - Modal create/edit + delete confirmation
   ============================================================ */
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
const { notify } = useNotify()

const categories = ref<any[]>([])
const total = ref(0)
const loading = ref(false)
const page = ref(1)
const itemsPerPage = ref(10)
const search = ref('')
const typeFilter = ref<string | undefined>(undefined)
const parentFilter = ref<number | undefined>(undefined)
const treeView = ref(false)

const dialog = ref(false)
const dialogMode = ref<'create' | 'edit'>('create')
const saving = ref(false)
const deleteDialog = ref(false)
const deleting = ref(false)
const selectedItem = ref<any>(null)

const categoryTypes = ['RAW_MATERIAL', 'SEMI_FINISHED', 'FINISHED_GOOD', 'PACKAGING']

const typeTone: Record<string, 'success' | 'warning' | 'primary' | 'neutral'> = {
  RAW_MATERIAL: 'success',
  SEMI_FINISHED: 'warning',
  FINISHED_GOOD: 'primary',
  PACKAGING: 'neutral',
}

const form = ref({
  name: '',
  type: 'RAW_MATERIAL',
  parent_id: null as number | null,
  sort_order: 0,
  is_active: true,
})

async function loadCategories() {
  loading.value = true
  try {
    const params: any = { page: page.value, per_page: itemsPerPage.value }
    if (search.value)
      params.search = search.value
    if (typeFilter.value)
      params.type = typeFilter.value
    if (parentFilter.value)
      params.parent_id = parentFilter.value
    if (treeView.value)
      params.tree = 'true'

    const res = await axios.get('/categories/', { params })
    const d = res.data?.data ?? res.data

    // BE returns { tree, total_count } when tree=true, else { categories, count }
    // Flatten tree to a list so the DataTable can render rows consistently.
    if (treeView.value) {
      const flat: any[] = []
      const walk = (nodes: any[], depth = 0) => {
        for (const n of nodes ?? []) {
          flat.push({ ...n, _depth: depth })
          if (n.children?.length)
            walk(n.children, depth + 1)
        }
      }
      walk(d?.tree ?? [])
      categories.value = flat
      total.value = d?.total_count ?? flat.length
    }
    else {
      categories.value = d?.categories ?? []
      total.value = d?.count ?? categories.value.length
    }
  }
  catch {
    notify(t('Failed to load categories'), 'error')
  }
  finally {
    loading.value = false
  }
}

onMounted(loadCategories)
watch([page, itemsPerPage], loadCategories)
watch([search, typeFilter, parentFilter, treeView], () => { page.value = 1; loadCategories() })

function openCreate() {
  dialogMode.value = 'create'
  selectedItem.value = null
  form.value = { name: '', type: 'RAW_MATERIAL', parent_id: null, sort_order: 0, is_active: true }
  dialog.value = true
}

function openEdit(item: any) {
  dialogMode.value = 'edit'
  selectedItem.value = item
  form.value = {
    name: item.name ?? '',
    type: item.type ?? 'RAW_MATERIAL',
    parent_id: item.parent_id ?? null,
    sort_order: item.sort_order ?? 0,
    is_active: item.is_active ?? true,
  }
  dialog.value = true
}

async function save() {
  if (saving.value) return
  saving.value = true
  try {
    const payload: any = { ...form.value }
    if (!payload.parent_id)
      delete payload.parent_id
    if (dialogMode.value === 'create') {
      await axios.post('/categories/', payload)
    }
    else {
      // BE category_detail accepts PUT (not PATCH).
      // is_active is not processed by service.update() — toggle goes through DELETE.
      const { is_active: _ignore, ...putPayload } = payload
      await axios.put(`/categories/${selectedItem.value.id}/`, putPayload)
    }
    notify(dialogMode.value === 'create' ? t('Category created') : t('Category updated'))
    dialog.value = false
    await loadCategories()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error saving category'), 'error')
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
  if (deleting.value) return
  deleting.value = true
  try {
    await axios.delete(`/categories/${selectedItem.value.id}/`)
    notify(t('Category deleted'))
    deleteDialog.value = false
    await loadCategories()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error deleting category'), 'error')
  }
  finally {
    deleting.value = false
  }
}

async function toggleActive(item: any) {
  // BE: deactivate = DELETE /categories/{id}/?cascade=false.
  // Activation has no exposed URL in stock/urls.py — surface a clear message instead of a silent 404/405.
  if (!item.is_active) {
    notify(t('stock_categories_activate_unavailable'), 'error')
    return
  }
  try {
    await axios.delete(`/categories/${item.id}/`, { params: { cascade: false } })
    notify(t('Category deactivated'))
    await loadCategories()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error updating category'), 'error')
  }
}

// parent select options (flat list, excluding current item in edit mode)
const parentOptions = computed(() =>
  categories.value
    .filter(c => selectedItem.value ? c.id !== selectedItem.value.id : true)
    .map(c => ({ value: String(c.id), label: c.name })),
)

const formParentOptions = computed(() =>
  categories.value
    .filter(c => selectedItem.value ? c.id !== selectedItem.value.id : true)
    .map(c => ({ value: String(c.id), label: `${c.name} (${t(`category_type_${c.type}`)})` })),
)

const typeOptions = computed(() =>
  categoryTypes.map(v => ({ value: v, label: t(`category_type_${v}`) })),
)

// ---- DataTable columns ----
const columns = computed<DataTableColumn<any>[]>(() => [
  { key: 'name', label: t('col_name'), sortable: true },
  { key: 'type', label: t('col_type'), sortable: true },
  { key: 'parent', label: t('col_parent') },
  { key: 'sort_order', label: t('col_sort_order'), sortable: true, align: 'right' },
  { key: 'is_active', label: t('col_is_active') },
])

const dtPagination = computed(() => ({
  page: page.value,
  perPage: itemsPerPage.value,
  total: total.value,
  onPage: (p: number) => { page.value = p },
  onPerPage: (n: number) => { itemsPerPage.value = n; page.value = 1 },
}))

const hasFilters = computed(() =>
  !!(search.value || typeFilter.value || parentFilter.value || treeView.value),
)

function clearAll() {
  search.value = ''
  typeFilter.value = undefined
  parentFilter.value = undefined
  treeView.value = false
}
</script>

<template>
  <div class="page">
    <!-- Page header -->
    <PageHeader
      :title="t('stock_categories_title')"
      :subtitle="t('stock_categories_subtitle')"
    >
      <template #actions>
        <Button
          variant="primary"
          icon="plus"
          @click="openCreate"
        >
          {{ t('Add Category') }}
        </Button>
      </template>
    </PageHeader>

    <!-- Main card -->
    <div class="card">
      <!-- Toolbar (flex-wrap, collapses gracefully under 900px) -->
      <div class="toolbar tb-wrap">
        <div class="tb-search">
          <Input
            v-model="search"
            icon="search"
            :placeholder="t('Search categories...')"
            :aria-label="t('Search categories...')"
          />
        </div>

        <div class="tb-select">
          <Select
            :model-value="typeFilter ?? ''"
            :placeholder="t('All Types')"
            :options="typeOptions"
            @update:model-value="(v: string) => typeFilter = v ? v : undefined"
          />
        </div>

        <div class="tb-select">
          <Select
            :model-value="parentFilter != null ? String(parentFilter) : ''"
            :placeholder="t('All Parents')"
            :options="parentOptions"
            @update:model-value="(v: string) => parentFilter = v ? Number(v) : undefined"
          />
        </div>

        <label class="tb-switch">
          <Switch v-model="treeView" />
          <span>{{ t('Tree view') }}</span>
        </label>
      </div>

      <!-- Active filter chips -->
      <div v-if="hasFilters" class="toolbar" style="padding-top: 0;">
        <div class="chips">
          <span class="tertiary" style="font-size: 13px; margin-right: 2px;">{{ t('Filters') }}:</span>

          <span v-if="search" class="chip">
            <span>{{ t('Search categories...') }}: <b>{{ search }}</b></span>
            <button
              type="button"
              :aria-label="t('Remove')"
              class="chip__x"
              @click="search = ''"
            ><DesignIcon
              name="close"
              :size="13"
            /></button>
          </span>

          <span v-if="typeFilter" class="chip">
            <span>{{ t('col_type') }}: <b>{{ t(`category_type_${typeFilter}`) }}</b></span>
            <button
              type="button"
              :aria-label="t('Remove')"
              class="chip__x"
              @click="typeFilter = undefined"
            ><DesignIcon
              name="close"
              :size="13"
            /></button>
          </span>

          <span v-if="parentFilter" class="chip">
            <span>{{ t('col_parent') }}: <b>{{ parentOptions.find(o => o.value === String(parentFilter))?.label }}</b></span>
            <button
              type="button"
              :aria-label="t('Remove')"
              class="chip__x"
              @click="parentFilter = undefined"
            ><DesignIcon
              name="close"
              :size="13"
            /></button>
          </span>

          <span v-if="treeView" class="chip">
            <span>{{ t('Tree view') }}</span>
            <button
              type="button"
              :aria-label="t('Remove')"
              class="chip__x"
              @click="treeView = false"
            ><DesignIcon
              name="close"
              :size="13"
            /></button>
          </span>

          <button class="chip--clear" @click="clearAll">
            {{ t('Clear all') }}
          </button>
        </div>
      </div>

      <div class="card__divider" />

      <!-- DataTable -->
      <DataTable
        :columns="columns"
        :rows="categories"
        row-key="id"
        :loading="loading"
        :pagination="dtPagination"
        :per-page-options="[10, 25, 50, 100]"
      >
        <!-- Name -->
        <template #cell.name="{ row }">
          <span class="cell-strong">{{ row.name }}</span>
        </template>

        <!-- Type -->
        <template #cell.type="{ row }">
          <Badge :tone="(typeTone[row.type] ?? 'neutral') as any">
            {{ row.type ? t(`category_type_${row.type}`) : '—' }}
          </Badge>
        </template>

        <!-- Parent -->
        <template #cell.parent="{ row }">
          <span class="cell-muted">{{ row.parent?.name ?? '—' }}</span>
        </template>

        <!-- Sort order -->
        <template #cell.sort_order="{ row }">
          <span class="mono cell-muted">{{ row.sort_order ?? 0 }}</span>
        </template>

        <!-- Active status -->
        <template #cell.is_active="{ row }">
          <Badge :tone="row.is_active ? 'success' : 'neutral'" dot>
            {{ row.is_active ? t('status_active') : t('status_inactive') }}
          </Badge>
        </template>

        <!-- Inline row actions -->
        <template #row-actions="{ row }">
          <IconAction
            icon="edit"
            :title="t('Edit')"
            @click.stop="openEdit(row)"
          />
          <IconAction
            :icon="row.is_active ? 'pause' : 'play'"
            :tone="row.is_active ? 'warning' : 'success'"
            :title="row.is_active ? t('Deactivate') : t('Activate')"
            @click.stop="toggleActive(row)"
          />
          <IconAction
            icon="trash"
            tone="danger"
            :title="t('Delete')"
            @click.stop="confirmDelete(row)"
          />
        </template>

        <!-- Empty state -->
        <template #empty>
          <StateFill
            icon="inbox"
            :title="t('stock_categories_empty_title')"
            :sub="t('stock_categories_empty_sub')"
          >
            <div v-if="hasFilters" style="margin-top: 12px;">
              <Button variant="secondary" @click="clearAll">
                {{ t('Clear filters') }}
              </Button>
            </div>
          </StateFill>
        </template>
      </DataTable>
    </div>

    <!-- Create / Edit modal -->
    <Modal
      :open="dialog"
      :width="540"
      :title="dialogMode === 'create' ? t('Add Category') : t('Edit Category')"
      @close="dialog = false"
    >
      <div class="modal-grid">
        <div class="span-2">
          <Field :label="t('Name')">
            <Input v-model="form.name" />
          </Field>
        </div>

        <Field :label="t('Type')">
          <Select v-model="form.type" :options="typeOptions" />
        </Field>

        <Field :label="t('Sort Order')">
          <Input v-model.number="form.sort_order" type="number" min="0" />
        </Field>

        <div class="span-2">
          <Field :label="t('Parent Category')" :hint="t('stock_categories_parent_hint')">
            <Select
              :model-value="form.parent_id != null ? String(form.parent_id) : ''"
              :placeholder="t('None')"
              :options="formParentOptions"
              @update:model-value="(v: string) => form.parent_id = v ? Number(v) : null"
            />
          </Field>
        </div>

        <Field v-if="dialogMode === 'edit'" :label="t('Active')">
          <Switch v-model="form.is_active" />
        </Field>
      </div>

      <template #footer>
        <Button
          variant="primary"
          :loading="saving"
          :disabled="!form.name || saving"
          @click="save"
        >
          {{ t('Save') }}
        </Button>
      </template>
    </Modal>

    <!-- Confirm delete -->
    <Modal
      :open="deleteDialog"
      :width="440"
      :title="t('Delete Category')"
      @close="deleteDialog = false"
    >
      <div class="row del-row">
        <div
          class="kpi__icon t-error del-ic"
        >
          <DesignIcon name="alert" :size="22" />
        </div>
        <div>
          <p style="margin: 0; font-weight: 600;">
            {{ selectedItem?.name }}
          </p>
          <p class="muted" style="margin: 6px 0 0; font-size: 14px;">
            {{ t('stock_categories_delete_confirm') }}
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
.row {
  display: flex;
  align-items: center;
}

/* Toolbar layout — flex-wrap with min widths that collapse to 100% on mobile */
.toolbar.tb-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.tb-search {
  flex: 1 1 240px;
  min-width: 0;
}
.tb-select {
  flex: 0 1 200px;
  min-width: 160px;
}
.tb-switch {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 13px;
  white-space: nowrap;
}

/* Modal grid responsive — 2 cols on desktop, 1 col on mobile */
.modal-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--sp-4);
}
.modal-grid .span-2 {
  grid-column: span 2;
}

/* Delete confirmation icon + content row */
.del-row {
  gap: 14px;
  align-items: flex-start;
}
.del-ic {
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
}

@media (max-width: 900px) {
  .tb-search,
  .tb-select {
    flex: 1 1 100%;
    min-width: 0;
  }
  .modal-grid {
    grid-template-columns: 1fr;
  }
  .modal-grid .span-2 {
    grid-column: span 1;
  }
}

/* Phone breakpoint — ensure modals collapse to viewport sheets and content remains readable */
@media (max-width: 768px) {
  /* Modal primitive already applies max-width:100% on phone, but reinforce
     that hard-coded width props (540, 440) cannot overflow the viewport. */
  :deep(.modal) {
    max-width: 100% !important;
  }
  .del-row {
    gap: 12px;
  }
  .del-ic {
    width: 40px;
    height: 40px;
    flex: 0 0 40px;
  }
}

@media (max-width: 420px) {
  .del-row {
    flex-wrap: wrap;
    gap: 10px;
  }
}
</style>

<route lang="yaml">
name: stock-categories
meta:
  action: manage
  subject: all
</route>
