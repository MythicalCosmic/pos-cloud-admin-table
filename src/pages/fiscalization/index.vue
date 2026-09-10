<script setup lang="ts">
import { fiscalApi as axios } from '@/plugins/axios'
import Badge from '@/components/design/Badge.vue'
import Button from '@/components/design/Button.vue'
import Card from '@/components/design/Card.vue'
import DataTable, { type DataTableColumn } from '@/components/design/DataTable.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import IconAction from '@/components/design/IconAction.vue'
import Kpi from '@/components/design/Kpi.vue'
import PageHeader from '@/components/design/PageHeader.vue'
import Select from '@/components/design/Select.vue'

const { t } = useI18n({ useScope: 'global' })
const { snackbar, snackbarMsg, snackbarColor, notify } = useNotify()
const { formatDate, formatCurrency } = useFormatters()

const status = ref<any>(null)
const receipts = ref<any[]>([])
const loading = ref(false)
const receiptsLoading = ref(false)
const statusFilter = ref<string>('')
const testing = ref(false)
const retrying = ref(false)
const savingMode = ref(false)

async function loadStatus() {
  loading.value = true
  try {
    const res = await axios.get('/status')

    status.value = res.data?.data ?? res.data
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Failed to load status'), 'error')
  }
  finally {
    loading.value = false
  }
}

async function loadReceipts() {
  receiptsLoading.value = true
  try {
    const params: any = {}
    if (statusFilter.value)
      params.status = statusFilter.value
    const res = await axios.get('/receipts', { params })
    const d = res.data?.data ?? res.data

    receipts.value = d?.receipts ?? d?.items ?? []
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Failed to load receipts'), 'error')
  }
  finally {
    receiptsLoading.value = false
  }
}

