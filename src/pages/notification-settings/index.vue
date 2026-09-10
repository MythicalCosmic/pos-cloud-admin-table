<script setup lang="ts">
/* ============================================================
   NOTIFICATION SETTINGS — Telegram bot, recipients, master switch
   Single-record settings surface backed by:
     GET  /api/admins/notifications/settings/
     PUT  /api/admins/notifications/settings/        (brand_name, bot_token, chat_ids, is_enabled, timeout)
     GET  /api/admins/notifications/settings/status/ (bot_online, queue_count, is_enabled)
     POST /api/admins/notifications/settings/test/   (no body)

   The backend exposes a singleton NotificationSettings row, so the
   "table" surface here is a 1-row summary derived from the GET response
   joined with the live /status/ payload. Filters operate client-side
   over that 1-row view per the spec (is_enabled toggle + bot_online
   select). All editing happens in a single Modal whose form fields are
   driven by spec.edit_fields.
   ============================================================ */
import type { DataTableColumn } from '@/components/design/DataTable.vue'
import axios from '@/plugins/axios'
import Badge from '@/components/design/Badge.vue'
import Button from '@/components/design/Button.vue'
import Card from '@/components/design/Card.vue'
import DataTable from '@/components/design/DataTable.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import Field from '@/components/design/Field.vue'
import IconAction from '@/components/design/IconAction.vue'
import Input from '@/components/design/Input.vue'
import Kpi from '@/components/design/Kpi.vue'
import Modal from '@/components/design/Modal.vue'
import PageHeader from '@/components/design/PageHeader.vue'
import Select from '@/components/design/Select.vue'
import Switch from '@/components/design/Switch.vue'
import { fmtNum } from '@/components/design/utils/format'

const { t } = useI18n({ useScope: 'global' })
const { snackbar, snackbarMsg, snackbarColor, notify } = useNotify()

// ============================================================
// Settings + live status
// ============================================================
interface TemplateType {
  type: string
  name: string
  is_enabled: boolean
}

interface NotifSettings {
  brand_name: string
  is_enabled: boolean
  bot_configured: boolean
  chat_ids: (string | number)[]
  timeout: number
  types: TemplateType[]
}

interface NotifStatus {
  is_enabled: boolean
  bot_online: boolean
  queue_count: number
}

const settings = ref<NotifSettings | null>(null)
const status = ref<NotifStatus | null>(null)

const loading = ref(false)
const statusLoading = ref(false)

// Filters (client-only — derived per spec)
const filterEnabled = ref<boolean | null>(null)
const filterBotOnline = ref<string>('')

// Edit modal
const editOpen = ref(false)
const editLoading = ref(false)
const form = ref({
  brand_name: '',
  bot_token: '',
  chat_ids: [] as string[],
  is_enabled: true,
  timeout: 10,
})
const chatInput = ref('')
const errors = ref<Record<string, string>>({})

// Test confirm modal
const testConfirmOpen = ref(false)
const testBusy = ref(false)

// ============================================================
// API
// ============================================================
async function load() {
  loading.value = true
  try {
    const res = await axios.get('/notifications/settings/')
    const d = res.data?.data ?? res.data
    settings.value = {
      brand_name: d?.brand_name ?? '',
      is_enabled: !!d?.is_enabled,
      bot_configured: !!d?.bot_configured,
      chat_ids: Array.isArray(d?.chat_ids) ? d.chat_ids : [],
      timeout: Number(d?.timeout ?? 10),
      types: Array.isArray(d?.types) ? d.types : [],
    }
  }
  catch {
    notify(t('notif_toast_load_failed'), 'error')
  }
  finally {
    loading.value = false
  }
}

async function loadStatus() {
  statusLoading.value = true
  try {
    const res = await axios.get('/notifications/settings/status/')
    const d = res.data?.data ?? res.data
    status.value = {
      is_enabled: !!d?.is_enabled,
      bot_online: !!d?.bot_online,
      queue_count: Number(d?.queue_count ?? 0),
    }
  }
  catch {
    // Soft fail — keep the page usable even if /status/ blips.
    status.value = null
  }
  finally {
    statusLoading.value = false
  }
}

