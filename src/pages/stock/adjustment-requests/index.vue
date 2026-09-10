<script setup lang="ts">
import type { DataTableColumn } from '@/components/design/DataTable.vue'
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
import SearchSelect from '@/components/design/SearchSelect.vue'
import Select from '@/components/design/Select.vue'
import StateFill from '@/components/design/StateFill.vue'
import Textarea from '@/components/design/Textarea.vue'
import { useUserAccess } from '@/composables/useUserAccess'
import { stockApi } from '@/plugins/axios'

interface AdjustmentRequest {
  id: number
  stock_item_id: number
  stock_item_name: string
  location_id: number
  location_name: string
  unit_id: number
  quantity: string | number
  reason: string
  evidence: string
  status: string
  requested_by: number
  requested_at: string
  reviewed_at?: string | null
  review_note?: string
}

const { t } = useI18n({ useScope: 'global' })
const { notify } = useNotify()
const { translate } = useApiError()
const { formatDate } = useFormatters()
const { hasPermission, currentUserId } = useUserAccess()

const canCreate = computed(() => hasPermission('stock.adjustment.request'))
const canApprove = computed(() => hasPermission('stock.adjustment.approve'))

function canReview(row: AdjustmentRequest): boolean {
  return canApprove.value
    && currentUserId.value != null
    && String(row.requested_by) !== String(currentUserId.value)
}

const rows = ref<AdjustmentRequest[]>([])
const loading = ref(false)
const errorMessage = ref('')
const page = ref(1)
const perPage = ref(20)
const total = ref(0)
const statusFilter = ref('')

const itemOptions = ref<{ value: string; label: string }[]>([])
const locationOptions = ref<{ value: string; label: string }[]>([])
const lookupLoading = ref(false)
const lookupError = ref('')

const statusOptions = computed(() => ['PENDING', 'APPROVED', 'REJECTED'].map(status => ({
  value: status,
  label: t(`warehouse.adjustments.status.${status}`),
})))

const directionOptions = computed(() => [
  { value: 'INCREASE', label: t('warehouse.adjustments.increase') },
  { value: 'DECREASE', label: t('warehouse.adjustments.decrease') },
])

const columns = computed<DataTableColumn<AdjustmentRequest>[]>(() => [
  { key: 'requested_at', label: t('warehouse.adjustments.requestedAt'), width: 165 },
  { key: 'stock_item_name', label: t('warehouse.adjustments.item'), width: 210 },
  { key: 'location_name', label: t('warehouse.adjustments.location'), width: 180 },
  { key: 'quantity', label: t('warehouse.adjustments.quantity'), align: 'right', width: 120 },
  { key: 'reason', label: t('warehouse.adjustments.reason'), width: 260 },
  { key: 'status', label: t('warehouse.adjustments.statusLabel'), width: 130 },
])

const pagination = computed(() => ({
  page: page.value,
  perPage: perPage.value,
  total: total.value,
  onPage: (value: number) => { page.value = value },
  onPerPage: (value: number) => { perPage.value = value; page.value = 1 },
}))

function unwrap(response: any) {
  return response?.data?.data ?? response?.data ?? {}
}

function statusTone(status: string): 'success' | 'warning' | 'error' | 'neutral' {
  if (status === 'APPROVED')
    return 'success'
  if (status === 'PENDING')
    return 'warning'
  if (status === 'REJECTED')
    return 'error'

  return 'neutral'
}

function formatQuantity(value: string | number): string {
  const number = Number(value)
  if (!Number.isFinite(number))
    return String(value)

  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(number).replace(/,/g, '\u202F')
}

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    const response = await stockApi.get('/adjustment-requests/', {
      params: {
        page: page.value,
        per_page: perPage.value,
        status: statusFilter.value || undefined,
      },
    })

    const data = unwrap(response)

    rows.value = data.adjustment_requests ?? []
    total.value = Number(data.pagination?.total ?? rows.value.length)
  }
  catch (error) {
    rows.value = []
    total.value = 0
    errorMessage.value = translate(error)
  }
  finally {
    loading.value = false
  }
}

