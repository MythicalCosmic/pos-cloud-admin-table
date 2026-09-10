<script setup lang="ts">
/* ============================================================
   ALPHA POS - Stock Suppliers
   - Design-system primitives only (no Vuetify on the page itself)
   - List / search / filter active
   - Create / Edit / Delete / Pay / Ledger modals
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
import MoneyInput from '@/components/design/MoneyInput.vue'
import PageHeader from '@/components/design/PageHeader.vue'
import Pagination from '@/components/design/Pagination.vue'
import Select from '@/components/design/Select.vue'
import StateFill from '@/components/design/StateFill.vue'
import { useUserAccess } from '@/composables/useUserAccess'
import { supplierItemHasKnownPrice } from '@/utils/supplierItemPrice'

const { t } = useI18n({ useScope: 'global' })
const { notify } = useNotify()
const { formatCurrency, formatDate } = useFormatters()
const router = useRouter()
const { hasPermission } = useUserAccess()

const canViewSuppliers = computed(() => hasPermission('stock.supplier.view'))
const canManageSuppliers = computed(() => hasPermission('stock.manage'))
const canViewSupplierBalances = computed(() => hasPermission('stock.supplier.balance.view'))
const canPaySuppliers = computed(() =>
  hasPermission('stock.supplier.pay') && hasPermission('stock.supplier.balance.view'),
)

// The list exposes balances on current backends, but currency still comes from
// the detail contract and must be verified before a payment can be submitted.
const suppliers = ref<any[]>([])
const total = ref(0)
const loading = ref(false)
const listLoadError = ref(false)
let supplierListRequestId = 0

const page = ref(1)
const itemsPerPage = ref(10)
const search = ref('')
const activeFilter = ref<string | undefined>(undefined)

// detail dialog (view)
const detailDialog = ref(false)
const detailItem = ref<any>(null)
const detailLoading = ref(false)
let detailRequestId = 0

// create/edit dialog
const dialog = ref(false)
const dialogMode = ref<'create' | 'edit'>('create')
const saving = ref(false)
const editDetailLoading = ref(false)
const editDetailError = ref(false)
let editDetailRequestId = 0
const deleteDialog = ref(false)
const deleting = ref(false)
const selectedItem = ref<any>(null)

const form = ref({
  name: '',
  contact_person: '',
  email: '',
  phone: '',
  city: '',
  address: '',
  rating: 3,
  payment_terms_days: 30,
  lead_time_days: 7,
  notes: '',
})

async function loadSuppliers() {
  if (!canViewSuppliers.value)
    return

  const requestId = ++supplierListRequestId
  const requestedPage = page.value
  const requestedPerPage = itemsPerPage.value
  const requestedSearch = search.value.trim()
  const requestedActiveFilter = activeFilter.value

  loading.value = true
  listLoadError.value = false
  try {
    const params: any = { page: requestedPage, per_page: requestedPerPage }
    if (requestedSearch)
      params.search = requestedSearch

    // `active_only=false` means all statuses on the backend. For an
    // inactive-only view, collect every server page first and paginate the
    // filtered result locally so rows and totals remain truthful.
    if (requestedActiveFilter === 'false') {
      const allRows: any[] = []
      let serverPage = 1
      let totalPages = 1

      do {
        const res = await axios.get('/suppliers/', {
          params: {
            ...(requestedSearch ? { search: requestedSearch } : {}),
            active_only: 'false',
            page: serverPage,
            per_page: 100,
          },
        })
        const data = res.data?.data ?? res.data ?? {}
        if (requestId !== supplierListRequestId)
          return

        allRows.push(...(data?.suppliers ?? []))
        totalPages = Math.max(1, Number(data?.pagination?.total_pages ?? 1) || 1)
        serverPage += 1
      } while (serverPage <= totalPages)

      const inactiveRows = allRows.filter(row => row.is_active === false)
      const start = (requestedPage - 1) * requestedPerPage

      if (requestId !== supplierListRequestId)
        return
      suppliers.value = inactiveRows.slice(start, start + requestedPerPage)
      total.value = inactiveRows.length
      return
    }

    params.active_only = requestedActiveFilter === 'true' ? 'true' : 'false'

    const res = await axios.get('/suppliers/', { params })
    const d = res.data?.data ?? res.data
    if (requestId !== supplierListRequestId)
      return

    suppliers.value = d?.suppliers ?? []
    total.value = d?.pagination?.total_suppliers ?? suppliers.value.length
  }
  catch {
    if (requestId === supplierListRequestId) {
      suppliers.value = []
      total.value = 0
      listLoadError.value = true
      notify(t('Failed to load suppliers'), 'error')
    }
  }
  finally {
    if (requestId === supplierListRequestId)
      loading.value = false
  }
}

const debouncedSearch = useDebounceFn(() => {
  if (page.value !== 1)
    page.value = 1
  else
    loadSuppliers()
}, 350)

onMounted(loadSuppliers)
watch([page, itemsPerPage], loadSuppliers)
watch(activeFilter, () => {
  if (page.value !== 1)
    page.value = 1
  else
    loadSuppliers()
})
watch(search, () => {
  supplierListRequestId += 1
  suppliers.value = []
  total.value = 0
  loading.value = true
  listLoadError.value = false
  debouncedSearch()
})

async function openDetail(item: any) {
  if (!canViewSuppliers.value)
    return

  const requestId = ++detailRequestId

  detailItem.value = item
  detailDialog.value = true
  detailLoading.value = true
  try {
    const res = await axios.get(`/suppliers/${item.id}/`)

    // BE wrapper: { success, message, data: { supplier: {...} } }
    if (requestId === detailRequestId && detailDialog.value)
      detailItem.value = res.data?.data?.supplier ?? item
  }
  catch { /* keep basic data */ }
  finally {
    if (requestId === detailRequestId)
      detailLoading.value = false
  }
}

