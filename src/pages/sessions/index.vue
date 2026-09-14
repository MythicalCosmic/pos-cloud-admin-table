<script setup lang="ts">
import WorkspacePage from '@/components/design/workspace/WorkspacePage.vue'
import WorkspaceToolbar from '@/components/design/workspace/WorkspaceToolbar.vue'

/* ============================================================
   SESSIONS — Active admin auth sessions
   List devices currently signed in to the admin account.
   Supports:
     - search by IP / device
     - current-only filter
     - refresh + sign-out-all-others (toolbar)
     - revoke per row (disabled for is_current)
   Wired to /api/admins/auth-sessions
   ============================================================ */
import type { DataTableColumn } from '@/components/design/DataTable.vue'
import axios from '@/plugins/axios'
import Badge from '@/components/design/Badge.vue'
import Button from '@/components/design/Button.vue'
import Card from '@/components/design/Card.vue'
import DataTable from '@/components/design/DataTable.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import IconAction from '@/components/design/IconAction.vue'
import Input from '@/components/design/Input.vue'
import Modal from '@/components/design/Modal.vue'
import PageHeader from '@/components/design/PageHeader.vue'
import StateFill from '@/components/design/StateFill.vue'
import Switch from '@/components/design/Switch.vue'

const { t } = useI18n({ useScope: 'global' })
const { snackbar, snackbarMsg, snackbarColor, notify } = useNotify()
const { formatDate } = useFormatters()

// ============================================================
// State
// ============================================================
const sessions = ref<any[]>([])
const loading = ref(false)
const loadError = ref(false)

const page = ref(1)
const itemsPerPage = ref(10)
const search = ref('')
const currentOnly = ref(false)

// Per-row revoke confirm
const revokeTarget = ref<any>(null)
const revokeBusy = ref(false)
const revokingId = ref<string | number | null>(null)

// Logout-all confirm
const logoutAllOpen = ref(false)
const logoutAllBusy = ref(false)

// Refresh button spin
const refreshing = ref(false)

// ============================================================
// API
// ============================================================
async function loadSessions(opts: { silent?: boolean } = {}) {
  loadError.value = false
  if (!opts.silent)
    loading.value = true
  try {
    const res = await axios.get('/auth-sessions')
    const d = res.data?.data ?? res.data
    sessions.value = Array.isArray(d) ? d : (d?.sessions ?? d?.items ?? [])
    return true
  }
  catch {
    loadError.value = true
    notify(t('sessions_load_error'), 'error')
    return false
  }
  finally {
    loading.value = false
    refreshing.value = false
  }
}

onMounted(loadSessions)

const debouncedSearch = useDebounceFn(() => { page.value = 1 }, 300)
watch(search, debouncedSearch)
watch(currentOnly, () => { page.value = 1 })

async function onRefresh() {
  if (refreshing.value) return
  refreshing.value = true
  if (await loadSessions({ silent: true }))
    notify(t('sessions_action_refresh'))
}

// ============================================================
// Revoke per row
// ============================================================
function askRevoke(row: any) {
  if (row?.is_current) return
  if (revokingId.value !== null) return
  revokeTarget.value = row
}

function cancelRevoke() {
  if (revokeBusy.value) return
  revokeTarget.value = null
}

async function doRevoke() {
  if (!revokeTarget.value || revokeBusy.value)
    return
  const row = revokeTarget.value
  revokeBusy.value = true
  revokingId.value = row.id
  try {
    await axios.delete('/auth-sessions', { data: { session_id: row.id } })
    notify(t('sessions_toast_revoked'))
    revokeTarget.value = null
    await loadSessions({ silent: true })
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('sessions_toast_error'), 'error')
  }
  finally {
    revokeBusy.value = false
    revokingId.value = null
  }
}

// ============================================================
// Logout all other sessions
// ============================================================
function askLogoutAll() {
  logoutAllOpen.value = true
}

function cancelLogoutAll() {
  if (logoutAllBusy.value) return
  logoutAllOpen.value = false
}

