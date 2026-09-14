<script setup lang="ts">
import WorkspacePage from '@/components/design/workspace/WorkspacePage.vue'
import WorkspaceToolbar from '@/components/design/workspace/WorkspaceToolbar.vue'
import Textarea from '@/components/design/Textarea.vue'
/* ============================================================
   NOTIFICATION TYPES — toggle delivery and edit message templates
   Backend: GET /api/admins/notifications/types/
            PUT /api/admins/notifications/types/<slug>/  { is_enabled?, template_text? }
   Spec: client-side filtering (search + bucket + status), edit-only modal
   (slug + name read-only). Toggle enable/disable inline; disable confirmed.
   ============================================================ */
import type { DataTableColumn } from '@/components/design/DataTable.vue'
import { notificationsApi } from '@/plugins/axios'
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
import Switch from '@/components/design/Switch.vue'

const { t } = useI18n({ useScope: 'global' })
const { snackbar, snackbarMsg, snackbarColor, notify } = useNotify()

// ============================================================
// State
// ============================================================
interface NotifType {
  notification_type: string
  name: string
  is_enabled: boolean
  template_text?: string
  [k: string]: any
}

const items = ref<NotifType[]>([])
const loading = ref(false)

const search = ref('')
const bucketFilter = ref('')
const statusFilter = ref('')

// edit modal
const editOpen = ref(false)
const editing = ref<NotifType | null>(null)
const editSaving = ref(false)
const editLoading = ref(false)
const form = ref({ is_enabled: true, template_text: '' })
const errors = ref<Record<string, string>>({})

// disable confirm
const disableConfirm = ref<NotifType | null>(null)
const togglingSlug = ref<string | null>(null)

// ============================================================
// Bucket derivation (mirrors notifications/models.py bucket_for)
// contains 'contract' -> contract; 'document' -> document;
// 'order'|'paid' -> order_paid; 'daily'|'summary'|'shift' -> daily;
// else system.
// ============================================================
type Bucket = 'order_paid' | 'daily' | 'contract' | 'document' | 'system'

function bucketFor(slug: string | undefined | null): Bucket {
  const s = String(slug ?? '').toLowerCase()
  if (s.includes('contract'))
    return 'contract'
  if (s.includes('document'))
    return 'document'
  if (s.includes('order') || s.includes('paid'))
    return 'order_paid'
  if (s.includes('daily') || s.includes('summary') || s.includes('shift'))
    return 'daily'
  return 'system'
}

const BUCKET_TONE: Record<Bucket, 'success' | 'info' | 'warning' | 'neutral'> = {
  order_paid: 'success',
  daily: 'info',
  contract: 'warning',
  document: 'neutral',
  system: 'neutral',
}

// ============================================================
// API
// ============================================================
async function loadTypes() {
  loading.value = true
  try {
    const res = await notificationsApi.get('/types/')
    const d = res.data?.data ?? res.data
    const list = Array.isArray(d) ? d : (d?.types ?? d?.items ?? d?.results ?? [])

    items.value = (list as any[]).map(r => ({
      notification_type: r.notification_type ?? r.type ?? r.slug ?? r.key ?? '',
      name: r.name ?? r.display_name ?? r.notification_type ?? '',
      is_enabled: Boolean(r.is_enabled ?? r.enabled ?? false),
      template_text: r.template_text ?? r.template ?? '',
      ...r,
    }))
  }
  catch {
    notify(t('notif_error_load'), 'error')
  }
  finally {
    loading.value = false
  }
}

onMounted(loadTypes)

// ============================================================
// Client-side filter pipeline
// ============================================================
const filteredRows = computed<NotifType[]>(() => {
  const q = search.value.trim().toLowerCase()
  const bf = bucketFilter.value
  const sf = statusFilter.value

  return items.value.filter(r => {
    if (q) {
      const slug = String(r.notification_type ?? '').toLowerCase()
      const nm = String(r.name ?? '').toLowerCase()
      if (!slug.includes(q) && !nm.includes(q))
        return false
    }
    if (bf && bucketFor(r.notification_type) !== bf)
      return false
    if (sf === 'true' && !r.is_enabled)
      return false
    if (sf === 'false' && r.is_enabled)
      return false
    return true
  })
})

// ============================================================
// Filter chips
// ============================================================
const activeFilters = computed(() => {
  const out: { k: string; label: string; val: string; clear: () => void }[] = []
  if (search.value)
    out.push({ k: 'q', label: t('notif_filter_q'), val: search.value, clear: () => { search.value = '' } })
  if (bucketFilter.value)
    out.push({ k: 'b', label: t('notif_filter_bucket'), val: t(`notif_bucket_${bucketFilter.value}`), clear: () => { bucketFilter.value = '' } })
  if (statusFilter.value)
    out.push({ k: 's', label: t('notif_filter_status'), val: statusFilter.value === 'true' ? t('notif_status_enabled') : t('notif_status_disabled'), clear: () => { statusFilter.value = '' } })
  return out
})

