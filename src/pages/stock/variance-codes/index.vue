<script setup lang="ts">
import WorkspacePage from '@/components/design/workspace/WorkspacePage.vue'
import WorkspaceToolbar from '@/components/design/workspace/WorkspaceToolbar.vue'
import Textarea from '@/components/design/Textarea.vue'
/* ============================================================
   ALPHA POS — Stock / Variance Reason Codes
   Plain HTML + design classes from design-shell.css.
   Adds a "Seed defaults" toolbar button with a confirm modal
   before POSTing /variance-codes/seed/.
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
const { notify, snackbar, snackbarMsg, snackbarColor } = useNotify()

/* ---------------- state ---------------- */
const codes = ref<any[]>([])
const total = ref(0)
const loading = ref(false)

const search = ref('')
const activeFilter = ref<'all' | 'true' | 'false'>('true')

// dialogs / actions
const dialog = ref(false)
const dialogMode = ref<'create' | 'edit'>('create')
const saving = ref(false)
const deleteDialog = ref(false)
const deleting = ref(false)
const seedDialog = ref(false)
const seeding = ref(false)
const selectedItem = ref<any>(null)
const togglingId = ref<number | string | null>(null)

const form = ref({
  code: '',
  name: '',
  description: '',
  requires_approval: false,
  is_active: true,
})

const fieldErrors = ref<Record<string, string>>({})

const debouncedSearch = useDebounceFn(() => { /* client-side filter, just trigger reactivity */ }, 200)

/* ---------------- load ---------------- */
async function loadCodes() {
  loading.value = true
  try {
    const params: any = {}
    if (activeFilter.value === 'true')
      params.active = true
    else if (activeFilter.value === 'false')
      params.active = false

    const res = await axios.get('/variance-codes/', { params })
    const d = res.data?.data ?? res.data

    codes.value = d?.codes ?? []
    total.value = d?.count ?? codes.value.length
  }
  catch {
    notify(t('Failed to load variance codes'), 'error')
  }
  finally {
    loading.value = false
  }
}

onMounted(loadCodes)
watch(activeFilter, loadCodes)
watch(search, () => debouncedSearch())

/* ---------------- filtered (client-side search) ---------------- */
const filteredCodes = computed(() => {
  const q = (search.value ?? '').trim().toLowerCase()
  if (!q)
    return codes.value
  return codes.value.filter((c: any) =>
    (c.code ?? '').toLowerCase().includes(q)
    || (c.name ?? '').toLowerCase().includes(q)
    || (c.description ?? '').toLowerCase().includes(q),
  )
})

/* ---------------- create / edit ---------------- */
function openCreate() {
  dialogMode.value = 'create'
  selectedItem.value = null
  form.value = { code: '', name: '', description: '', requires_approval: false, is_active: true }
  fieldErrors.value = {}
  dialog.value = true
}

function openEdit(item: any) {
  dialogMode.value = 'edit'
  selectedItem.value = item
  form.value = {
    code: item.code ?? '',
    name: item.name ?? '',
    description: item.description ?? '',
    requires_approval: item.requires_approval ?? false,
    is_active: item.is_active ?? true,
  }
  fieldErrors.value = {}
  dialog.value = true
}

function onCodeInput(v: string) {
  // uppercase + restrict to A-Z 0-9 _
  const cleaned = (v ?? '').toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 20)
  form.value.code = cleaned
}

function validate(): boolean {
  const e: Record<string, string> = {}
  if (dialogMode.value === 'create') {
    if (!form.value.code.trim())
      e.code = t('Required')
    else if (!/^[A-Z0-9_]+$/.test(form.value.code))
      e.code = t('variance_code_hint')
  }
  if (!form.value.name.trim())
    e.name = t('Required')
  fieldErrors.value = e
  return Object.keys(e).length === 0
}

