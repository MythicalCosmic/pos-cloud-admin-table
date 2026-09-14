<script setup lang="ts">
import WorkspacePage from '@/components/design/workspace/WorkspacePage.vue'
import WorkspaceToolbar from '@/components/design/workspace/WorkspaceToolbar.vue'
import Textarea from '@/components/design/Textarea.vue'
/* ============================================================
   NOTIFICATION TEMPLATES — Telegram message templates per type+lang
   Built with design primitives (PageHeader, Card, DataTable, Modal,
   Field, Input, Select, Switch, Button, Badge, IconAction, DesignIcon,
   StateFill).
   API: /api/admins/notifications/templates/ via notificationsApi.
   ============================================================ */
import type { DataTableColumn } from '@/components/design/DataTable.vue'
import { notificationsApi as axios } from '@/plugins/axios'
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
import StateFill from '@/components/design/StateFill.vue'
import Switch from '@/components/design/Switch.vue'

const { t } = useI18n({ useScope: 'global' })
const { snackbar, snackbarMsg, snackbarColor, notify } = useNotify()

// ============================================================
// State
// ============================================================
const templates = ref<any[]>([])
const loading = ref(false)

// filters
const search = ref('')
const typeFilter = ref('')
const languageFilter = ref('')
const enabledOnly = ref(false)

const page = ref(1)
const itemsPerPage = ref(10)

// create/edit modal
const dialogOpen = ref(false)
const editing = ref<any>(null)
const dialogLoading = ref(false)
const editingId = ref<number | string | null>(null)

const form = ref<{
  notification_type: string
  name: string
  language: string
  template_text: string
  description: string
  is_enabled: boolean
}>({
  notification_type: '',
  name: '',
  language: 'uz',
  template_text: '',
  description: '',
  is_enabled: true,
})

const errors = ref<Record<string, string>>({})

// delete confirm
const deleteDialog = ref(false)
const deleting = ref<any>(null)
const deleteBusy = ref(false)
const deletingId = ref<number | string | null>(null)

// toggle confirm
const toggleConfirm = ref<{ row: any; next: boolean } | null>(null)
const togglingId = ref<number | string | null>(null)

// preview modal
const previewOpen = ref(false)
const previewing = ref<any>(null)
const previewContext = ref<string>('{}')
const previewResult = ref<string>('')
const previewLoading = ref(false)
const previewError = ref<string>('')

// ============================================================
// Enum tones
// ============================================================
const STATUS_TONE: Record<string, 'success' | 'neutral'> = {
  ENABLED: 'success',
  DISABLED: 'neutral',
}

const LANG_TONE: Record<string, 'info' | 'primary' | 'neutral'> = {
  uz: 'primary',
  ru: 'info',
  en: 'neutral',
}

const LANGUAGE_OPTIONS = computed(() => [
  { value: 'uz', label: t('lang_uz') },
  { value: 'ru', label: t('lang_ru') },
  { value: 'en', label: t('lang_en') },
])

const LANGUAGE_FILTER_OPTIONS = computed(() => [
  { value: '', label: t('ntpl_filter_language') },
  ...LANGUAGE_OPTIONS.value,
])

// ============================================================
// API
// ============================================================
async function load() {
  loading.value = true
  try {
    const res = await axios.get('/templates/')
    const d = res.data?.data ?? res.data
    const list = Array.isArray(d) ? d : (d?.templates ?? d?.items ?? d?.results ?? [])
    templates.value = list ?? []
  }
  catch {
    templates.value = []
    notify(t('Failed to load'), 'error')
  }
  finally {
    loading.value = false
  }
}

onMounted(load)

// ============================================================
// Client-side filter + paginate
// ============================================================
const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  const tq = typeFilter.value.trim().toLowerCase()
  return templates.value.filter((r) => {
    if (q) {
      const hay = `${r.notification_type ?? ''} ${r.name ?? ''}`.toLowerCase()
      if (!hay.includes(q))
        return false
    }
    if (tq && !String(r.notification_type ?? '').toLowerCase().includes(tq))
      return false
    if (languageFilter.value && r.language !== languageFilter.value)
      return false
    if (enabledOnly.value && r.is_enabled !== true)
      return false
    return true
  })
})

const totalFiltered = computed(() => filtered.value.length)

const pagedRows = computed(() => {
  const start = (page.value - 1) * itemsPerPage.value
  return filtered.value.slice(start, start + itemsPerPage.value)
})

watch([search, typeFilter, languageFilter, enabledOnly], () => { page.value = 1 })

