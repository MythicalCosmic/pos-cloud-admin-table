<script setup lang="ts">
import Textarea from '@/components/design/Textarea.vue'
/* ============================================================
   HR CASH — register deposits, withdrawals, salary/expense payouts
   Plain HTML + design primitives (PageHeader / Card / DataTable /
   Modal / Field / Input / Select / Badge / IconAction / Kpi /
   StateFill / DesignIcon). No Vuetify on this surface.
   ============================================================ */
import type { DataTableColumn } from '@/components/design/DataTable.vue'
import { hrApi as axios } from '@/plugins/axios'
import Badge from '@/components/design/Badge.vue'
import Button from '@/components/design/Button.vue'
import Card from '@/components/design/Card.vue'
import DataTable from '@/components/design/DataTable.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import Field from '@/components/design/Field.vue'
import IconAction from '@/components/design/IconAction.vue'
import Input from '@/components/design/Input.vue'
import Kpi from '@/components/design/Kpi.vue'
import MoneyInput from '@/components/design/MoneyInput.vue'
import Modal from '@/components/design/Modal.vue'
import PageHeader from '@/components/design/PageHeader.vue'
import Select from '@/components/design/Select.vue'
import { fmtNum } from '@/components/design/utils/format'

const { t } = useI18n({ useScope: 'global' })
const { snackbar, snackbarMsg, snackbarColor, notify } = useNotify()
const { formatDate } = useFormatters()

// ============================================================
// State
// ============================================================
const items = ref<any[]>([])
const total = ref(0)
const loading = ref(false)
const stats = ref<any>(null)

const page = ref(1)
const itemsPerPage = ref(10)

// Filters per spec
const typeFilter = ref<string>('')
const dateFrom = ref<string>('')
const dateTo = ref<string>('')
const search = ref<string>('')

// Enums per spec
const CASH_TYPES = ['DEPOSIT', 'WITHDRAWAL', 'EXPENSE_PAYMENT', 'SALARY_PAYMENT'] as const
const CASH_METHODS = ['CASH', 'UZCARD', 'HUMO', 'PAYME', 'BANK_TRANSFER'] as const

type CashMethod = typeof CASH_METHODS[number]
type CashType = typeof CASH_TYPES[number]

// ============================================================
// Tone maps
// ============================================================
const TYPE_TONE: Record<string, 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'primary'> = {
  DEPOSIT: 'success',
  WITHDRAWAL: 'warning',
  EXPENSE_PAYMENT: 'error',
  SALARY_PAYMENT: 'info',
}

const METHOD_TONE: Record<string, 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'primary'> = {
  CASH: 'success',
  UZCARD: 'info',
  HUMO: 'info',
  PAYME: 'primary',
  BANK_TRANSFER: 'neutral',
}

// ============================================================
// Formatters
// ============================================================
function fmtMoney(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === '' || Number.isNaN(Number(n))) return '—'
  return fmtNum(Number(n))
}

// ============================================================
// API
// ============================================================
async function load() {
  loading.value = true
  try {
    const params: Record<string, any> = { page: page.value, per_page: itemsPerPage.value }
    if (typeFilter.value) params.type = typeFilter.value
    if (dateFrom.value) params.date_from = dateFrom.value
    if (dateTo.value) params.date_to = dateTo.value
    if (search.value) params.search = search.value
    const res = await axios.get('/cash/', { params })
    const d = res.data?.data ?? res.data
    items.value = d?.cash ?? d?.transactions ?? d?.items ?? []
    total.value = d?.pagination?.total_items ?? d?.pagination?.total ?? items.value.length
  }
  catch {
    notify(t('Failed to load'), 'error')
  }
  finally {
    loading.value = false
  }
}

async function loadStats() {
  try {
    const res = await axios.get('/cash/balance/')
    stats.value = res.data?.data ?? res.data
  }
  catch { /* ignore */ }
}