function clearAllFilters() {
  search.value = ''
  bucketFilter.value = ''
  statusFilter.value = ''
}

// ============================================================
// Select option lists
// ============================================================
const bucketOptions = computed(() => [
  { value: 'order_paid', label: t('notif_bucket_order_paid') },
  { value: 'daily', label: t('notif_bucket_daily') },
  { value: 'contract', label: t('notif_bucket_contract') },
  { value: 'document', label: t('notif_bucket_document') },
  { value: 'system', label: t('notif_bucket_system') },
])

const statusOptions = computed(() => [
  { value: 'true', label: t('notif_status_enabled') },
  { value: 'false', label: t('notif_status_disabled') },
])

// ============================================================
// Edit modal
// ============================================================
async function openEdit(row: NotifType) {
  editing.value = row
  form.value = {
    is_enabled: Boolean(row.is_enabled),
    template_text: row.template_text ?? '',
  }
  errors.value = {}
  editOpen.value = true

  // BE GET /types/ omits template_text — fetch from /templates/?notification_type=<slug>
  // so the textarea opens with the actual stored template instead of empty.
  editLoading.value = true
  try {
    const res = await notificationsApi.get('/templates/', {
      params: { notification_type: row.notification_type },
    })
    const d = res.data?.data ?? res.data
    const list = Array.isArray(d) ? d : (d?.templates ?? d?.items ?? d?.results ?? [])
    const tpl = (list as any[])[0]
    if (tpl) {
      form.value.template_text = tpl.template_text ?? ''
      // also cache on the row so re-open is instant
      row.template_text = tpl.template_text ?? ''
    }
  }
  catch {
    // Silent: textarea stays empty, user can still author a fresh template
  }
  finally {
    editLoading.value = false
  }
}

function closeEdit() {
  if (editSaving.value)
    return
  editOpen.value = false
  editing.value = null
}

async function saveEdit() {
  if (!editing.value)
    return
  errors.value = {}
  editSaving.value = true
  try {
    const slug = editing.value.notification_type
    const payload: any = {
      is_enabled: form.value.is_enabled,
      template_text: form.value.template_text ?? '',
    }
    await notificationsApi.put(`/types/${encodeURIComponent(slug)}/`, payload)
    notify(t('notif_toast_enabled'))
    editOpen.value = false
    editing.value = null
    await loadTypes()
  }
  catch (e: any) {
    const data = e?.response?.data
    const fieldErrs = data?.errors ?? data?.error?.fields
    if (fieldErrs && typeof fieldErrs === 'object') {
      const norm: Record<string, string> = {}
      for (const [k, v] of Object.entries(fieldErrs))
        norm[k] = Array.isArray(v) ? String(v[0]) : String(v)
      errors.value = norm
    }
    notify(data?.message ?? t('notif_error_save'), 'error')
  }
  finally {
    editSaving.value = false
  }
}

// ============================================================
// Toggle enable / disable (PUT { is_enabled })
// ============================================================
async function performToggle(row: NotifType, next: boolean) {
  if (togglingSlug.value !== null)
    return
  togglingSlug.value = row.notification_type
  try {
    await notificationsApi.put(`/types/${encodeURIComponent(row.notification_type)}/`, { is_enabled: next })
    notify(next ? t('notif_toast_enabled') : t('notif_toast_disabled'))
    await loadTypes()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('notif_error_save'), 'error')
  }
  finally {
    togglingSlug.value = null
  }
}

function onToggleClick(row: NotifType) {
  if (row.is_enabled) {
    // disable -> confirm
    disableConfirm.value = row
    return
  }
  performToggle(row, true)
}

function confirmDisable() {
  if (!disableConfirm.value)
    return
  const row = disableConfirm.value
  disableConfirm.value = null
  performToggle(row, false)
}

function cancelDisable() {
  disableConfirm.value = null
}

// ============================================================
// DataTable columns (client-side sort + pagination via DataTable)
// ============================================================
const columns: DataTableColumn<NotifType>[] = [
  { key: 'notification_type', label: t('notif_col_type'), sortable: true, width: 260 },
  { key: 'name', label: t('notif_col_name'), sortable: true },
  { key: 'bucket', label: t('notif_col_bucket'), sortValue: r => bucketFor(r.notification_type), sortable: true, width: 200 },
  { key: 'is_enabled', label: t('notif_col_status'), sortable: true, width: 140 },
]