// ============================================================
// Dialog actions
// ============================================================
function resetForm() {
  form.value = {
    notification_type: '',
    name: '',
    language: 'uz',
    template_text: '',
    description: '',
    is_enabled: true,
  }
  errors.value = {}
}

function openCreate() {
  editing.value = null
  resetForm()
  dialogOpen.value = true
}

function openEdit(row: any) {
  if (editingId.value !== null)
    return
  editingId.value = row.id
  editing.value = row
  form.value = {
    notification_type: row.notification_type ?? '',
    name: row.name ?? '',
    language: row.language ?? 'uz',
    template_text: row.template_text ?? '',
    description: row.description ?? '',
    is_enabled: row.is_enabled ?? true,
  }
  errors.value = {}
  dialogOpen.value = true
}

function closeDialog() {
  if (dialogLoading.value)
    return
  dialogOpen.value = false
  editingId.value = null
}

function validateForm(): boolean {
  const e: Record<string, string> = {}
  if (!editing.value && !form.value.notification_type.trim())
    e.notification_type = t('Required')
  if (!form.value.name.trim())
    e.name = t('Required')
  if (!form.value.language)
    e.language = t('Required')
  if (!form.value.template_text.trim())
    e.template_text = t('Required')
  errors.value = e
  return Object.keys(e).length === 0
}

async function save() {
  if (!validateForm()) {
    notify(Object.values(errors.value)[0], 'error')
    return
  }
  dialogLoading.value = true
  try {
    const payload: any = {
      name: form.value.name.trim(),
      language: form.value.language,
      template_text: form.value.template_text,
      description: form.value.description ?? '',
      is_enabled: form.value.is_enabled,
    }
    if (!editing.value)
      payload.notification_type = form.value.notification_type.trim()

    if (editing.value) {
      await axios.put(`/templates/${editing.value.id}/`, payload)
      notify(t('ntpl_toast_updated'))
    }
    else {
      await axios.post('/templates/', payload)
      notify(t('ntpl_toast_created'))
    }
    dialogOpen.value = false
    editingId.value = null
    await load()
  }
  catch (e: any) {
    const msg = e?.response?.data?.message ?? e?.response?.data?.detail
    if (msg && /duplicate|exists|already/i.test(String(msg)))
      notify(t('ntpl_error_duplicate_type'), 'error')
    else if (msg && /unsafe|disallowed|format/i.test(String(msg)))
      notify(t('ntpl_error_unsafe_token'), 'error')
    else
      notify(msg ?? t('Error'), 'error')
  }
  finally {
    dialogLoading.value = false
  }
}

// ============================================================
// Toggle enabled (confirm modal)
// ============================================================
function requestToggle(row: any) {
  if (togglingId.value !== null)
    return
  toggleConfirm.value = { row, next: !row.is_enabled }
}

function cancelToggle() {
  toggleConfirm.value = null
}

