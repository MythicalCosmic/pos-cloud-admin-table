<script setup lang="ts">
/* ============================================================
   QR CODES — self-order QR per table
   Backend:
     GET    /api/admins/tables                   (list w/ filters)
     POST   /api/admins/tables                   (create)
     PUT    /api/admins/tables/{id}              (edit)
     DELETE /api/admins/tables/{id}              (delete)
     PATCH  /api/admins/tables/{id}/status       (set status)
     GET    /api/admins/notifications/qr/tables/{id}/token/  (mint/fetch token)
     GET    /api/admins/places?per_page=100      (place options)

   Lazy token fetch — only when the row is expanded or one of the
   QR row-actions is clicked. Token, menu_url_suffix and the resolved
   public URL are cached per-table-id so subsequent clicks don't
   re-hit the backend.

   QR PNG generation stays in the browser so menu tokens are never
   disclosed to an external image-generation service.
   ============================================================ */
import type { DataTableColumn } from '@/components/design/DataTable.vue'
import axios, { notificationsApi } from '@/plugins/axios'
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
import { createQrDataUrl } from '@/utils/qrCode'

const { t } = useI18n({ useScope: 'global' })
const { snackbar, snackbarMsg, snackbarColor, notify } = useNotify()

// ============================================================
// State
// ============================================================
interface TableRow {
  id: number
  number: string
  capacity?: number
  status?: string
  is_active?: boolean
  sort_order?: number
  place?: { id: number; name: string } | null
  place_id?: number
  qr_token?: string
  [k: string]: any
}

const tables = ref<TableRow[]>([])
const places = ref<any[]>([])
const totalTables = ref(0)
const loading = ref(false)

const page = ref(1)
const itemsPerPage = ref(10)
const search = ref('')
const placeFilter = ref<string>('')
const statusFilter = ref<string>('')

// Token cache keyed by table.id
const tokenCache = ref<Record<number, { token: string; menu_url_suffix: string }>>({})
const tokenBusyId = ref<number | null>(null)

const qrImageCache = ref<Record<string, string>>({})
const qrImagePromises = new Map<string, Promise<string>>()

// Create / Edit modal
const dialogOpen = ref(false)
const editing = ref<TableRow | null>(null)
const dialogSaving = ref(false)
const errors = ref<Record<string, string>>({})
const form = ref({
  place_id: '' as string | number,
  number: '',
  capacity: 4 as number | string,
  status: 'AVAILABLE',
  is_active: true,
  sort_order: 0 as number | string,
})

// Delete confirm
const deleteDialog = ref(false)
const deleting = ref<TableRow | null>(null)
const deleteBusy = ref(false)

// Set-status modal
const statusDialog = ref(false)
const statusTarget = ref<TableRow | null>(null)
const statusForm = ref<string>('AVAILABLE')
const statusBusy = ref(false)

// QR view modal
const qrDialog = ref(false)
const qrTarget = ref<TableRow | null>(null)
const qrLoading = ref(false)

const TABLE_STATUSES = ['AVAILABLE', 'OCCUPIED', 'RESERVED', 'OUT_OF_SERVICE']

// ============================================================
// Tone maps
// ============================================================
const STATUS_TONE: Record<string, 'success' | 'warning' | 'error' | 'neutral' | 'info' | 'primary'> = {
  AVAILABLE: 'success',
  OCCUPIED: 'error',
  RESERVED: 'warning',
  OUT_OF_SERVICE: 'neutral',
}