onMounted(() => { load(); loadStats() })
watch([page, itemsPerPage], load)
const debouncedSearch = useDebounceFn(() => { page.value = 1; load() }, 400)
watch(search, debouncedSearch)
watch([typeFilter, dateFrom, dateTo], () => { page.value = 1; load() })

// ============================================================
// Deposit / Withdraw modals
// ============================================================
type FormShape = { amount: number; payment_method: CashMethod; description: string; notes: string }
const blankForm = (): FormShape => ({ amount: 0, payment_method: 'CASH', description: '', notes: '' })

const depositOpen = ref(false)
const withdrawOpen = ref(false)
const saving = ref(false)
const form = ref<FormShape>(blankForm())
const errors = ref<Record<string, string>>({})

function openDeposit() {
  form.value = blankForm()
  errors.value = {}
  depositOpen.value = true
}

function openWithdraw() {
  form.value = blankForm()
  errors.value = {}
  withdrawOpen.value = true
}

function closeDeposit() {
  if (saving.value) return
  depositOpen.value = false
}

function closeWithdraw() {
  if (saving.value) return
  withdrawOpen.value = false
}

function validate(): boolean {
  const e: Record<string, string> = {}
  if (!form.value.amount || Number(form.value.amount) <= 0)
    e.amount = t('hr_cash_amount_required')
  if (!form.value.payment_method)
    e.payment_method = t('Required')
  errors.value = e
  return Object.keys(e).length === 0
}

async function submit(kind: 'deposit' | 'withdraw') {
  if (!validate()) return
  saving.value = true
  try {
    const payload: any = {
      amount: Number(form.value.amount),
      payment_method: form.value.payment_method,
    }
    if (form.value.description) payload.description = form.value.description
    if (form.value.notes) payload.notes = form.value.notes
    if (kind === 'deposit') {
      await axios.post('/cash/deposit/', payload)
      notify(t('hr_cash_deposit_success'))
      depositOpen.value = false
    }
    else {
      await axios.post('/cash/withdraw/', payload)
      notify(t('hr_cash_withdraw_success'))
      withdrawOpen.value = false
    }
    await Promise.all([load(), loadStats()])
  }
  catch (e: any) {
    const msg = e?.response?.data?.message
      ?? (e?.response?.status === 400 ? t('hr_cash_insufficient_balance') : t('Error'))
    notify(msg, 'error')
  }
  finally {
    saving.value = false
  }
}

// ============================================================
// Detail modal
// ============================================================
const detailOpen = ref(false)
const detail = ref<any>(null)
const detailLoading = ref(false)

async function openDetail(row: any) {
  detail.value = row
  detailOpen.value = true
  detailLoading.value = true
  try {
    const res = await axios.get(`/cash/${row.id}/`)
    detail.value = res.data?.data?.transaction ?? res.data?.data ?? res.data ?? row
  }
  catch { /* keep row */ }
  finally {
    detailLoading.value = false
  }
}

function closeDetail() {
  detailOpen.value = false
  detail.value = null
}

// ============================================================
// Filter chips
// ============================================================
const activeFilters = computed(() => {
  const out: { k: string; label: string; val: string; clear: () => void }[] = []
  if (typeFilter.value)
    out.push({ k: 't', label: t('hr_cash_filter_type'), val: t(`cash_type_${typeFilter.value}`), clear: () => { typeFilter.value = '' } })
  if (dateFrom.value)
    out.push({ k: 'df', label: t('hr_cash_filter_date_from'), val: dateFrom.value, clear: () => { dateFrom.value = '' } })
  if (dateTo.value)
    out.push({ k: 'dt', label: t('hr_cash_filter_date_to'), val: dateTo.value, clear: () => { dateTo.value = '' } })
  if (search.value)
    out.push({ k: 'q', label: t('Search'), val: search.value, clear: () => { search.value = '' } })
  return out
})

function clearAllFilters() {
  typeFilter.value = ''
  dateFrom.value = ''
  dateTo.value = ''
  search.value = ''
}

