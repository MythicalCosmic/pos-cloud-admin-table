<script setup lang="ts">
import axios from '@/plugins/axios'
import Badge from '@/components/design/Badge.vue'
import Button from '@/components/design/Button.vue'
import DataTable, { type DataTableColumn } from '@/components/design/DataTable.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import Field from '@/components/design/Field.vue'
import Input from '@/components/design/Input.vue'
import MoneyInput from '@/components/design/MoneyInput.vue'
import Modal from '@/components/design/Modal.vue'
import PageHeader from '@/components/design/PageHeader.vue'
import Select from '@/components/design/Select.vue'
import Skeleton from '@/components/design/Skeleton.vue'
import StateFill from '@/components/design/StateFill.vue'
import { useUserAccess } from '@/composables/useUserAccess'
import { listAllExpenseCategories } from '@/services/expenseControlApi'
import type { ExpenseCategory } from '@/types/expenseControl'

const { t, te } = useI18n({ useScope: 'global' })
const { snackbar, snackbarMsg, snackbarColor, notify } = useNotify()
const { formatCurrency, formatDate } = useFormatters()
const route = useRoute()
const { hasPermission } = useUserAccess()

const canTransfer = computed(() => hasPermission('treasury.transfer'))
const canDirectExpense = computed(() => hasPermission('expense.direct.pay'))

const TXN_TYPES = [
  'INKASSA',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'FEE',
  'EXPENSE',
  'EXPENSE_REVERSAL',
  'ADJUSTMENT',
  'SUPPLIER_PAYMENT',
  'SUPPLIER_PAYMENT_REVERSAL',
  'SALARY_PAYMENT',
  'SHIFT_DEPOSIT',
  'SHIFT_RECLASS_OUT',
  'SHIFT_RECLASS_IN',
]

function txnTypeLabel(type: string): string {
  const key = `treasury_txn_${type}`

  return te(key) ? t(key) : type.replaceAll('_', ' ')
}

const txnTypeItems = computed(() => TXN_TYPES.map(value => ({
  value,
  label: txnTypeLabel(value),
})))

const accountOptions = computed(() => [
  { value: 'SAFE', label: t('treasury_account_SAFE') },
  { value: 'BANK', label: t('treasury_account_BANK') },
])

const txnTypeTone: Record<string, 'success' | 'info' | 'warning' | 'neutral' | 'error' | 'primary'> = {
  INKASSA: 'success',
  TRANSFER_IN: 'info',
  TRANSFER_OUT: 'warning',
  FEE: 'neutral',
  EXPENSE: 'error',
  EXPENSE_REVERSAL: 'success',
  ADJUSTMENT: 'neutral',
  SUPPLIER_PAYMENT: 'warning',
  SUPPLIER_PAYMENT_REVERSAL: 'success',
  SALARY_PAYMENT: 'warning',
  SHIFT_DEPOSIT: 'success',
  SHIFT_RECLASS_OUT: 'warning',
  SHIFT_RECLASS_IN: 'info',
}

// -------- accounts --------
const accounts = ref<Record<string, any>>({})
const accountsLoading = ref(false)
const accountsError = ref('')

async function loadAccounts() {
  accountsLoading.value = true
  accountsError.value = ''
  try {
    const res = await axios.get('/treasury/accounts')
    const d = res.data?.data ?? res.data

    accounts.value = d?.accounts ?? {}
  }
  catch (e: any) {
    accounts.value = {}
    accountsError.value = e?.response?.data?.message ?? t('Failed to load accounts')
    notify(accountsError.value, 'error')
  }
  finally {
    accountsLoading.value = false
  }
}

// Combined money on hand across both accounts — the single figure an operator
// checks first ("how much cash does the business currently control?").
const accountsReady = computed(() => !!(accounts.value?.SAFE || accounts.value?.BANK))

const totalBalance = computed(() =>
  Number(accounts.value?.SAFE?.balance ?? 0) + Number(accounts.value?.BANK?.balance ?? 0),
)

// -------- history --------
const txns = ref<any[]>([])
const total = ref(0)
const loading = ref(false)
const historyError = ref('')

interface TreasuryHistoryTotals {
  totalInflowUzs: number | null
  totalOutflowUzs: number | null
  totalFeeUzs: number | null
  rowCount: number | null
}

const historyTotals = ref<TreasuryHistoryTotals | null>(null)
let historyRequestId = 0

function queryValue(value: unknown): string {
  return String(Array.isArray(value) ? value[0] ?? '' : value ?? '').trim()
}