async function save() {
  if (saving.value)
    return
  if (!validate())
    return
  saving.value = true
  try {
    if (dialogMode.value === 'create') {
      // Backend create() has no is_active param — sending it throws 500.
      const { is_active: _drop, ...payload } = form.value as any
      await axios.post('/variance-codes/', payload)
      notify(t('variance_created'))
    }
    else {
      // BE update() ignores code — immutable
      const payload: any = {
        name: form.value.name,
        description: form.value.description,
        requires_approval: form.value.requires_approval,
        is_active: form.value.is_active,
      }
      try {
        await axios.patch(`/variance-codes/${selectedItem.value.id}/`, payload)
      }
      catch (err: any) {
        // some BE wires only PUT — retry
        if (err?.response?.status === 405)
          await axios.put(`/variance-codes/${selectedItem.value.id}/`, payload)
        else
          throw err
      }
      notify(t('variance_updated'))
    }
    dialog.value = false
    await loadCodes()
  }
  catch (e: any) {
    const data = e?.response?.data
    // duplicate-code detection
    const msg = (data?.message ?? data?.detail ?? '').toString().toLowerCase()
    if (data?.errors?.code || msg.includes('exists') || msg.includes('unique')) {
      fieldErrors.value = { ...fieldErrors.value, code: t('variance_code_exists') }
      notify(t('variance_code_exists'), 'error')
    }
    else {
      notify(data?.message ?? t('Error saving variance code'), 'error')
    }
  }
  finally {
    saving.value = false
  }
}

/* ---------------- delete ---------------- */
function confirmDelete(item: any) {
  selectedItem.value = item
  deleteDialog.value = true
}

async function doDelete() {
  if (deleting.value)
    return
  deleting.value = true
  try {
    await axios.delete(`/variance-codes/${selectedItem.value.id}/`)
    notify(t('Variance code deleted'))
    deleteDialog.value = false
    await loadCodes()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error deleting variance code'), 'error')
  }
  finally {
    deleting.value = false
  }
}

/* ---------------- toggle active (row inline) ---------------- */
async function toggleActive(item: any) {
  if (togglingId.value === item.id)
    return
  togglingId.value = item.id
  try {
    const payload = { is_active: !item.is_active }
    try {
      await axios.patch(`/variance-codes/${item.id}/`, payload)
    }
    catch (err: any) {
      if (err?.response?.status === 405)
        await axios.put(`/variance-codes/${item.id}/`, payload)
      else
        throw err
    }
    notify(t('variance_updated'))
    await loadCodes()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error saving variance code'), 'error')
  }
  finally {
    togglingId.value = null
  }
}

/* ---------------- seed defaults ---------------- */
function openSeedConfirm() {
  seedDialog.value = true
}

async function doSeed() {
  if (seeding.value)
    return
  seeding.value = true
  try {
    const res = await axios.post('/variance-codes/seed/')
    const d = res.data?.data ?? res.data
    const n = Number(d?.created ?? 0)
    if (n > 0)
      notify(t('variance_seeded_count', { n }))
    else
      notify(t('variance_seeded_none'))
    seedDialog.value = false
    await loadCodes()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error seeding defaults'), 'error')
  }
  finally {
    seeding.value = false
  }
}

/* ---------------- table columns ---------------- */
const columns = computed<DataTableColumn<any>[]>(() => [
  { key: 'code', label: t('variance_code') },
  { key: 'name', label: t('variance_name') },
  { key: 'description', label: t('variance_description') },
  { key: 'requires_approval', label: t('variance_requires_approval') },
  { key: 'is_active', label: t('variance_is_active') },
])

const activeFilterOptions = computed(() => [
  { value: 'all', label: t('variance_filter_all') },
  { value: 'true', label: t('variance_filter_active') },
  { value: 'false', label: t('variance_filter_inactive') },
])

const countLabel = computed(() => t('variance_count_label', { n: total.value }))
</script>