// ============================================================
// menu_url_suffix is already a complete relative URL ("/m/<token>");
// resolve it against the current host so printed codes point to the
// same public frontend the administrator is using.
// ============================================================
function resolveMenuUrl(suffix: string): string {
  if (!suffix) return ''
  if (/^https?:\/\//i.test(suffix)) return suffix
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return origin + (suffix.startsWith('/') ? suffix : `/${suffix}`)
}

function qrImageKey(row: TableRow, size: number): string {
  return `${row.id}:${size}`
}

// ============================================================
// API
// ============================================================
async function loadPlaces() {
  try {
    const res = await axios.get('/places', { params: { per_page: 100 } })
    const d = res.data?.data ?? res.data

    places.value = d?.places ?? d?.items ?? []
  }
  catch {
    notify(t('Failed to load places'), 'error')
  }
}

async function loadTables() {
  loading.value = true
  try {
    const params: any = { page: page.value, per_page: itemsPerPage.value }
    if (search.value) params.search = search.value
    if (placeFilter.value) params.place_id = placeFilter.value
    if (statusFilter.value) params.status = statusFilter.value
    const res = await axios.get('/tables', { params })
    const d = res.data?.data ?? res.data

    tables.value = d?.tables ?? d?.items ?? []
    totalTables.value = d?.pagination?.total_tables ?? d?.pagination?.total ?? tables.value.length
  }
  catch {
    notify(t('Failed to load tables'), 'error')
  }
  finally {
    loading.value = false
  }
}

onMounted(() => {
  loadPlaces()
  loadTables()
})
watch([page, itemsPerPage], loadTables)
const debouncedSearch = useDebounceFn(() => { page.value = 1; loadTables() }, 400)
watch(search, debouncedSearch)
watch([placeFilter, statusFilter], () => { page.value = 1; loadTables() })

// ============================================================
// Token fetch — lazy, cached per row
// ============================================================
async function fetchToken(row: TableRow): Promise<{ token: string; menu_url_suffix: string } | null> {
  if (tokenCache.value[row.id])
    return tokenCache.value[row.id]
  tokenBusyId.value = row.id
  try {
    const res = await notificationsApi.get(`/qr/tables/${row.id}/token/`)
    const d = res.data?.data ?? res.data
    const payload = {
      token: d?.token ?? d?.qr_token ?? '',
      menu_url_suffix: d?.menu_url_suffix ?? d?.menu_url ?? '',
    }

    tokenCache.value = { ...tokenCache.value, [row.id]: payload }

    return payload
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('qr_invalid_token_err'), 'error')

    return null
  }
  finally {
    tokenBusyId.value = null
  }
}

async function ensureQrImage(row: TableRow, size = 320): Promise<string> {
  const key = qrImageKey(row, size)
  const cached = qrImageCache.value[key]

  if (cached)
    return cached

  const inFlight = qrImagePromises.get(key)

  if (inFlight)
    return inFlight

  const generation = (async () => {
    const tok = await fetchToken(row)

    if (!tok)
      return ''

    const dataUrl = await createQrDataUrl(resolveMenuUrl(tok.menu_url_suffix), size)

    qrImageCache.value = { ...qrImageCache.value, [key]: dataUrl }

    return dataUrl
  })().finally(() => qrImagePromises.delete(key))

  qrImagePromises.set(key, generation)

  return generation
}

async function copyMenuUrl(row: TableRow) {
  const tok = await fetchToken(row)
  if (!tok) return
  const url = resolveMenuUrl(tok.menu_url_suffix)
  try {
    await navigator.clipboard.writeText(url)
    notify(t('qr_copy_success'))
  }
  catch {
    notify(t('Error'), 'error')
  }
}

async function downloadQr(row: TableRow) {
  try {
    const url = await ensureQrImage(row, 512)

    if (!url)
      return

    const a = document.createElement('a')

    a.href = url
    a.download = `qr-table-${row.number || row.id}.png`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }
  catch {
    notify(t('Error'), 'error')
  }
}

function openQrModal(row: TableRow) {
  qrTarget.value = row
  qrDialog.value = true
  qrLoading.value = !qrImageCache.value[qrImageKey(row, 320)]

  ensureQrImage(row).catch(() => notify(t('Error'), 'error')).finally(() => {
    if (qrTarget.value?.id === row.id)
      qrLoading.value = false
  })
}