async function refreshAll() {
  await Promise.all([load(), loadStatus()])
}

onMounted(refreshAll)

// ============================================================
// Edit modal lifecycle
// ============================================================
function openEdit() {
  if (!settings.value)
    return
  form.value = {
    brand_name: settings.value.brand_name ?? '',
    bot_token: '',
    chat_ids: (settings.value.chat_ids ?? []).map(String),
    is_enabled: !!settings.value.is_enabled,
    timeout: Number(settings.value.timeout ?? 10),
  }
  chatInput.value = ''
  errors.value = {}
  editOpen.value = true
}

function closeEdit() {
  if (editLoading.value)
    return
  editOpen.value = false
}

function addChip() {
  const raw = chatInput.value.trim()
  if (!raw)
    return
  // Accept comma-separated paste too.
  const parts = raw.split(/[,\s]+/).map(p => p.trim()).filter(Boolean)
  for (const p of parts) {
    if (!form.value.chat_ids.includes(p))
      form.value.chat_ids.push(p)
  }
  chatInput.value = ''
}

function removeChip(id: string) {
  form.value.chat_ids = form.value.chat_ids.filter(x => x !== id)
}

function onChipKey(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault()
    addChip()
  }
  else if (e.key === 'Backspace' && !chatInput.value && form.value.chat_ids.length > 0) {
    form.value.chat_ids.pop()
  }
}

function validate(): boolean {
  const err: Record<string, string> = {}
  if (!form.value.brand_name.trim())
    err.brand_name = t('This field is required')
  else if (form.value.brand_name.length > 100)
    err.brand_name = t('Too long')
  if (form.value.bot_token && form.value.bot_token.length > 200)
    err.bot_token = t('Too long')
  const to = Number(form.value.timeout)
  if (Number.isNaN(to) || to < 1 || to > 120)
    err.timeout = t('Must be between 1 and 120')
  errors.value = err

  return Object.keys(err).length === 0
}

async function save() {
  // Flush any unstaged chip text so a user who typed an id and clicked Save
  // doesn't silently lose it.
  if (chatInput.value.trim())
    addChip()
  if (!validate()) {
    notify(Object.values(errors.value)[0], 'error')

    return
  }
  editLoading.value = true
  try {
    const payload: Record<string, unknown> = {
      brand_name: form.value.brand_name,
      chat_ids: form.value.chat_ids,
      is_enabled: form.value.is_enabled,
      timeout: Number(form.value.timeout),
    }
    // bot_token is write-only — only send when the admin actually typed
    // something, otherwise BE would clobber the stored token with "".
    if (form.value.bot_token)
      payload.bot_token = form.value.bot_token
    await axios.put('/notifications/settings/', payload)
    notify(t('notif_toast_saved'))
    editOpen.value = false
    await refreshAll()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('notif_toast_save_failed'), 'error')
  }
  finally {
    editLoading.value = false
  }
}

// ============================================================
// Test notification — confirmed via modal per spec
// ============================================================
function openTestConfirm() {
  testConfirmOpen.value = true
}

async function sendTest() {
  testBusy.value = true
  try {
    await axios.post('/notifications/settings/test/')
    notify(t('notif_toast_test_queued'))
    testConfirmOpen.value = false
    // Refresh status so the queue count update is reflected immediately.
    await loadStatus()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('notif_toast_test_failed'), 'error')
  }
  finally {
    testBusy.value = false
  }
}

// ============================================================
// Filter chips (client-side)
// ============================================================
const filteredRows = computed(() => {
  if (!settings.value)
    return []
  const row = buildRow.value
  if (filterEnabled.value !== null && row.is_enabled !== filterEnabled.value)
    return []
  if (filterBotOnline.value) {
    const wantOnline = filterBotOnline.value === 'online'
    if (row.bot_online !== wantOnline)
      return []
  }
  return [row]
})