function positiveQueryInteger(value: unknown, fallback: number, allowed?: number[]): number {
  const parsed = Number(queryValue(value))
  if (!Number.isInteger(parsed) || parsed <= 0 || (allowed && !allowed.includes(parsed)))
    return fallback

  return parsed
}

function routeDate(value: unknown): string {
  const parsed = queryValue(value)

  return /^\d{4}-\d{2}-\d{2}$/.test(parsed) ? parsed : ''
}

const requestedAccount = queryValue(route.query.account).toUpperCase()
const requestedType = queryValue(route.query.type).toUpperCase()

const page = ref(positiveQueryInteger(route.query.page, 1))
const itemsPerPage = ref(positiveQueryInteger(route.query.per_page, 20, [10, 20, 50, 100]))

const accountFilter = ref<string | undefined>(
  accountOptions.value.some(option => option.value === requestedAccount) ? requestedAccount : undefined,
)

const typeFilter = ref<string | undefined>(TXN_TYPES.includes(requestedType) ? requestedType : undefined)

const dateFrom = ref(routeDate(route.query.date_from))
const dateTo = ref(routeDate(route.query.date_to))
const search = ref(queryValue(route.query.search))

const hasServerFilters = computed(() => !!(
  search.value.trim()
  || dateFrom.value
  || dateTo.value
  || accountFilter.value
  || typeFilter.value
))

function clearServerFilters() {
  search.value = ''
  dateFrom.value = ''
  dateTo.value = ''
  accountFilter.value = undefined
  typeFilter.value = undefined
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '')
    return null

  const parsed = Number(value)

  return Number.isFinite(parsed) ? parsed : null
}

function normalizeHistoryTotals(value: unknown): TreasuryHistoryTotals | null {
  if (!value || typeof value !== 'object')
    return null

  const totals = value as Record<string, unknown>

  return {
    totalInflowUzs: finiteNumber(totals.total_inflow_uzs),
    totalOutflowUzs: finiteNumber(totals.total_outflow_uzs),
    totalFeeUzs: finiteNumber(totals.total_fee_uzs),
    rowCount: finiteNumber(totals.row_count),
  }
}

function historyParams() {
  const params: Record<string, string | number> = {
    page: page.value,
    per_page: itemsPerPage.value,
  }

  if (accountFilter.value)
    params.account = accountFilter.value
  if (typeFilter.value)
    params.type = typeFilter.value
  if (dateFrom.value)
    params.date_from = dateFrom.value
  if (dateTo.value)
    params.date_to = dateTo.value
  if (search.value.trim())
    params.search = search.value.trim()

  return params
}

const columns = computed<DataTableColumn<any>[]>(() => [
  { key: 'created_at', label: t('Date'), width: 160 },
  { key: 'account', label: t('Account'), width: 100 },
  { key: 'type', label: t('Type'), width: 150 },
  { key: 'delta', label: t('Amount'), align: 'right' },
  { key: 'balance_after', label: t('Balance after'), align: 'right' },
  { key: 'category', label: t('Category') },
  { key: 'description', label: t('Description') },
  { key: 'performed_by', label: t('By') },
])

async function loadHistory() {
  const requestId = ++historyRequestId

  loading.value = true
  historyError.value = ''
  try {
    const res = await axios.get('/treasury/history', { params: historyParams() })
    const d = res.data?.data ?? res.data

    if (requestId !== historyRequestId)
      return

    txns.value = d?.transactions ?? []
    historyTotals.value = normalizeHistoryTotals(d?.totals)

    const paginationTotal = finiteNumber(d?.pagination?.total)

    total.value = paginationTotal
      ?? historyTotals.value?.rowCount
      ?? txns.value.length
  }
  catch (e: any) {
    if (requestId !== historyRequestId)
      return

    txns.value = []
    total.value = 0
    historyTotals.value = null
    historyError.value = e?.response?.data?.message ?? t('Failed to load history')
    notify(historyError.value, 'error')
  }
  finally {
    if (requestId === historyRequestId)
      loading.value = false
  }
}

function resetHistoryPageAndLoad() {
  if (page.value !== 1)
    page.value = 1
  else
    loadHistory()
}

const loadFilteredHistory = useDebounceFn(resetHistoryPageAndLoad, 300)

onMounted(() => { loadAccounts(); loadHistory() })
watch([page, itemsPerPage], () => loadHistory())
watch([accountFilter, typeFilter, dateFrom, dateTo, search], () => loadFilteredHistory())