async function doLogoutAll() {
  if (logoutAllBusy.value)
    return
  logoutAllBusy.value = true
  try {
    await axios.post('/auth-logout-all')
    notify(t('sessions_toast_logout_all'))
    logoutAllOpen.value = false
    await loadSessions({ silent: true })
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('sessions_toast_error'), 'error')
  }
  finally {
    logoutAllBusy.value = false
  }
}

// ============================================================
// Client-side filtering (BE returns the full list)
// ============================================================
const filteredRows = computed(() => {
  const q = search.value.trim().toLowerCase()
  return sessions.value.filter((s: any) => {
    if (currentOnly.value && !s.is_current) return false
    if (!q) return true
    const ip = String(s.ip_address ?? '').toLowerCase()
    const ua = String(s.user_agent ?? '').toLowerCase()
    return ip.includes(q) || ua.includes(q)
  })
})

const totalItems = computed(() => filteredRows.value.length)

// Has any other (revocable) session?
const hasOtherSessions = computed(() => sessions.value.some((s: any) => !s.is_current))

// ============================================================
// Filter chips
// ============================================================
const activeFilters = computed(() => {
  const out: { k: string; label: string; val: string; clear: () => void }[] = []
  if (search.value)
    out.push({ k: 'q', label: t('Search'), val: search.value, clear: () => { search.value = '' } })
  if (currentOnly.value)
    out.push({ k: 'c', label: t('sessions_current_only'), val: t('session_current_TRUE'), clear: () => { currentOnly.value = false } })
  return out
})

function clearAllFilters() {
  search.value = ''
  currentOnly.value = false
}

// ============================================================
// Columns
// ============================================================
const columns: DataTableColumn<any>[] = [
  { key: 'id', label: t('sessions_col_id'), sortable: true, width: 100, mobileFullWidth: true },
  { key: 'ip_address', label: t('sessions_col_ip'), sortable: true, width: 180 },
  { key: 'user_agent', label: t('sessions_col_device'), sortable: true, mobileFullWidth: true },
  { key: 'last_activity', label: t('sessions_col_last_activity'), sortable: true, width: 200 },
  { key: 'is_current', label: t('sessions_col_current'), sortable: true, width: 160 },
]

// Controlled pagination over the client-filtered list
const tablePagination = computed(() => ({
  page: page.value,
  perPage: itemsPerPage.value,
  total: totalItems.value,
  onPage: (n: number) => { page.value = n },
  onPerPage: (n: number) => { itemsPerPage.value = n; page.value = 1 },
}))

// Paginated slice
const pagedRows = computed(() => {
  const start = (page.value - 1) * itemsPerPage.value
  return filteredRows.value.slice(start, start + itemsPerPage.value)
})

// ============================================================
// Display helpers
// ============================================================
function displayId(row: any): string {
  const v = row?.id
  if (v === null || v === undefined || v === '') return '—'
  const s = String(v)
  // Truncate long opaque session keys
  return s.length > 12 ? `${s.slice(0, 8)}…${s.slice(-4)}` : s
}
function displayIp(row: any): string {
  const v = row?.ip_address
  if (!v) return t('sessions_unknown_ip')
  return String(v)
}
function displayUa(row: any): string {
  const v = row?.user_agent
  if (!v) return t('sessions_unknown_device')
  return String(v)
}