function closeDetail() {
  detailRequestId += 1
  detailDialog.value = false
  detailLoading.value = false
}

function openCreate() {
  if (!canManageSuppliers.value)
    return

  editDetailRequestId += 1
  editDetailLoading.value = false
  editDetailError.value = false
  dialogMode.value = 'create'
  selectedItem.value = null
  form.value = { name: '', contact_person: '', email: '', phone: '', city: '', address: '', rating: 3, payment_terms_days: 30, lead_time_days: 7, notes: '' }
  dialog.value = true
}

function viewProfile(item: any) {
  if (!canViewSuppliers.value || !item?.id)
    return
  closeDetail()
  router.push(`/stock/suppliers/${item.id}`)
}

function supplierForm(item: any) {
  return {
    name: item.name ?? '',
    contact_person: item.contact_person ?? '',
    email: item.email ?? '',
    phone: item.phone ?? '',
    city: item.city ?? '',
    address: item.address ?? '',
    rating: item.rating ?? 3,
    payment_terms_days: item.payment_terms_days ?? 30,
    lead_time_days: item.lead_time_days ?? 7,
    notes: item.notes ?? '',
  }
}

function isValidSupplierDetail(value: any, supplierId: unknown): boolean {
  return Boolean(
    value
    && typeof value === 'object'
    && !Array.isArray(value)
    && String(value.id) === String(supplierId)
    && typeof value.name === 'string'
    && value.name.trim(),
  )
}

function isCurrentEditDetailRequest(requestId: number, supplierId: unknown): boolean {
  return requestId === editDetailRequestId
    && dialog.value
    && dialogMode.value === 'edit'
    && String(selectedItem.value?.id) === String(supplierId)
}

async function loadEditDetails(item: any) {
  const supplierId = item?.id
  const requestId = ++editDetailRequestId
  editDetailLoading.value = true
  editDetailError.value = false

  try {
    const res = await axios.get(`/suppliers/${supplierId}/`)
    if (!isCurrentEditDetailRequest(requestId, supplierId))
      return

    // BE wrapper: { success, message, data: { supplier: {...} } }
    const detail = res.data?.data?.supplier
    if (!isValidSupplierDetail(detail, supplierId)) {
      editDetailError.value = true
      return
    }

    selectedItem.value = { ...item, ...detail }
    form.value = supplierForm(detail)
  }
  catch {
    if (isCurrentEditDetailRequest(requestId, supplierId))
      editDetailError.value = true
  }
  finally {
    if (requestId === editDetailRequestId)
      editDetailLoading.value = false
  }
}

function openEdit(item: any) {
  if (!canManageSuppliers.value)
    return

  dialogMode.value = 'edit'
  selectedItem.value = item
  form.value = supplierForm({})
  editDetailError.value = false
  dialog.value = true
  void loadEditDetails(item)
}

function retryEditDetails() {
  if (!selectedItem.value?.id) {
    editDetailError.value = true
    return
  }

  void loadEditDetails(selectedItem.value)
}

function closeSupplierForm() {
  editDetailRequestId += 1
  editDetailLoading.value = false
  editDetailError.value = false
  dialog.value = false
}

async function save() {
  if (!canManageSuppliers.value || saving.value || !form.value.name.trim())
    return

  if (dialogMode.value === 'edit' && (editDetailLoading.value || editDetailError.value || !selectedItem.value?.id)) {
    notify(t('supplier_failed_load'), 'error')
    return
  }

  saving.value = true
  try {
    if (dialogMode.value === 'create')
      await axios.post('/suppliers/', form.value)
    else

      // Supplier detail route allows GET/PUT/DELETE (not PATCH).
      await axios.put(`/suppliers/${selectedItem.value.id}/`, form.value)
    notify(dialogMode.value === 'create' ? t('Supplier created') : t('Supplier updated'))
    closeSupplierForm()
    await loadSuppliers()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error saving supplier'), 'error')
  }
  finally {
    saving.value = false
  }
}

function confirmDelete(item: any) {
  if (!canManageSuppliers.value)
    return

  selectedItem.value = item
  deleteDialog.value = true
}

async function doDelete() {
  if (!canManageSuppliers.value)
    return

  deleting.value = true
  try {
    await axios.delete(`/suppliers/${selectedItem.value.id}/`)
    notify(t('Supplier deleted'))
    deleteDialog.value = false
    await loadSuppliers()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error deleting supplier'), 'error')
  }
  finally {
    deleting.value = false
  }
}

// -------- pay supplier --------
const payDialog = ref(false)
const paying = ref<any>(null)
const paySaving = ref(false)
const payDetailsLoading = ref(false)
const payDetailsError = ref(false)
const payForm = ref({ amount: 0, source_account: 'BANK', commission: 0, note: '' })
let payDetailRequestId = 0

function closePayDialog() {
  if (paySaving.value)
    return
  payDetailRequestId += 1
  payDialog.value = false
  payDetailsLoading.value = false
  payDetailsError.value = false
}