async function loadLookups() {
  lookupLoading.value = true
  lookupError.value = ''
  try {
    const [items, locations] = await Promise.all([
      loadAllStockRows('/items/', 'items'),
      loadAllStockRows('/locations/', 'locations'),
    ])

    itemOptions.value = items.map((item: any) => ({
      value: String(item.id),
      label: item.sku ? `${item.name} · ${item.sku}` : item.name,
    }))
    locationOptions.value = locations.map((location: any) => ({ value: String(location.id), label: location.name }))
  }
  catch (error) {
    itemOptions.value = []
    locationOptions.value = []
    lookupError.value = translate(error)
  }
  finally {
    lookupLoading.value = false
  }
}

async function loadAllStockRows(path: string, key: string): Promise<any[]> {
  const allRows: any[] = []
  const pageSize = 100
  for (let currentPage = 1; ; currentPage += 1) {
    const response = await stockApi.get(path, { params: { page: currentPage, per_page: pageSize } })
    const data = unwrap(response)
    const pageRows = data?.[key] ?? data?.results ?? []

    allRows.push(...pageRows)

    const expectedTotal = Number(data?.pagination?.total ?? allRows.length)
    if (!pageRows.length || allRows.length >= expectedTotal)
      break
  }

  return allRows
}

watch([page, perPage], () => { load() })
watch(statusFilter, () => { page.value = 1; load() })
onMounted(() => { Promise.all([load(), loadLookups()]) })

const createOpen = ref(false)
const saving = ref(false)
const formErrors = ref<Record<string, string>>({})
const form = ref({ stock_item_id: '', location_id: '', unit_id: '', direction: 'DECREASE', quantity: '', reason: '', evidence: '' })
const baseUnitLabel = ref('')
const baseUnitLoading = ref(false)
const baseUnitError = ref('')
const selectedItemTracksBatches = ref(false)
let baseUnitRequestId = 0

async function fetchStockItemDetail(itemId: string | number): Promise<any> {
  const response = await stockApi.get(`/items/${itemId}/`)
  const data = unwrap(response)

  return data.item ?? data
}

async function openCreate() {
  if (lookupLoading.value)
    return
  if (lookupError.value) {
    await loadLookups()
    if (lookupError.value)
      return
  }

  form.value = { stock_item_id: '', location_id: '', unit_id: '', direction: 'DECREASE', quantity: '', reason: '', evidence: '' }
  baseUnitLabel.value = ''
  baseUnitError.value = ''
  formErrors.value = {}
  createOpen.value = true
}

watch(() => form.value.stock_item_id, async itemId => {
  const requestId = ++baseUnitRequestId

  form.value.unit_id = ''
  baseUnitLabel.value = ''
  baseUnitError.value = ''
  selectedItemTracksBatches.value = false
  if (!itemId) {
    baseUnitLoading.value = false
    return
  }
  baseUnitLoading.value = true
  try {
    const item = await fetchStockItemDetail(itemId)
    if (requestId !== baseUnitRequestId || String(itemId) !== form.value.stock_item_id)
      return

    const unitId = item.base_unit_id ?? item.base_unit?.id
    if (!unitId)
      throw new Error('Missing base unit')

    form.value.unit_id = String(unitId)
    baseUnitLabel.value = item.base_unit?.short_name ?? item.base_unit?.name ?? String(unitId)
    selectedItemTracksBatches.value = item.track_batches === true
  }
  catch {
    if (requestId === baseUnitRequestId)
      baseUnitError.value = t('warehouse.adjustments.baseUnitUnavailable')
  }
  finally {
    if (requestId === baseUnitRequestId)
      baseUnitLoading.value = false
  }
})