async function setMode(mode: string) {
  if (mode === status.value?.config?.mode)
    return
  savingMode.value = true
  try {
    await axios.post('/mode', { mode })

    notify(t('Mode updated'))
    await loadStatus()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
  finally {
    savingMode.value = false
  }
}

async function runTest() {
  testing.value = true
  try {
    const res = await axios.post('/test')
    const ok = res.data?.success
    const msg = res.data?.message ?? (ok ? t('Test OK') : t('Test failed'))

    notify(msg, ok ? 'success' : 'error')
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Test failed'), 'error')
  }
  finally {
    testing.value = false
  }
}

async function retryFailed() {
  retrying.value = true
  try {
    const res = await axios.post('/retry')
    const d = res.data?.data ?? res.data
    const retried = d?.retried ?? d?.count ?? 0

    notify(`${t('Retried')}: ${retried}`)
    await Promise.all([loadStatus(), loadReceipts()])
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
  finally {
    retrying.value = false
  }
}

async function fiscalizeOrder(receipt: any) {
  if (!receipt.order_id) {
    notify(t('No order linked to this receipt'), 'error')

    return
  }
  try {
    await axios.post(`/orders/${receipt.order_id}/fiscalize`)
    notify(t('Sent for fiscalization'))
    await Promise.all([loadStatus(), loadReceipts()])
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
}

onMounted(() => { loadStatus(); loadReceipts() })
watch(statusFilter, loadReceipts)

const receiptStatusTone: Record<string, 'success' | 'warning' | 'error' | 'info' | 'neutral'> = {
  PENDING: 'warning',
  SENT: 'info',
  CONFIRMED: 'success',
  FAILED: 'error',
  SKIPPED: 'neutral',
}

// ---- KPI strip ----
const kpiConfirmed = computed(() => ({
  label: t('Confirmed'),
  value: status.value ? (status.value.confirmed ?? 0) : null,
  icon: 'checkcircle',
  tone: 'success' as const,
}))
const kpiPending = computed(() => ({
  label: t('Pending'),
  value: status.value ? (status.value.pending ?? 0) : null,
  icon: 'clock',
  tone: 'warning' as const,
}))
const kpiSent = computed(() => ({
  label: t('Sent'),
  value: status.value ? (status.value.sent ?? 0) : null,
  icon: 'send',
  tone: 'info' as const,
}))
const kpiFailed = computed(() => ({
  label: t('Failed'),
  value: status.value ? (status.value.failed ?? 0) : null,
  icon: 'close',
  tone: 'error' as const,
}))

const modeOptions = computed(() => [
  { value: 'off', label: t('fiscal_mode_OFF') },
  { value: 'mock', label: t('fiscal_mode_MOCK') },
  { value: 'live', label: t('fiscal_mode_LIVE') },
])

const statusFilterOptions = computed(() => [
  { value: 'PENDING', label: t('fiscal_receipt_status_PENDING') },
  { value: 'SENT', label: t('fiscal_receipt_status_SENT') },
  { value: 'CONFIRMED', label: t('fiscal_receipt_status_CONFIRMED') },
  { value: 'FAILED', label: t('fiscal_receipt_status_FAILED') },
  { value: 'SKIPPED', label: t('fiscal_receipt_status_SKIPPED') },
])

const columns = computed<DataTableColumn<any>[]>(() => [
  { key: 'id', label: t('Receipt ID'), sortable: true, align: 'right' as const, width: 80 },
  { key: 'order_id', label: t('Order'), sortable: true, width: 90 },
  { key: 'receipt_type', label: t('Type'), sortable: true, width: 120 },
  { key: 'status', label: t('Status'), sortable: true, width: 130 },
  { key: 'amount', label: t('Total'), sortable: true, align: 'right' as const, width: 130 },
  { key: 'fiscal_sign', label: t('Fiscal sign'), sortable: false },
  { key: 'qr_url', label: t('QR'), sortable: false, align: 'center' as const, width: 60 },
  { key: 'fiscalized_at', label: t('Created'), sortable: true, width: 160 },
  { key: 'error', label: t('Error'), sortable: false },
])
</script>

<template>
  <div class="page fiscalization-page">
    <!-- Page header -->
    <PageHeader
      :title="t('Fiscalization')"
      :subtitle="t('Fiscalization page subtitle')"
    />

    <!-- KPI strip -->
    <div
      class="grid cols-4 kpi-strip"
      style="margin-bottom: var(--sp-5);"
    >
      <Kpi :data="kpiConfirmed" />
      <Kpi :data="kpiPending" />
      <Kpi :data="kpiSent" />
      <Kpi :data="kpiFailed" />
    </div>

    <!-- Provider info + Mode + Actions -->
    <Card>
      <div class="toolbar toolbar--wrap">
        <div class="provider-info">
          <span class="muted">{{ t('Provider') }}:</span>
          <b>{{ status?.config?.provider ?? status?.provider ?? '—' }}</b>
          <span class="muted" style="margin-inline-start: var(--sp-3);">{{ t('TIN') }}:</span>
          <b>{{ (status?.config?.tin_set ?? false) ? t('TIN set') : t('TIN not set') }}</b>
        </div>

        <div style="flex: 1;" />

        <div class="mode-segmented">
          <span class="muted mode-label">{{ t('Mode') }}:</span>
          <div class="segmented">
            <button
              type="button"
              class="seg-btn"
              :class="{ 'is-active': (status?.config?.mode ?? 'off') === 'off' }"
              :disabled="savingMode"
              @click="setMode('off')"
            >
              {{ t('fiscal_mode_OFF') }}
            </button>
            <button
              type="button"
              class="seg-btn"
              :class="{ 'is-active': status?.config?.mode === 'mock' }"
              :disabled="savingMode"
              @click="setMode('mock')"
            >
              {{ t('fiscal_mode_MOCK') }}
            </button>
            <button
              type="button"
              class="seg-btn"
              :class="{ 'is-active': status?.config?.mode === 'live' }"
              :disabled="savingMode"
              @click="setMode('live')"
            >
              {{ t('fiscal_mode_LIVE') }}
            </button>
          </div>
        </div>

        <div class="tb-actions">
          <Button
            variant="secondary"
            icon="play"
            :loading="testing"
            @click="runTest"
          >
            {{ t('Run test') }}
          </Button>
          <Button
            variant="danger-soft"
            icon="refresh"
            :loading="retrying"
            @click="retryFailed"
          >
            {{ t('Retry failed') }}
          </Button>
        </div>
      </div>
    </Card>

    <!-- Receipts -->
    <Card style="margin-top: var(--sp-4);">
      <div class="toolbar toolbar--wrap">
        <h3 class="section-title">{{ t('Receipts') }}</h3>
        <div style="flex: 1;" />
        <div class="tb-status">
          <Select
            v-model="statusFilter"
            icon="filter"
            :placeholder="t('Filter by status')"
            :options="statusFilterOptions"
          />
        </div>
        <IconAction
          icon="refresh"
          tone="primary"
          :title="t('Refresh')"
          @click="loadReceipts"
        />
      </div>

      <div class="card__divider" />

      <DataTable
        :columns="columns"
        :rows="receipts"
        row-key="id"
        :loading="receiptsLoading"
        :per-page="10"
        :empty-title="t('No receipts yet')"
        :empty-sub="t('Receipts will appear once orders are fiscalized')"
        empty-icon="inbox"
      >
        <template #cell.id="{ row }">
          <span class="mono">#{{ row.id }}</span>
        </template>

        <template #cell.order_id="{ row }">
          <span v-if="row.order_id" class="mono">#{{ row.order_id }}</span>
          <span v-else class="muted">—</span>
        </template>

        <template #cell.receipt_type="{ row }">
          <span v-if="row.receipt_type">{{ t(`fiscal_receipt_type_${row.receipt_type}`) }}</span>
          <span v-else class="muted">—</span>
        </template>

        <template #cell.status="{ row }">
          <Badge :tone="receiptStatusTone[row.status] ?? 'neutral'" dot>
            {{ t(`fiscal_receipt_status_${row.status}`) }}
          </Badge>
        </template>

        <template #cell.amount="{ row }">
          <span class="num-tabular">{{ formatCurrency(row.amount ?? 0) }}</span>
        </template>

        <template #cell.fiscal_sign="{ row }">
          <span v-if="row.fiscal_sign" class="mono fiscal-sign">{{ row.fiscal_sign }}</span>
          <span v-else class="muted">—</span>
        </template>

        <template #cell.qr_url="{ row }">
          <a
            v-if="row.qr_url"
            :href="row.qr_url"
            target="_blank"
            rel="noopener"
            class="qr-link"
            :title="t('Open QR')"
          >
            <DesignIcon name="receipt" :size="18" />
          </a>
          <span v-else class="muted">—</span>
        </template>

        <template #cell.fiscalized_at="{ row }">
          <span class="muted">{{ formatDate(row.fiscalized_at) }}</span>
        </template>

        <template #cell.error="{ row }">
          <span v-if="row.error" class="error-text">{{ row.error }}</span>
          <span v-else class="muted">—</span>
        </template>

        <template #row-actions="{ row }">
          <IconAction
            v-if="row.order_id && (row.status === 'FAILED' || row.status === 'PENDING')"
            icon="refresh"
            tone="primary"
            :title="t('Re-send')"
            @click="fiscalizeOrder(row)"
          />
        </template>
      </DataTable>
    </Card>

    <VSnackbar v-model="snackbar" :color="snackbarColor" :timeout="3000">
      {{ snackbarMsg }}
    </VSnackbar>
  </div>
</template>

<style scoped>
.provider-info {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  flex-wrap: wrap;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
  color: var(--text);
}

.mode-segmented {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mode-label {
  font-size: 13px;
}

.segmented {
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  overflow: hidden;
  background: var(--surface);
}

.seg-btn {
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 500;
  background: transparent;
  border: none;
  border-inline-end: 1px solid var(--border);
  cursor: pointer;
  color: var(--text-secondary);
  transition: background 0.15s, color 0.15s;
}

.seg-btn:last-child {
  border-inline-end: none;
}

.seg-btn:hover:not(:disabled):not(.is-active) {
  background: var(--surface-inset);
}

.seg-btn.is-active {
  background: var(--primary);
  color: #fff;
  font-weight: 600;
}

.seg-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.tb-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.tb-status {
  width: 200px;
}

.qr-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--primary);
  text-decoration: none;
}

.qr-link:hover {
  color: var(--primary-strong, var(--primary));
}

.fiscal-sign {
  font-size: 12px;
  color: var(--text-secondary);
}

.error-text {
  font-size: 12px;
  color: rgb(var(--v-theme-error-strong));
}

/* Responsive */
@media (max-width: 1100px) {
  .grid.cols-4 { grid-template-columns: repeat(2, 1fr); }
}

@media (max-width: 900px) {
  .tb-status {
    width: 100%;
    flex: 1 1 100%;
  }
  .mode-segmented,
  .tb-actions,
  .provider-info {
    flex: 1 1 100%;
  }
  .segmented {
    flex: 1;
  }
  .seg-btn {
    flex: 1;
  }
}

@media (max-width: 600px) {
  .tb-actions { flex-direction: column; align-items: stretch; }
  .tb-actions :deep(.btn) { width: 100%; }
}

@media (max-width: 420px) {
  .grid.cols-4 { grid-template-columns: 1fr; }
}
</style>

<route lang="yaml">
meta:
  action: manage
  subject: all
</route>