async function openPay(s: any) {
  if (!canPaySuppliers.value || paySaving.value)
    return

  paying.value = s
  payForm.value = { amount: 0, source_account: 'BANK', commission: 0, note: '' }
  payDetailsLoading.value = true
  payDetailsError.value = false
  payDialog.value = true
  const requestId = ++payDetailRequestId

  // Currency is intentionally absent from the brief list contract. Verify the
  // full supplier before allowing a Treasury payment.
  try {
    const res = await axios.get(`/suppliers/${s.id}/`)
    if (requestId !== payDetailRequestId || !payDialog.value || String(paying.value?.id) !== String(s.id))
      return
    const full = res.data?.data?.supplier
    if (full)
      paying.value = { ...s, ...full }
    else
      payDetailsError.value = true
  }
  catch {
    if (requestId === payDetailRequestId)
      payDetailsError.value = true
  }
  finally {
    if (requestId === payDetailRequestId)
      payDetailsLoading.value = false
  }
}

async function doPay() {
  if (!canPaySuppliers.value)
    return

  if (!paying.value || payForm.value.amount <= 0) {
    notify(t('Amount must be greater than 0'), 'error')

    return
  }
  if (payUnavailableReason.value || payAmountError.value) {
    notify(payUnavailableReason.value || payAmountError.value, 'error')
    return
  }
  paySaving.value = true
  try {
    await axios.post(`/suppliers/${paying.value.id}/payments/`, {
      amount_uzs: Number(payForm.value.amount),
      fee_uzs: payForm.value.source_account === 'BANK'
        ? (Number(payForm.value.commission) || 0)
        : 0,
      source_account: payForm.value.source_account,
      allocation_mode: 'AUTO_OLDEST_DUE',
      note: payForm.value.note.trim(),
    })
    notify(t('Payment recorded'))
    payDetailRequestId += 1
    payDialog.value = false
    payDetailsLoading.value = false
    payDetailsError.value = false
    await loadSuppliers()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
  finally {
    paySaving.value = false
  }
}

// -------- ledger drawer --------
const ledgerDialog = ref(false)
const ledgerSupplier = ref<any>(null)
const ledgerLoading = ref(false)
const ledgerRows = ref<any[]>([])
const ledgerPage = ref(1)
const ledgerPerPage = ref(20)
const ledgerTotal = ref(0)
const ledgerBalance = ref<number | null>(null)
const ledgerLoadError = ref(false)
let ledgerRequestId = 0

function moneyNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '')
    return null

  const amount = Number(value)

  return Number.isFinite(amount) ? amount : null
}

function normalizedLedgerRow(row: any) {
  const type = row?.type ?? row?.transaction_type ?? ''
  const amount = moneyNumber(row?.amount_uzs ?? row?.amount) ?? 0
  const deployedChange = moneyNumber(row?.change_uzs ?? row?.change)
  const reducesDebt = type === 'PAYMENT' || type === 'RETURN'
  const change = deployedChange ?? (reducesDebt ? -Math.abs(amount) : amount)

  return {
    ...row,
    type,
    amount,
    change,
    balance_after: moneyNumber(row?.balance_after_uzs ?? row?.balance_after) ?? 0,
    fee: moneyNumber(row?.fee_uzs ?? row?.fee) ?? 0,
  }
}

function formatLedgerChange(row: any): string {
  const change = moneyNumber(row?.change) ?? 0

  return `${change > 0 ? '+' : ''}${formatCurrency(change)}`
}

async function openLedger(s: any) {
  if (!canViewSupplierBalances.value)
    return

  const startsOnFirstPage = ledgerPage.value === 1

  ledgerRequestId += 1
  ledgerSupplier.value = s
  ledgerPage.value = 1
  ledgerRows.value = []
  ledgerLoadError.value = false
  ledgerBalance.value = supplierBalance(s)
  ledgerDialog.value = true
  if (startsOnFirstPage)
    await loadLedger()
}

async function loadLedger() {
  if (!canViewSupplierBalances.value || !ledgerSupplier.value)
    return

  const requestId = ++ledgerRequestId
  const supplierId = ledgerSupplier.value.id
  const requestedPage = ledgerPage.value
  const requestedPerPage = ledgerPerPage.value

  ledgerLoading.value = true
  ledgerLoadError.value = false
  try {
    const res = await axios.get(`/suppliers/${supplierId}/ledger/`, {
      params: { page: requestedPage, per_page: requestedPerPage },
    })

    if (
      requestId !== ledgerRequestId
      || !ledgerDialog.value
      || ledgerSupplier.value?.id !== supplierId
    )
      return

    const d = res.data?.data ?? res.data

    const rows = d?.transactions ?? d?.entries ?? d?.items ?? []

    ledgerRows.value = rows.map(normalizedLedgerRow)
    ledgerTotal.value = d?.pagination?.total ?? ledgerRows.value.length

    // Deployed history returns transactions + pagination. The first page is
    // newest-first, so its balance_after_uzs is the freshest ledger value.
    const responseBalance = moneyNumber(d?.current_balance_uzs ?? d?.current_balance ?? d?.balance)

    const newestBalance = requestedPage === 1
      ? moneyNumber(ledgerRows.value[0]?.balance_after)
      : null

    ledgerBalance.value = responseBalance
      ?? newestBalance
      ?? supplierBalance(ledgerSupplier.value)
      ?? ledgerBalance.value
  }
  catch (e: any) {
    if (requestId === ledgerRequestId) {
      ledgerRows.value = []
      ledgerTotal.value = 0
      ledgerLoadError.value = true
      notify(e?.response?.data?.message ?? t('Failed to load'), 'error')
    }
  }
  finally {
    if (requestId === ledgerRequestId)
      ledgerLoading.value = false
  }
}

function closeLedger() {
  ledgerRequestId += 1
  ledgerDialog.value = false
  ledgerLoading.value = false
  ledgerLoadError.value = false
}