function validateRequestForm(quantity: number) {
  const errors: Record<string, string> = {}

  if (!form.value.stock_item_id)
    errors.stock_item_id = t('warehouse.adjustments.required')
  else if (baseUnitLoading.value)
    errors.stock_item_id = t('warehouse.adjustments.itemVerificationPending')
  else if (baseUnitError.value)
    errors.stock_item_id = baseUnitError.value
  else if (selectedItemTracksBatches.value)
    errors.stock_item_id = t('warehouse.adjustments.batchTrackedBlocked')
  if (!form.value.location_id)
    errors.location_id = t('warehouse.adjustments.required')
  if (!form.value.unit_id)
    errors.unit_id = baseUnitError.value || t('warehouse.adjustments.required')
  if (!Number.isFinite(quantity) || quantity <= 0)
    errors.quantity = t('warehouse.adjustments.positiveQuantity')
  if (!form.value.reason.trim())
    errors.reason = t('warehouse.adjustments.required')
  if (!form.value.evidence.trim())
    errors.evidence = t('warehouse.adjustments.required')

  return errors
}

async function submitRequest() {
  const quantity = Number(form.value.quantity)
  const errors = validateRequestForm(quantity)

  formErrors.value = errors
  if (Object.keys(errors).length || saving.value)
    return

  saving.value = true
  try {
    let latestItem: any
    try {
      latestItem = await fetchStockItemDetail(form.value.stock_item_id)
    }
    catch {
      throw new Error(t('warehouse.adjustments.itemVerificationFailed'))
    }
    if (latestItem?.track_batches === true)
      throw new Error(t('warehouse.adjustments.batchTrackedBlocked'))

    await stockApi.post('/adjustment-requests/', {
      stock_item_id: Number(form.value.stock_item_id),
      location_id: Number(form.value.location_id),
      unit_id: Number(form.value.unit_id),
      quantity: form.value.direction === 'DECREASE' ? -quantity : quantity,
      reason: form.value.reason.trim(),
      evidence: form.value.evidence.trim(),
    })
    notify(t('warehouse.adjustments.created'))
    createOpen.value = false
    page.value = 1
    await load()
  }
  catch (error) {
    notify(error instanceof Error ? error.message : translate(error), 'error')
  }
  finally {
    saving.value = false
  }
}

const reviewOpen = ref(false)
const reviewSaving = ref(false)
const reviewTarget = ref<AdjustmentRequest | null>(null)
const reviewAction = ref<'approve' | 'reject'>('approve')
const reviewNote = ref('')
const reviewError = ref('')
const reviewSafetyLoading = ref(false)
const reviewSafetyError = ref('')
const reviewBatchTracked = ref(false)
let reviewSafetyRequestId = 0

async function openReview(row: AdjustmentRequest, action: 'approve' | 'reject') {
  const requestId = ++reviewSafetyRequestId

  reviewTarget.value = row
  reviewAction.value = action
  reviewNote.value = ''
  reviewError.value = ''
  reviewSafetyError.value = ''
  reviewBatchTracked.value = false
  reviewOpen.value = true
  if (action !== 'approve')
    return

  reviewSafetyLoading.value = true
  try {
    const item = await fetchStockItemDetail(row.stock_item_id)
    if (requestId !== reviewSafetyRequestId)
      return
    reviewBatchTracked.value = item?.track_batches === true
  }
  catch {
    if (requestId === reviewSafetyRequestId)
      reviewSafetyError.value = t('warehouse.adjustments.itemVerificationFailed')
  }
  finally {
    if (requestId === reviewSafetyRequestId)
      reviewSafetyLoading.value = false
  }
}