const buildRow = computed(() => {
  const s = settings.value
  const enabledTypes = (s?.types ?? []).filter(x => x.is_enabled).length
  const totalTypes = (s?.types ?? []).length

  return {
    id: 1,
    brand_name: s?.brand_name ?? '',
    is_enabled: !!s?.is_enabled,
    bot_configured: !!s?.bot_configured,
    bot_online: !!status.value?.bot_online,
    chat_count: (s?.chat_ids ?? []).length,
    chat_ids: (s?.chat_ids ?? []).map(String),
    timeout: Number(s?.timeout ?? 0),
    queue_count: Number(status.value?.queue_count ?? 0),
    types_enabled: enabledTypes,
    types_total: totalTypes,
  }
})

const activeFilters = computed(() => {
  const out: { k: string; label: string; val: string; clear: () => void }[] = []
  if (filterEnabled.value !== null) {
    out.push({
      k: 'en',
      label: t('notif_field_is_enabled'),
      val: filterEnabled.value ? t('notif_master_true') : t('notif_master_false'),
      clear: () => { filterEnabled.value = null },
    })
  }
  if (filterBotOnline.value) {
    out.push({
      k: 'bo',
      label: t('notif_status_bot_label'),
      val: filterBotOnline.value === 'online' ? t('notif_bot_online') : t('notif_bot_offline'),
      clear: () => { filterBotOnline.value = '' },
    })
  }
  return out
})

function clearAllFilters() {
  filterEnabled.value = null
  filterBotOnline.value = ''
}

// ============================================================
// KPI strip — live snapshot of the singleton
// ============================================================
const kpiMaster = computed(() => ({
  label: t('notif_status_master_label'),
  value: settings.value ? (settings.value.is_enabled ? 1 : 0) : null,
  icon: 'bell',
  tone: settings.value?.is_enabled ? 'success' as const : 'neutral' as const,
  sub: settings.value
    ? (settings.value.is_enabled ? t('notif_master_true') : t('notif_master_false'))
    : '',
}))
const kpiBot = computed(() => ({
  label: t('notif_status_bot_label'),
  value: status.value ? (status.value.bot_online ? 1 : 0) : null,
  icon: 'sparkle',
  tone: status.value?.bot_online ? 'success' as const : 'error' as const,
  sub: status.value
    ? (status.value.bot_online ? t('notif_bot_online') : t('notif_bot_offline'))
    : '',
}))
const kpiQueue = computed(() => ({
  label: t('notif_status_queue_label'),
  value: status.value ? fmtNum(status.value.queue_count) : null,
  icon: 'inbox',
  tone: 'info' as const,
}))
const kpiChats = computed(() => ({
  label: t('notif_card_recipients'),
  value: settings.value ? fmtNum(settings.value.chat_ids.length) : null,
  icon: 'users',
  tone: 'primary' as const,
}))

// ============================================================
// DataTable columns — derived from spec.columns
// ============================================================
const columns: DataTableColumn<any>[] = [
  { key: 'brand_name', label: t('notif_field_brand_name') },
  { key: 'is_enabled', label: t('notif_status_master_label') },
  { key: 'bot_configured', label: t('notif_status_bot_token_label') },
  { key: 'bot_online', label: t('notif_status_bot_label') },
  { key: 'chat_count', label: t('notif_card_recipients'), align: 'right' },
  { key: 'chat_ids', label: t('notif_field_chat_ids') },
  { key: 'timeout', label: t('notif_field_timeout'), align: 'right' },
  { key: 'queue_count', label: t('notif_status_queue_label'), align: 'right' },
  { key: 'types', label: t('notif_card_telegram') },
]