watch([ledgerPage, ledgerPerPage], () => {
  if (ledgerDialog.value)
    loadLedger()
})

const ledgerTypeTone: Record<string, 'warning' | 'success' | 'info' | 'neutral'> = {
  PURCHASE: 'warning',
  PAYMENT: 'success',
  PAYMENT_REVERSAL: 'warning',
  RETURN: 'info',
  ADJUSTMENT: 'neutral',
}

// ---- DataTable columns ----
// Newer list responses expose the server-calculated balance. Legacy responses
// remain supported and render a dash instead of inventing zero debt.
const columns = computed<DataTableColumn<any>[]>(() => [
  { key: 'name', label: t('supplier_col_name') },
  { key: 'city', label: t('supplier_col_city') },
  ...(canViewSupplierBalances.value
    ? [{ key: 'current_balance', label: t('Balance'), align: 'right' as const }]
    : []),
  { key: 'rating', label: t('supplier_col_rating') },
  { key: 'is_active', label: t('supplier_col_status') },
])

const dtPagination = computed(() => ({
  page: page.value,
  perPage: itemsPerPage.value,
  total: total.value,
  onPage: (p: number) => { page.value = p },
  onPerPage: (n: number) => { itemsPerPage.value = n; page.value = 1 },
}))

const statusOptions = computed(() => [
  { value: 'true', label: t('supplier_status_active') },
  { value: 'false', label: t('supplier_status_inactive') },
])

const sourceOptions = computed(() => [
  { value: 'BANK', label: t('pay_source_BANK') },
  { value: 'SAFE', label: t('pay_source_SAFE') },
])

// -------- pay: live preview + helpers --------
// Commission only applies to BANK transfers (backend zeroes it for SAFE).
const isBankPay = computed(() => payForm.value.source_account === 'BANK')
const payAmountNum = computed(() => Math.max(0, Number(payForm.value.amount) || 0))
const payCommissionNum = computed(() => (isBankPay.value ? Math.max(0, Number(payForm.value.commission) || 0) : 0))
const payTotalCharge = computed(() => payAmountNum.value + payCommissionNum.value)
const payOwed = computed(() => Number(paying.value?.current_balance_uzs ?? paying.value?.current_balance ?? 0))
const payRemaining = computed(() => payOwed.value - payAmountNum.value)
const payCurrency = computed(() => String(paying.value?.currency ?? '').trim().toUpperCase())
const payUnavailableReason = computed(() => {
  if (payDetailsError.value)
    return t('pay_supplier_details_failed')
  if (payCurrency.value && payCurrency.value !== 'UZS')
    return t('pay_currency_unsupported')
  if (!payDetailsLoading.value && payOwed.value <= 0)
    return t('pay_no_outstanding_balance')

  return ''
})
const payAmountError = computed(() =>
  payAmountNum.value > payOwed.value && payOwed.value > 0
    ? t('pay_amount_exceeds_balance')
    : '',
)
const canSubmitSupplierPayment = computed(() =>
  !paySaving.value
  && !payDetailsLoading.value
  && !payUnavailableReason.value
  && payAmountNum.value > 0
  && !payAmountError.value,
)

watch(() => payForm.value.source_account, source => {
  if (source === 'SAFE')
    payForm.value.commission = 0
})

// Prefill the amount with the full outstanding balance (one-click settle).
function payFull() {
  if (payOwed.value > 0)
    payForm.value.amount = payOwed.value
}

// -------- balance tone (positive = we owe; negative = credit) --------
type BalanceTone = 'warning' | 'success' | 'neutral'
function balanceTone(v: any): BalanceTone {
  const n = Number(v ?? 0)
  if (n > 0)
    return 'warning'
  if (n < 0)
    return 'success'
  return 'neutral'
}
function balanceLabel(v: any): string {
  const n = Number(v ?? 0)
  if (n > 0)
    return t('Owed')
  if (n < 0)
    return t('supplier_balance_credit')
  return t('supplier_balance_settled')
}

function supplierBalance(supplier: any): number | null {
  const raw = supplier?.current_balance_uzs ?? supplier?.current_balance

  if (raw === null || raw === undefined || raw === '')
    return null

  const value = Number(raw)

  return Number.isFinite(value) ? value : null
}

const balanceColorVar: Record<BalanceTone, string> = {
  warning: 'rgb(var(--v-theme-warning-strong))',
  success: 'rgb(var(--v-theme-success-strong))',
  neutral: 'var(--text-tertiary)',
}

// -------- ledger pagination --------
const ledgerPages = computed(() => Math.max(1, Math.ceil(ledgerTotal.value / ledgerPerPage.value)))
function onLedgerPerPage(n: number) {
  ledgerPerPage.value = n
  ledgerPage.value = 1
}

// Ledger reference labels (backend reference_type values).
const refLabels: Record<string, string> = {
  PurchaseOrder: 'ref_PurchaseOrder',
  TreasuryPayment: 'ref_TreasuryPayment',
  CashboxExpense: 'ref_CashboxExpense',
  SupplierPayment: 'ref_SupplierPayment',
  Supplier: 'ref_Supplier',
  PurchaseReceiving: 'ref_PurchaseReceiving',
  PurchaseReceivingCorrection: 'ref_PurchaseReceivingCorrection',
}

function refLabel(type: string): string {
  const key = refLabels[type]
  return key ? t(key) : type
}

const sourceLabels: Record<string, string> = {
  SAFE: 'supplier_source_SAFE',
  BANK: 'supplier_source_BANK',
  DRAWER: 'supplier_source_DRAWER',
}