const dtPagination = computed(() => ({
  page: page.value,
  perPage: itemsPerPage.value,
  total: total.value,
  onPage: (p: number) => { page.value = p },
  onPerPage: (n: number) => { itemsPerPage.value = n; page.value = 1 },
}))

// -------- transfer dialog --------
const transferDialog = ref(false)
const transferSaving = ref(false)
const transferForm = ref({ from: 'BANK', to: 'SAFE', amount: 0, fee: 0, description: '' })

function openTransfer() {
  if (!canTransfer.value) {
    notify(t('err_no_permission'), 'error')

    return
  }
  transferForm.value = { from: 'BANK', to: 'SAFE', amount: 0, fee: 0, description: '' }
  transferDialog.value = true
}

function swapTransferAccounts() {
  const { from, to } = transferForm.value

  transferForm.value.from = to
  transferForm.value.to = from
}

const transferCredited = computed(() =>
  Math.max(0, Number(transferForm.value.amount || 0) - Number(transferForm.value.fee || 0)),
)

const transferSourceBalance = computed(() => {
  const src = accounts.value?.[transferForm.value.from]

  return Number(src?.balance ?? 0)
})

const transferInsufficient = computed(() => {
  const amt = Number(transferForm.value.amount || 0)

  return amt > 0 && amt > transferSourceBalance.value
})

async function doTransfer() {
  if (!canTransfer.value) {
    transferDialog.value = false
    notify(t('err_no_permission'), 'error')

    return
  }
  if (transferForm.value.from === transferForm.value.to) {
    notify(t('From and To must differ'), 'error')

    return
  }
  if (!transferForm.value.amount || transferForm.value.amount <= 0) {
    notify(t('Amount must be greater than 0'), 'error')

    return
  }
  if (transferInsufficient.value) {
    notify(t('Insufficient balance: available {bal}', { bal: formatCurrency(transferSourceBalance.value) }), 'error')

    return
  }
  transferSaving.value = true
  try {
    await axios.post('/treasury/transfer', transferForm.value)
    notify(t('Transfer completed'))
    transferDialog.value = false
    await Promise.all([loadAccounts(), loadHistory()])
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
  finally {
    transferSaving.value = false
  }
}

// -------- expense dialog --------
const expenseDialog = ref(false)
const expenseSaving = ref(false)

const expenseForm = ref({
  account: 'SAFE',
  amount: 0,
  feePercent: '',
  categoryId: '',
  description: '',
  receiptNumber: '',
})

const expenseValidationAttempted = ref(false)

const expenseCategories = ref<ExpenseCategory[]>([])
const expenseCategoriesLoading = ref(false)
const expenseCategoriesError = ref('')
let expenseCategoriesRequestId = 0

const availableExpenseCategories = computed(() => expenseCategories.value.filter(category => {
  if (category.is_active === false)
    return false

  if (!Array.isArray(category.allowed_sources))
    return true

  return category.allowed_sources
    .map(source => String(source).toUpperCase())
    .includes(expenseForm.value.account)
}))

const expenseCategoryOptions = computed(() => availableExpenseCategories.value.map(category => ({
  value: String(category.id),
  label: category.name,
})))

const selectedExpenseCategory = computed(() => availableExpenseCategories.value.find(category =>
  String(category.id) === expenseForm.value.categoryId,
))

const isBankExpense = computed(() => expenseForm.value.account === 'BANK')

const expenseDescriptionError = computed(() => {
  if (!expenseValidationAttempted.value
    || !selectedExpenseCategory.value?.requires_description
    || expenseForm.value.description.trim())
    return ''

  return t('expense_description_required')
})

const expenseReceiptError = computed(() => {
  if (!expenseValidationAttempted.value
    || !selectedExpenseCategory.value?.requires_receipt
    || expenseForm.value.receiptNumber.trim())
    return ''

  return t('expense_receipt_required')
})

async function loadExpenseCategories() {
  const requestId = ++expenseCategoriesRequestId

  expenseCategoriesLoading.value = true
  expenseCategoriesError.value = ''
  try {
    const result = await listAllExpenseCategories()

    if (requestId !== expenseCategoriesRequestId)
      return

    expenseCategories.value = result
      .filter((category: ExpenseCategory) => category.is_active !== false)
      .slice()
      .sort((a: ExpenseCategory, b: ExpenseCategory) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))
  }
  catch (error: any) {
    if (requestId === expenseCategoriesRequestId) {
      expenseCategories.value = []
      expenseCategoriesError.value = error?.response?.data?.message ?? t('Failed to load expense categories')
    }
  }
  finally {
    if (requestId === expenseCategoriesRequestId)
      expenseCategoriesLoading.value = false
  }
}