async function confirmToggle() {
  if (!toggleConfirm.value)
    return
  const { row, next } = toggleConfirm.value
  toggleConfirm.value = null
  togglingId.value = row.id
  try {
    await axios.put(`/templates/${row.id}/`, {
      name: row.name,
      language: row.language,
      template_text: row.template_text,
      description: row.description ?? '',
      is_enabled: next,
    })
    notify(t('ntpl_toast_updated'))
    await load()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
  finally {
    togglingId.value = null
  }
}

// ============================================================
// Delete (confirm modal)
// ============================================================
function confirmDelete(row: any) {
  if (deletingId.value !== null)
    return
  deletingId.value = row.id
  deleting.value = row
  deleteDialog.value = true
}

function closeDeleteDialog() {
  if (deleteBusy.value)
    return
  deleteDialog.value = false
  deletingId.value = null
}

async function doDelete() {
  if (!deleting.value)
    return
  deleteBusy.value = true
  try {
    await axios.delete(`/templates/${deleting.value.id}/`)
    notify(t('ntpl_toast_deleted'))
    deleteDialog.value = false
    deletingId.value = null
    await load()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
  finally {
    deleteBusy.value = false
  }
}

// ============================================================
// Preview modal
// ============================================================
function openPreview(row: any) {
  previewing.value = row
  previewContext.value = '{}'
  previewResult.value = ''
  previewError.value = ''
  previewOpen.value = true
}

function closePreview() {
  if (previewLoading.value)
    return
  previewOpen.value = false
  previewing.value = null
}

async function runPreview() {
  if (!previewing.value)
    return
  let ctx: any = {}
  try {
    ctx = JSON.parse(previewContext.value || '{}')
  }
  catch {
    previewError.value = t('ntpl_preview_invalid_json')
    notify(t('ntpl_preview_invalid_json'), 'error')
    return
  }
  previewError.value = ''
  previewLoading.value = true
  try {
    const res = await axios.post(`/templates/${previewing.value.id}/preview/`, {
      context: ctx,
    })
    const d = res.data?.data ?? res.data
    previewResult.value = d?.rendered ?? d?.text ?? d?.result ?? JSON.stringify(d)
    notify(t('ntpl_toast_preview_ok'))
  }
  catch (e: any) {
    const msg = e?.response?.data?.message ?? e?.response?.data?.detail
    if (msg && /missing|placeholder|key/i.test(String(msg)))
      previewError.value = t('ntpl_error_missing_key')
    else if (msg && /unsafe|disallowed|format/i.test(String(msg)))
      previewError.value = t('ntpl_error_unsafe_token')
    else
      previewError.value = msg ?? t('Error')
    notify(previewError.value, 'error')
  }
  finally {
    previewLoading.value = false
  }
}

// ============================================================
// Filter chips
// ============================================================
const languageLabelMap = computed<Record<string, string>>(() => ({
  uz: t('lang_uz'),
  ru: t('lang_ru'),
  en: t('lang_en'),
}))

const activeFilters = computed(() => {
  const out: { k: string; label: string; val: string; clear: () => void }[] = []
  if (search.value)
    out.push({ k: 'q', label: t('Search'), val: search.value, clear: () => { search.value = '' } })
  if (typeFilter.value)
    out.push({ k: 'type', label: t('ntpl_filter_type'), val: typeFilter.value, clear: () => { typeFilter.value = '' } })
  if (languageFilter.value)
    out.push({
      k: 'lang',
      label: t('ntpl_filter_language'),
      val: languageLabelMap.value[languageFilter.value] ?? languageFilter.value,
      clear: () => { languageFilter.value = '' },
    })
  if (enabledOnly.value)
    out.push({ k: 'en', label: t('ntpl_filter_enabled'), val: t('Yes'), clear: () => { enabledOnly.value = false } })
  return out
})

function clearAllFilters() {
  search.value = ''
  typeFilter.value = ''
  languageFilter.value = ''
  enabledOnly.value = false
}

// ============================================================
// DataTable columns
// ============================================================
const columns: DataTableColumn<any>[] = [
  { key: 'notification_type', label: t('ntpl_col_type'), sortable: true },
  { key: 'name', label: t('ntpl_col_name'), sortable: true },
  { key: 'language', label: t('ntpl_col_language'), sortable: true, width: 130 },
  { key: 'template_text', label: t('ntpl_col_body'), sortable: false },
  { key: 'is_enabled', label: t('ntpl_col_status'), sortable: true, width: 130 },
]

function truncate(s: string, n = 90) {
  const text = String(s ?? '').replace(/\s+/g, ' ').trim()
  return text.length > n ? `${text.slice(0, n)}…` : text
}

const tablePagination = computed(() => ({
  page: page.value,
  perPage: itemsPerPage.value,
  total: totalFiltered.value,
  onPage: (n: number) => { page.value = n },
  onPerPage: (n: number) => { itemsPerPage.value = n; page.value = 1 },
}))

// ============================================================
// ESC handler — close top-most modal
// ============================================================
function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape')
    return
  if (toggleConfirm.value) {
    cancelToggle()
    e.preventDefault()
    return
  }
  if (deleteDialog.value) {
    if (!deleteBusy.value) {
      deleteDialog.value = false
      deletingId.value = null
      e.preventDefault()
    }
    return
  }
  if (previewOpen.value) {
    closePreview()
    e.preventDefault()
    return
  }
  if (dialogOpen.value) {
    closeDialog()
    e.preventDefault()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <WorkspacePage class="page">
    <!-- Page header -->
    <PageHeader
      :title="t('ntpl_page_title')"
      :subtitle="t('ntpl_page_subtitle')"
    >
      <template #actions>
        <Button
          variant="ghost"
          icon="refresh"
          :disabled="loading"
          @click="load"
        >
          {{ t('Refresh') }}
        </Button>
        <Button
          variant="primary"
          icon="plus"
          @click="openCreate"
        >
          {{ t('ntpl_action_create') }}
        </Button>
      </template>
    </PageHeader>

    <!-- Toolbar + table -->
    <Card>
      <WorkspaceToolbar class="toolbar tpl-toolbar">
        <!-- Search -->
        <div class="tpl-toolbar__search">
          <Input
            v-model="search"
            icon="search"
            :placeholder="t('ntpl_search_placeholder')"
          />
        </div>

        <!-- Type filter -->
        <div class="tpl-toolbar__type">
          <Input
            v-model="typeFilter"
            icon="tag"
            :placeholder="t('ntpl_filter_type')"
          />
        </div>

        <!-- Language filter -->
        <div class="tpl-toolbar__lang">
          <Select
            v-model="languageFilter"
            icon="translate"
            :placeholder="t('ntpl_filter_language')"
            :options="LANGUAGE_FILTER_OPTIONS"
          />
        </div>

        <!-- Enabled only switch -->
        <div
          class="row tpl-toolbar__switch"
          style="gap:10px;align-items:center;height:42px;padding:0 10px;"
        >
          <Switch
            v-model="enabledOnly"
            :aria-label="t('ntpl_filter_enabled')"
          />
          <span style="font-size:13px;color:var(--text-secondary);white-space:nowrap;">
            {{ t('ntpl_filter_enabled') }}
          </span>
        </div>
      </WorkspaceToolbar>

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

      <!-- Table -->
      <DataTable
        :columns="columns"
        :rows="pagedRows"
        row-key="id"
        :loading="loading"
        :pagination="tablePagination"
        :initial-sort="{ key: 'notification_type', dir: 'asc' }"
        :empty-title="t('ntpl_empty_state_title')"
        :empty-sub="t('ntpl_empty_state_body')"
        empty-icon="bell"
      >
        <!-- Cell renderers -->
        <template #cell.notification_type="{ row }">
          <span class="mono cell-strong">{{ row.notification_type }}</span>
        </template>

        <template #cell.name="{ row }">
          <span class="cell-strong nowrap">{{ row.name }}</span>
        </template>

        <template #cell.language="{ row }">
          <Badge
            :tone="LANG_TONE[row.language] ?? 'neutral'"
            dot
          >
            {{ t(`ntpl_lang_${row.language}`) }}
          </Badge>
        </template>

        <template #cell.template_text="{ row }">
          <span
            class="cell-muted tpl-cell-body"
            :title="row.template_text"
          >
            {{ truncate(row.template_text) }}
          </span>
        </template>

        <template #cell.is_enabled="{ row }">
          <Badge
            :tone="STATUS_TONE[row.is_enabled ? 'ENABLED' : 'DISABLED']"
            dot
          >
            {{ t(`ntpl_status_${row.is_enabled ? 'ENABLED' : 'DISABLED'}`) }}
          </Badge>
        </template>

        <!-- Row actions -->
        <template #row-actions="{ row }">
          <IconAction
            icon="sparkle"
            tone="primary"
            :title="t('ntpl_action_preview')"
            @click="openPreview(row)"
          />
          <IconAction
            :icon="togglingId === row.id ? 'refresh' : (row.is_enabled ? 'pause' : 'play')"
            tone="warning"
            :title="t('ntpl_action_toggle')"
            :disabled="togglingId === row.id"
            @click="requestToggle(row)"
          />
          <IconAction
            icon="pencil"
            tone="primary"
            :title="t('ntpl_action_edit')"
            :disabled="editingId === row.id"
            @click="openEdit(row)"
          />
          <IconAction
            icon="trash"
            tone="danger"
            :title="t('ntpl_action_delete')"
            :disabled="deletingId === row.id"
            @click="confirmDelete(row)"
          />
        </template>

        <!-- Empty state -->
        <template #empty>
          <StateFill
            icon="bell"
            :title="t('ntpl_empty_state_title')"
            :sub="t('ntpl_empty_state_body')"
          >
            <template #action>
              <div class="tpl-empty-actions">
                <Button
                  v-if="activeFilters.length > 0"
                  variant="ghost"
                  @click="clearAllFilters"
                >
                  {{ t('Clear filters') }}
                </Button>
                <Button
                  variant="primary"
                  icon="plus"
                  @click="openCreate"
                >
                  {{ t('ntpl_action_create') }}
                </Button>
              </div>
            </template>
          </StateFill>
        </template>
      </DataTable>
    </Card>

    <!-- Create / Edit modal -->
    <Modal
      :open="dialogOpen"
      :title="editing ? t('ntpl_edit_modal_title') : t('ntpl_create_modal_title')"
      :subtitle="t('ntpl_page_subtitle')"
      :width="640"
      @close="closeDialog"
    >
      <form @submit.prevent="save">
        <div class="form-grid">
          <!-- notification_type slug -->
          <Field
            :label="t('ntpl_field_type')"
            class="span-2"
            :error="errors.notification_type"
            :hint="!errors.notification_type ? (editing ? t('ntpl_hint_type_locked') : t('ntpl_hint_type')) : undefined"
          >
            <Input
              v-model="form.notification_type"
              icon="tag"
              :placeholder="t('ntpl_placeholder_type_example')"
              :disabled="!!editing"
              :error="!!errors.notification_type"
            />
          </Field>

          <!-- name -->
          <Field
            :label="t('ntpl_field_name')"
            :error="errors.name"
          >
            <Input
              v-model="form.name"
              :error="!!errors.name"
            />
          </Field>

          <!-- language -->
          <Field
            :label="t('ntpl_field_language')"
            :error="errors.language"
          >
            <Select
              v-model="form.language"
              icon="translate"
              :options="LANGUAGE_OPTIONS"
              :error="!!errors.language"
            />
          </Field>

          <!-- template_text -->
          <Field
            :label="t('ntpl_field_body')"
            class="span-2"
            :error="errors.template_text"
            :hint="!errors.template_text ? t('ntpl_hint_body') : undefined"
          >
            <Textarea
              v-model="form.template_text"
              :error="errors.template_text"
              rows="8"
              style="resize:vertical; font-family:var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); font-size:13px; line-height:1.55; min-height:160px;"
              :placeholder="t('ntpl_field_body')"
            />
          </Field>

          <!-- description -->
          <Field
            :label="t('ntpl_field_description')"
            class="span-2"
            :hint="t('ntpl_hint_desc')"
          >
            <Textarea
              v-model="form.description"
              rows="4"
              style="resize:vertical; font-size:13px; line-height:1.55; min-height:88px;"
              :placeholder="t('ntpl_field_description')"
            />
          </Field>

          <!-- is_enabled -->
          <Field
            :label="t('ntpl_field_enabled')"
            class="span-2"
          >
            <div
              class="row"
              style="gap:10px;align-items:center;height:42px;"
            >
              <Switch v-model="form.is_enabled" />
              <span style="font-size:14px;font-weight:500;color:var(--text-secondary);">
                {{ t(`ntpl_status_${form.is_enabled ? 'ENABLED' : 'DISABLED'}`) }}
              </span>
            </div>
          </Field>
        </div>
      </form>

      <template #footer>
        <Button
          variant="ghost"
          :disabled="dialogLoading"
          @click="closeDialog"
        >
          {{ t('ntpl_cancel') }}
        </Button>
        <Button
          variant="primary"
          icon="check"
          :loading="dialogLoading"
          :disabled="dialogLoading"
          @click="save"
        >
          {{ t('ntpl_save') }}
        </Button>
      </template>
    </Modal>

    <!-- Preview modal -->
    <Modal
      :open="previewOpen"
      :title="t('ntpl_preview_title')"
      :subtitle="previewing?.name"
      :width="720"
      @close="closePreview"
    >
      <div class="form-grid">
        <Field
          :label="t('ntpl_preview_context_label')"
          class="span-2"
          :hint="t('ntpl_preview_context_hint')"
          :error="previewError || undefined"
        >
          <Textarea
            v-model="previewContext"
            :error="previewError"
            rows="6"
            style="resize:vertical; font-family:var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); font-size:13px; line-height:1.55; min-height:120px;"
            :placeholder="t('ntpl_preview_context_example')"
          />
        </Field>

        <Field
          :label="t('ntpl_preview_result')"
          class="span-2"
        >
          <div
            v-if="previewResult"
            style="
              padding:14px 16px;
              border:1px solid rgb(var(--v-theme-divider));
              border-radius:var(--r-sm, 8px);
              background:rgb(var(--v-theme-surface-soft, var(--v-theme-surface)));
              font-size:14px;
              line-height:1.6;
              color:var(--text);
              white-space:pre-wrap;
              max-height:280px;
              overflow:auto;
            "
          >{{ previewResult }}</div>
          <div
            v-else
            class="muted"
            style="
              padding:18px 16px;
              border:1px dashed rgb(var(--v-theme-divider));
              border-radius:var(--r-sm, 8px);
              font-size:13px;
              text-align:center;
            "
          >
            {{ t('ntpl_preview_empty') }}
          </div>
        </Field>
      </div>

      <template #footer>
        <Button
          variant="ghost"
          :disabled="previewLoading"
          @click="closePreview"
        >
          {{ t('ntpl_cancel') }}
        </Button>
        <Button
          variant="primary"
          icon="sparkle"
          :loading="previewLoading"
          :disabled="previewLoading"
          @click="runPreview"
        >
          {{ t('ntpl_preview_run') }}
        </Button>
      </template>
    </Modal>

    <!-- Delete confirm modal -->
    <Modal
      :open="deleteDialog"
      :title="t('ntpl_action_delete')"
      :subtitle="t('ntpl_delete_confirm')"
      :width="460"
      @close="closeDeleteDialog"
    >
      <div
        class="row"
        style="gap:14px;align-items:flex-start;"
      >
        <div
          class="kpi__icon t-error"
          style="width:44px;height:44px;flex:0 0 44px;"
        >
          <DesignIcon
            name="alert"
            :size="22"
          />
        </div>
        <div>
          <p style="margin:0;font-weight:600;">
            {{ deleting?.name }}
          </p>
          <p
            class="muted"
            style="margin:6px 0 0;font-size:13px;"
          >
            <span class="mono">{{ deleting?.notification_type }}</span>
            <span v-if="deleting?.language"> · {{ t(`ntpl_lang_${deleting.language}`) }}</span>
          </p>
          <p
            class="muted"
            style="margin:10px 0 0;font-size:14px;"
          >
            {{ t('ntpl_delete_confirm') }}
          </p>
        </div>
      </div>

      <template #footer>
        <Button
          variant="ghost"
          :disabled="deleteBusy"
          @click="closeDeleteDialog"
        >
          {{ t('ntpl_cancel') }}
        </Button>
        <Button
          variant="danger"
          icon="trash"
          :loading="deleteBusy"
          :disabled="deleteBusy"
          @click="doDelete"
        >
          {{ t('ntpl_action_delete') }}
        </Button>
      </template>
    </Modal>

    <!-- Toggle confirm modal -->
    <Modal
      :open="!!toggleConfirm"
      :title="t('ntpl_action_toggle')"
      :width="440"
      @close="cancelToggle"
    >
      <div
        v-if="toggleConfirm"
        class="row"
        style="gap:14px;align-items:flex-start;"
      >
        <div
          class="kpi__icon t-warning"
          style="width:44px;height:44px;flex:0 0 44px;"
        >
          <DesignIcon
            name="alert"
            :size="22"
          />
        </div>
        <div>
          <p style="margin:0;font-weight:600;">
            {{ toggleConfirm.row.name }}
          </p>
          <p
            class="muted"
            style="margin:6px 0 0;font-size:14px;"
          >
            {{ t(`ntpl_status_${toggleConfirm.next ? 'ENABLED' : 'DISABLED'}`) }}
          </p>
        </div>
      </div>

      <template #footer>
        <Button
          variant="ghost"
          @click="cancelToggle"
        >
          {{ t('ntpl_cancel') }}
        </Button>
        <Button
          variant="primary"
          @click="confirmToggle"
        >
          {{ t('ntpl_save') }}
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
  </WorkspacePage>
</template>

<style scoped>
.tpl-toolbar {
  flex-wrap: wrap;
}
.tpl-toolbar__search {
  flex: 1 1 220px;
  max-width: 300px;
  min-width: 0;
}
.tpl-toolbar__type {
  width: 220px;
  min-width: 0;
}
.tpl-toolbar__lang {
  width: 180px;
  min-width: 0;
}
.tpl-toolbar__switch {
  flex-wrap: nowrap;
}
.tpl-cell-body {
  display: block;
  max-width: 380px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tpl-empty-actions {
  margin-top: 12px;
  display: flex;
  gap: 8px;
  justify-content: center;
  flex-wrap: wrap;
}

@media (max-width: 1024px) {
  .tpl-toolbar__search,
  .tpl-toolbar__type,
  .tpl-toolbar__lang {
    flex: 1 1 100%;
    max-width: 100%;
    width: 100%;
  }
  .tpl-toolbar__switch {
    flex: 1 1 100%;
  }
  .tpl-cell-body {
    max-width: 220px;
  }
  :deep(.form-grid) {
    grid-template-columns: 1fr;
  }
  :deep(.form-grid .span-2) {
    grid-column: 1 / -1;
  }
}

@media (max-width: 768px) {
  .tpl-cell-body {
    max-width: 180px;
  }
}
</style>

<route lang="yaml">
meta:
  action: manage
  subject: all
</route>
