<script setup lang="ts">
/* ============================================================
   NOTIFICATION QUEUE — pending Telegram notifications
   Backend:
     GET  /api/admins/notifications/queue/           — list
     POST /api/admins/notifications/queue/process/   — drain queue
     POST /api/admins/notifications/queue/clear/     — wipe queue
   The list endpoint returns a flat array (no GET params) — all
   filtering / search / pagination is client-side.
   Plain HTML + design-shell classes. No Vuetify, no Tailwind.
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
import Kpi from '@/components/design/Kpi.vue'
import Modal from '@/components/design/Modal.vue'
import PageHeader from '@/components/design/PageHeader.vue'
import Select from '@/components/design/Select.vue'
import Switch from '@/components/design/Switch.vue'

const { t } = useI18n({ useScope: 'global' })
const { snackbar, snackbarMsg, snackbarColor, notify } = useNotify()

// ============================================================
// Buckets (mirror ROUTABLE_TYPES in notifications/models.py).
// Raw NotificationTemplate.notification_type values like
// "hr.contract_expiry" map to a bucket via slug heuristics.
// ============================================================
type Bucket = 'order_paid' | 'daily' | 'contract' | 'document' | 'system'

const BUCKETS: Bucket[] = ['order_paid', 'daily', 'contract', 'document', 'system']

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

const BUCKET_TONE: Record<Bucket, 'success' | 'info' | 'warning' | 'neutral' | 'primary'> = {
  order_paid: 'success',
  daily: 'info',
  contract: 'warning',
  document: 'primary',
  system: 'neutral',
}

const BUCKET_ICON: Record<Bucket, string> = {
  order_paid: 'dollar',
  daily: 'calendar',
  contract: 'receipt',
  document: 'box',
  system: 'sliders',
}

// ============================================================
// State
// ============================================================
interface QueueItem {
  type: string
  message: string
  chat_ids: (string | number)[] | null
  // index assigned client-side since the server has no ids
  idx?: number
}

const items = ref<QueueItem[]>([])
// Mirrors QueueService.MAX_PENDING in alpha_pos/notifications/services/queue_service.py.
// BE doesn't surface the cap in any response, so we mirror the constant here so the
// "Capacity" KPI shows a real number instead of "—". Update if BE constant changes.
const QUEUE_MAX_PENDING = 500
const capacity = ref<number | null>(QUEUE_MAX_PENDING)
const loading = ref(false)

// filters (client-side)
const typeFilter = ref<string>('')
const targetedOnly = ref(false)
const search = ref('')

// pagination (client-side; DataTable handles it internally when
// `pagination` prop is omitted, but we manage perPage explicitly so
// we can tune for queue size)
const page = ref(1)
const perPage = ref(10)

// modals
const viewOpen = ref(false)
const viewing = ref<QueueItem | null>(null)

const confirmProcessOpen = ref(false)
const processing = ref(false)

const confirmClearOpen = ref(false)
const clearing = ref(false)

// ============================================================
// API
// ============================================================
async function loadQueue() {
  loading.value = true
  try {
    const res = await notificationsApi.get('/queue/')
    const d = res.data?.data ?? res.data
    const raw: any[]
      = d?.queue
        ?? d?.items
        ?? d?.results
        ?? (Array.isArray(d) ? d : [])

    items.value = raw.map((r: any, i: number) => ({
      type: String(r.type ?? r.notification_type ?? ''),
      message: String(r.message ?? r.text ?? r.body ?? ''),
      chat_ids: Array.isArray(r.chat_ids)
        ? r.chat_ids
        : (r.chat_ids === null || r.chat_ids === undefined ? null : [r.chat_ids]),
      idx: i + 1,
    }))

    // Capacity may live on the same payload or in a sibling field. BE
    // (alpha_pos QueueService) currently doesn't surface the cap, so we keep
    // the QUEUE_MAX_PENDING fallback. If/when BE adds a capacity field, it
    // wins automatically.
    if (typeof d?.capacity === 'number')
      capacity.value = d.capacity
    else if (typeof d?.max === 'number')
      capacity.value = d.max
    else if (typeof d?.limit === 'number')
      capacity.value = d.limit
    else
      capacity.value = QUEUE_MAX_PENDING
  }
  catch {
    notify(t('Failed to load queue'), 'error')
    items.value = []
  }
  finally {
    loading.value = false
  }
}

async function processQueue() {
  if (processing.value)
    return
  // Snapshot queue size BEFORE the call — used to detect the Telegram-offline
  // case. BE (alpha_pos QueueService.process) silently returns sent=0,failed=0
  // when TelegramService.is_online() is False — there is no `offline` flag in
  // the response. Heuristic: if we had pending items going in but nothing was
  // sent or failed coming out, the bot was offline.
  const hadPending = items.value.length
  processing.value = true
  try {
    const res = await notificationsApi.post('/queue/process/')
    // Response shape (alpha_pos): { success, data: { sent, failed } }
    // `success` lives on the wrapper, NOT inside `data`.
    const body = res.data ?? {}
    const d = body?.data ?? body
    const sent = Number(d?.sent ?? 0)
    const failed = Number(d?.failed ?? 0)
    const wrapperSuccess = body?.success

    // Offline detection. Priority:
    //   1. explicit flag (future-proof if BE adds one)
    //   2. wrapper success=false
    //   3. had pending items but BE reports 0 processed and 0 failed
    const looksOffline
      = d?.telegram_offline === true
      || d?.offline === true
      || wrapperSuccess === false
      || (hadPending > 0 && sent === 0 && failed === 0)

    if (looksOffline)
      notify(t('notif_queue_toast_offline'), 'warning')
    else
      notify(t('notif_queue_toast_processed', { sent, failed }))

    confirmProcessOpen.value = false
    await loadQueue()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
  finally {
    processing.value = false
  }
}

async function clearQueue() {
  if (clearing.value)
    return
  clearing.value = true
  try {
    await notificationsApi.post('/queue/clear/')
    notify(t('notif_queue_toast_cleared'))
    confirmClearOpen.value = false
    await loadQueue()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
  finally {
    clearing.value = false
  }
}

onMounted(loadQueue)

// debounce search
const debSearch = useDebounceFn(() => { page.value = 1 }, 250)

watch(search, debSearch)
watch([typeFilter, targetedOnly], () => { page.value = 1 })

// ============================================================
// Client-side filtering
// ============================================================
const filtered = computed<QueueItem[]>(() => {
  let arr = items.value
  if (typeFilter.value) {
    arr = arr.filter(it => bucketFor(it.type) === typeFilter.value)
  }
  if (targetedOnly.value) {
    arr = arr.filter(it => it.chat_ids !== null && it.chat_ids !== undefined)
  }
  if (search.value.trim()) {
    const q = search.value.trim().toLowerCase()

    arr = arr.filter(it => it.message.toLowerCase().includes(q))
  }

  return arr
})

// ============================================================
// KPIs
// ============================================================
const kpiPending = computed(() => ({
  label: t('notif_queue_kpi_pending'),
  value: items.value.length,
  icon: 'bell',
  tone: 'primary' as const,
}))

const kpiTargeted = computed(() => ({
  label: t('notif_queue_kpi_targeted'),
  value: items.value.filter(it => it.chat_ids !== null && it.chat_ids !== undefined).length,
  icon: 'retry',
  tone: 'warning' as const,
}))

const kpiCapacity = computed(() => ({
  label: t('notif_queue_kpi_capacity'),
  value: capacity.value !== null && capacity.value !== undefined ? capacity.value : '—',
  icon: 'inbox',
  tone: 'info' as const,
  sub: t('notif_queue_kpi_capacity_sub'),
}))

// ============================================================
// Options
// ============================================================
const typeOptions = computed(() => BUCKETS.map(v => ({ value: v, label: t(`notif_queue_type_${v}`) })))

// ============================================================
// Filter chips
// ============================================================
const activeFilters = computed(() => {
  const out: { k: string; label: string; val: string; clear: () => void }[] = []

  if (search.value)
    out.push({ k: 'q', label: t('notif_queue_filter_search'), val: search.value, clear: () => { search.value = '' } })
  if (typeFilter.value)
    out.push({ k: 'type', label: t('notif_queue_filter_type'), val: t(`notif_queue_type_${typeFilter.value}`), clear: () => { typeFilter.value = '' } })
  if (targetedOnly.value)
    out.push({ k: 'targeted', label: t('notif_queue_filter_targeted'), val: t('Yes'), clear: () => { targetedOnly.value = false } })

  return out
})

function clearFilters() {
  search.value = ''
  typeFilter.value = ''
  targetedOnly.value = false
}

// ============================================================
// Columns
// ============================================================
const columns: DataTableColumn<QueueItem>[] = [
  { key: 'idx', label: t('notif_queue_col_index'), sortable: true, align: 'right', width: 64, sortValue: r => r.idx ?? 0 },
  { key: 'type', label: t('notif_queue_col_type'), sortable: true, width: 170, sortValue: r => bucketFor(r.type) },
  { key: 'message', label: t('notif_queue_col_message'), sortable: false },
  { key: 'chat_ids', label: t('notif_queue_col_targets'), sortable: false, width: 200 },
]

// ============================================================
// Helpers
// ============================================================
function truncateMsg(s: string, n = 80): string {
  if (!s)
    return '—'
  const flat = s.replace(/\s+/g, ' ').trim()
  if (flat.length <= n)
    return flat

  return `${flat.slice(0, n - 1)}…`
}

function typeLabel(raw: string): string {
  const b = bucketFor(raw)

  return t(`notif_queue_type_${b}`)
}

function openView(row: QueueItem) {
  viewing.value = row
  viewOpen.value = true
}

function closeView() {
  viewOpen.value = false
  viewing.value = null
}

// ============================================================
// ESC handler — close whichever modal is open
// ============================================================
function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape')
    return
  if (viewOpen.value) {
    closeView()
    e.preventDefault()

    return
  }
  if (confirmProcessOpen.value && !processing.value) {
    confirmProcessOpen.value = false
    e.preventDefault()

    return
  }
  if (confirmClearOpen.value && !clearing.value) {
    confirmClearOpen.value = false
    e.preventDefault()
  }
}

onMounted(() => { window.addEventListener('keydown', onKeydown) })
onBeforeUnmount(() => { window.removeEventListener('keydown', onKeydown) })
</script>

<template>
  <div class="page">
    <!-- Header -->
    <PageHeader
      :title="t('notif_queue_title')"
      :subtitle="t('notif_queue_subtitle')"
    >
      <template #actions>
        <Button
          variant="secondary"
          icon="refresh"
          :loading="loading"
          @click="loadQueue"
        >
          {{ t('notif_queue_action_refresh') }}
        </Button>
        <Button
          variant="primary"
          icon="send"
          :disabled="items.length === 0 || processing"
          @click="confirmProcessOpen = true"
        >
          {{ t('notif_queue_action_process') }}
        </Button>
        <Button
          variant="danger"
          icon="trash"
          :disabled="items.length === 0 || clearing"
          @click="confirmClearOpen = true"
        >
          {{ t('notif_queue_action_clear') }}
        </Button>
      </template>
    </PageHeader>

    <!-- KPI strip -->
    <div
      class="grid cols-3 nq-kpis"
      style="margin-bottom: var(--sp-5);"
    >
      <Kpi :data="kpiPending" />
      <Kpi :data="kpiTargeted" />
      <Kpi :data="kpiCapacity" />
    </div>

    <!-- ======================================================
         Queue list
         ====================================================== -->
    <Card>
      <div
        class="toolbar nq-toolbar"
        style="flex-wrap:wrap;gap:12px;"
      >
        <div class="nq-search">
          <Input
            v-model="search"
            icon="search"
            :placeholder="t('notif_queue_filter_search')"
          />
        </div>
        <div class="nq-type-select">
          <Select
            v-model="typeFilter"
            icon="filter"
            :placeholder="t('notif_queue_filter_type')"
            :options="typeOptions"
          />
        </div>
        <div
          class="row"
          style="gap:10px;align-items:center;flex-wrap:wrap;"
        >
          <Switch v-model="targetedOnly" />
          <span style="font-size:14px;color:var(--text-secondary);">
            {{ t('notif_queue_filter_targeted') }}
          </span>
        </div>
      </div>

      <div
        v-if="activeFilters.length > 0"
        class="toolbar"
        style="padding-top:0;flex-wrap:wrap;gap:8px;"
      >
        <div class="chips">
          <span
            class="tertiary"
            style="font-size:13px;margin-right:2px;"
          >{{ t('notif_queue_filters_label') }}</span>
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
            @click="clearFilters"
          >
            {{ t('Clear all') }}
          </button>
        </div>
      </div>

      <div class="card__divider" />

      <DataTable
        :columns="columns"
        :rows="filtered"
        row-key="idx"
        :loading="loading"
        :per-page="perPage"
        :initial-sort="{ key: 'idx', dir: 'asc' }"
      >
        <template #cell.idx="{ row }">
          <span class="mono num-tabular cell-muted">{{ row.idx }}</span>
        </template>

        <template #cell.type="{ row }">
          <Badge :tone="BUCKET_TONE[bucketFor(row.type)] || 'neutral'">
            <DesignIcon
              :name="BUCKET_ICON[bucketFor(row.type)]"
              :size="12"
            />
            {{ typeLabel(row.type) }}
          </Badge>
        </template>

        <template #cell.message="{ row }">
          <span :title="row.message">{{ truncateMsg(row.message) }}</span>
        </template>

        <template #cell.chat_ids="{ row }">
          <span
            v-if="row.chat_ids === null || row.chat_ids === undefined"
            class="cell-muted"
          >
            {{ t('notif_queue_targets_all') }}
          </span>
          <span
            v-else
            class="mono cell-muted"
            :title="row.chat_ids.join(', ')"
          >
            {{ t('notif_queue_targets_partial', { count: row.chat_ids.length }) }}
          </span>
        </template>

        <template #row-actions="{ row }">
          <IconAction
            icon="more"
            tone="primary"
            :title="t('notif_queue_action_view')"
            @click="openView(row)"
          />
        </template>

        <template #empty>
          <div class="statefill">
            <div class="statefill__icon">
              <DesignIcon
                name="checkcircle"
                :size="24"
              />
            </div>
            <div class="statefill__title">
              {{ t('notif_queue_empty_title') }}
            </div>
            <div
              class="statefill__sub"
              style="margin-top:6px;"
            >
              {{ t('notif_queue_empty_hint') }}
            </div>
          </div>
        </template>
      </DataTable>
    </Card>

    <!-- ======================================================
         Modal — view full message
         ====================================================== -->
    <Modal
      :open="viewOpen"
      :title="t('notif_queue_modal_title')"
      :subtitle="viewing ? typeLabel(viewing.type) : ''"
      :width="640"
      @close="closeView"
    >
      <div
        v-if="viewing"
        class="form-grid"
      >
        <Field
          :label="t('notif_queue_modal_type')"
          class="span-2"
        >
          <div
            class="row"
            style="gap:8px;align-items:center;height:42px;"
          >
            <Badge :tone="BUCKET_TONE[bucketFor(viewing.type)] || 'neutral'">
              <DesignIcon
                :name="BUCKET_ICON[bucketFor(viewing.type)]"
                :size="12"
              />
              {{ typeLabel(viewing.type) }}
            </Badge>
            <span
              v-if="viewing.type && viewing.type !== bucketFor(viewing.type)"
              class="mono cell-muted"
              style="font-size:12px;"
            >
              {{ viewing.type }}
            </span>
          </div>
        </Field>

        <Field
          :label="t('notif_queue_modal_targets')"
          class="span-2"
        >
          <div
            v-if="viewing.chat_ids === null || viewing.chat_ids === undefined"
            class="row"
            style="gap:8px;align-items:center;height:42px;"
          >
            <Badge tone="info">
              {{ t('notif_queue_targets_all') }}
            </Badge>
          </div>
          <div
            v-else
            class="chips"
            style="padding-top:8px;"
          >
            <span
              v-for="cid in viewing.chat_ids"
              :key="String(cid)"
              class="chip"
            >
              <span class="mono">{{ cid }}</span>
            </span>
          </div>
        </Field>

        <Field
          :label="t('notif_queue_modal_message')"
          class="span-2"
        >
          <pre
            style="
              margin:0;
              padding:12px 14px;
              border-radius:var(--r-md);
              background:rgb(var(--v-theme-neutral-weak));
              color:rgb(var(--v-theme-text-primary));
              font-family:var(--font-mono, ui-monospace, monospace);
              font-size:13px;
              line-height:1.55;
              white-space:pre-wrap;
              word-break:break-word;
              max-height:50vh;
              overflow:auto;
            "
          >{{ viewing.message }}</pre>
        </Field>
      </div>

      <template #footer>
        <Button
          variant="ghost"
          @click="closeView"
        >
          {{ t('Close') }}
        </Button>
      </template>
    </Modal>

    <!-- ======================================================
         Modal — confirm process queue
         ====================================================== -->
    <Modal
      :open="confirmProcessOpen"
      :title="t('notif_queue_confirm_process_title')"
      :subtitle="t('notif_queue_action_process')"
      :width="460"
      :close-on-backdrop="!processing"
      @close="confirmProcessOpen = false"
    >
      <div
        class="row"
        style="gap:14px;align-items:flex-start;"
      >
        <div
          class="kpi__icon t-primary"
          style="width:44px;height:44px;flex:0 0 44px;"
        >
          <DesignIcon
            name="send"
            :size="22"
          />
        </div>
        <div>
          <p
            class="muted"
            style="margin:0;font-size:14px;"
          >
            {{ t('notif_queue_confirm_process_body') }}
          </p>
        </div>
      </div>

      <template #footer>
        <Button
          variant="primary"
          icon="send"
          :loading="processing"
          :disabled="processing"
          @click="processQueue"
        >
          {{ t('notif_queue_action_process') }}
        </Button>
      </template>
    </Modal>

    <!-- ======================================================
         Modal — confirm clear queue
         ====================================================== -->
    <Modal
      :open="confirmClearOpen"
      :title="t('notif_queue_confirm_clear_title')"
      :subtitle="t('notif_queue_action_clear')"
      :width="460"
      :close-on-backdrop="!clearing"
      @close="confirmClearOpen = false"
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
            name="trash"
            :size="22"
          />
        </div>
        <div>
          <p
            class="muted"
            style="margin:0;font-size:14px;"
          >
            {{ t('notif_queue_confirm_clear_body') }}
          </p>
        </div>
      </div>

      <template #footer>
        <Button
          variant="danger"
          icon="trash"
          :loading="clearing"
          :disabled="clearing"
          @click="clearQueue"
        >
          {{ t('notif_queue_action_clear') }}
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

<route lang="yaml">
meta:
  action: manage
  subject: all
</route>

<style scoped>
/* Toolbar fields — class-driven widths so breakpoints are not duplicated inline */
.nq-search {
  flex: 1 1 240px;
  min-width: 200px;
  max-width: 320px;
}
.nq-type-select {
  flex: 0 0 220px;
  width: 220px;
}

/* Tablet — KPI strip stays 3-up but compacts */
@media (max-width: 1024px) {
  .nq-kpis {
    grid-template-columns: repeat(3, 1fr) !important;
  }
}

/* Phone — canonical 768px breakpoint */
@media (max-width: 768px) {
  /* KPIs stay 2-up at phone breakpoint (canonical rule) */
  .nq-kpis {
    grid-template-columns: repeat(2, 1fr) !important;
  }
  .nq-toolbar {
    flex-direction: column;
    align-items: stretch !important;
  }
  .nq-search,
  .nq-type-select {
    width: 100% !important;
    max-width: 100% !important;
    flex: 1 1 100% !important;
  }
}

/* Small phone — KPIs collapse to single column */
@media (max-width: 420px) {
  .nq-kpis {
    grid-template-columns: 1fr !important;
  }
}
</style>