<template>
  <WorkspacePage class="page">
    <PageHeader
      :title="t('variance_codes_title')"
      :subtitle="t('variance_codes_subtitle')"
    >
      <template #actions>
        <Button
          variant="secondary"
          icon="sparkle"
          :loading="seeding"
          :disabled="seeding"
          @click="openSeedConfirm"
        >
          {{ t('variance_seed_defaults') }}
        </Button>
        <Button
          variant="primary"
          icon="plus"
          @click="openCreate"
        >
          {{ t('variance_create_title') }}
        </Button>
      </template>
    </PageHeader>

    <div class="card">
      <!-- Toolbar -->
      <WorkspaceToolbar class="toolbar" style="flex-wrap: wrap;">
        <div class="grow toolbar-search">
          <Input
            v-model="search"
            icon="search"
            :placeholder="t('variance_search_placeholder')"
            :aria-label="t('variance_search_placeholder')"
          />
        </div>

        <div class="toolbar-select">
          <Select
            v-model="activeFilter"
            :options="activeFilterOptions"
            icon="filter"
          />
        </div>

        <div class="row toolbar-count" style="gap: 8px; margin-left: auto; font-size: 13px; color: var(--text-tertiary);">
          {{ countLabel }}
        </div>
      </WorkspaceToolbar>

      <div class="card__divider" />

      <!-- DataTable -->
      <DataTable
        :columns="columns"
        :rows="filteredCodes"
        row-key="id"
        :loading="loading"
        :empty-title="t('variance_empty_title')"
        :empty-sub="t('variance_empty_body')"
        empty-icon="flag"
      >
        <!-- Code -->
        <template #cell.code="{ row: c }">
          <span class="cell-strong mono">{{ c.code }}</span>
        </template>

        <!-- Name -->
        <template #cell.name="{ row: c }">
          <span class="cell-strong">{{ c.name ?? '—' }}</span>
        </template>

        <!-- Description -->
        <template #cell.description="{ row: c }">
          <span
            class="cell-muted desc-cell"
            :title="c.description ?? ''"
          >
            {{ c.description || '—' }}
          </span>
        </template>

        <!-- Requires approval -->
        <template #cell.requires_approval="{ row: c }">
          <Badge :tone="c.requires_approval ? 'warning' : 'neutral'">
            {{ c.requires_approval ? t('variance_approval_required') : t('variance_approval_not_required') }}
          </Badge>
        </template>

        <!-- Is active -->
        <template #cell.is_active="{ row: c }">
          <Badge :tone="c.is_active ? 'success' : 'neutral'" dot>
            {{ c.is_active ? t('variance_status_active') : t('variance_status_inactive') }}
          </Badge>
        </template>

        <!-- Row actions -->
        <template #row-actions="{ row: c }">
          <IconAction
            :icon="c.is_active ? 'check' : 'close'"
            :tone="c.is_active ? 'success' : 'warning'"
            :title="c.is_active ? t('variance_status_active') : t('variance_status_inactive')"
            :disabled="togglingId === c.id"
            @click="toggleActive(c)"
          />
          <IconAction
            icon="pencil"
            :title="t('Edit')"
            @click="openEdit(c)"
          />
          <IconAction
            icon="trash"
            tone="danger"
            :title="t('Delete')"
            @click="confirmDelete(c)"
          />
        </template>

        <!-- Custom empty -->
        <template #empty>
          <StateFill
            icon="flag"
            :title="t('variance_empty_title')"
            :sub="t('variance_empty_body')"
          >
            <div style="margin-top: 12px; display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
              <Button variant="secondary" icon="sparkle" @click="openSeedConfirm">
                {{ t('variance_seed_defaults') }}
              </Button>
              <Button variant="primary" icon="plus" @click="openCreate">
                {{ t('variance_create_title') }}
              </Button>
            </div>
          </StateFill>
        </template>
      </DataTable>
    </div>

    <!-- ============ Create / Edit modal ============ -->
    <Modal
      :open="dialog"
      :title="dialogMode === 'create' ? t('variance_create_title') : t('variance_edit_title')"
      @close="dialog = false"
    >
      <div class="form-grid">
        <!-- code -->
        <div class="col-6">
          <Field
            :label="t('variance_code')"
            :error="fieldErrors.code"
            :hint="dialogMode === 'create' ? t('variance_code_hint') : undefined"
          >
            <Input
              :model-value="form.code"
              :placeholder="t('variance_code_placeholder')"
              :disabled="dialogMode === 'edit'"
              :error="!!fieldErrors.code"
              @update:model-value="onCodeInput"
            />
          </Field>
        </div>

        <!-- name -->
        <div class="col-6">
          <Field
            :label="t('variance_name')"
            :error="fieldErrors.name"
          >
            <Input
              v-model="form.name"
              :placeholder="t('variance_name_placeholder')"
              maxlength="100"
              :error="!!fieldErrors.name"
            />
          </Field>
        </div>

        <!-- description -->
        <div class="col-12">
          <Field :label="t('variance_description')">
            <Textarea
              v-model="form.description"
              class="control"
              rows="3"
              :placeholder="t('variance_description_placeholder')"
              style="resize: vertical; min-height: 78px; padding: 10px 12px; font: inherit; line-height: 1.45;"
            />
          </Field>
        </div>

        <!-- requires_approval -->
        <div :class="dialogMode === 'edit' ? 'col-6' : 'col-12'">
          <Field
            :label="t('variance_requires_approval')"
            :hint="t('variance_requires_approval_hint')"
          >
            <label class="row" style="gap: 10px; cursor: pointer; padding-top: 4px;">
              <Switch v-model="form.requires_approval" />
              <span style="font-size: 13px; color: var(--text-secondary);">
                {{ form.requires_approval ? t('variance_approval_required') : t('variance_approval_not_required') }}
              </span>
            </label>
          </Field>
        </div>

        <!-- is_active (edit only) -->
        <div
          v-if="dialogMode === 'edit'"
          class="col-6"
        >
          <Field :label="t('variance_is_active')">
            <label class="row" style="gap: 10px; cursor: pointer; padding-top: 4px;">
              <Switch v-model="form.is_active" />
              <span style="font-size: 13px; color: var(--text-secondary);">
                {{ form.is_active ? t('variance_status_active') : t('variance_status_inactive') }}
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
      :title="t('Delete Variance Code')"
      :subtitle="t('This action cannot be undone')"
      @close="deleteDialog = false"
    >
      <div class="row" style="gap: 14px; align-items: flex-start;">
        <div
          class="kpi__icon t-error"
          style="width:44px; height:44px; flex:0 0 44px;"
        >
          <DesignIcon name="alert" :size="22" />
        </div>
        <div>
          <p style="margin: 0; font-weight: 600;">
            {{ selectedItem?.code }} · {{ selectedItem?.name }}
          </p>
          <p class="muted" style="margin: 6px 0 0; font-size: 14px; color: var(--text-secondary);">
            {{ t('variance_delete_confirm_q') }}
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

    <!-- ============ Seed defaults confirm modal ============ -->
    <Modal
      :open="seedDialog"
      :title="t('variance_seed_confirm_title')"
      @close="seedDialog = false"
    >
      <div class="row" style="gap: 14px; align-items: flex-start;">
        <div
          class="kpi__icon t-primary"
          style="width:44px; height:44px; flex:0 0 44px;"
        >
          <DesignIcon name="sparkle" :size="22" />
        </div>
        <div>
          <p style="margin: 0; font-size: 14px; color: var(--text-secondary); line-height: 1.5;">
            {{ t('variance_seed_confirm_body') }}
          </p>
        </div>
      </div>

      <template #footer>
        <Button
          variant="primary"
          icon="sparkle"
          :loading="seeding"
          :disabled="seeding"
          @click="doSeed"
        >
          {{ t('variance_seed_defaults') }}
        </Button>
      </template>
    </Modal>

    <!-- Snackbar (reused Vuetify toast — already mounted globally elsewhere; kept for parity) -->
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
.row {
  display: flex;
  align-items: center;
}

.toolbar-search {
  max-width: 320px;
}

.toolbar-select {
  width: 200px;
}

.desc-cell {
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
  max-width: 340px;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: var(--sp-4);
}

.form-grid .col-6 {
  grid-column: span 6;
}

.form-grid .col-12 {
  grid-column: span 12;
}

@media (max-width: 900px) {
  .toolbar-search {
    max-width: 100%;
    width: 100%;
    flex: 1 1 100%;
  }

  .toolbar-select {
    width: 100%;
    flex: 1 1 100%;
  }

  .toolbar-count {
    margin-left: 0 !important;
  }

  .desc-cell {
    max-width: 180px;
  }
}

@media (max-width: 768px) {
  .form-grid {
    grid-template-columns: 1fr;
  }

  .form-grid .col-6,
  .form-grid .col-12 {
    grid-column: span 1;
  }
}
</style>

<route lang="yaml">
name: stock-variance-codes
meta:
  action: manage
  subject: all
</route>