function openExpense() {
  if (!canDirectExpense.value) {
    notify(t('err_no_permission'), 'error')

    return
  }
  expenseForm.value = {
    account: 'SAFE',
    amount: 0,
    feePercent: '',
    categoryId: '',
    description: '',
    receiptNumber: '',
  }
  expenseValidationAttempted.value = false
  expenseDialog.value = true
  loadExpenseCategories()
}

watch(() => expenseForm.value.account, account => {
  if (account !== 'BANK')
    expenseForm.value.feePercent = ''

  if (!selectedExpenseCategory.value)
    expenseForm.value.categoryId = ''
})

const normalizedExpenseFeePercent = computed(() => expenseForm.value.feePercent.trim().replace(',', '.'))

const expenseFeePercentInvalid = computed(() => {
  if (!isBankExpense.value || !normalizedExpenseFeePercent.value)
    return false

  return !/^(?:100(?:\.0{1,4})?|\d{1,2}(?:\.\d{1,4})?)$/.test(normalizedExpenseFeePercent.value)
})

const expenseFeeUzs = computed(() => {
  if (!isBankExpense.value || expenseFeePercentInvalid.value || !normalizedExpenseFeePercent.value)
    return 0

  return Math.round(Number(expenseForm.value.amount || 0) * Number(normalizedExpenseFeePercent.value) / 100)
})

// The backend debits amount + its calculated bank fee from the chosen account,
// so preview the true outflow before submitting the percentage contract.
const expenseAccountBalance = computed(() =>
  Number(accounts.value?.[expenseForm.value.account]?.balance ?? 0),
)

const expenseTotalOut = computed(() =>
  Math.max(0, Number(expenseForm.value.amount || 0) + expenseFeeUzs.value),
)

const expenseInsufficient = computed(() =>
  expenseTotalOut.value > 0 && expenseTotalOut.value > expenseAccountBalance.value,
)

const expenseRemaining = computed(() =>
  expenseAccountBalance.value - expenseTotalOut.value,
)