// ESC closes whichever modal is on top
function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape')
    return
  if (disableConfirm.value) {
    cancelDisable()
    e.preventDefault()
    return
  }
  if (editOpen.value) {
    closeEdit()
    e.preventDefault()
  }
}

onMounted(() => { window.addEventListener('keydown', onKeydown) })
onBeforeUnmount(() => { window.removeEventListener('keydown', onKeydown) })
</script>

<template>
  <WorkspacePage class="page">
    <!-- Header -->
    <PageHeader
      :title="t('notif_page_title')"
      :subtitle="t('notif_page_subtitle')"
    >
      <template #actions>
        <Button
          variant="secondary"
          icon="refresh"
          :loading="loading"
          @click="loadTypes"
        >
          {{ t('notif_action_refresh') }}
        </Button>
      </template>
    </PageHeader>

    <!-- Toolbar + table -->
    <Card>
      <WorkspaceToolbar class="toolbar nt-toolbar">
        <!-- Search -->
        <div class="nt-toolbar__search">
          <Input
            v-model="search"
            icon="search"
            :placeholder="t('notif_filter_q_ph')"
          />
        </div>

        <!-- Bucket -->
        <div class="nt-toolbar__bucket">
          <Select
            v-model="bucketFilter"
            icon="filter"
            :placeholder="t('notif_bucket_all')"
            :options="bucketOptions"
          />
        </div>

        <!-- Status -->
        <div class="nt-toolbar__status">
          <Select
            v-model="statusFilter"
            :placeholder="t('notif_status_all')"
            :options="statusOptions"
          />
        </div>
      </WorkspaceToolbar>

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
        :rows="filteredRows"
        row-key="notification_type"
        :loading="loading"
        :initial-sort="{ key: 'notification_type', dir: 'asc' }"
        :empty-title="t('notif_empty_title')"
        :empty-sub="t('notif_empty_subtitle')"
        empty-icon="bell"
      >
        <!-- Cells -->
        <template #cell.notification_type="{ row }">
          <span class="mono cell-strong">{{ row.notification_type }}</span>
        </template>

        <template #cell.name="{ row }">
          <span class="cell-muted">{{ row.name || '—' }}</span>
        </template>

        <template #cell.bucket="{ row }">
          <Badge :tone="BUCKET_TONE[bucketFor(row.notification_type)]">
            {{ t(`notif_bucket_${bucketFor(row.notification_type)}`) }}
          </Badge>
        </template>

        <template #cell.is_enabled="{ row }">
          <Badge
            :tone="row.is_enabled ? 'success' : 'neutral'"
            dot
          >
            {{ row.is_enabled ? t('notif_state_enabled') : t('notif_state_disabled') }}
          </Badge>
        </template>

        <!-- Row actions -->
        <template #row-actions="{ row }">
          <IconAction
            icon="pencil"
            tone="primary"
            :title="t('notif_action_edit')"
            @click="openEdit(row)"
          />
          <IconAction
            v-if="row.is_enabled"
            icon="pause"
            tone="warning"
            :title="t('notif_action_disable')"
            :disabled="togglingSlug === row.notification_type"
            @click="onToggleClick(row)"
          />
          <IconAction
            v-else
            icon="play"
            tone="success"
            :title="t('notif_action_enable')"
            :disabled="togglingSlug === row.notification_type"
            @click="onToggleClick(row)"
          />
        </template>

        <!-- Empty state -->
        <template #empty>
          <div class="statefill">
            <div class="statefill__icon">
              <DesignIcon
                name="bell"
                :size="24"
              />
            </div>
            <div class="statefill__title">
              {{ t('notif_empty_title') }}
            </div>
            <div
              class="statefill__sub"
              style="margin-top:6px;"
            >
              {{ t('notif_empty_subtitle') }}
            </div>
            <div
              v-if="activeFilters.length > 0"
              style="margin-top:12px;"
            >
              <Button
                variant="secondary"
                @click="clearAllFilters"
              >
                {{ t('Clear filters') }}
              </Button>
            </div>
          </div>
        </template>
      </DataTable>
    </Card>

    <!-- Edit modal -->
    <Modal
      :open="editOpen"
      :title="t('notif_modal_edit_title')"
      :subtitle="editing?.name || editing?.notification_type || ''"
      :width="640"
      class="nt-modal-edit"
      @close="closeEdit"
    >
      <form
        v-if="editing"
        @submit.prevent="saveEdit"
      >
        <div class="form-grid">
          <!-- Type slug (readonly) -->
          <Field
            :label="t('notif_field_type')"
            class="span-2"
          >
            <Input
              class="is-disabled"
              icon="lock"
              :model-value="editing.notification_type"
              disabled
            />
          </Field>

          <!-- Display name (readonly) -->
          <Field
            :label="t('notif_field_name')"
            class="span-2"
          >
            <Input
              class="is-disabled"
              icon="info"
              :model-value="editing.name"
              disabled
            />
          </Field>

          <!-- Enabled switch -->
          <Field
            :label="t('notif_field_enabled')"
            class="span-2"
          >
            <div
              class="row nt-switch-row"
              style="gap:10px;align-items:center;"
            >
              <Switch v-model="form.is_enabled" />
              <span style="font-size:14px;font-weight:500;color:var(--text-secondary);">
                {{ form.is_enabled ? t('notif_state_enabled') : t('notif_state_disabled') }}
              </span>
            </div>
          </Field>

          <!-- Template text -->
          <Field
            :label="t('notif_field_template_text')"
            class="span-2"
            :error="errors.template_text"
            :hint="!errors.template_text ? t('notif_field_template_text_help') : undefined"
          >
            <div :class="['control', errors.template_text && 'is-error']">
              <Textarea
                v-model="form.template_text"
                rows="8"
                class="nt-textarea"
                :placeholder="editLoading ? t('notif_template_loading') : t('notif_field_template_text')"
                :disabled="editLoading"
              />
            </div>
          </Field>
        </div>
      </form>

      <template #footer>
        <Button
          variant="ghost"
          :disabled="editSaving"
          @click="closeEdit"
        >
          {{ t('notif_btn_cancel') }}
        </Button>
        <Button
          variant="primary"
          icon="check"
          :loading="editSaving"
          :disabled="editSaving || editLoading"
          @click="saveEdit"
        >
          {{ t('notif_btn_save') }}
        </Button>
      </template>
    </Modal>

    <!-- Disable confirm modal -->
    <Modal
      :open="!!disableConfirm"
      :title="t('notif_action_disable')"
      :subtitle="disableConfirm?.name || disableConfirm?.notification_type || ''"
      :width="440"
      class="nt-modal-confirm"
      @close="cancelDisable"
    >
      <div
        v-if="disableConfirm"
        class="row nt-confirm-row"
      >
        <div class="kpi__icon t-warning nt-confirm-icon">
          <DesignIcon
            name="alert"
            :size="22"
          />
        </div>
        <div>
          <p style="margin:0;font-weight:600;">
            {{ t('notif_confirm_disable') }}
          </p>
          <p
            class="muted"
            style="margin:6px 0 0;font-size:14px;"
          >
            <span class="mono">{{ disableConfirm.notification_type }}</span>
          </p>
        </div>
      </div>

      <template #footer>
        <Button
          variant="ghost"
          @click="cancelDisable"
        >
          {{ t('notif_btn_cancel') }}
        </Button>
        <Button
          variant="danger"
          icon="pause"
          @click="confirmDisable"
        >
          {{ t('notif_action_disable') }}
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
.nt-toolbar {
  flex-wrap: wrap;
}
.nt-toolbar__search {
  flex: 1 1 240px;
  max-width: 320px;
  min-width: 200px;
}
.nt-toolbar__bucket {
  flex: 0 1 220px;
  min-width: 180px;
}
.nt-toolbar__status {
  flex: 0 1 200px;
  min-width: 160px;
}
.nt-switch-row {
  min-height: 42px;
}
.nt-textarea {
  resize: vertical;
  min-height: 160px;
  font-family: var(--font-mono, monospace);
  font-size: 13px;
  line-height: 1.5;
  inline-size: 100%;
  background: transparent;
  border: 0;
  outline: 0;
  color: var(--text);
}
.nt-confirm-row {
  gap: 14px;
  align-items: flex-start;
}
.nt-confirm-icon {
  inline-size: 44px;
  block-size: 44px;
  flex: 0 0 44px;
}

@media (max-width: 768px) {
  .nt-toolbar {
    gap: 8px;
  }
  .nt-toolbar__search,
  .nt-toolbar__bucket,
  .nt-toolbar__status {
    flex: 1 1 100%;
    max-width: 100%;
    min-width: 0;
    width: 100%;
  }
  .nt-textarea {
    min-height: 120px;
  }
  .nt-confirm-row {
    gap: 10px;
  }
  .nt-confirm-icon {
    inline-size: 36px;
    block-size: 36px;
    flex: 0 0 36px;
  }
}
</style>

<route lang="yaml">
meta:
  action: manage
  subject: all
</route>