async function submitReview() {
  if (!reviewTarget.value || reviewSaving.value)
    return
  if (!reviewNote.value.trim()) {
    reviewError.value = t('warehouse.adjustments.required')
    return
  }
  if (reviewAction.value === 'approve') {
    reviewSafetyLoading.value = true
    try {
      const item = await fetchStockItemDetail(reviewTarget.value.stock_item_id)
      if (item?.track_batches === true) {
        reviewBatchTracked.value = true
        reviewSafetyError.value = t('warehouse.adjustments.batchTrackedApprovalBlocked')
        return
      }
      reviewBatchTracked.value = false
      reviewSafetyError.value = ''
    }
    catch {
      reviewSafetyError.value = t('warehouse.adjustments.itemVerificationFailed')
      return
    }
    finally {
      reviewSafetyLoading.value = false
    }
  }
  reviewSaving.value = true
  try {
    await stockApi.post(`/adjustment-requests/${reviewTarget.value.id}/${reviewAction.value}/`, {
      review_note: reviewNote.value.trim(),
    })
    notify(t(`warehouse.adjustments.reviewed.${reviewAction.value}`))
    reviewOpen.value = false
    await load()
  }
  catch (error) {
    notify(translate(error), 'error')
    await load()
  }
  finally {
    reviewSaving.value = false
  }
}
</script>