// ============================================================
// KPI cards (4) from /cash/balance/
// ============================================================
const kpiBalance = computed(() => ({
  label: t('hr_cash_current_balance'),
  value: stats.value ? Number(stats.value.current_balance ?? stats.value.balance ?? 0) : null,
  icon: 'wallet',
  tone: 'primary' as const,
  money: true,
}))
const kpiDeposits = computed(() => ({
  label: t('hr_cash_total_deposits'),
  value: stats.value ? Number(stats.value.totals_by_type?.DEPOSIT ?? stats.value.total_deposits ?? 0) : null,
  icon: 'arrowup',
  tone: 'success' as const,
  money: true,
}))
const kpiWithdrawals = computed(() => ({
  label: t('hr_cash_total_withdrawals'),
  value: stats.value ? Number(stats.value.totals_by_type?.WITHDRAWAL ?? stats.value.total_withdrawals ?? 0) : null,
  icon: 'arrowdown',
  tone: 'warning' as const,
  money: true,
}))
const kpiOutflow = computed(() => ({
  label: t('hr_cash_total_expenses'),
  value: stats.value ? Number(stats.value.totals_by_type?.EXPENSE_PAYMENT ?? stats.value.total_expenses ?? 0) : null,
  icon: 'receipt',
  tone: 'error' as const,
  money: true,
  sub: t('hr_cash_total_salaries') + ': ' + fmtMoney(stats.value?.totals_by_type?.SALARY_PAYMENT ?? stats.value?.total_salaries ?? 0),
}))

// ============================================================
// Filter options
// ============================================================
const typeOptions = computed(() => CASH_TYPES.map(v => ({ value: v, label: t(`cash_type_${v}`) })))
const methodOptions = computed(() => CASH_METHODS.map(v => ({ value: v, label: t(`cash_method_${v}`) })))

// ============================================================
// Columns
// ============================================================
const columns: DataTableColumn<any>[] = [
  { key: 'id', label: t('ID'), sortable: true, width: 90 },
  { key: 'type', label: t('hr_cash_filter_type'), sortable: true, width: 160 },
  { key: 'amount', label: t('hr_cash_amount'), sortable: true, align: 'right', width: 140 },
  { key: 'payment_method', label: t('hr_cash_payment_method'), sortable: true, width: 150 },
  { key: 'description', label: t('hr_cash_description'), sortable: false },
  { key: 'balance_before', label: t('hr_cash_balance_before'), sortable: false, align: 'right', width: 140 },
  { key: 'balance_after', label: t('hr_cash_balance_after'), sortable: false, align: 'right', width: 140 },
  { key: 'performed_by', label: t('hr_cash_performed_by'), sortable: false, width: 160 },
  { key: 'created_at', label: t('hr_cash_created_at'), sortable: true, width: 160 },
]

const tablePagination = computed(() => ({
  page: page.value,
  perPage: itemsPerPage.value,
  total: total.value,
  onPage: (n: number) => { page.value = n },
  onPerPage: (n: number) => { itemsPerPage.value = n; page.value = 1 },
}))

function performerName(p: any): string {
  if (!p) return '—'
  if (typeof p === 'string') return p
  const full = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim()
  return full || p.email || p.username || `#${p.id ?? ''}` || '—'
}

// ESC handler
function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  if (detailOpen.value) { closeDetail(); e.preventDefault(); return }
  if (depositOpen.value) { closeDeposit(); e.preventDefault(); return }
  if (withdrawOpen.value) { closeWithdraw(); e.preventDefault() }
}

onMounted(() => { window.addEventListener('keydown', onKeydown) })
onBeforeUnmount(() => { window.removeEventListener('keydown', onKeydown) })
</script>