// ESC closes the top-most modal first.
function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape')
    return
  if (testConfirmOpen.value) {
    if (!testBusy.value) {
      testConfirmOpen.value = false
      e.preventDefault()
    }
    return
  }
  if (editOpen.value) {
    closeEdit()
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
  <div class="page">
    <!-- Page header -->
    <PageHeader
      :title="t('notif_settings_title')"
      :subtitle="t('notif_settings_subtitle')"
    >
      <template #actions>
        <Button
          variant="ghost"
          icon="refresh"
          :loading="loading || statusLoading"
          :disabled="loading || statusLoading"
          @click="refreshAll"
        >
          {{ t('notif_action_refresh') }}
        </Button>
        <Button
          variant="secondary"
          icon="send"
          :disabled="!settings || !settings.bot_configured || settings.chat_ids.length === 0"
          @click="openTestConfirm"
        >
          {{ t('notif_action_test') }}
        </Button>
        <Button
          variant="primary"
          icon="edit"
          :disabled="!settings"
          @click="openEdit"
        >
          {{ t('notif_action_save') }}
        </Button>
      </template>
    </PageHeader>

    <!-- KPI strip -->
    <div
      class="grid cols-4"
      style="margin-bottom: var(--sp-5);"
    >
      <Kpi :data="kpiMaster" />
      <Kpi :data="kpiBot" />
      <Kpi :data="kpiQueue" />
      <Kpi :data="kpiChats" />
    </div>

    <!-- Toolbar + table -->
    <Card>
      <div class="toolbar">
        <!-- is_enabled — switch filter -->
        <div
          class="control"
          style="width:auto;gap:10px;"
        >
          <span style="font-size:13px;color:var(--text-secondary);font-weight:500;">
            {{ t('notif_field_is_enabled') }}
          </span>
          <Switch
            :model-value="filterEnabled === true"
            @update:model-value="(v) => filterEnabled = (filterEnabled === true ? null : (v ? true : false))"
          />
        </div>

        <!-- bot_online — select filter -->
        <div class="filter-select">
          <Select
            v-model="filterBotOnline"
            icon="filter"
            :placeholder="t('notif_status_bot_label')"
            :options="[
              { value: 'online', label: t('notif_bot_online') },
              { value: 'offline', label: t('notif_bot_offline') },
            ]"
          />
        </div>

        <div class="toolbar-spacer" />

        <Button
          variant="ghost"
          icon="refresh"
          :loading="statusLoading"
          @click="loadStatus"
        >
          {{ t('notif_action_refresh') }}
        </Button>
      </div>

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

      <!-- Table — single-row summary of the settings singleton -->
      <DataTable
        :columns="columns"
        :rows="filteredRows"
        row-key="id"
        :loading="loading"
        :per-page="10"
      >
        <template #cell.brand_name="{ row }">
          <span class="cell-strong">{{ row.brand_name || '—' }}</span>
        </template>

        <template #cell.is_enabled="{ row }">
          <Badge
            :tone="row.is_enabled ? 'success' : 'neutral'"
            dot
          >
            {{ row.is_enabled ? t('notif_master_true') : t('notif_master_false') }}
          </Badge>
        </template>

        <template #cell.bot_configured="{ row }">
          <Badge
            :tone="row.bot_configured ? 'success' : 'warning'"
            dot
          >
            {{ row.bot_configured ? t('notif_bot_token_true') : t('notif_bot_token_false') }}
          </Badge>
        </template>

        <template #cell.bot_online="{ row }">
          <Badge
            :tone="row.bot_online ? 'success' : 'error'"
            dot
          >
            {{ row.bot_online ? t('notif_bot_status_true') : t('notif_bot_status_false') }}
          </Badge>
        </template>

        <template #cell.chat_count="{ row }">
          <span class="mono">{{ fmtNum(row.chat_count) }}</span>
        </template>

        <template #cell.chat_ids="{ row }">
          <span
            v-if="row.chat_ids.length === 0"
            class="cell-muted"
          >—</span>
          <span
            v-else
            class="mono cell-muted chat-ids-cell"
            :title="row.chat_ids.join(t('notif_list_separator'))"
          >
            {{ row.chat_ids.join(t('notif_list_separator')) }}
          </span>
        </template>

        <template #cell.timeout="{ row }">
          <span class="mono">{{ t('notif_timeout_seconds', { n: fmtNum(row.timeout) }) }}</span>
        </template>

        <template #cell.queue_count="{ row }">
          <span class="mono">{{ fmtNum(row.queue_count) }}</span>
        </template>

        <template #cell.types="{ row }">
          <Badge
            :tone="row.types_enabled === row.types_total && row.types_total > 0 ? 'success' : 'info'"
          >
            {{ t('notif_status_types_count', { enabled: row.types_enabled, total: row.types_total }) }}
          </Badge>
        </template>

        <template #row-actions="{ row }">
          <IconAction
            icon="edit"
            tone="primary"
            :title="t('notif_action_save')"
            @click="openEdit()"
          />
          <IconAction
            icon="send"
            tone="primary"
            :title="t('notif_action_test')"
            :disabled="!row.bot_configured || row.chat_count === 0"
            @click="openTestConfirm()"
          />
          <IconAction
            icon="refresh"
            :title="t('notif_action_refresh')"
            :disabled="statusLoading"
            @click="loadStatus"
          />
        </template>

        <template #empty>
          <div class="statefill">
            <div class="statefill__icon">
              <DesignIcon
                name="belloff"
                :size="24"
              />
            </div>
            <div class="statefill__title">
              {{ t('No results') }}
            </div>
            <div style="margin-top:12px;">
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
      :title="t('notif_settings_title')"
      :subtitle="t('notif_settings_subtitle')"
      :width="720"
      class="notif-modal-edit"
      @close="closeEdit"
    >
      <form @submit.prevent="save">
        <div class="form-grid">
          <!-- Brand name -->
          <Field
            :label="t('notif_field_brand_name')"
            class="span-2"
            :error="errors.brand_name"
            :hint="!errors.brand_name ? t('notif_field_brand_name_hint') : undefined"
          >
            <Input
              v-model="form.brand_name"
              icon="tag"
              :error="!!errors.brand_name"
              :placeholder="t('notif_field_brand_name')"
              :maxlength="100"
            />
          </Field>

          <!-- Bot token -->
          <Field
            :label="t('notif_field_bot_token')"
            class="span-2"
            :error="errors.bot_token"
            :hint="!errors.bot_token ? t('notif_field_bot_token_hint') : undefined"
          >
            <Input
              v-model="form.bot_token"
              type="password"
              icon="lock"
              :error="!!errors.bot_token"
              :placeholder="settings?.bot_configured ? t('notif_bot_token_masked') : t('notif_field_bot_token')"
              :maxlength="200"
              autocomplete="new-password"
            />
          </Field>

          <!-- Chat ids — chip list -->
          <Field
            :label="t('notif_field_chat_ids')"
            class="span-2"
            :hint="t('notif_field_chat_ids_hint')"
          >
            <div class="chip-input">
              <span
                v-for="id in form.chat_ids"
                :key="id"
                class="chip"
              >
                <span class="mono">{{ id }}</span>
                <button
                  type="button"
                  :aria-label="t('Remove')"
                  class="chip__x"
                  :title="t('notif_chip_remove')"
                  @click="removeChip(id)"
                >
                  <DesignIcon
                    name="close"
                    :size="13"
                  />
                </button>
              </span>
              <Input
                v-model="chatInput"
                class="chip-input__field"
                :placeholder="form.chat_ids.length === 0 ? t('notif_field_chat_id_placeholder') : ''"
                inputmode="numeric"
                @keydown="onChipKey"
                @blur="addChip" />
            </div>
            <div
              v-if="form.chat_ids.length === 0"
              class="hint-soft"
            >
              {{ t('notif_empty_chat_ids') }}
            </div>
            <div class="hint-soft">
              {{ t('notif_help_chat_id') }}
            </div>
          </Field>

          <!-- Master switch -->
          <Field :label="t('notif_field_is_enabled')">
            <div
              class="row"
              style="gap:10px;align-items:center;height:42px;"
            >
              <Switch v-model="form.is_enabled" />
              <span style="font-size:14px;font-weight:500;color:var(--text-secondary);">
                {{ form.is_enabled ? t('notif_master_true') : t('notif_master_false') }}
              </span>
            </div>
            <span class="field__hint">{{ t('notif_field_is_enabled_hint') }}</span>
          </Field>

          <!-- Timeout -->
          <Field
            :label="t('notif_field_timeout')"
            :error="errors.timeout"
            :hint="!errors.timeout ? t('notif_field_timeout_hint') : undefined"
          >
            <Input
              v-model="form.timeout"
              type="number"
              icon="clock"
              :error="!!errors.timeout"
              :placeholder="t('notif_field_timeout')"
              min="1"
              max="120"
            />
          </Field>
        </div>
      </form>

      <template #footer>
        <Button
          variant="primary"
          icon="check"
          :loading="editLoading"
          :disabled="editLoading"
          @click="save"
        >
          {{ t('notif_action_save') }}
        </Button>
      </template>
    </Modal>

    <!-- Test confirm modal -->
    <Modal
      :open="testConfirmOpen"
      :title="t('notif_action_test')"
      :subtitle="t('notif_action_test_hint')"
      :width="440"
      class="notif-modal-test"
      @close="testConfirmOpen = false"
    >
      <div
        class="row"
        style="gap:14px;align-items:flex-start;"
      >
        <div
          class="kpi__icon t-info"
          style="width:44px;height:44px;flex:0 0 44px;"
        >
          <DesignIcon
            name="send"
            :size="22"
          />
        </div>
        <div>
          <p style="margin:0;font-weight:600;">
            {{ t('notif_action_test_confirm') }}
          </p>
          <p
            class="muted"
            style="margin:6px 0 0;font-size:14px;"
          >
            {{ t('notif_status_chat_count', { n: settings?.chat_ids?.length ?? 0 }) }}
          </p>
        </div>
      </div>

      <template #footer>
        <Button
          variant="primary"
          icon="send"
          :loading="testBusy"
          :disabled="testBusy"
          @click="sendTest"
        >
          {{ t('notif_action_test') }}
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
  </div>