async function doExpense() {
  if (!canDirectExpense.value) {
    expenseDialog.value = false
    notify(t('err_no_permission'), 'error')

    return
  }
  expenseValidationAttempted.value = true
  if (!expenseForm.value.amount || expenseForm.value.amount <= 0) {
    notify(t('Amount must be greater than 0'), 'error')

    return
  }
  if (!selectedExpenseCategory.value) {
    notify(t('Expense category is required'), 'error')

    return
  }
  if (expenseFeePercentInvalid.value) {
    notify(t('expense_fee_percent_invalid'), 'error')

    return
  }
  if (expenseDescriptionError.value || expenseReceiptError.value)
    return
  if (expenseInsufficient.value) {
    notify(t('Insufficient balance: available {bal}', { bal: formatCurrency(expenseAccountBalance.value) }), 'error')

    return
  }
  expenseSaving.value = true
  try {
    const bankFeePayload: { fee_uzs?: null; fee_percent?: string } = {}

    if (isBankExpense.value && normalizedExpenseFeePercent.value) {
      // Compatibility for the current Treasury adapter, which otherwise
      // supplies a legacy zero fee alongside fee_percent.
      bankFeePayload.fee_uzs = null
      bankFeePayload.fee_percent = normalizedExpenseFeePercent.value
    }

    await axios.post('/treasury/expense', {
      source_account: expenseForm.value.account,
      amount_uzs: Number(expenseForm.value.amount),
      ...bankFeePayload,
      category_id: selectedExpenseCategory.value.id,
      category: selectedExpenseCategory.value.name,
      description: expenseForm.value.description,
      receipt_number: expenseForm.value.receiptNumber.trim(),
    })
    notify(t('Expense recorded'))
    expenseDialog.value = false
    await Promise.all([loadAccounts(), loadHistory()])
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
  finally {
    expenseSaving.value = false
  }
}

// -------- delta display --------
function deltaDisplay(t_: any) {
  const v = Number(t_.delta ?? 0)
  const sign = v >= 0 ? '+' : '−'
  const colorClass = v >= 0 ? 'text-success-strong' : 'text-error-strong'

  return { text: `${sign}${formatCurrency(Math.abs(v))}`, colorClass }
}
</script>

<template>
  <div class="page">
    <PageHeader
      :title="t('Treasury')"
      :subtitle="t('Ledger')"
    />

    <!-- Account cards -->
    <StateFill
      v-if="accountsError && !accountsLoading"
      class="card treasury-account-error"
      icon="alert"
      :title="t('Failed to load accounts')"
      :sub="accountsError"
      error
    >
      <template #action>
        <Button variant="secondary" icon="refresh" @click="loadAccounts">
          {{ t('Retry') }}
        </Button>
      </template>
    </StateFill>

    <div v-else class="grid cols-3 treasury-kpis">
      <div class="kpi-card">
        <div class="kpi-card__top">
          <div class="kpi-card__icon t-success">
            <DesignIcon name="lock" :size="20" />
          </div>
          <div class="kpi-card__label">{{ t('Safe (cash)') }}</div>
        </div>
        <div v-if="accounts.SAFE" class="kpi-card__value num-tabular">
          {{ formatCurrency(accounts.SAFE.balance ?? 0) }}<span class="kpi-card__unit">{{ t('currency_short') }}</span>
        </div>
        <Skeleton v-else :h="28" w="140px" :r="4" style="margin: 4px 0;" />
        <div v-if="accounts.SAFE?.last_updated" class="kpi-card__sub">
          {{ t('Updated') }}: {{ formatDate(accounts.SAFE.last_updated) }}
        </div>
      </div>

      <div class="kpi-card">
        <div class="kpi-card__top">
          <div class="kpi-card__icon t-primary">
            <DesignIcon name="wallet" :size="20" />
          </div>
          <div class="kpi-card__label">{{ t('Bank (cards)') }}</div>
        </div>
        <div v-if="accounts.BANK" class="kpi-card__value num-tabular">
          {{ formatCurrency(accounts.BANK.balance ?? 0) }}<span class="kpi-card__unit">{{ t('currency_short') }}</span>
        </div>
        <Skeleton v-else :h="28" w="140px" :r="4" style="margin: 4px 0;" />
        <div v-if="accounts.BANK?.last_updated" class="kpi-card__sub">
          {{ t('Updated') }}: {{ formatDate(accounts.BANK.last_updated) }}
        </div>
      </div>

      <div class="kpi-card treasury-total">
        <div class="kpi-card__top">
          <div class="kpi-card__icon t-info">
            <DesignIcon name="wallet" :size="20" />
          </div>
          <div class="kpi-card__label">{{ t('Total treasury') }}</div>
        </div>
        <div v-if="accountsReady" class="kpi-card__value num-tabular">
          {{ formatCurrency(totalBalance) }}<span class="kpi-card__unit">{{ t('currency_short') }}</span>
        </div>
        <Skeleton v-else :h="28" w="140px" :r="4" style="margin: 4px 0;" />
        <div class="kpi-card__sub">
          {{ t('Safe + Bank combined') }}
        </div>
      </div>
    </div>

    <!-- History card -->
    <div class="card">
      <div class="toolbar treasury-toolbar">
        <div class="treasury-search">
          <Input
            v-model="search"
            icon="search"
            :placeholder="t('Search description or category')"
          />
        </div>
        <div class="treasury-date">
          <Input
            v-model="dateFrom"
            type="date"
            :placeholder="t('Date from')"
            :aria-label="t('Date from')"
          />
        </div>
        <div class="treasury-date">
          <Input
            v-model="dateTo"
            type="date"
            :placeholder="t('Date to')"
            :aria-label="t('Date to')"
          />
        </div>

        <div class="treasury-select">
          <Select
            :model-value="accountFilter ?? ''"
            :placeholder="t('All accounts')"
            :options="accountOptions"
            @update:model-value="(v: string) => accountFilter = v ? v : undefined"
          />
        </div>
        <div class="treasury-select">
          <Select
            :model-value="typeFilter ?? ''"
            :placeholder="t('All types')"
            :options="txnTypeItems"
            @update:model-value="(v: string) => typeFilter = v ? v : undefined"
          />
        </div>

        <div class="treasury-actions">
          <Button
            v-if="hasServerFilters"
            variant="ghost"
            icon="close"
            @click="clearServerFilters"
          >
            {{ t('Clear filters') }}
          </Button>
          <Button
            v-if="canTransfer"
            variant="secondary"
            icon="refresh"
            @click="openTransfer"
          >
            {{ t('Transfer') }}
          </Button>
          <Button
            v-if="canDirectExpense"
            variant="danger"
            icon="dollar"
            @click="openExpense"
          >
            {{ t('Record Expense') }}
          </Button>
        </div>
      </div>

      <div
        v-if="historyTotals && !loading"
        class="treasury-history-totals"
        aria-live="polite"
      >
        <div class="treasury-history-total">
          <span class="cell-muted">{{ t('Total Deposits') }}</span>
          <strong class="num-tabular">
            {{ historyTotals.totalInflowUzs == null ? t('em_dash') : formatCurrency(historyTotals.totalInflowUzs) }}
          </strong>
        </div>
        <div class="treasury-history-total">
          <span class="cell-muted">{{ t('Total Withdrawals') }}</span>
          <strong class="num-tabular">
            {{ historyTotals.totalOutflowUzs == null ? t('em_dash') : formatCurrency(historyTotals.totalOutflowUzs) }}
          </strong>
        </div>
        <div class="treasury-history-total">
          <span class="cell-muted">{{ t('Fee') }}</span>
          <strong class="num-tabular">
            {{ historyTotals.totalFeeUzs == null ? t('em_dash') : formatCurrency(historyTotals.totalFeeUzs) }}
          </strong>
        </div>
        <div class="treasury-history-total">
          <span class="cell-muted">{{ t('Transactions') }}</span>
          <strong class="num-tabular">
            {{ historyTotals.rowCount == null ? t('em_dash') : historyTotals.rowCount }}
          </strong>
        </div>
      </div>

      <div class="card__divider" />

      <StateFill
        v-if="historyError && !loading"
        icon="alert"
        :title="t('Failed to load history')"
        :sub="historyError"
        error
      >
        <template #action>
          <Button variant="secondary" icon="refresh" @click="loadHistory">
            {{ t('Retry') }}
          </Button>
        </template>
      </StateFill>

      <DataTable
        v-else
        :columns="columns"
        :rows="txns"
        row-key="id"
        :loading="loading"
        :pagination="dtPagination"
        :per-page-options="[10, 20, 50, 100]"
        :empty-title="t('No transactions')"
        :empty-sub="t('No treasury activity yet for the current filters')"
        empty-icon="inbox"
      >
        <template #cell.created_at="{ row }">
          <span class="mono nowrap">{{ formatDate(row.created_at) }}</span>
        </template>

        <template #cell.account="{ row }">
          <Badge :tone="row.account === 'SAFE' ? 'success' : 'primary'">
            {{ t(`treasury_account_${row.account}`) }}
          </Badge>
        </template>

        <template #cell.type="{ row }">
          <Badge :tone="txnTypeTone[row.type] ?? 'neutral'">
            {{ txnTypeLabel(row.type) }}
          </Badge>
        </template>

        <template #cell.delta="{ row }">
          <div>
            <span
              class="num-tabular cell-strong"
              :class="deltaDisplay(row).colorClass"
            >{{ deltaDisplay(row).text }}</span>
            <div
              v-if="Number(row.fee ?? 0) > 0"
              class="cell-muted num-tabular"
              style="font-size: var(--fs-label);"
            >
              {{ t('Fee') }}: {{ formatCurrency(row.fee) }}
            </div>
          </div>
        </template>

        <template #cell.balance_after="{ row }">
          <div>
            <span class="num-tabular">{{ formatCurrency(row.balance_after) }}</span>
            <div
              v-if="row.balance_before != null"
              class="cell-muted num-tabular"
              style="font-size: var(--fs-label);"
            >
              {{ t('Before') }}: {{ formatCurrency(row.balance_before) }}
            </div>
          </div>
        </template>

        <template #cell.category="{ row }">
          <span :class="row.category ? '' : 'cell-muted'">{{ row.category || t('em_dash') }}</span>
        </template>

        <template #cell.description="{ row }">
          <div>
            <span :class="row.description ? '' : 'cell-muted'">{{ row.description || t('em_dash') }}</span>
            <div
              v-if="row.counterparty"
              class="cell-muted"
              style="font-size: var(--fs-label);"
            >
              <DesignIcon name="refresh" :size="12" />
              {{ t(`treasury_account_${row.counterparty}`) }}
            </div>
          </div>
        </template>

        <template #cell.performed_by="{ row }">
          <span :class="row.performed_by ? '' : 'cell-muted'">{{ row.performed_by || t('em_dash') }}</span>
        </template>
      </DataTable>
    </div>

    <!-- Transfer modal -->
    <Modal
      :open="transferDialog && canTransfer"
      width="min(560px, 100%)"
      :title="t('Transfer between accounts')"
      :subtitle="t('Move funds between Safe and Bank')"
      @close="transferDialog = false"
    >
      <div class="grid cols-2 treasury-form-grid">
        <Field :label="t('From')">
          <Select
            v-model="transferForm.from"
            :options="accountOptions"
          />
        </Field>
        <Field :label="t('To')">
          <Select
            v-model="transferForm.to"
            :options="accountOptions"
          />
        </Field>
        <div class="treasury-swap-row">
          <button
            type="button"
            class="treasury-swap-btn"
            @click="swapTransferAccounts"
          >
            <DesignIcon name="sort" :size="14" />
            {{ t('Swap direction') }}
          </button>
        </div>
        <Field
          :label="t('Amount')"
          :error="transferInsufficient ? t('Insufficient balance: available {bal}', { bal: formatCurrency(transferSourceBalance) }) : ''"
        >
          <MoneyInput
            v-model="transferForm.amount"
            :error="transferInsufficient"
            autofocus
          />
        </Field>
        <Field
          :label="t('Fee')"
          :hint="t('Bank fee hint')"
        >
          <MoneyInput v-model="transferForm.fee" />
        </Field>
        <div style="grid-column: span 2;">
          <Field :label="t('Description')">
            <Input v-model="transferForm.description" />
          </Field>
        </div>
        <div style="grid-column: span 2; display: flex; justify-content: space-between; align-items: center; padding: 0 4px;">
          <span class="cell-muted">{{ t('Destination will receive') }}</span>
          <span class="num-tabular cell-strong">{{ formatCurrency(transferCredited) }}</span>
        </div>
      </div>

      <template #footer>
        <Button
          variant="primary"
          icon="exchange"
          :loading="transferSaving"
          :disabled="transferSaving || transferInsufficient || transferForm.from === transferForm.to"
          @click="doTransfer"
        >
          {{ t('Transfer') }}
        </Button>
      </template>
    </Modal>

    <!-- Expense modal -->
    <Modal
      :open="expenseDialog && canDirectExpense"
      width="min(520px, 100%)"
      :title="t('Record Treasury Expense')"
      :subtitle="t('Record an outgoing payment from Safe or Bank')"
      @close="expenseDialog = false"
    >
      <div class="grid cols-2 treasury-form-grid">
        <Field :label="t('Account')">
          <Select
            v-model="expenseForm.account"
            :options="accountOptions"
          />
        </Field>
        <Field
          :label="t('Amount')"
          :error="expenseInsufficient ? t('Insufficient balance: available {bal}', { bal: formatCurrency(expenseAccountBalance) }) : ''"
        >
          <MoneyInput
            v-model="expenseForm.amount"
            :error="expenseInsufficient"
            autofocus
          />
        </Field>
        <div
          v-if="isBankExpense"
          style="grid-column: span 2;"
        >
          <Field
            :label="t('expense_fee_percent_label')"
            :hint="t('expense_fee_percent_hint')"
            :error="expenseFeePercentInvalid ? t('expense_fee_percent_invalid') : ''"
          >
            <Input
              v-model="expenseForm.feePercent"
              type="number"
              min="0"
              max="100"
              step="0.0001"
              placeholder="0"
              :error="expenseFeePercentInvalid"
            />
          </Field>
        </div>
        <div style="grid-column: span 2;">
          <Field
            :label="t('Category')"
            :error="expenseCategoriesError || (!expenseCategoriesLoading && !expenseCategoryOptions.length ? t('No expense categories available') : '')"
          >
            <Select
              v-model="expenseForm.categoryId"
              :options="expenseCategoryOptions"
              :placeholder="expenseCategoriesLoading ? t('Loading') : t('Select category')"
              :disabled="expenseCategoriesLoading || !expenseCategoryOptions.length"
            />
          </Field>
        </div>
        <div style="grid-column: span 2;">
          <Field
            :label="t('Description')"
            :error="expenseDescriptionError"
          >
            <Input v-model="expenseForm.description" />
          </Field>
        </div>
        <div
          v-if="selectedExpenseCategory?.requires_receipt"
          style="grid-column: span 2;"
        >
          <Field
            :label="t('Receipt #')"
            :error="expenseReceiptError"
          >
            <Input
              v-model="expenseForm.receiptNumber"
              :placeholder="t('expense_receipt_placeholder')"
            />
          </Field>
        </div>
        <div
          v-if="expenseTotalOut > 0"
          class="treasury-expense-preview"
        >
          <div
            v-if="isBankExpense && expenseFeeUzs > 0"
            class="treasury-preview-row"
          >
            <span class="cell-muted">{{ t('expense_calculated_fee') }}</span>
            <span class="num-tabular cell-strong">{{ formatCurrency(expenseFeeUzs) }}</span>
          </div>
          <div class="treasury-preview-row">
            <span class="cell-muted">{{ t('Total debited') }}</span>
            <span class="num-tabular cell-strong">{{ formatCurrency(expenseTotalOut) }}</span>
          </div>
          <div class="treasury-preview-row">
            <span class="cell-muted">{{ t('Balance after this expense') }}</span>
            <span
              class="num-tabular cell-strong"
              :class="expenseInsufficient ? 'text-error-strong' : ''"
            >{{ formatCurrency(expenseRemaining) }}</span>
          </div>
        </div>
      </div>

      <template #footer>
        <Button
          variant="danger"
          icon="minus"
          :loading="expenseSaving"
          :disabled="expenseSaving || expenseInsufficient || expenseFeePercentInvalid || !selectedExpenseCategory"
          @click="doExpense"
        >
          {{ t('Record Expense') }}
        </Button>
      </template>
    </Modal>

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
.treasury-kpis {
  margin-bottom: var(--sp-5);
}

.treasury-account-error {
  margin-bottom: var(--sp-5);
}

.treasury-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-3);
}

