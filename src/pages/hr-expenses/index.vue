<script setup lang="ts">
import type { DataTableColumn } from '@/components/design/DataTable.vue'
import type { ExpenseCategory, ExpenseRecord, ExpenseSource, ExpenseStatus, ExpenseTotals } from '@/types/expenseControl'
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
import {
  approveExpense,
  cancelExpense,
  createExpense,
  getExpense,
  listAllExpenseCategories,
  listExpenses,
  payExpense,
  rejectExpense,
  voidExpense,
} from '@/services/expenseControlApi'
import { useUserAccess } from '@/composables/useUserAccess'

const { t } = useI18n({ useScope: 'global' })
const router = useRouter()
const { snackbar, snackbarMsg, snackbarColor, notify } = useNotify()
const { formatCurrency, formatDate } = useFormatters()
const { currentUserId, hasPermission, hasAnyPermission } = useUserAccess()

const canView = computed(() => hasAnyPermission([
  'expense.request.view_all',
  'expense.request.view_own',
]))

const canCreate = computed(() => hasPermission('expense.request.create'))
const canApprove = computed(() => hasPermission('expense.request.approve'))
const canPay = computed(() => hasPermission('expense.request.pay'))
const canVoid = computed(() => hasPermission('expense.request.void'))
const canViewCategories = computed(() => hasPermission('expense.category.view'))

const items = ref<ExpenseRecord[]>([])
const total = ref(0)
const loading = ref(false)
const loadError = ref('')
const page = ref(1)
const itemsPerPage = ref(20)
const totals = ref<ExpenseTotals>({ row_count: 0, amount_uzs: 0, by_status: {} })
const categories = ref<ExpenseCategory[]>([])

const statusFilter = ref<ExpenseStatus | ''>('')
const categoryFilter = ref('')
const dateFrom = ref('')
const dateTo = ref('')
const search = ref('')
let expenseRequestId = 0

const EXPENSE_STATUSES: ExpenseStatus[] = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'PAID',
  'CANCELED',
  'VOIDED',
]

const statusFilterOptions = computed(() => [
  { value: '', label: t('expense_status_filter_all') },
  ...EXPENSE_STATUSES.map(value => ({ value, label: t(`expense_status_${value}`) })),
])

const categoryFilterOptions = computed(() => [
  { value: '', label: t('expense_filter_all_categories') },
  ...categories.value.map(category => ({ value: String(category.id), label: category.name })),
])

const availableRequestCategories = computed(() => categories.value.filter(category =>
  category.is_active && category.allowed_sources.some(source => source === 'SAFE' || source === 'BANK'),
))

const categoryFormOptions = computed(() => availableRequestCategories.value.map(category => ({
  value: String(category.id),
  label: category.name,
})))

const dialog = ref(false)
const saving = ref(false)
const formErrors = ref<Record<string, string>>({})

const form = ref({
  category_id: null as number | null,
  amount_uzs: 0,
  requested_source: '' as '' | 'SAFE' | 'BANK',
  description: '',
  expense_date: new Date().toISOString().slice(0, 10),
  receipt_number: '',
  notes: '',
})

const selectedCategory = computed(() =>
  categories.value.find(category => category.id === form.value.category_id) ?? null,
)

const availableSources = computed<Array<'SAFE' | 'BANK'>>(() => {
  const allowed = selectedCategory.value?.allowed_sources ?? []

  return (['SAFE', 'BANK'] as const).filter(source => allowed.includes(source))
})

const sourceOptions = computed(() => availableSources.value.map(value => ({
  value,
  label: t(`supplier_source_${value}`),
})))

const categoryIdString = computed({
  get: () => form.value.category_id == null ? '' : String(form.value.category_id),
  set: (value: string) => { form.value.category_id = value ? Number(value) : null },
})

watch(() => form.value.category_id, () => {
  if (!availableSources.value.includes(form.value.requested_source as 'SAFE' | 'BANK'))
    form.value.requested_source = availableSources.value[0] ?? ''
})