// ESC handler — close whichever modal is open, top-most first.
function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  if (logoutAllOpen.value) {
    if (!logoutAllBusy.value) {
      logoutAllOpen.value = false
      e.preventDefault()
    }
    return
  }
  if (revokeTarget.value) {
    if (!revokeBusy.value) {
      revokeTarget.value = null
      e.preventDefault()
    }
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
      :title="t('sessions_page_title')"
      :subtitle="t('sessions_page_subtitle')"
    >
      <template #actions>
        <Button
          variant="ghost"
          icon="refresh"
          :disabled="refreshing || loading"
          :class="{ 'iconspin-wrap': refreshing }"
          @click="onRefresh"
        >
          {{ t('sessions_action_refresh') }}
        </Button>
        <Button
          variant="danger"
          icon="lock"
          :disabled="!hasOtherSessions || loading"
          @click="askLogoutAll"
        >
          {{ t('sessions_action_logout_all') }}
        </Button>
      </template>
    </PageHeader>

    <!-- Toolbar + table -->
    <Card>
      <WorkspaceToolbar class="toolbar sessions-toolbar">
        <!-- Search -->
        <Input
          v-model="search"
          class="sessions-search"
          icon="search"
          :placeholder="t('sessions_search_placeholder')"
        />

        <!-- Current-only switch -->
        <div class="control sessions-switch">
          <Switch
            v-model="currentOnly"
            :aria-label="t('sessions_current_only')"
          />
          <span class="sessions-switch__label">
            {{ t('sessions_current_only') }}
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
      <p
        v-if="loadError && sessions.length"
        class="sessions-error"
        role="alert"
      >
        {{ t('sessions_load_error') }}
      </p>
      <DataTable
        mobile-cards
        mobile-title-key="ip_address"
        :mobile-summary="['is_current', 'last_activity']"
        :columns="columns"
        :rows="pagedRows"
        row-key="id"
        :loading="loading"
        :pagination="tablePagination"
        :initial-sort="{ key: 'last_activity', dir: 'desc' }"
      >
        <template #cell.id="{ row, mobile }">
          <span
            class="mono cell-muted"
            :title="String(row.id)"
          >#{{ mobile ? row.id : displayId(row) }}</span>
        </template>

        <template #cell.ip_address="{ row }">
          <span class="mono cell-strong">{{ displayIp(row) }}</span>
        </template>

        <template #cell.user_agent="{ row }">
          <span
            class="cell-muted sessions-ua"
            :title="String(row.user_agent || '')"
          >{{ displayUa(row) }}</span>
        </template>

        <template #cell.last_activity="{ row }">
          <span class="cell-muted">{{ row.last_activity ? formatDate(row.last_activity) : '—' }}</span>
        </template>

        <template #cell.is_current="{ row }">
          <Badge
            :tone="row.is_current ? 'success' : 'neutral'"
            dot
          >
            {{ row.is_current ? t('session_current_TRUE') : t('session_current_FALSE') }}
          </Badge>
        </template>

        <!-- Row actions -->
        <template #row-actions="{ row }">
          <IconAction
            icon="trash"
            tone="danger"
            :title="row.is_current ? t('sessions_cannot_revoke_current') : t('sessions_action_revoke')"
            :disabled="row.is_current || revokingId === row.id"
            :class="{ 'is-busy': revokingId === row.id }"
            @click="askRevoke(row)"
          />
        </template>

        <!-- Empty state -->
        <template #empty>
          <StateFill
            icon="lock"
            :error="loadError"
            :title="loadError ? t('sessions_load_error') : t('sessions_empty_title')"
            :sub="loadError ? undefined : t('sessions_empty_body')"
          >
            <template
              v-if="loadError || activeFilters.length > 0"
              #action
            >
              <div style="margin-top:12px;">
                <Button
                  v-if="loadError"
                  variant="secondary"
                  icon="refresh"
                  @click="onRefresh"
                >
                  {{ t('Refresh') }}
                </Button>
                <Button
                  v-else
                  variant="secondary"
                  @click="clearAllFilters"
                >
                  {{ t('Clear filters') }}
                </Button>
              </div>
            </template>
          </StateFill>
        </template>
      </DataTable>
    </Card>

    <!-- Revoke confirm modal -->
    <Modal
      :open="!!revokeTarget"
      :title="t('sessions_confirm_revoke_title')"
      :subtitle="t('sessions_confirm_revoke_body')"
      :width="460"
      @close="cancelRevoke"
    >
      <div
        v-if="revokeTarget"
        class="row sessions-modal-row"
      >
        <div class="kpi__icon t-error sessions-modal-icon">
          <DesignIcon
            name="alert"
            :size="22"
          />
        </div>
        <div class="sessions-modal-body">
          <p class="sessions-modal-title">
            <span class="mono">{{ displayIp(revokeTarget) }}</span>
          </p>
          <p class="muted sessions-modal-ua">
            {{ displayUa(revokeTarget) }}
          </p>
          <p class="muted sessions-modal-meta">
            {{ t('sessions_col_last_activity') }}:
            {{ revokeTarget.last_activity ? formatDate(revokeTarget.last_activity) : '—' }}
          </p>
        </div>
      </div>

      <template #footer>
        <Button
          variant="danger"
          icon="trash"
          :loading="revokeBusy"
          :disabled="revokeBusy"
          @click="doRevoke"
        >
          {{ t('sessions_action_revoke') }}
        </Button>
      </template>
    </Modal>

    <!-- Logout-all confirm modal -->
    <Modal
      :open="logoutAllOpen"
      :title="t('sessions_confirm_logout_all_title')"
      :subtitle="t('sessions_confirm_logout_all_body')"
      :width="460"
      @close="cancelLogoutAll"
    >
      <div class="row sessions-modal-row">
        <div class="kpi__icon t-warning sessions-modal-icon">
          <DesignIcon
            name="alert"
            :size="22"
          />
        </div>
        <div>
          <p class="sessions-modal-title">
            {{ t('sessions_action_logout_all') }}
          </p>
          <p class="muted sessions-modal-ua">
            {{ t('sessions_confirm_logout_all_body') }}
          </p>
        </div>
      </div>

      <template #footer>
        <Button
          variant="danger"
          icon="lock"
          :loading="logoutAllBusy"
          :disabled="logoutAllBusy"
          @click="doLogoutAll"
        >
          {{ t('sessions_action_logout_all') }}
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
.sessions-error { padding: 12px 18px; margin: 0; color: var(--error-strong); font-size: 13px; }

/* Spin animation for refresh + per-row revoke busy state. */
.iconspin-wrap :deep(svg) {
  animation: sessions-spin 0.85s linear infinite;
}
@keyframes sessions-spin {
  to { transform: rotate(360deg); }
}
.iconaction.is-busy {
  cursor: progress;
  opacity: 0.7;
}

/* Toolbar — responsive */
.sessions-toolbar {
  flex-wrap: wrap;
  gap: 12px;
}
.sessions-search {
  flex: 1;
  max-width: 340px;
  min-width: 220px;
}
.sessions-switch {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 42px;
}
.sessions-switch__label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
}