.treasury-search {
  flex: 1 1 240px;
  min-width: 220px;
  max-width: 320px;
}

.treasury-date {
  flex: 0 1 170px;
  min-width: 160px;
}

.treasury-select {
  flex: 0 1 180px;
  min-width: 160px;
}

.treasury-actions {
  display: flex;
  gap: var(--sp-2);
  margin-left: auto;
  flex-wrap: wrap;
}

.treasury-ref-link {
  color: rgb(var(--v-theme-primary));
  text-decoration: none;
}
.treasury-ref-link:hover { text-decoration: underline; }

.text-success-strong { color: rgb(var(--v-theme-success-strong)); }
.text-error-strong { color: rgb(var(--v-theme-error-strong)); }

.treasury-total .kpi-card__value { color: rgb(var(--v-theme-info-strong, var(--v-theme-primary))); }

.treasury-history-totals {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--sp-3);
  padding: 0 var(--sp-4) var(--sp-4);
}

.treasury-history-total {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  min-width: 0;
  padding: var(--sp-3);
  background: rgb(var(--v-theme-surface-inset));
  border: 1px solid rgb(var(--v-theme-border));
  border-radius: var(--r-md);
}

.treasury-history-total > span {
  overflow: hidden;
  font-size: var(--fs-label);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.treasury-history-total > strong {
  overflow: hidden;
  font-size: var(--fs-body);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.treasury-form-grid {
  gap: var(--sp-4);
}

.treasury-swap-row {
  grid-column: span 2;
  display: flex;
  justify-content: center;
  margin-top: calc(-1 * var(--sp-2));
}

.treasury-swap-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  font-size: var(--fs-label);
  color: rgb(var(--v-theme-primary));
  background: transparent;
  border: 1px solid rgba(var(--v-theme-primary), 0.35);
  border-radius: 999px;
  cursor: pointer;
  transition: background 0.15s ease;
}
.treasury-swap-btn:hover { background: rgba(var(--v-theme-primary), 0.08); }

.treasury-expense-preview {
  grid-column: span 2;
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding: var(--sp-3);
  background: rgba(var(--v-theme-on-surface), 0.03);
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  border-radius: 8px;
}

.treasury-preview-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

@media (max-width: 768px) {
  .treasury-history-totals { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .treasury-search,
  .treasury-date,
  .treasury-select { flex: 1 1 100%; min-width: 0; max-width: none; }
  .treasury-actions { margin-left: 0; width: 100%; }
  .treasury-actions > * { flex: 1 1 auto; }
  .treasury-form-grid { grid-template-columns: 1fr; }
  .treasury-form-grid > div[style*="span 2"] { grid-column: span 1 !important; }
  .treasury-swap-row,
  .treasury-expense-preview { grid-column: span 1; }
}

@media (max-width: 480px) {
  .treasury-kpis { grid-template-columns: 1fr; }
}
</style>

<route lang="yaml">
meta:
  action: manage
  subject: all
</route>