function apiError(error: any): string {
  const body = error?.response?.data

  const fieldErrors = (body?.errors && typeof body.errors === 'object')
    ? Object.values(body.errors).flat().filter(Boolean).join(' ')
    : ''

  return String(fieldErrors || body?.message || body?.detail || t('Error'))
}

async function load() {
  if (!canView.value)
    return
  const requestId = ++expenseRequestId

  loading.value = true
  loadError.value = ''
  try {
    const result = await listExpenses({
      page: page.value,
      per_page: itemsPerPage.value,
      status: statusFilter.value,
      category_id: categoryFilter.value ? Number(categoryFilter.value) : undefined,
      date_from: dateFrom.value || undefined,
      date_to: dateTo.value || undefined,
      search: search.value.trim() || undefined,
    })

    if (requestId === expenseRequestId) {
      items.value = result.expenses
      total.value = Number(result.pagination.total ?? result.expenses.length)
      totals.value = result.totals
    }
  }
  catch (error: any) {
    if (requestId === expenseRequestId) {
      loadError.value = apiError(error)
      items.value = []
      total.value = 0
      totals.value = { row_count: 0, amount_uzs: 0, by_status: {} }
    }
  }
  finally {
    if (requestId === expenseRequestId)
      loading.value = false
  }
}

async function loadCategories() {
  if (!canViewCategories.value)
    return
  try {
    categories.value = await listAllExpenseCategories()
  }
  catch (error: any) {
    notify(apiError(error), 'error')
  }
}

onMounted(() => Promise.all([load(), loadCategories()]))
watch([page, itemsPerPage], load)
watch([statusFilter, categoryFilter, dateFrom, dateTo], () => {
  page.value = 1
  load()
})

const debouncedSearch = useDebounceFn(() => {
  page.value = 1
  load()
}, 350)

watch(search, debouncedSearch)

const columns: DataTableColumn<ExpenseRecord>[] = [
  { key: 'expense_date', label: t('Date'), width: 116 },
  { key: 'category', label: t('Category') },
  { key: 'description', label: t('Description') },
  { key: 'amount_uzs', label: t('Amount'), align: 'right', width: 150 },
  { key: 'requested_source', label: t('pay_field_source_account'), width: 130 },
  { key: 'created_by', label: t('Filed by') },
  { key: 'status', label: t('Status'), width: 126 },
]

const tablePagination = computed(() => ({
  page: page.value,
  perPage: itemsPerPage.value,
  total: total.value,
  onPage: (value: number) => { page.value = value },
  onPerPage: (value: number) => { itemsPerPage.value = value; page.value = 1 },
}))

const STATUS_TONE: Record<ExpenseStatus, 'success' | 'warning' | 'error' | 'info' | 'neutral'> = {
  PENDING: 'warning',
  APPROVED: 'info',
  REJECTED: 'error',
  PAID: 'success',
  CANCELED: 'neutral',
  VOIDED: 'neutral',
}

function statusAmount(status: ExpenseStatus) {
  return Number(totals.value.by_status?.[status]?.amount_uzs ?? 0)
}

function openCreate() {
  const first = availableRequestCategories.value[0]

  form.value = {
    category_id: first?.id ?? null,
    amount_uzs: 0,
    requested_source: first?.allowed_sources.includes('SAFE') ? 'SAFE' : first?.allowed_sources.includes('BANK') ? 'BANK' : '',
    description: '',
    expense_date: new Date().toISOString().slice(0, 10),
    receipt_number: '',
    notes: '',
  }
  formErrors.value = {}
  dialog.value = true
}

function closeForm() {
  if (!saving.value)
    dialog.value = false
}

function validateCreate() {
  const errors: Record<string, string> = {}
  if (!form.value.category_id)
    errors.category_id = t('expense_category_required')
  if (!Number.isInteger(form.value.amount_uzs) || form.value.amount_uzs <= 0)
    errors.amount_uzs = t('Amount must be greater than 0')
  if (!form.value.requested_source)
    errors.requested_source = t('expense_source_required')
  if (!form.value.expense_date)
    errors.expense_date = t('Required')
  if (selectedCategory.value?.requires_description && !form.value.description.trim())
    errors.description = t('expense_description_required')
  if (selectedCategory.value?.requires_receipt && !form.value.receipt_number.trim())
    errors.receipt_number = t('expense_receipt_required')
  formErrors.value = errors

  return Object.keys(errors).length === 0
}