<template>
  <div class="page adjustment-page">
    <PageHeader
      :title="t('warehouse.adjustments.title')"
      :subtitle="t('warehouse.adjustments.subtitle')"
    >
      <template #actions>
        <Button
          v-if="canCreate"
          variant="primary"
          icon="plus"
          :loading="lookupLoading"
          :disabled="lookupLoading"
          @click="openCreate"
        >
          {{ t('warehouse.adjustments.newRequest') }}
        </Button>
      </template>
    </PageHeader>

    <div
      v-if="lookupError"
      class="inline-alert"
      role="alert"
    >
      <DesignIcon
        name="alert"
        :size="18"
      />
      <span><strong>{{ t('Failed to load') }}.</strong> {{ lookupError }}</span>
      <Button
        variant="ghost"
        size="sm"
        icon="retry"
        :loading="lookupLoading"
        @click="loadLookups"
      >
        {{ t('Retry') }}
      </Button>
    </div>

    <Card>
      <div class="adjustment-toolbar">
        <Select
          v-model="statusFilter"
          :options="statusOptions"
          :placeholder="t('warehouse.adjustments.allStatuses')"
        />
        <Button
          variant="ghost"
          size="sm"
          icon="refresh"
          :disabled="loading"
          @click="load"
        >
          {{ t('opsAudit.refresh') }}
        </Button>
      </div>

      <StateFill
        v-if="errorMessage"
        icon="alert"
        :title="t('warehouse.adjustments.loadFailed')"
        :sub="errorMessage"
        error
      >
        <template #action>
          <Button
            variant="secondary"
            size="sm"
            icon="retry"
            @click="load"
          >
            {{ t('opsAudit.tryAgain') }}
          </Button>
        </template>
      </StateFill>

      <DataTable
        v-else
        :columns="columns"
        :rows="rows"
        :loading="loading"
        :pagination="pagination"
        row-key="id"
        expandable
        :empty-title="t('warehouse.adjustments.emptyTitle')"
        :empty-sub="t('warehouse.adjustments.emptySubtitle')"
        empty-icon="sliders"
      >
        <template #cell.requested_at="{ row }">
          <span class="mono nowrap">{{ formatDate(row.requested_at) }}</span>
        </template>
        <template #cell.stock_item_name="{ row }">
          <strong>{{ row.stock_item_name }}</strong>
        </template>
        <template #cell.quantity="{ row }">
          <span
            class="mono"
            :class="Number(row.quantity) < 0 ? 'qty-negative' : 'qty-positive'"
          >{{ Number(row.quantity) > 0 ? '+' : '' }}{{ formatQuantity(row.quantity) }}</span>
        </template>
        <template #cell.reason="{ row }">
          <span
            class="cell-ellipsis"
            :title="row.reason"
          >{{ row.reason }}</span>
        </template>
        <template #cell.status="{ row }">
          <Badge
            :tone="statusTone(row.status)"
            dot
          >
            {{ t(`warehouse.adjustments.status.${row.status}`) }}
          </Badge>
        </template>
        <template #row-actions="{ row }">
          <template v-if="canReview(row) && row.status === 'PENDING'">
            <IconAction
              icon="check"
              tone="success"
              :title="t('warehouse.adjustments.approve')"
              @click="openReview(row, 'approve')"
            />
            <IconAction
              icon="close"
              tone="danger"
              :title="t('warehouse.adjustments.reject')"
              @click="openReview(row, 'reject')"
            />
          </template>
        </template>
        <template #expanded="{ row }">
          <div class="request-detail">
            <div><span>{{ t('warehouse.adjustments.evidence') }}</span><p>{{ row.evidence }}</p></div>
            <div><span>{{ t('warehouse.adjustments.reviewNote') }}</span><p>{{ row.review_note || '—' }}</p></div>
            <div><span>{{ t('warehouse.adjustments.reviewedAt') }}</span><p>{{ row.reviewed_at ? formatDate(row.reviewed_at) : '—' }}</p></div>
          </div>
        </template>
      </DataTable>
    </Card>

    <Modal
      :open="createOpen"
      :title="t('warehouse.adjustments.newRequest')"
      :subtitle="t('warehouse.adjustments.createSubtitle')"
      :width="700"
      :close-on-backdrop="!saving"
      :close-on-esc="!saving"
      @close="createOpen = false"
    >
      <div class="form-grid form-grid--two">
        <Field
          class="span-two"
          :label="t('warehouse.adjustments.item')"
          :error="formErrors.stock_item_id"
        >
          <SearchSelect
            v-model="form.stock_item_id"
            icon="box"
            :options="itemOptions"
            :placeholder="t('warehouse.adjustments.selectItem')"
          />
        </Field>
        <div
          v-if="selectedItemTracksBatches"
          class="inline-alert span-two"
        >
          <DesignIcon
            name="alert"
            :size="16"
          />
          <span>{{ t('warehouse.adjustments.batchTrackedBlocked') }}</span>
        </div>
        <Field
          :label="t('warehouse.adjustments.location')"
          :error="formErrors.location_id"
        >
          <SearchSelect
            v-model="form.location_id"
            icon="store"
            :options="locationOptions"
            :placeholder="t('warehouse.adjustments.selectLocation')"
          />
        </Field>
        <Field
          :label="t('warehouse.adjustments.baseUnit')"
          :error="formErrors.unit_id || baseUnitError"
        >
          <Input
            :model-value="baseUnitLabel"
            :placeholder="baseUnitLoading ? t('warehouse.adjustments.baseUnitLoading') : t('warehouse.adjustments.selectItem')"
            disabled
          />
        </Field>
        <Field :label="t('warehouse.adjustments.direction')">
          <Select
            v-model="form.direction"
            :options="directionOptions"
          />
        </Field>
        <Field
          :label="t('warehouse.adjustments.quantity')"
          :error="formErrors.quantity"
        >
          <Input
            v-model="form.quantity"
            type="number"
            min="0.0001"
            step="0.0001"
            inputmode="decimal"
          />
        </Field>
        <Field
          class="span-two"
          :label="t('warehouse.adjustments.reason')"
          :error="formErrors.reason"
        >
          <Input
            v-model="form.reason"
            maxlength="250"
          />
        </Field>
        <Field
          class="span-two"
          :label="t('warehouse.adjustments.evidence')"
          :error="formErrors.evidence"
        >
          <Textarea
            v-model="form.evidence"
            :rows="4"
            maxlength="1000"
            :placeholder="t('warehouse.adjustments.evidencePlaceholder')"
          />
        </Field>
      </div>
      <template #footer>
        <Button
          variant="primary"
          icon="send"
          :loading="saving"
          :disabled="saving || baseUnitLoading || !!baseUnitError || selectedItemTracksBatches"
          @click="submitRequest"
        >
          {{ t('warehouse.adjustments.submit') }}
        </Button>
      </template>
    </Modal>

    <Modal
      :open="reviewOpen"
      :title="t(`warehouse.adjustments.reviewTitle.${reviewAction}`)"
      :subtitle="reviewTarget?.stock_item_name"
      :width="520"
      :close-on-backdrop="!reviewSaving"
      :close-on-esc="!reviewSaving"
      @close="reviewOpen = false"
    >
      <div
        v-if="reviewAction === 'approve'"
        class="approval-warning"
      >
        {{ t('warehouse.adjustments.approvalWarning') }}
      </div>
      <div
        v-if="reviewAction === 'approve' && (reviewBatchTracked || reviewSafetyError)"
        class="inline-alert"
      >
        <DesignIcon
          name="alert"
          :size="16"
        />
        <span>{{ reviewSafetyError || t('warehouse.adjustments.batchTrackedApprovalBlocked') }}</span>
      </div>
      <Field
        :label="t('warehouse.adjustments.reviewNote')"
        :error="reviewError"
      >
        <Textarea
          v-model="reviewNote"
          :rows="4"
          :placeholder="t('warehouse.adjustments.reviewPlaceholder')"
        />
      </Field>
      <template #footer>
        <Button
          :variant="reviewAction === 'approve' ? 'primary' : 'danger'"
          :icon="reviewAction === 'approve' ? 'check' : 'close'"
          :loading="reviewSaving || reviewSafetyLoading"
          :disabled="reviewSaving || reviewSafetyLoading || (reviewAction === 'approve' && (reviewBatchTracked || !!reviewSafetyError))"
          @click="submitReview"
        >
          {{ t(`warehouse.adjustments.${reviewAction}`) }}
        </Button>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.adjustment-page { max-width: none; }