/* User-agent cell ellipsis */
.sessions-ua {
  display: inline-block;
  max-width: 520px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
}

/* Modal layout */
.sessions-modal-row {
  gap: 14px;
  align-items: flex-start;
}
.sessions-modal-icon {
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
}
.sessions-modal-body {
  min-width: 0;
}
.sessions-modal-title {
  margin: 0;
  font-weight: 600;
}
.sessions-modal-ua {
  margin: 6px 0 0;
  font-size: 13px;
  word-break: break-word;
}
.sessions-modal-meta {
  margin: 6px 0 0;
  font-size: 12px;
}

/* Responsive collapse */
@media (max-width: 1024px) {
  .sessions-ua {
    max-width: 360px;
  }
}
@media (max-width: 768px) {
  .sessions-toolbar {
    flex-direction: column;
    align-items: stretch;
  }
  .sessions-search {
    max-width: 100%;
    min-width: 0;
    flex: 1 1 100%;
  }
  .sessions-switch {
    height: auto;
  }
  .sessions-ua {
    max-width: 220px;
  }
  .sessions-modal-row {
    flex-wrap: wrap;
  }
}
@media (max-width: 700px) {
  .sessions-ua {
    max-width: 100%;
    white-space: normal;
    overflow-wrap: anywhere;
  }
}
</style>

<route lang="yaml">
meta:
  action: manage
  subject: all
</route>