async function save() {
  if (!validateCreate() || !form.value.category_id || !form.value.requested_source)
    return
  saving.value = true
  try {
    await createExpense({
      category_id: form.value.category_id,
      amount_uzs: form.value.amount_uzs,
      requested_source: form.value.requested_source,
      expense_date: form.value.expense_date,
      description: form.value.description.trim(),
      receipt_number: form.value.receipt_number.trim(),
      notes: form.value.notes.trim(),
    })
    notify(t('Expense created'))
    dialog.value = false
    await load()
  }
  catch (error: any) {
    notify(apiError(error), 'error')
  }
  finally {
    saving.value = false
  }
}

const busyAction = ref('')
async function approve(row: ExpenseRecord) {
  busyAction.value = `approve-${row.id}`
  try {
    await approveExpense(row.id)
    notify(t('Approved'))
    await load()
  }
  catch (error: any) {
    notify(apiError(error), 'error')
  }
  finally {
    busyAction.value = ''
  }
}

type ReasonAction = 'reject' | 'cancel' | 'void'
const reasonOpen = ref(false)
const reasonAction = ref<ReasonAction>('reject')
const reasonRow = ref<ExpenseRecord | null>(null)
const reason = ref('')
const reasonSaving = ref(false)

function openReason(action: ReasonAction, row: ExpenseRecord) {
  reasonAction.value = action
  reasonRow.value = row
  reason.value = ''
  reasonOpen.value = true
}

function closeReason() {
  if (!reasonSaving.value) {
    reasonOpen.value = false
    reasonRow.value = null
  }
}

const reasonRequired = computed(() => reasonAction.value !== 'cancel' || reasonRow.value?.status === 'APPROVED')
const reasonTitle = computed(() => t(`expense_${reasonAction.value}_title`))

async function submitReason() {
  if (!reasonRow.value)
    return
  if (reasonRequired.value && !reason.value.trim()) {
    notify(t('expense_reason_required'), 'error')
    return
  }
  reasonSaving.value = true
  try {
    if (reasonAction.value === 'reject')
      await rejectExpense(reasonRow.value.id, reason.value.trim())
    else if (reasonAction.value === 'cancel')
      await cancelExpense(reasonRow.value.id, reason.value.trim())
    else
      await voidExpense(reasonRow.value.id, reason.value.trim())

    notify(t(`expense_${reasonAction.value}_success`))
    reasonOpen.value = false
    reasonRow.value = null
    await load()
  }
  catch (error: any) {
    notify(apiError(error), 'error')
  }
  finally {
    reasonSaving.value = false
  }
}

const payDialog = ref(false)
const paying = ref<ExpenseRecord | null>(null)
const feePercent = ref('')
const paymentNote = ref('')
const payingFlag = ref(false)

function openPay(row: ExpenseRecord) {
  paying.value = row
  feePercent.value = ''
  paymentNote.value = ''
  payDialog.value = true
}

function closePay() {
  if (!payingFlag.value) {
    payDialog.value = false
    paying.value = null
  }
}

async function pay() {
  if (!paying.value?.requested_source)
    return
  payingFlag.value = true
  try {
    const bankFee = (paying.value.requested_source === 'BANK' && feePercent.value !== '')
      ? { fee_percent: feePercent.value }
      : {}

    await payExpense(paying.value.id, {
      source_account: paying.value.requested_source,
      ...bankFee,
      ...(paymentNote.value.trim() ? { note: paymentNote.value.trim() } : {}),
    })
    notify(t('Paid'))
    payDialog.value = false
    paying.value = null
    await load()
  }
  catch (error: any) {
    notify(apiError(error), 'error')
  }
  finally {
    payingFlag.value = false
  }
}