</template>

<style scoped>
/* Chip input — mirrors the .control surface but lays out children as
   wrapped chips followed by a transparent free-text input. */
.chip-input {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-height: 42px;
  padding: 6px 10px;
  border: 1px solid var(--border, rgb(var(--v-theme-border)));
  border-radius: var(--r-sm, 8px);
  background: var(--surface, rgb(var(--v-theme-surface)));
  transition: border-color 0.15s, box-shadow 0.15s;
}
.chip-input:focus-within {
  border-color: var(--primary, rgb(var(--v-theme-primary)));
  box-shadow: 0 0 0 3px rgba(var(--v-theme-primary), 0.15);
}
.chip-input .chip {
  margin: 0;
}
.chip-input__field {
  flex: 1;
  min-width: 120px;
  border: none;
  outline: none;
  background: transparent;
  font: inherit;
  color: inherit;
  padding: 4px 0;
}
.hint-soft {
  margin-top: 6px;
  font-size: 12px;
  color: var(--text-tertiary, rgb(var(--v-theme-text-secondary)));
  line-height: 1.4;
}

/* Filter select — sane min-width with collapse on small screens. */
.filter-select {
  inline-size: 200px;
  min-inline-size: 160px;
}

/* Flex spacer inside .toolbar — hidden on mobile so trailing button doesn't wrap to its own row. */
.toolbar-spacer {
  flex: 1;
}