function sourceLabel(src: string): string {
  const key = sourceLabels[src]
  return key ? t(key) : (src || '—')
}
</script>

<template>
  <div class="page">
    <!-- Page header -->
    <PageHeader
      :title="t('Suppliers')"
      :subtitle="t('suppliers_subtitle')"
    >
      <template #actions>
        <Button
          v-if="canManageSuppliers"
          variant="primary"
          icon="plus"
          @click="openCreate"
        >
          {{ t('Add Supplier') }}
        </Button>
      </template>
    </PageHeader>

    <!-- Main table card -->
    <div class="card">
      <!-- Toolbar -->
      <div class="toolbar toolbar--wrap">
        <div class="grow toolbar__search">
          <Input
            v-model="search"
            icon="search"
            :placeholder="t('Search suppliers...')"
            :aria-label="t('Search suppliers...')"
          />
        </div>

        <div class="toolbar__status">
          <Select
            :model-value="activeFilter ?? ''"
            :placeholder="t('All')"
            :options="statusOptions"
            @update:model-value="(v: string) => activeFilter = v ? v : undefined"
          />
        </div>
      </div>

      <div class="card__divider" />

      <!-- DataTable -->
      <DataTable
        :columns="columns"
        :rows="suppliers"
        row-key="id"
        :loading="loading"
        :pagination="dtPagination"
        :per-page-options="[10, 25, 50, 100]"
      >
        <!-- Name -->
        <template #cell.name="{ row }">
          <span class="cell-strong">{{ row.name }}</span>
        </template>

        <!-- City -->
        <template #cell.city="{ row }">
          <span class="cell-muted">{{ row.city || '—' }}</span>
        </template>

        <!-- Server-backed current balance; absent on legacy list responses. -->
        <template #cell.current_balance="{ row }">
          <div v-if="supplierBalance(row) !== null" style="text-align: right;">
            <div
              class="mono"
              :style="{ color: balanceColorVar[balanceTone(supplierBalance(row))], fontWeight: 600 }"
            >
              {{ formatCurrency(Math.abs(supplierBalance(row) ?? 0)) }}
            </div>
            <div class="cell-muted" style="font-size: 12px;">
              {{ balanceLabel(supplierBalance(row)) }}
            </div>
          </div>
          <span v-else class="cell-muted">—</span>
        </template>

        <!-- Rating -->
        <template #cell.rating="{ row }">
          <div class="row" style="gap: 4px;">
            <DesignIcon
              name="star"
              :size="14"
              style="color: rgb(var(--v-theme-warning-strong));"
            />
            <span>{{ row.rating ?? '—' }}</span>
          </div>
        </template>

        <!-- Status -->
        <template #cell.is_active="{ row }">
          <Badge :tone="row.is_active ? 'success' : 'neutral'" dot>
            {{ row.is_active ? t('supplier_status_active') : t('supplier_status_inactive') }}
          </Badge>
        </template>

        <!-- Inline row actions -->
        <template #row-actions="{ row }">
          <IconAction
            v-if="canPaySuppliers"
            icon="dollar"
            tone="success"
            :title="t('Pay supplier')"
            @click.stop="openPay(row)"
          />
          <IconAction
            v-if="canViewSupplierBalances"
            icon="receipt"
            :title="t('Ledger')"
            @click.stop="openLedger(row)"
          />
          <IconAction
            icon="eye"
            :title="t('View')"
            @click.stop="openDetail(row)"
          />
          <IconAction
            v-if="canManageSuppliers"
            icon="edit"
            :title="t('Edit')"
            @click.stop="openEdit(row)"
          />
          <IconAction
            v-if="canManageSuppliers"
            icon="trash"
            tone="danger"
            :title="t('Delete')"
            @click.stop="confirmDelete(row)"
          />
        </template>

        <!-- Empty state -->
        <template #empty>
          <StateFill
            :icon="listLoadError ? 'alert' : 'package'"
            :title="listLoadError ? t('Failed to load suppliers') : t('suppliers_empty_title')"
            :sub="listLoadError ? undefined : t('suppliers_empty_sub')"
            :error="listLoadError"
          >
            <div v-if="listLoadError" style="margin-top: 12px;">
              <Button variant="secondary" icon="refresh" @click="loadSuppliers">
                {{ t('Retry') }}
              </Button>
            </div>
          </StateFill>
        </template>
      </DataTable>
    </div>

    <!-- Detail Modal -->
    <Modal
      :open="detailDialog"
      :width="560"
      :title="detailItem?.name ?? ''"
      @close="closeDetail"
    >
      <div v-if="detailLoading" class="row" style="justify-content: center; padding: 16px 0;">
        <DesignIcon name="refresh" :size="20" />
        <span style="margin-left: 8px;" class="cell-muted">{{ t('Loading') }}</span>
      </div>

      <div v-if="detailItem" class="grid cols-2 detail-grid" style="gap: var(--sp-4);">
        <div>
          <div class="field__label">
            {{ t('Contact') }}
          </div>
          <div>{{ detailItem.contact_person || '—' }}</div>
        </div>
        <div>
          <div class="field__label">
            {{ t('Phone') }}
          </div>
          <div>{{ detailItem.phone || '—' }}</div>
        </div>
        <div>
          <div class="field__label">
            {{ t('Email') }}
          </div>
          <div>{{ detailItem.email || '—' }}</div>
        </div>
        <div>
          <div class="field__label">
            {{ t('City') }}
          </div>
          <div>{{ detailItem.city || '—' }}</div>
        </div>
        <div>
          <div class="field__label">
            {{ t('Payment Terms') }}
          </div>
          <div>{{ detailItem.payment_terms_days ? `${detailItem.payment_terms_days} ${t('days')}` : '—' }}</div>
        </div>
        <div>
          <div class="field__label">
            {{ t('Lead Time') }}
          </div>
          <div>{{ detailItem.lead_time_days ? `${detailItem.lead_time_days} ${t('days')}` : '—' }}</div>
        </div>
        <div v-if="canViewSupplierBalances">
          <div class="field__label">
            {{ t('Balance') }}
          </div>
          <div
            class="mono"
            :style="{ color: balanceColorVar[balanceTone(supplierBalance(detailItem))], fontWeight: 600 }"
          >
            {{ supplierBalance(detailItem) !== null ? formatCurrency(Math.abs(supplierBalance(detailItem) ?? 0)) : '—' }}
            <span
              v-if="supplierBalance(detailItem) !== null"
              class="cell-muted"
              style="font-weight: 400; font-size: 12px;"
            >· {{ balanceLabel(supplierBalance(detailItem)) }}</span>
          </div>
        </div>
        <div>
          <div class="field__label">
            {{ t('Rating') }}
          </div>
          <div class="row" style="gap: 4px;">
            <DesignIcon
              name="star"
              :size="14"
              style="color: rgb(var(--v-theme-warning-strong));"
            />
            {{ detailItem.rating ?? '—' }}
          </div>
        </div>
        <div v-if="detailItem.code">
          <div class="field__label">
            {{ t('Code') }}
          </div>
          <div class="mono">
            {{ detailItem.code }}
          </div>
        </div>
        <div v-if="detailItem.credit_limit">
          <div class="field__label">
            {{ t('supplier_field_credit_limit') }}
          </div>
          <div class="mono">
            {{ formatCurrency(detailItem.credit_limit) }}
          </div>
        </div>

        <!-- Purchase summary (from detail stats) -->
        <div
          v-if="detailItem.stats"
          class="detail-grid__full supplier-stats"
          style="grid-column: span 2;"
        >
          <div class="field__label" style="margin-bottom: 8px;">
            {{ t('supplier_purchase_summary') }}
          </div>
          <div class="grid cols-3 supplier-stats__grid" style="gap: var(--sp-3);">
            <div class="supplier-stat">
              <div class="supplier-stat__val">
                {{ detailItem.stats.total_orders ?? 0 }}
              </div>
              <div class="supplier-stat__lbl">
                {{ t('supplier_kpi_total_orders') }}
              </div>
            </div>
            <div class="supplier-stat">
              <div class="supplier-stat__val mono">
                {{ formatCurrency(detailItem.stats.total_value ?? 0) }}
              </div>
              <div class="supplier-stat__lbl">
                {{ t('supplier_kpi_total_value') }}
              </div>
            </div>
            <div class="supplier-stat">
              <div class="supplier-stat__val mono">
                {{ formatCurrency(detailItem.stats.avg_order_value ?? 0) }}
              </div>
              <div class="supplier-stat__lbl">
                {{ t('supplier_kpi_avg_order') }}
              </div>
            </div>
          </div>
        </div>

        <div
          v-if="detailItem.notes"
          class="detail-grid__full"
          style="grid-column: span 2;"
        >
          <div class="field__label">
            {{ t('Notes') }}
          </div>
          <div style="white-space: pre-wrap;">
            {{ detailItem.notes }}
          </div>
        </div>
        <div v-if="detailItem.items?.length" class="detail-grid__full" style="grid-column: span 2;">
          <div class="field__label" style="margin-bottom: 6px;">
            {{ t('Supplied Items') }} ({{ detailItem.item_count }})
          </div>
          <div class="tablewrap">
            <table class="dtable" style="background: var(--surface); border-radius: 10px; border: 1px solid var(--border); overflow: hidden;">
              <thead>
                <tr>
                  <th>{{ t('Item') }}</th>
                  <th class="num">
                    {{ t('Price') }}
                  </th>
                  <th>{{ t('Unit') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="si in (detailItem.items as any[])" :key="si.id">
                  <td>{{ si.stock_item_name }}</td>
                  <td class="num mono">
                    {{ supplierItemHasKnownPrice(si) ? formatCurrency(si.price) : '—' }}
                  </td>
                  <td>{{ si.unit_short }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <template #footer>
        <Button
          v-if="detailItem?.id"
          variant="primary"
          icon="chevright"
          @click="viewProfile(detailItem)"
        >
          {{ t('supplier_view_profile') }}
        </Button>
      </template>
    </Modal>

    <!-- Create / Edit Modal -->
    <Modal
      :open="dialog"
      :width="560"
      :title="dialogMode === 'create' ? t('Add Supplier') : t('Edit Supplier')"
      :close-on-backdrop="false"
      @close="closeSupplierForm"
    >
      <div v-if="editDetailLoading" class="row" style="justify-content: center; padding: 24px 0;">
        <DesignIcon name="refresh" :size="20" />
        <span class="cell-muted" style="margin-left: 8px;">{{ t('Loading') }}</span>
      </div>
      <StateFill
        v-else-if="editDetailError"
        icon="alert"
        :title="t('supplier_failed_load')"
        error
      >
        <div style="margin-top: 12px;">
          <Button variant="secondary" icon="refresh" @click="retryEditDetails">
            {{ t('Retry') }}
          </Button>
        </div>
      </StateFill>
      <div v-else class="grid cols-2 form-grid" style="gap: var(--sp-4);">
        <div class="form-grid__full" style="grid-column: span 2;">
          <Field :label="t('Name')">
            <Input v-model="form.name" />
          </Field>
        </div>

        <Field :label="t('Contact Person')">
          <Input v-model="form.contact_person" />
        </Field>

        <Field :label="t('Phone')">
          <Input v-model="form.phone" />
        </Field>

        <Field :label="t('Email')">
          <Input v-model="form.email" type="email" />
        </Field>

        <Field :label="t('City')">
          <Input v-model="form.city" />
        </Field>

        <div class="form-grid__full" style="grid-column: span 2;">
          <Field :label="t('Address')">
            <Input v-model="form.address" />
          </Field>
        </div>

        <Field :label="t('Rating (1-5)')">
          <Input
            v-model="form.rating"
            type="number"
            min="1"
            max="5"
          />
        </Field>

        <Field :label="t('Payment Terms (days)')">
          <Input
            v-model="form.payment_terms_days"
            type="number"
            min="0"
          />
        </Field>

        <Field :label="t('Lead Time (days)')">
          <Input
            v-model="form.lead_time_days"
            type="number"
            min="0"
          />
        </Field>

        <div class="form-grid__full" style="grid-column: span 2;">
          <Field :label="t('Notes')">
            <Input v-model="form.notes" />
          </Field>
        </div>
      </div>

      <template #footer>
        <Button
          v-if="!editDetailLoading && !editDetailError"
          variant="primary"
          :loading="saving"
          :disabled="!form.name.trim() || saving"
          @click="save"
        >
          {{ t('Save') }}
        </Button>
      </template>
    </Modal>

    <!-- Delete Confirm Modal -->
    <Modal
      :open="deleteDialog"
      :width="440"
      :title="t('Delete Supplier')"
      :subtitle="t('supplier_delete_confirm')"
      @close="deleteDialog = false"
    >
      <div class="row" style="gap: 14px; align-items: flex-start;">
        <div
          class="kpi__icon t-error"
          style="width: 44px; height: 44px; flex: 0 0 44px;"
        >
          <DesignIcon name="alert" :size="22" />
        </div>
        <div>
          <p style="margin: 0; font-weight: 600;">
            {{ selectedItem?.name }}
          </p>
          <p class="muted" style="margin: 6px 0 0; font-size: 14px;">
            {{ t('supplier_delete_warning') }}
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

    <!-- Pay Modal -->
    <Modal
      :open="payDialog"
      :width="520"
      :title="t('Pay supplier')"
      :close-on-backdrop="false"
      @close="closePayDialog"
    >
      <div v-if="paying" class="pay-head">
        <div>
          <strong style="color: var(--text);">{{ paying.name }}</strong>
          <span v-if="canViewSupplierBalances && payOwed" class="cell-muted" style="font-size: 13px;">
            · {{ t('Owed') }}:
            <strong class="mono" style="color: rgb(var(--v-theme-warning-strong));">{{ formatCurrency(payOwed) }}</strong>
          </span>
        </div>
        <Button
          v-if="canViewSupplierBalances && payOwed > 0"
          variant="ghost"
          size="sm"
          @click="payFull"
        >
          {{ t('pay_full') }}
        </Button>
      </div>

      <StateFill
        v-if="payDetailsLoading"
        icon="refresh"
        :title="t('Loading')"
      />
      <StateFill
        v-else-if="payUnavailableReason"
        icon="alert"
        :title="payUnavailableReason"
      />
      <template v-else>
        <div class="grid cols-2 form-grid" style="gap: var(--sp-4);">
          <Field :label="t('Amount')" :error="payAmountError">
            <MoneyInput
              v-model="payForm.amount"
              autofocus
              :error="!!payAmountError"
            />
          </Field>

          <Field :label="t('Source account')">
            <Select
              v-model="payForm.source_account"
              :options="sourceOptions"
            />
          </Field>

          <div class="form-grid__full" style="grid-column: span 2;">
            <Field
              :label="t('Commission / fee (optional)')"
              :hint="isBankPay ? t('pay_commission_hint') : t('pay_commission_bank_note')"
            >
              <MoneyInput
                v-model="payForm.commission"
                :disabled="!isBankPay"
              />
            </Field>
          </div>

          <div class="form-grid__full" style="grid-column: span 2;">
            <Field :label="t('Note')">
              <Input v-model="payForm.note" />
            </Field>
          </div>
        </div>

        <!-- Live payment preview -->
        <div v-if="payAmountNum > 0" class="pay-preview">
          <div class="pay-preview__row">
            <span class="cell-muted">{{ t('pay_total_charge') }}</span>
            <span class="mono" style="font-weight: 600;">{{ formatCurrency(payTotalCharge) }}</span>
          </div>
          <div v-if="payCommissionNum > 0" class="pay-preview__row">
            <span class="cell-muted">{{ t('Fee') }}</span>
            <span class="mono">{{ formatCurrency(payCommissionNum) }}</span>
          </div>
          <div v-if="canViewSupplierBalances && payOwed" class="pay-preview__row">
            <span class="cell-muted">{{ t('pay_remaining_after') }}</span>
            <span
              class="mono"
              :style="{ color: balanceColorVar[balanceTone(Math.max(0, payRemaining))], fontWeight: 600 }"
            >
              {{ formatCurrency(Math.max(0, payRemaining)) }}
            </span>
          </div>
        </div>
      </template>

      <template #footer>
        <Button
          v-if="!payDetailsLoading && !payUnavailableReason"
          variant="primary"
          icon="dollar"
          :loading="paySaving"
          :disabled="!canSubmitSupplierPayment"
          @click="doPay"
        >
          {{ t('Pay') }}
        </Button>
      </template>
    </Modal>

    <!-- Ledger Modal -->
    <Modal
      :open="ledgerDialog"
      :width="860"
      :title="`${ledgerSupplier?.name ?? ''} · ${t('Ledger')}`"
      :subtitle="ledgerBalance !== null ? `${t('Current balance')}: ${formatCurrency(ledgerBalance)}` : undefined"
      @close="closeLedger"
    >
      <div class="row" style="justify-content: flex-end; margin-bottom: var(--sp-3);">
        <Button variant="ghost" size="sm" icon="refresh" :disabled="ledgerLoading" @click="loadLedger">
          {{ t('supplier_action_refresh') }}
        </Button>
      </div>

      <div v-if="ledgerLoading" class="row" style="justify-content: center; padding: 16px 0;">
        <DesignIcon name="refresh" :size="20" />
        <span style="margin-left: 8px;" class="cell-muted">{{ t('Loading') }}</span>
      </div>

      <StateFill
        v-else-if="ledgerLoadError"
        icon="alert"
        :title="t('supplier_failed_load_ledger')"
        error
      >
        <div style="margin-top: 12px;">
          <Button variant="secondary" icon="refresh" @click="loadLedger">
            {{ t('Retry') }}
          </Button>
        </div>
      </StateFill>

      <div v-else-if="ledgerRows.length === 0">
        <StateFill
          icon="receipt"
          :title="t('No ledger entries')"
        />
      </div>

      <div v-else class="tablewrap">
        <table class="dtable" style="background: var(--surface); border-radius: 10px; border: 1px solid var(--border); overflow: hidden;">
          <thead>
            <tr>
              <th>{{ t('Date') }}</th>
              <th>{{ t('Type') }}</th>
              <th class="num">
                {{ t('Amount') }}
              </th>
              <th class="num">
                {{ t('Balance after') }}
              </th>
              <th>{{ t('Source') }}</th>
              <th>{{ t('Reference') }}</th>
              <th>{{ t('Note') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in ledgerRows" :key="r.id">
              <td class="mono nowrap">
                {{ formatDate(r.created_at) }}
              </td>
              <td>
                <Badge :tone="ledgerTypeTone[r.type] ?? 'neutral'">
                  {{ r.type ? t(`supplier_tx_${r.type}`) : '—' }}
                </Badge>
              </td>
              <td
                class="num mono"
                :style="{ color: Number(r.change) >= 0 ? 'rgb(var(--v-theme-warning-strong))' : 'rgb(var(--v-theme-success-strong))', fontWeight: 600 }"
              >
                {{ formatLedgerChange(r) }}
              </td>
              <td class="num mono">
                {{ formatCurrency(r.balance_after ?? 0) }}
              </td>
              <td>
                <span v-if="r.source_account">{{ sourceLabel(r.source_account) }}</span>
                <span v-else class="cell-muted">—</span>
                <span
                  v-if="Number(r.fee) !== 0"
                  class="cell-muted"
                  style="font-size: 11px;"
                >· {{ t('Fee') }} {{ formatCurrency(r.fee) }}</span>
              </td>
              <td>
                <span v-if="r.reference_type" class="cell-muted" style="font-size: 12px;">
                  {{ refLabel(r.reference_type) }}<template v-if="r.reference_id"> #{{ r.reference_id }}</template>
                </span>
                <span v-else class="cell-muted">—</span>
              </td>
              <td class="cell-muted">
                {{ r.note || '—' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div
        v-if="ledgerRows.length > 0 && ledgerTotal > ledgerPerPage"
        style="margin-top: var(--sp-3);"
      >
        <Pagination
          :page="ledgerPage"
          :per-page="ledgerPerPage"
          :pages="ledgerPages"
          :total="ledgerTotal"
          :per-page-options="[20, 50, 100]"
          @page="(p: number) => ledgerPage = p"
          @per-page="onLedgerPerPage"
        />
      </div>

    </Modal>
  </div>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
}

.toolbar--wrap {
  flex-wrap: wrap;
  gap: 8px;
}

.toolbar__search {
  max-inline-size: 320px;
  min-inline-size: 180px;
  flex: 1 1 200px;
}

.toolbar__status {
  inline-size: 180px;
}

.tablewrap {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.field__label {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-bottom: 2px;
}

/* Pay modal: header row + live preview */
.pay-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: var(--sp-3);
}

.pay-preview {
  margin-top: var(--sp-4);
  padding: var(--sp-3) var(--sp-4);
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-2, rgba(var(--v-theme-on-surface), 0.03));
  display: grid;
  gap: 6px;
}

.pay-preview__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
}

/* Detail modal: purchase summary tiles */
.supplier-stats__grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
}

.supplier-stat {
  padding: var(--sp-3);
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-2, rgba(var(--v-theme-on-surface), 0.03));
}

.supplier-stat__val {
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
}

.supplier-stat__lbl {
  font-size: 11px;
  color: var(--text-tertiary);
  margin-top: 2px;
}

@media (max-width: 768px) {
  .toolbar__search,
  .toolbar__status {
    inline-size: 100%;
    max-inline-size: none;
    min-inline-size: 0;
    flex: 1 1 100%;
  }
  .form-grid,
  .detail-grid {
    grid-template-columns: 1fr;
  }
  .form-grid__full,
  .detail-grid__full {
    grid-column: span 1 !important;
  }
  .supplier-stats__grid {
    grid-template-columns: 1fr;
  }
}
</style>

<route lang="yaml">
name: stock-suppliers
meta:
  action: manage
  subject: all
  anyPermission:
    - stock.supplier.view
</route>