const detailsOpen = ref(false)
const detailsLoading = ref(false)
const details = ref<ExpenseRecord | null>(null)

async function openDetails(row: ExpenseRecord) {
  details.value = row
  detailsOpen.value = true
  detailsLoading.value = true
  try {
    details.value = await getExpense(row.id)
  }
  catch (error: any) {
    notify(apiError(error), 'error')
  }
  finally {
    detailsLoading.value = false
  }
}

function canCancel(row: ExpenseRecord) {
  if (row.status === 'PENDING')
    return String(row.created_by?.id ?? '') === String(currentUserId.value ?? '')

  return row.status === 'APPROVED' && canApprove.value
}

function actorName(actor: any) {
  if (!actor)
    return '—'

  return actor.name || `${actor.first_name ?? ''} ${actor.last_name ?? ''}`.trim() || '—'
}

function sourceLabel(source: ExpenseSource | null) {
  return source ? t(`supplier_source_${source}`) : '—'
}
</script>

<template>
  <div class="page">
    <PageHeader
      :title="t('Expenses')"
      :subtitle="t('expense_subtitle')"
    >
      <template #actions>
        <Button
          v-if="canViewCategories"
          variant="ghost"
          icon="folder"
          @click="router.push('/hr-expense-categories')"
        >
          {{ t('Categories') }}
        </Button>
        <Button
          v-if="canCreate"
          variant="primary"
          icon="plus"
          :disabled="!availableRequestCategories.length"
          @click="openCreate"
        >
          {{ t('New Expense') }}
        </Button>
      </template>
    </PageHeader>

    <Card
      v-if="!canView"
      class="permission-state"
    >
      <div class="statefill">
        <div class="statefill__icon">
          <DesignIcon
            name="lock"
            :size="24"
          />
        </div>
        <div class="statefill__title">
          {{ t('expense_permission_denied_title') }}
        </div>
        <div class="statefill__sub">
          {{ t('expense_permission_denied_body') }}
        </div>
      </div>
    </Card>

    <template v-else>
      <div class="kpi-grid">
        <Kpi :data="{ label: t('Pending'), value: statusAmount('PENDING'), icon: 'clock', tone: 'warning', money: true }" />
        <Kpi :data="{ label: t('Approved'), value: statusAmount('APPROVED'), icon: 'calendar', tone: 'info', money: true }" />
        <Kpi :data="{ label: t('Paid'), value: statusAmount('PAID'), icon: 'check', tone: 'success', money: true }" />
        <Kpi :data="{ label: t('Total'), value: totals.amount_uzs, icon: 'wallet', tone: 'primary', money: true, sub: `${totals.row_count} ${t('expense_count_suffix')}` }" />
      </div>

      <Card>
        <div class="toolbar toolbar--wrap">
          <div class="tb-search">
            <Input
              v-model="search"
              icon="search"
              :placeholder="t('Search description or category')"
            />
          </div>
          <div class="tb-filter">
            <Select
              v-model="statusFilter"
              icon="filter"
              :options="statusFilterOptions"
              :placeholder="t('expense_status_filter_all')"
            />
          </div>
          <div class="tb-filter tb-filter--wide">
            <Select
              v-model="categoryFilter"
              icon="folder"
              :options="categoryFilterOptions"
              :placeholder="t('expense_filter_all_categories')"
            />
          </div>
          <div class="tb-date">
            <Field :label="t('expense_date_from')">
              <Input
                v-model="dateFrom"
                type="date"
              />
            </Field>
          </div>
          <div class="tb-date">
            <Field :label="t('expense_date_to')">
              <Input
                v-model="dateTo"
                type="date"
              />
            </Field>
          </div>
          <Button
            variant="ghost"
            icon="refresh"
            :disabled="loading"
            @click="load"
          >
            {{ t('expcat_action_refresh') }}
          </Button>
        </div>

        <div
          v-if="loadError"
          class="error-banner"
          role="alert"
        >
          <span>{{ loadError }}</span>
          <Button
            variant="ghost"
            icon="retry"
            @click="load"
          >
            {{ t('Retry') }}
          </Button>
        </div>

        <div class="card__divider" />

        <DataTable
          :columns="columns"
          :rows="items"
          row-key="id"
          :loading="loading"
          :pagination="tablePagination"
          :empty-title="t('expense_empty_title')"
          :empty-sub="t('expense_empty_hint')"
        >
          <template #cell.expense_date="{ row }">
            {{ formatDate(row.expense_date) }}
          </template>
          <template #cell.category="{ row }">
            <div class="cell-stack">
              <span class="cell-strong">{{ row.category?.name || '—' }}</span>
              <span
                v-if="row.category?.code"
                class="cell-muted mono"
              >{{ row.category.code }}</span>
            </div>
          </template>
          <template #cell.description="{ row }">
            <span class="cell-muted truncate">{{ row.description || '—' }}</span>
          </template>
          <template #cell.amount_uzs="{ row }">
            <span class="mono">{{ formatCurrency(row.amount_uzs ?? row.amount ?? 0) }}</span>
          </template>
          <template #cell.requested_source="{ row }">
            {{ sourceLabel(row.requested_source) }}
          </template>
          <template #cell.created_by="{ row }">
            {{ actorName(row.created_by) }}
          </template>
          <template #cell.status="{ row }">
            <Badge :tone="STATUS_TONE[row.status] ?? 'neutral'">
              {{ t(`expense_status_${row.status}`) }}
            </Badge>
          </template>
          <template #row-actions="{ row }">
            <IconAction
              icon="info"
              :title="t('Details')"
              @click="openDetails(row)"
            />
            <IconAction
              v-if="row.status === 'PENDING' && canApprove && String(row.created_by?.id ?? '') !== String(currentUserId ?? '')"
              icon="check"
              tone="success"
              :title="t('Approve')"
              :disabled="!!busyAction"
              @click="approve(row)"
            />
            <IconAction
              v-if="row.status === 'PENDING' && canApprove && String(row.created_by?.id ?? '') !== String(currentUserId ?? '')"
              icon="close"
              tone="danger"
              :title="t('Reject')"
              :disabled="!!busyAction"
              @click="openReason('reject', row)"
            />
            <IconAction
              v-if="row.status === 'APPROVED' && canPay"
              icon="dollar"
              tone="success"
              :title="t('Pay')"
              @click="openPay(row)"
            />
            <IconAction
              v-if="canCancel(row)"
              icon="close"
              tone="danger"
              :title="t('expense_cancel_action')"
              @click="openReason('cancel', row)"
            />
            <IconAction
              v-if="row.status === 'PAID' && canVoid"
              icon="refresh"
              tone="danger"
              :title="t('expense_void_action')"
              @click="openReason('void', row)"
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
                {{ t('expense_empty_title') }}
              </div>
              <div class="statefill__sub">
                {{ t('expense_empty_hint') }}
              </div>
              <Button
                v-if="canCreate && availableRequestCategories.length"
                class="empty-action"
                variant="primary"
                icon="plus"
                @click="openCreate"
              >
                {{ t('New Expense') }}
              </Button>
            </div>
          </template>
        </DataTable>
      </Card>
    </template>

    <Modal
      :open="dialog"
      :title="t('New Expense')"
      :subtitle="t('expense_request_create_hint')"
      :width="600"
      @close="closeForm"
    >
      <form @submit.prevent="save">
        <div class="form-grid">
          <Field
            :label="t('Category')"
            class="span-2"
            :error="formErrors.category_id"
          >
            <Select
              v-model="categoryIdString"
              :options="categoryFormOptions"
              :placeholder="t('expense_pick_category')"
              :error="!!formErrors.category_id"
            />
          </Field>
          <Field
            :label="t('Amount')"
            :error="formErrors.amount_uzs"
          >
            <MoneyInput
              v-model="form.amount_uzs"
              :error="!!formErrors.amount_uzs"
              :placeholder="t('expense_amount_placeholder')"
            />
          </Field>
          <Field
            :label="t('Date')"
            :error="formErrors.expense_date"
          >
            <Input
              v-model="form.expense_date"
              type="date"
              :error="!!formErrors.expense_date"
            />
          </Field>
          <Field
            :label="t('expense_requested_source')"
            class="span-2"
            :error="formErrors.requested_source"
            :hint="t('expense_requested_source_hint')"
          >
            <Select
              v-model="form.requested_source"
              :options="sourceOptions"
              :placeholder="t('expense_source_required')"
              :error="!!formErrors.requested_source"
            />
          </Field>
          <Field
            :label="t('Description')"
            class="span-2"
            :error="formErrors.description"
          >
            <Input
              v-model="form.description"
              :error="!!formErrors.description"
              :placeholder="t('expense_description_placeholder')"
            />
          </Field>
          <Field
            :label="t('Receipt #')"
            class="span-2"
            :error="formErrors.receipt_number"
            :hint="selectedCategory?.requires_receipt ? t('expense_receipt_category_required') : ''"
          >
            <Input
              v-model="form.receipt_number"
              :error="!!formErrors.receipt_number"
              :placeholder="t('expense_receipt_placeholder')"
            />
          </Field>
          <Field
            :label="t('Notes')"
            class="span-2"
          >
            <Input
              v-model="form.notes"
              :placeholder="t('expense_notes_placeholder')"
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
          @click="save"
        >
          {{ t('expense_submit_request') }}
        </Button>
      </template>
    </Modal>

    <Modal
      :open="payDialog"
      :title="t('Pay Expense')"
      :subtitle="paying ? formatCurrency(paying.amount_uzs) : ''"
      :width="460"
      @close="closePay"
    >
      <div class="summary-row">
        <span>{{ t('pay_field_source_account') }}</span>
        <strong>{{ sourceLabel(paying?.requested_source ?? null) }}</strong>
      </div>
      <Field
        v-if="paying?.requested_source === 'BANK'"
        :label="t('pay_field_commission')"
        :hint="t('pay_commission_hint')"
      >
        <Input
          v-model="feePercent"
          type="number"
          min="0"
          max="100"
          step="0.01"
          placeholder="0"
        />
      </Field>
      <Field :label="t('Notes')">
        <Input
          v-model="paymentNote"
          :placeholder="t('expense_payment_note_placeholder')"
        />
      </Field>
      <div class="pay-hint">
        {{ t('expense_payment_posts_money') }}
      </div>
      <template #footer>
        <Button
          variant="primary"
          icon="dollar"
          :loading="payingFlag"
          :disabled="payingFlag || !paying?.requested_source"
          @click="pay"
        >
          {{ t('Pay') }}
        </Button>
      </template>
    </Modal>

    <Modal
      :open="reasonOpen"
      :title="reasonTitle"
      :subtitle="reasonRow?.description || ''"
      :width="480"
      @close="closeReason"
    >
      <Field
        :label="t('Reason')"
        :hint="reasonRequired ? t('expense_reason_required') : t('Reason (optional)')"
      >
        <Input
          v-model="reason"
          :placeholder="t('expense_reason_placeholder')"
          autofocus
        />
      </Field>
      <template #footer>
        <Button
          variant="danger"
          icon="close"
          :loading="reasonSaving"
          :disabled="reasonSaving"
          @click="submitReason"
        >
          {{ t(`expense_${reasonAction}_action`) }}
        </Button>
      </template>
    </Modal>

    <Modal
      :open="detailsOpen"
      :title="t('expense_details_title')"
      :subtitle="details ? `#${details.id}` : ''"
      :width="680"
      @close="detailsOpen = false"
    >
      <div
        v-if="detailsLoading"
        class="detail-loading"
      >
        {{ t('Loading...') }}
      </div>
      <template v-else-if="details">
        <dl class="detail-grid">
          <div><dt>{{ t('Category') }}</dt><dd>{{ details.category?.name || '—' }}</dd></div>
          <div>
            <dt>{{ t('Amount') }}</dt><dd class="mono">
              {{ formatCurrency(details.amount_uzs) }}
            </dd>
          </div>
          <div><dt>{{ t('pay_field_source_account') }}</dt><dd>{{ sourceLabel(details.requested_source) }}</dd></div>
          <div>
            <dt>{{ t('Status') }}</dt><dd>
              <Badge :tone="STATUS_TONE[details.status]">
                {{ t(`expense_status_${details.status}`) }}
              </Badge>
            </dd>
          </div>
          <div><dt>{{ t('Filed by') }}</dt><dd>{{ actorName(details.created_by) }}</dd></div>
          <div><dt>{{ t('Date') }}</dt><dd>{{ formatDate(details.expense_date) }}</dd></div>
          <div class="span-2">
            <dt>{{ t('Description') }}</dt><dd>{{ details.description || '—' }}</dd>
          </div>
        </dl>
        <div
          v-if="details.transitions?.length"
          class="timeline"
        >
          <div class="timeline__title">
            {{ t('expense_history') }}
          </div>
          <div
            v-for="transition in details.transitions"
            :key="transition.id"
            class="timeline__item"
          >
            <Badge :tone="STATUS_TONE[transition.new_status]">
              {{ t(`expense_status_${transition.new_status}`) }}
            </Badge>
            <span>{{ actorName(transition.actor) }}</span>
            <span class="cell-muted">{{ formatDate(transition.created_at) }}</span>
            <p v-if="transition.reason">
              {{ transition.reason }}
            </p>
          </div>
        </div>
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