/* Truncate chat ids list inside the table cell. */
.chat-ids-cell {
  display: inline-block;
  max-inline-size: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}

/* Toolbar should wrap when room runs out. */
.toolbar {
  flex-wrap: wrap;
}

/* Tablet — KPI strip 4 → 2 columns. */
@media (max-width: 1024px) {
  .grid.cols-4 {
    grid-template-columns: repeat(2, 1fr);
  }
}

/* Phone — toolbar/form collapse; KPI stays 2-up per spec. */
@media (max-width: 768px) {
  .form-grid {
    grid-template-columns: 1fr !important;
  }
  .form-grid .span-2 {
    grid-column: 1 / -1;
  }
  .filter-select {
    inline-size: 100%;
    min-inline-size: 0;
  }
  .toolbar-spacer {
    display: none;
  }
  .chat-ids-cell {
    max-inline-size: 140px;
  }
}

/* Small phone — KPI 2 → 1 column. */
@media (max-width: 420px) {
  .grid.cols-4 {
    grid-template-columns: 1fr;
  }
}

/* Modals: cap declared width by viewport so 720/440 don't overflow. */
.notif-modal-edit :deep(.modal__panel),
.notif-modal-edit :deep(.modal__dialog) {
  max-inline-size: min(720px, calc(100vw - 32px));
}
.notif-modal-test :deep(.modal__panel),
.notif-modal-test :deep(.modal__dialog) {
  max-inline-size: min(440px, calc(100vw - 32px));
}
</style>

<route lang="yaml">
meta:
  action: manage
  subject: all
</route>