// ============================================================
// Create / Edit
// ============================================================
function openCreate() {
  editing.value = null
  errors.value = {}
  form.value = {
    place_id: placeFilter.value || (places.value[0]?.id ?? ''),
    number: '',
    capacity: 4,
    status: 'AVAILABLE',
    is_active: true,
    sort_order: 0,
  }
  dialogOpen.value = true
}

function openEdit(row: TableRow) {
  editing.value = row
  errors.value = {}
  form.value = {
    place_id: row.place?.id ?? row.place_id ?? '',
    number: row.number ?? '',
    capacity: row.capacity ?? 4,
    status: row.status ?? 'AVAILABLE',
    is_active: row.is_active ?? true,
    sort_order: row.sort_order ?? 0,
  }
  dialogOpen.value = true
}

function closeDialog() {
  if (dialogSaving.value) return
  dialogOpen.value = false
}

function validate(): boolean {
  const e: Record<string, string> = {}

  if (!form.value.place_id) e.place_id = t('Required')
  if (!String(form.value.number).trim()) e.number = t('Required')
  errors.value = e

  return Object.keys(e).length === 0
}

async function save() {
  if (!validate()) {
    notify(Object.values(errors.value)[0], 'error')

    return
  }
  dialogSaving.value = true
  try {
    if (editing.value) {
      const payload: any = {
        place_id: form.value.place_id,
        number: form.value.number,
        capacity: Number(form.value.capacity) || null,
        status: form.value.status,
        is_active: form.value.is_active,
        sort_order: Number(form.value.sort_order) || 0,
      }

      await axios.put(`/tables/${editing.value.id}`, payload)
      notify(t('Table updated'))
    }
    else {
      const payload: any = {
        place_id: form.value.place_id,
        number: form.value.number,
        capacity: Number(form.value.capacity) || null,
      }

      await axios.post('/tables', payload)
      notify(t('Table created'))
    }
    dialogOpen.value = false
    await loadTables()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
  finally {
    dialogSaving.value = false
  }
}

// ============================================================
// Delete
// ============================================================
function confirmDelete(row: TableRow) {
  deleting.value = row
  deleteDialog.value = true
}

function closeDeleteDialog() {
  if (deleteBusy.value) return
  deleteDialog.value = false
}

async function doDelete() {
  if (!deleting.value) return
  deleteBusy.value = true
  try {
    await axios.delete(`/tables/${deleting.value.id}`)
    notify(t('Table deleted'))
    deleteDialog.value = false
    await loadTables()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
  finally {
    deleteBusy.value = false
  }
}

// ============================================================
// Set status modal
// ============================================================
function openSetStatus(row: TableRow) {
  statusTarget.value = row
  statusForm.value = row.status ?? 'AVAILABLE'
  statusDialog.value = true
}

function closeStatusDialog() {
  if (statusBusy.value) return
  statusDialog.value = false
}

async function applyStatus() {
  if (!statusTarget.value) return
  statusBusy.value = true
  try {
    await axios.patch(`/tables/${statusTarget.value.id}/status`, { status: statusForm.value })
    notify(t('Status updated'))
    statusDialog.value = false
    await loadTables()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
  finally {
    statusBusy.value = false
  }
}

// ============================================================
// Filter chips
// ============================================================
const activeFilters = computed(() => {
  const out: { k: string; label: string; val: string; clear: () => void }[] = []
  if (search.value)
    out.push({ k: 'q', label: t('Search'), val: search.value, clear: () => { search.value = '' } })
  if (placeFilter.value) {
    const p = places.value.find((x: any) => String(x.id) === String(placeFilter.value))

    out.push({ k: 'p', label: t('filter_by_place'), val: p?.name ?? String(placeFilter.value), clear: () => { placeFilter.value = '' } })
  }
  if (statusFilter.value)
    out.push({ k: 's', label: t('filter_by_status'), val: t(`table_status_${statusFilter.value}`), clear: () => { statusFilter.value = '' } })

  return out
})

function clearAllFilters() {
  search.value = ''
  placeFilter.value = ''
  statusFilter.value = ''
}

// ============================================================
// Options
// ============================================================
const placeOptions = computed(() => places.value.map((p: any) => ({ value: String(p.id), label: p.name })))
const formPlaceOptions = computed(() => places.value.map((p: any) => ({ value: String(p.id), label: p.name })))
const statusOptions = computed(() => TABLE_STATUSES.map(s => ({ value: s, label: t(`table_status_${s}`) })))

// ============================================================
// Columns
// ============================================================
const columns: DataTableColumn<TableRow>[] = [
  { key: 'number', label: t('table_number'), sortable: true, width: 110 },
  { key: 'place', label: t('table_place'), sortable: true, sortValue: r => r.place?.name ?? '' },
  { key: 'capacity', label: t('table_capacity'), sortable: true, width: 110 },
  { key: 'status', label: t('table_status'), sortable: true, width: 140 },
  { key: 'is_active', label: t('table_is_active'), sortable: true, width: 110 },
  { key: 'qr_token', label: t('qr_token'), width: 220 },
]

const tablePagination = computed(() => ({
  page: page.value,
  perPage: itemsPerPage.value,
  total: totalTables.value,
  onPage: (n: number) => { page.value = n },
  onPerPage: (n: number) => { itemsPerPage.value = n; page.value = 1 },
}))

// Reveal token (used inside expanded row)
async function revealToken(row: TableRow) {
  try {
    await ensureQrImage(row)
  }
  catch {
    notify(t('Error'), 'error')
  }
}

// ESC handler — close whichever modal is open, top-most first
function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  if (qrDialog.value) { qrDialog.value = false; e.preventDefault(); return }
  if (statusDialog.value) { if (!statusBusy.value) { statusDialog.value = false; e.preventDefault() } return }
  if (deleteDialog.value) { if (!deleteBusy.value) { deleteDialog.value = false; e.preventDefault() } return }
  if (dialogOpen.value) { closeDialog(); e.preventDefault() }
}

onMounted(() => { window.addEventListener('keydown', onKeydown) })
onBeforeUnmount(() => { window.removeEventListener('keydown', onKeydown) })

// Convenience — resolved QR url for the open modal
const qrTokenInfo = computed(() => (qrTarget.value ? tokenCache.value[qrTarget.value.id] : null))
const qrMenuUrl = computed(() => qrTokenInfo.value ? resolveMenuUrl(qrTokenInfo.value.menu_url_suffix) : '')
const qrImgUrl = computed(() => qrTarget.value ? qrImageCache.value[qrImageKey(qrTarget.value, 320)] ?? '' : '')
</script>

<template>
  <div class="page">
    <!-- Page header -->
    <PageHeader
      :title="t('qr_codes_title')"
      :subtitle="t('qr_codes_subtitle')"
    >
      <template #actions>
        <Button
          variant="primary"
          icon="plus"
          @click="openCreate"
        >
          {{ t('new_table') }}
        </Button>
      </template>
    </PageHeader>

    <!-- Toolbar + table -->
    <Card>
      <div class="toolbar toolbar--wrap">
        <!-- Search -->
        <div class="tb-search">
          <Input
            v-model="search"
            icon="search"
            :placeholder="t('Search')"
          />
        </div>

        <!-- Place -->
        <div class="tb-filter">
          <Select
            v-model="placeFilter"
            icon="filter"
            :placeholder="t('all_places')"
            :options="placeOptions"
          />
        </div>

        <!-- Status -->
        <div class="tb-filter">
          <Select
            v-model="statusFilter"
            :placeholder="t('all_statuses')"
            :options="statusOptions"
          />
        </div>
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

      <DataTable
        :columns="columns"
        :rows="tables"
        row-key="id"
        :loading="loading"
        :pagination="tablePagination"
        expandable
        :initial-sort="{ key: 'number', dir: 'asc' }"
      >
        <template #cell.number="{ row }">
          <span class="mono cell-strong">#{{ row.number }}</span>
        </template>

        <template #cell.place="{ row }">
          <span class="cell-muted">{{ row.place?.name ?? '—' }}</span>
        </template>

        <template #cell.capacity="{ row }">
          <span class="mono">{{ row.capacity ?? '—' }}</span>
        </template>

        <template #cell.status="{ row }">
          <Badge
            :tone="row.status ? (STATUS_TONE[row.status] || 'neutral') : 'neutral'"
            dot
          >
            {{ row.status ? t(`table_status_${row.status}`) : '—' }}
          </Badge>
        </template>

        <template #cell.is_active="{ row }">
          <Badge
            :tone="row.is_active ? 'success' : 'neutral'"
            dot
          >
            {{ t(`active_state_${row.is_active ? 'true' : 'false'}`) }}
          </Badge>
        </template>

        <template #cell.qr_token="{ row }">
          <template v-if="tokenCache[row.id]">
            <span
              class="mono cell-muted"
              :title="tokenCache[row.id].token"
            >{{ tokenCache[row.id].token.slice(0, 14) }}…</span>
          </template>
          <template v-else>
            <Button
              variant="ghost"
              size="sm"
              icon="sparkle"
              :loading="tokenBusyId === row.id"
              :disabled="tokenBusyId === row.id"
              @click="revealToken(row)"
            >
              {{ t('qr_mint_btn') }}
            </Button>
          </template>
        </template>

        <!-- Expanded row body — show full token + menu url -->
        <template #expanded="{ row }">
          <div
            class="row qr-expanded"
            style="gap:24px;flex-wrap:wrap;padding:6px 4px;"
          >
            <div style="flex:0 0 auto;">
              <div
                class="kpi__icon qr-thumb"
              >
                <img
                  v-if="qrImageCache[qrImageKey(row, 320)]"
                  :src="qrImageCache[qrImageKey(row, 320)]"
                  :alt="t('qr_image_alt')"
                  style="width:100%;height:100%;object-fit:contain;"
                >
                <DesignIcon
                  v-else
                  name="grid"
                  :size="40"
                />
              </div>
            </div>
            <div
              class="col qr-expanded__info"
            >
              <div style="font-size:13px;color:var(--text-secondary);margin-bottom:2px;">
                {{ t('qr_token') }}
              </div>
              <div
                v-if="tokenCache[row.id]"
                class="mono"
                style="font-size:13px;word-break:break-all;"
              >
                {{ tokenCache[row.id].token }}
              </div>
              <div
                v-else
                class="muted"
                style="font-size:13px;"
              >
                <Button
                  variant="ghost"
                  size="sm"
                  icon="sparkle"
                  :loading="tokenBusyId === row.id"
                  @click="revealToken(row)"
                >
                  {{ t('qr_mint_btn') }}
                </Button>
              </div>

              <div style="font-size:13px;color:var(--text-secondary);margin-top:10px;margin-bottom:2px;">
                {{ t('qr_menu_url') }}
              </div>
              <div
                v-if="tokenCache[row.id]"
                class="mono"
                style="font-size:13px;word-break:break-all;"
              >
                {{ resolveMenuUrl(tokenCache[row.id].menu_url_suffix) }}
              </div>
              <div
                v-else
                class="muted"
                style="font-size:13px;"
              >
                —
              </div>

              <div
                class="muted"
                style="margin-top:10px;font-size:12px;"
              >
                {{ t('qr_token_stable_hint') }}
              </div>
            </div>
          </div>
        </template>

        <template #row-actions="{ row }">
          <IconAction
            icon="grid"
            tone="primary"
            :title="t('qr_show_modal_title', { number: row.number })"
            @click="openQrModal(row)"
          />
          <IconAction
            icon="copy"
            tone="primary"
            :title="t('qr_copy_menu_url')"
            :disabled="tokenBusyId === row.id"
            @click="copyMenuUrl(row)"
          />
          <IconAction
            icon="download"
            tone="primary"
            :title="t('qr_download_png')"
            :disabled="tokenBusyId === row.id"
            @click="downloadQr(row)"
          />
          <IconAction
            icon="sliders"
            tone="warning"
            :title="t('set_table_status')"
            @click="openSetStatus(row)"
          />
          <IconAction
            icon="edit"
            tone="primary"
            :title="t('edit_table')"
            @click="openEdit(row)"
          />
          <IconAction
            icon="trash"
            tone="danger"
            :title="t('Delete')"
            @click="confirmDelete(row)"
          />
        </template>

        <template #empty>
          <div class="statefill">
            <div class="statefill__icon">
              <DesignIcon
                name="grid"
                :size="24"
              />
            </div>
            <div class="statefill__title">
              {{ t('no_tables_yet') }}
            </div>
            <div style="margin-top:12px;">
              <Button
                variant="primary"
                icon="plus"
                @click="openCreate"
              >
                {{ t('new_table') }}
              </Button>
            </div>
          </div>
        </template>
      </DataTable>
    </Card>

    <!-- Create / Edit modal -->
    <Modal
      :open="dialogOpen"
      :title="editing ? t('edit_table') : t('new_table')"
      :subtitle="editing ? t('qr_codes_subtitle') : t('qr_codes_subtitle')"
      :width="640"
      @close="closeDialog"
    >
      <form @submit.prevent="save">
        <div class="form-grid">
          <Field
            :label="t('table_place')"
            :error="errors.place_id"
            class="span-2"
          >
            <Select
              v-model="form.place_id"
              :options="formPlaceOptions"
              :placeholder="t('table_place')"
              :error="!!errors.place_id"
            />
          </Field>

          <Field
            :label="t('table_number_label')"
            :error="errors.number"
          >
            <Input
              v-model="form.number"
              :placeholder="t('table_number_label')"
              :error="!!errors.number"
            />
          </Field>

          <Field :label="t('table_capacity')">
            <Input
              v-model="form.capacity"
              type="number"
              inputmode="numeric"
              min="1"
              :placeholder="t('table_capacity')"
            />
          </Field>

          <template v-if="editing">
            <Field :label="t('table_status')">
              <Select
                v-model="form.status"
                :options="statusOptions"
              />
            </Field>

            <Field :label="t('table_sort_order')">
              <Input
                v-model="form.sort_order"
                type="number"
                inputmode="numeric"
                min="0"
                :placeholder="t('table_sort_order')"
              />
            </Field>

            <Field
              :label="t('table_is_active')"
              class="span-2"
            >
              <div
                class="row"
                style="gap:10px;align-items:center;height:42px;"
              >
                <Switch v-model="form.is_active" />
                <span style="font-size:14px;font-weight:500;color:var(--text-secondary);">
                  {{ t(`active_state_${form.is_active ? 'true' : 'false'}`) }}
                </span>
              </div>
            </Field>
          </template>
        </div>
      </form>

      <template #footer>
        <Button
          variant="primary"
          icon="check"
          :loading="dialogSaving"
          :disabled="dialogSaving"
          @click="save"
        >
          {{ t('Save') }}
        </Button>
      </template>
    </Modal>

    <!-- Delete confirm modal -->
    <Modal
      :open="deleteDialog"
      :title="t('Delete')"
      :subtitle="t('This action cannot be undone')"
      :width="440"
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
            {{ t('delete_table_confirm') }}
          </p>
          <p
            class="muted"
            style="margin:6px 0 0;font-size:14px;"
          >
            <span v-if="deleting">#{{ deleting.number }} · {{ deleting.place?.name ?? '' }}</span>
          </p>
        </div>
      </div>

      <template #footer>
        <Button
          variant="danger"
          icon="trash"
          :loading="deleteBusy"
          :disabled="deleteBusy"
          @click="doDelete"
        >
          {{ t('Delete') }}
        </Button>
      </template>
    </Modal>

    <!-- Set status modal -->
    <Modal
      :open="statusDialog"
      :title="t('set_table_status')"
      :subtitle="statusTarget ? `#${statusTarget.number}` : ''"
      :width="440"
      @close="closeStatusDialog"
    >
      <div class="form-grid">
        <Field
          :label="t('table_status')"
          class="span-2"
        >
          <Select
            v-model="statusForm"
            :options="statusOptions"
          />
        </Field>
      </div>

      <template #footer>
        <Button
          variant="primary"
          icon="check"
          :loading="statusBusy"
          :disabled="statusBusy"
          @click="applyStatus"
        >
          {{ t('Save') }}
        </Button>
      </template>
    </Modal>

    <!-- QR view modal -->
    <Modal
      :open="qrDialog"
      :title="qrTarget ? t('qr_show_modal_title', { number: qrTarget.number }) : ''"
      :subtitle="t('qr_print_hint')"
      :width="480"
      @close="qrDialog = false"
    >
      <div
        class="col"
        style="gap:14px;align-items:center;"
      >
        <div class="qr-display">
          <img
            v-if="qrImgUrl"
            :src="qrImgUrl"
            :alt="t('qr_image_alt')"
            style="width:100%;height:100%;object-fit:contain;"
          >
          <DesignIcon
            v-else-if="qrLoading"
            name="refresh"
            :size="48"
          />
          <DesignIcon
            v-else
            name="grid"
            :size="64"
          />
        </div>

        <div
          v-if="qrMenuUrl"
          class="mono"
          style="font-size:12px;word-break:break-all;text-align:center;color:var(--text-secondary);"
        >
          {{ qrMenuUrl }}
        </div>

        <div
          class="muted"
          style="font-size:12px;text-align:center;"
        >
          {{ t('qr_token_stable_hint') }}
        </div>
      </div>

      <template #footer>
        <Button
          variant="secondary"
          icon="copy"
          :disabled="!qrMenuUrl"
          @click="qrTarget && copyMenuUrl(qrTarget)"
        >
          {{ t('qr_copy_menu_url') }}
        </Button>
        <Button
          variant="primary"
          icon="download"
          :disabled="!qrMenuUrl"
          @click="qrTarget && downloadQr(qrTarget)"
        >
          {{ t('qr_download_png') }}
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
.col {
  display: flex;
  flex-direction: column;
}

.toolbar--wrap {
  flex-wrap: wrap;
  gap: 12px;
}

.tb-search {
  flex: 1 1 240px;
  max-width: 300px;
  min-width: 200px;
}

.tb-filter {
  flex: 0 1 200px;
  min-width: 160px;
}

.qr-thumb {
  width: 96px;
  height: 96px;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.qr-expanded__info {
  flex: 1;
  min-width: 240px;
}

.qr-display {
  width: 280px;
  height: 280px;
  max-width: 100%;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.form-grid .span-2 {
  grid-column: span 2;
}

@media (max-width: 768px) {
  .tb-search,
  .tb-filter {
    flex: 1 1 100%;
    max-width: none;
    width: 100%;
  }

  .qr-thumb {
    width: 80px;
    height: 80px;
  }

  .qr-expanded__info {
    min-width: 0;
    flex: 1 1 100%;
  }

  .qr-expanded {
    gap: 14px !important;
  }

  .qr-display {
    width: 240px;
    height: 240px;
  }

  .form-grid {
    grid-template-columns: 1fr;
  }

  .form-grid .span-2 {
    grid-column: span 1;
  }

  :deep(.row-actions) {
    flex-wrap: wrap;
    justify-content: flex-end;
    row-gap: 4px;
  }
}

@media (max-width: 480px) {
  .qr-display {
    width: 100%;
    height: auto;
    aspect-ratio: 1 / 1;
  }
}
</style>

<route lang="yaml">
meta:
  action: manage
  subject: all
</route>