<route lang="yaml">
meta:
  action: manage
  subject: all
</route>

<style scoped>
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-block-end: 16px;
}

.toolbar--wrap {
  flex-wrap: wrap;
  gap: 12px;
}

.tb-search { flex: 1 1 220px; min-width: 200px; }
.tb-filter { width: 190px; }
.tb-filter--wide { width: 230px; }
.tb-date { width: 165px; }

.error-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 0 16px 12px;
  padding: 10px 12px;
  border: 1px solid rgba(var(--v-theme-error), .3);
  border-radius: 8px;
  background: rgba(var(--v-theme-error), .08);
  color: rgb(var(--v-theme-error));
}

.cell-stack { display: flex; flex-direction: column; min-width: 0; gap: 2px; }
.truncate { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 300px; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.span-2 { grid-column: span 2; }
.empty-action { margin-block-start: 12px; }

.summary-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px;
  margin-block-end: 14px;
  border-radius: 8px;
  background: rgba(var(--v-theme-on-surface), .04);
}

.pay-hint,
.detail-loading {
  margin-block-start: 10px;
  color: rgb(var(--v-theme-text-secondary));
  font-size: 13px;
}

.detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  margin: 0;
}

.detail-grid div { min-width: 0; }
.detail-grid dt { color: rgb(var(--v-theme-text-secondary)); font-size: 12px; }
.detail-grid dd { margin: 4px 0 0; overflow-wrap: anywhere; }
.timeline { margin-block-start: 22px; }
.timeline__title { margin-block-end: 10px; font-weight: 600; }
.timeline__item { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 8px; padding: 10px 0; border-block-start: 1px solid rgba(var(--v-theme-on-surface), .08); }
.timeline__item p { grid-column: 2 / -1; margin: 0; overflow-wrap: anywhere; }

@media (max-width: 1024px) {
  .kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 768px) {
  .tb-search,
  .tb-filter,
  .tb-filter--wide,
  .tb-date { width: 100%; flex: 1 1 100%; }
  .form-grid,
  .detail-grid { grid-template-columns: 1fr; }
  .span-2 { grid-column: span 1; }
  .timeline__item { grid-template-columns: auto 1fr; }
  .timeline__item .cell-muted { grid-column: 2; }
}

@media (max-width: 480px) {
  .kpi-grid { grid-template-columns: 1fr; }
  .error-banner { align-items: flex-start; flex-direction: column; }
}
</style>