<template>
  <div class="page">
    <PageHeader
      :title="t('hr_cash_title')"
      :subtitle="t('hr_cash_subtitle')"
    >
      <template #actions>
        <Button
          variant="secondary"
          icon="arrowdown"
          @click="openWithdraw"
        >
          {{ t('hr_cash_withdraw_btn') }}
        </Button>
        <Button
          variant="primary"
          icon="plus"
          @click="openDeposit"
        >
          {{ t('hr_cash_deposit_btn') }}
        </Button>
      </template>
    </PageHeader>

    <!-- KPI strip -->
    <div class="grid cols-4 hr-cash__kpis">
      <Kpi :data="kpiBalance" />
      <Kpi :data="kpiDeposits" />
      <Kpi :data="kpiWithdrawals" />
      <Kpi :data="kpiOutflow" />
    </div>

    <!-- Toolbar + table -->
    <Card>
      <div class="toolbar hr-cash__toolbar">
        <div class="hr-cash__search">
          <Input
            v-model="search"
            icon="search"
            :placeholder="t('hr_cash_search_placeholder')"
          />
        </div>
        <div class="hr-cash__filter">
          <Select
            v-model="typeFilter"
            icon="filter"
            :placeholder="t('hr_cash_filter_type')"
            :options="typeOptions"
          />
        </div>
        <div class="hr-cash__date">
          <Input
            v-model="dateFrom"
            icon="calendar"
            type="date"
            :placeholder="t('hr_cash_filter_date_from')"
            :aria-label="t('hr_cash_filter_date_from')"
          />
        </div>
        <div class="hr-cash__date">
          <Input
            v-model="dateTo"
            icon="calendar"
            type="date"
            :placeholder="t('hr_cash_filter_date_to')"
            :aria-label="t('hr_cash_filter_date_to')"
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
        :rows="items"
        row-key="id"
        :loading="loading"
        :pagination="tablePagination"
        :initial-sort="{ key: 'created_at', dir: 'desc' }"
      >
        <template #cell.id="{ row }">
          <span class="mono cell-muted">#{{ row.id }}</span>
        </template>

        <template #cell.type="{ row }">
          <Badge :tone="TYPE_TONE[row.type] || 'neutral'">
            {{ row.type ? t(`cash_type_${row.type}`) : '—' }}
          </Badge>
        </template>

        <template #cell.amount="{ row }">
          <span
            class="mono cell-strong"
            :style="{ color: row.type === 'DEPOSIT' ? 'var(--success)' : (row.type === 'WITHDRAWAL' || row.type === 'EXPENSE_PAYMENT' || row.type === 'SALARY_PAYMENT' ? 'var(--error)' : undefined) }"
          >{{ fmtMoney(row.amount) }}</span>
        </template>

        <template #cell.payment_method="{ row }">
          <Badge :tone="METHOD_TONE[row.payment_method] || 'neutral'">
            {{ row.payment_method ? t(`cash_method_${row.payment_method}`) : '—' }}
          </Badge>
        </template>

        <template #cell.description="{ row }">
          <span class="cell-muted">{{ row.description || '—' }}</span>
        </template>

        <template #cell.balance_before="{ row }">
          <span class="mono cell-muted">{{ fmtMoney(row.balance_before) }}</span>
        </template>

        <template #cell.balance_after="{ row }">
          <span class="mono cell-muted">{{ fmtMoney(row.balance_after) }}</span>
        </template>

        <template #cell.performed_by="{ row }">
          <span class="cell-muted">{{ performerName(row.performed_by) }}</span>
        </template>

        <template #cell.created_at="{ row }">
          <span class="cell-muted">{{ row.created_at ? formatDate(row.created_at) : '—' }}</span>
        </template>

        <template #row-actions="{ row }">
          <IconAction
            icon="search"
            tone="primary"
            :title="t('hr_cash_view')"
            @click="openDetail(row)"
          />
        </template>

        <template #empty>
          <div class="statefill">
            <div class="statefill__icon">
              <DesignIcon
                name="wallet"
                :size="24"
              />
            </div>
            <div class="statefill__title">
              {{ t('hr_cash_empty') }}
            </div>
            <div style="margin-top:12px;display:flex;gap:8px;justify-content:center;">
              <Button
                v-if="activeFilters.length > 0"
                variant="secondary"
                @click="clearAllFilters"
              >
                {{ t('Clear filters') }}
              </Button>
              <Button
                variant="primary"
                icon="plus"
                @click="openDeposit"
              >
                {{ t('hr_cash_deposit_btn') }}
              </Button>
            </div>
          </div>
        </template>
      </DataTable>
    </Card>

    <!-- Deposit modal -->
    <Modal
      :open="depositOpen"
      :title="t('hr_cash_deposit_modal_title')"
      :subtitle="t('hr_cash_deposit_btn')"
      :width="520"
      @close="closeDeposit"
    >
      <form @submit.prevent="submit('deposit')">
        <div class="form-grid">
          <Field
            :label="t('hr_cash_amount')"
            class="span-2"
            :error="errors.amount"
          >
            <MoneyInput
              v-model="form.amount"
              icon="dollar"
              :error="!!errors.amount"
              placeholder="0"
            />
          </Field>

          <Field
            :label="t('hr_cash_payment_method')"
            class="span-2"
            :error="errors.payment_method"
          >
            <Select
              v-model="form.payment_method"
              :options="methodOptions"
              :error="!!errors.payment_method"
            />
          </Field>

          <Field
            :label="t('hr_cash_description')"
            class="span-2"
          >
            <Input
              v-model="form.description"
              :placeholder="t('hr_cash_description')"
            />
          </Field>

          <Field
            :label="t('hr_cash_notes')"
            class="span-2"
          >
            <Textarea
              v-model="form.notes"
              class="control hr-cash__textarea"
              rows="3"
              :placeholder="t('hr_cash_notes')"
            />
          </Field>
        </div>
      </form>

      <template #footer>
        <Button
          variant="primary"
          icon="check"
          :loading="saving"
          :disabled="saving"
          @click="submit('deposit')"
        >
          {{ t('hr_cash_save_deposit') }}
        </Button>
      </template>
    </Modal>

    <!-- Withdraw modal -->
    <Modal
      :open="withdrawOpen"
      :title="t('hr_cash_withdraw_modal_title')"
      :subtitle="t('hr_cash_withdraw_btn')"
      :width="520"
      @close="closeWithdraw"
    >
      <form @submit.prevent="submit('withdraw')">
        <div class="form-grid">
          <Field
            :label="t('hr_cash_amount')"
            class="span-2"
            :error="errors.amount"
            :hint="stats ? t('hr_cash_current_balance') + ': ' + fmtMoney(stats?.current_balance ?? stats?.balance ?? 0) + ' ' + t('currency_short') : undefined"
          >
            <MoneyInput
              v-model="form.amount"
              icon="dollar"
              :error="!!errors.amount"
              placeholder="0"
            />
          </Field>

          <Field
            :label="t('hr_cash_payment_method')"
            class="span-2"
            :error="errors.payment_method"
          >
            <Select
              v-model="form.payment_method"
              :options="methodOptions"
              :error="!!errors.payment_method"
            />
          </Field>

          <Field
            :label="t('hr_cash_description')"
            class="span-2"
          >
            <Input
              v-model="form.description"
              :placeholder="t('hr_cash_description')"
            />
          </Field>

          <Field
            :label="t('hr_cash_notes')"
            class="span-2"
          >
            <Textarea
              v-model="form.notes"
              class="control hr-cash__textarea"
              rows="3"
              :placeholder="t('hr_cash_notes')"
            />
          </Field>
        </div>
      </form>

      <template #footer>
        <Button
          variant="danger"
          icon="check"
          :loading="saving"
          :disabled="saving"
          @click="submit('withdraw')"
        >
          {{ t('hr_cash_save_withdrawal') }}
        </Button>
      </template>
    </Modal>

    <!-- Detail modal -->
    <Modal
      :open="detailOpen"
      :title="t('hr_cash_detail_title')"
      :subtitle="detail ? `#${detail.id}` : ''"
      :width="560"
      @close="closeDetail"
    >
      <div
        v-if="detailLoading"
        class="form-grid"
      >
        <div
          class="sk-box span-2"
          style="height:14px;border-radius:4px;"
        />
        <div
          class="sk-box span-2"
          style="height:14px;border-radius:4px;"
        />
        <div
          class="sk-box span-2"
          style="height:14px;border-radius:4px;"
        />
      </div>
      <div
        v-else-if="detail"
        class="form-grid"
      >
        <Field :label="t('hr_cash_filter_type')">
          <div>
            <Badge :tone="TYPE_TONE[detail.type] || 'neutral'">
              {{ detail.type ? t(`cash_type_${detail.type}`) : '—' }}
            </Badge>
          </div>
        </Field>
        <Field :label="t('hr_cash_payment_method')">
          <div>
            <Badge :tone="METHOD_TONE[detail.payment_method] || 'neutral'">
              {{ detail.payment_method ? t(`cash_method_${detail.payment_method}`) : '—' }}
            </Badge>
          </div>
        </Field>
        <Field :label="t('hr_cash_amount')">
          <div class="mono cell-strong">
            {{ fmtMoney(detail.amount) }} {{ t('currency_short') }}
          </div>
        </Field>
        <Field :label="t('hr_cash_created_at')">
          <div class="cell-muted">
            {{ detail.created_at ? formatDate(detail.created_at) : '—' }}
          </div>
        </Field>
        <Field :label="t('hr_cash_balance_before')">
          <div class="mono">
            {{ fmtMoney(detail.balance_before) }} {{ t('currency_short') }}
          </div>
        </Field>
        <Field :label="t('hr_cash_balance_after')">
          <div class="mono">
            {{ fmtMoney(detail.balance_after) }} {{ t('currency_short') }}
          </div>
        </Field>
        <Field
          :label="t('hr_cash_description')"
          class="span-2"
        >
          <div class="cell-muted">
            {{ detail.description || '—' }}
          </div>
        </Field>
        <Field
          v-if="detail.notes"
          :label="t('hr_cash_notes')"
          class="span-2"
        >
          <div
            class="cell-muted"
            style="white-space:pre-wrap;"
          >
            {{ detail.notes }}
          </div>
        </Field>
        <Field :label="t('hr_cash_performed_by')">
          <div class="cell-muted">
            {{ performerName(detail.performed_by) }}
          </div>
        </Field>
        <Field
          v-if="detail.approved_by || detail.approved_by_id"
          :label="t('hr_cash_approved_by')"
        >
          <div class="cell-muted">
            {{ performerName(detail.approved_by ?? detail.approved_by_id) }}
          </div>
        </Field>
        <Field
          v-if="detail.reference_type"
          :label="t('hr_cash_reference_type')"
        >
          <div class="cell-muted">
            {{ detail.reference_type }}
          </div>
        </Field>
        <Field
          v-if="detail.reference_id"
          :label="t('hr_cash_reference_id')"
        >
          <div class="mono cell-muted">
            #{{ detail.reference_id }}
          </div>
        </Field>
      </div>

      <template #footer>
        <Button
          variant="ghost"
          @click="closeDetail"
        >
          {{ t('Close') }}
        </Button>
      </template>
    </Modal>

    <!-- Toast (kept consistent with the rest of the rebuilt pages) -->
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
.hr-cash__kpis {
  margin-bottom: var(--sp-5);
}

.hr-cash__toolbar {
  flex-wrap: wrap;
}

.hr-cash__search {
  flex: 1;
  max-width: 300px;
  min-width: 200px;
}

.hr-cash__filter {
  width: 200px;
}

.hr-cash__date {
  width: 170px;
}

.hr-cash__textarea {
  resize: vertical;
  min-height: 80px;
  padding: 10px 12px;
}

@media (max-width: 900px) {
  .hr-cash__kpis {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .hr-cash__search,
  .hr-cash__filter,
  .hr-cash__date {
    width: 100%;
    max-width: none;
    min-width: 0;
    flex: 1 1 100%;
  }
}

@media (max-width: 420px) {
  .hr-cash__kpis {
    grid-template-columns: 1fr;
  }
}
</style>

<route lang="yaml">
meta:
  action: manage
  subject: all
</route>