.inline-alert { display: flex; align-items: center; gap: 9px; margin-bottom: 14px; padding: 10px 12px; border: 1px solid rgb(var(--v-theme-error-border)); border-radius: var(--r-md); color: rgb(var(--v-theme-error-strong)); background: rgb(var(--v-theme-error-weak)); font-size: 13px; }
.inline-alert span { flex: 1; min-width: 0; }
.adjustment-toolbar { display: flex; justify-content: flex-end; align-items: center; gap: 10px; padding: 12px 14px; border-bottom: 1px solid rgb(var(--v-theme-border)); }
.adjustment-toolbar > :first-child { width: min(260px, 100%); }
.qty-positive { color: rgb(var(--v-theme-success-strong)); }
.qty-negative { color: rgb(var(--v-theme-error-strong)); }
.cell-ellipsis { display: block; max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.request-detail { display: grid; grid-template-columns: 2fr 2fr 1fr; gap: 18px; padding: 4px 8px 8px; }
.request-detail span { color: rgb(var(--v-theme-text-secondary)); font-size: 12px; }
.request-detail p { margin: 4px 0 0; white-space: pre-wrap; }
.form-grid { display: grid; gap: 14px; }
.form-grid--two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.span-two { grid-column: 1 / -1; }
.approval-warning { margin-bottom: 14px; padding: 11px 12px; border: 1px solid rgb(var(--v-theme-warning-border)); border-radius: var(--r-md); color: rgb(var(--v-theme-warning-strong)); background: rgb(var(--v-theme-warning-weak)); font-size: 13px; }
@media (max-width: 700px) {
  .adjustment-toolbar { align-items: stretch; flex-direction: column; }
  .adjustment-toolbar > :first-child { width: 100%; }
  .form-grid--two, .request-detail { grid-template-columns: 1fr; }
  .span-two { grid-column: auto; }
}
</style>

<route lang="yaml">
meta:
  action: manage
  subject: all
  anyPermission:
    - stock.adjustment.request
</route>
