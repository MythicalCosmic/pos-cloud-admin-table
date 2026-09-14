<script setup lang="ts">
import WorkspacePage from '@/components/design/workspace/WorkspacePage.vue'
import Input from '@/components/design/Input.vue'
import Textarea from '@/components/design/Textarea.vue'
import axios from '@/plugins/axios'
import { shiftNumber as num, useShiftPresentation } from '@/composables/useShiftPresentation'
import { fmtMoney, fmtNum } from '@/components/design/utils/format'
import DesignIcon from '@/components/design/DesignIcon.vue'
import PageHeader from '@/components/design/PageHeader.vue'
import Button from '@/components/design/Button.vue'
import StateFill from '@/components/design/StateFill.vue'
import ShiftCard from '@/components/shifts/ShiftCard.vue'
import ShiftLedger from '@/components/shifts/ShiftLedger.vue'
import '@styles/pages/shifts.css'
import { buildCsv } from '@/utils/csv'
import DateRangePicker, { type DateRangeValue } from '@/components/design/DateRangePicker.vue'
import Select from '@/components/design/Select.vue'
import { formatWindow } from '@/composables/useWindowLabel'
import { caretAfterDigitCount, formatWholeMoneyInput } from '@/utils/moneyInput'
import {
  type SettlementRow,
  type ShiftSummary,
  moneyNumber,
  outstandingAllTenders,
  outstandingNoncash,
  outstandingPhysicalCash,
  reconciliationSetup,
  safeSettlementExpected,
  settlementMethod,
  settlementRowIsUncounted,
} from '@/utils/shiftMoney'

const { t } = useI18n({ useScope: 'global' })
const { notify } = useNotify()

const { fullName, shiftState, varianceOf, netOf } = useShiftPresentation()

// ============================================================
// Filters
// ============================================================
const dateRange = ref<DateRangeValue>({ from: '', to: '', preset: 'all' })
const cashierId = ref<number | ''>('')

// status uses BE Shift.Status enum directly: ACTIVE | ENDED | COMPLETED | ABANDONED
const statusF = ref<'' | 'ACTIVE' | 'ENDED' | 'COMPLETED' | 'ABANDONED'>('')
const liveOnly = ref(false)

const cashiers = ref<any[]>([])

async function loadCashiers() {
  try {
    // The role control was removed from this toolbar. Fetch all staff once so
    // the cashier filter can still find every shift owner.
    const res = await axios.get('/users', { params: { per_page: 200 } })
    const d = res.data?.data ?? res.data

    cashiers.value = d?.users ?? []
  }
  catch {
    cashiers.value = []
  }
}

// ============================================================
// Shifts data
// ============================================================
const shifts = ref<any[]>([])
const apiSummary = ref<ShiftSummary>({})
const loading = ref(true)
const loadError = ref(false)
const moreLoading = ref(false)
const hasMore = ref(false)
const totalShifts = ref<number | null>(null)
const loadedPage = ref(1)
const searchQuery = ref('')
const sortBy = ref('recent')
const viewMode = useStorage<'list' | 'cards'>('alphapos-shift-view', 'list')
let shiftsRequest = 0

function shiftParams(page: number) {
  const params: Record<string, string | number | boolean> = { page, per_page: 100 }
  if (dateRange.value.from)
    params.date_from = dateRange.value.from
  if (dateRange.value.to)
    params.date_to = dateRange.value.to
  if (cashierId.value)
    params.user_id = cashierId.value
  if (statusF.value)
    params.status = statusF.value
  if (liveOnly.value)
    params.live_only = true
  return params
}

function applyShiftPage(data: any, page: number, append: boolean) {
  const rows: any[] = Array.isArray(data) ? data : (data?.shifts ?? data?.items ?? [])
  const additions = rows.filter(row => !append || !shifts.value.some(existing => existing.id === row.id))

  shifts.value = append ? [...shifts.value, ...additions] : rows
  apiSummary.value = (!Array.isArray(data) && (data?.summary ?? data?.stats)) || {}
  totalShifts.value = moneyNumber(data?.pagination?.total ?? data?.total ?? data?.count)
  loadedPage.value = page
  hasMore.value = additions.length > 0 && (totalShifts.value === null ? rows.length >= 100 : shifts.value.length < totalShifts.value)
}

async function fetchShiftsPage(page: number, append = false) {
  if (append && (loading.value || moreLoading.value))
    return
  const requestId = ++shiftsRequest
  if (append)
    moreLoading.value = true
  else loading.value = true
  loadError.value = false
  try {
    const res = await axios.get('/shifts', { params: shiftParams(page) })
    if (requestId !== shiftsRequest)
      return
    const data = res.data?.data ?? res.data

    applyShiftPage(data, page, append)
  }
  catch (error: any) {
    if (requestId !== shiftsRequest)
      return
    if (!append)
      loadError.value = true
    notify(error?.response?.data?.message ?? t('Failed to load shifts'), 'error')
  }
  finally {
    if (requestId === shiftsRequest) {
      loading.value = false
      moreLoading.value = false
    }
  }
}
function loadShifts() { return fetchShiftsPage(1) }
function loadMore() { return fetchShiftsPage(loadedPage.value + 1, true) }
function setStatus(value: string | number) {
  if (!['', 'ACTIVE', 'ENDED', 'COMPLETED', 'ABANDONED'].includes(String(value)))
    return
  statusF.value = String(value) as typeof statusF.value
  if (value !== 'ACTIVE')
    liveOnly.value = false
}
function toggleLive() {
  liveOnly.value = !liveOnly.value
  if (liveOnly.value)
    statusF.value = ''
}

onMounted(() => { loadCashiers(); loadShifts() })
watch([dateRange, cashierId, statusF, liveOnly], () => { loadShifts() })

// ============================================================
// Filtering
// ============================================================
const filtered = computed(() => {
  return shifts.value.filter(s => {
    if (cashierId.value && s.user?.id !== cashierId.value)
      return false

    // liveOnly is a UI shortcut for status === ACTIVE
    if (liveOnly.value && shiftState(s) !== 'active')
      return false
    const search = searchQuery.value.trim().toLocaleLowerCase()
    return !search || `${fullName(s.user)} ${s.id} ${s.shift_template?.name || ''}`.toLocaleLowerCase().includes(search)
  })
})

// ============================================================
// Summary KPIs
// ============================================================
const summary = computed(() => {
  let netVariance = 0
  for (const s of shifts.value) {
    const st = shiftState(s)
    if (st === 'reconciled')
      netVariance += varianceOf(s)
  }

  const activeRaw = moneyNumber(apiSummary.value.live_count == null ? null : String(apiSummary.value.live_count))
  const awaitingRaw = moneyNumber(apiSummary.value.awaiting_reconciliation_count == null ? null : String(apiSummary.value.awaiting_reconciliation_count))

  return {
    active: activeRaw,
    awaiting: awaitingRaw,
    physicalCash: moneyNumber(outstandingPhysicalCash(apiSummary.value)),
    noncash: moneyNumber(outstandingNoncash(apiSummary.value)),
    allTenders: moneyNumber(outstandingAllTenders(apiSummary.value)),
    netVariance,
  }
})

// ============================================================
// Active filter chips
// ============================================================
const activeFilters = computed(() => {
  const arr: { k: string; label: string; val: string; clear: () => void }[] = []
  if (cashierId.value) {
    const u = cashiers.value.find((c: any) => c.id === cashierId.value)

    arr.push({ k: 'c', label: t('Cashier'), val: u ? fullName(u) : `#${cashierId.value}`, clear: () => (cashierId.value = '') })
  }
  if (statusF.value)
    arr.push({ k: 's', label: t('Status'), val: t(`shift_status_${statusF.value}`), clear: () => (statusF.value = '') })
  if (liveOnly.value)
    arr.push({ k: 'l', label: t('Live only'), val: t('On'), clear: () => (liveOnly.value = false) })
  if (dateRange.value.from || dateRange.value.to) {
    arr.push({
      k: 'd',
      label: t('Period'),
      val: formatWindow(dateRange.value, t),
      clear: () => { dateRange.value = { from: '', to: '', preset: 'all' } },
    })
  }
  return arr
})

function clearAllFilters() {
  searchQuery.value = ''
  cashierId.value = ''
  statusF.value = ''
  liveOnly.value = false
  dateRange.value = { from: '', to: '', preset: 'all' }
}

// ============================================================
// Receive-money modal — per-tender settlement
// ============================================================
const receiving = ref<any | null>(null)
const note = ref('')
const busy = ref(false)

type Tender = string

// Card is the combined terminal amount, stored under the backend's HUMO key.
// Payme is counted separately; CARD and UZCARD are not sent by this dialog.
const RECEIVE_TENDERS = ['CASH', 'HUMO', 'PAYME'] as const

const TENDER_LABEL: Record<string, string> = {
  CASH: 'Cash',
  HUMO: 'Card',
  PAYME: 'Payme',
}

function emptyTenderCounts(): Record<Tender, string> {
  return Object.fromEntries(RECEIVE_TENDERS.map(method => [method, '']))
}

const settlementLoading = ref(false)
const settlementReady = ref(false)
const settlementError = ref(false)
const settlementDetail = ref<any | null>(null)
const countedByTender = ref<Record<Tender, string>>(emptyTenderCounts())
let settlementRequestId = 0

const settlementSetup = computed(() => reconciliationSetup(settlementDetail.value))
const settlementRows = computed<SettlementRow[]>(() => settlementSetup.value.rows)

// Keep the operational form stable even though the backend exposes additional
// accounting tenders in `expected_by_tender` and `settlement`.
const visibleTenders = RECEIVE_TENDERS

function tenderLabel(method: Tender): string {
  return TENDER_LABEL[method] ? t(TENDER_LABEL[method]) : method
}
function parseAmount(v: string | undefined): number | null {
  if (v === '' || v === null || v === undefined)
    return null
  const stripped = String(v).replace(/[^\d-]/g, '')
  if (stripped === '' || stripped === '-')
    return null
  const n = Number(stripped)
  return Number.isFinite(n) ? n : null
}
function countedOf(method: Tender): number | null {
  return parseAmount(countedByTender.value[method])
}
function rowForTender(method: Tender): SettlementRow | null {
  return settlementRows.value.find(row => settlementMethod(row) === method) ?? null
}
function expectedOf(method: Tender): number | null {
  const row = rowForTender(method)
  return row ? moneyNumber(safeSettlementExpected(row)) : null
}
function cashierCountNote(method: Tender): string | null {
  const row = rowForTender(method)
  return (row && settlementRowIsUncounted(row)) ? t('Cashier count not submitted') : null
}
function setCountedAmount(method: Tender, event: Event) {
  const input = event.target as HTMLInputElement
  const digitsBeforeCaret = input.value.slice(0, input.selectionStart ?? input.value.length).replace(/\D/g, '').length
  const formatted = formatWholeMoneyInput(input.value)

  countedByTender.value = { ...countedByTender.value, [method]: formatted }
  nextTick(() => {
    const caret = caretAfterDigitCount(formatted, digitsBeforeCaret)

    input.setSelectionRange(caret, caret)
  })
}
function tenderVariance(method: Tender): number | null {
  const counted = countedOf(method)
  const expected = expectedOf(method)
  return (counted === null || expected === null) ? null : counted - expected
}
const allReceiveTendersCounted = computed(() => RECEIVE_TENDERS.every(method => countedOf(method) !== null))

const canConfirmSettlement = computed(() => settlementReady.value
  && settlementSetup.value.ok
  && !settlementLoading.value
  && settlementRows.value.length > 0
  && settlementRows.value.every(row => !!settlementMethod(row))
  && allReceiveTendersCounted.value)

const totalReceived = computed(() => visibleTenders.reduce(
  (total, method) => total + (countedOf(method) ?? 0),
  0,
))

async function loadSettlement(id: number | string) {
  const requestId = ++settlementRequestId

  settlementLoading.value = true
  settlementReady.value = false
  settlementError.value = false
  try {
    const res = await axios.get(`/shifts/${id}`)
    if (requestId !== settlementRequestId)
      return
    const responseData = res.data?.data ?? res.data ?? {}
    const base = (responseData?.shift && typeof responseData.shift === 'object') ? responseData.shift : responseData
    const data = { ...(base ?? {}), settlement: responseData?.settlement ?? base?.settlement ?? [] }

    settlementDetail.value = data
    countedByTender.value = emptyTenderCounts()
    settlementReady.value = true
  }
  catch {
    if (requestId === settlementRequestId)
      settlementError.value = true
  }
  finally {
    if (requestId === settlementRequestId)
      settlementLoading.value = false
  }
}

function openReceive(s: any) {
  receiving.value = s
  note.value = ''
  busy.value = false
  settlementReady.value = false
  settlementError.value = false
  settlementDetail.value = null
  countedByTender.value = emptyTenderCounts()
  loadSettlement(s.id)
}
function closeReceive() {
  if (busy.value)
    return
  settlementRequestId++
  receiving.value = null
  settlementDetail.value = null
}

const router = useRouter()
function openReport(s: any) {
  router.push({ path: '/analytics/shift-handover', query: { shift: String(s.id) } })
}

// ------------------------------------------------------------
// End shift confirmation (destructive)
// ------------------------------------------------------------
const endingShift = ref<any | null>(null)
function askEndShift(s: any) {
  endingShift.value = s
}
function cancelEndShift() {
  if (busy.value)
    return
  endingShift.value = null
}
async function confirmEndShift() {
  const s = endingShift.value
  if (!s || busy.value)
    return
  busy.value = true
  try {
    // POST /shifts/<id>/end — actually closes the shift (previously this button
    // only navigated to the report and never ended anything). BE guards: the
    // shift must be ACTIVE and have no open/preparing/ready orders; a manager
    // may close any cashier's till. The blind cash count is taken later at
    // reconcile, so `counted` is omitted here and `notes` is optional.
    await axios.post(`/shifts/${s.id}/end`, { notes: '' })
    notify(`${t('Shift ended')} · ${fullName(s.user)}`, 'success')
    endingShift.value = null

    // Refresh so the card flips ACTIVE → awaiting-cash and the manager can
    // reconcile the drawer from it.
    await loadShifts()
  }
  catch (e: any) {
    const status = e?.response?.status
    const beMsg = e?.response?.data?.message || ''
    if (status === 404)
      notify(t('Shift not found'), 'error')
    else

      // Surfaces BE guard messages verbatim, e.g. "Cannot close shift while N
      // order(s) are still open." so the manager knows what to fix.
      notify(beMsg || e?.message || t('Failed to end shift'), 'error')
  }
  finally {
    busy.value = false
  }
}

// ------------------------------------------------------------
// Export (CSV) — current filtered set
// ------------------------------------------------------------
function exportShifts() {
  const rows = filtered.value
  if (!rows.length) {
    notify(t('Nothing to export'), 'warning')
    return
  }

  const header = ['id', 'cashier', 'start', 'end', 'orders', 'gross', 'net', 'cash_collected', 'expenses', 'state']

  const csv = buildCsv([
    header,
    ...rows.map(s => [
      s.id,
      fullName(s.user),
      s.start_time || '',
      s.end_time || '',
      num(s.total_orders),
      num(s.total_revenue),
      netOf(s),
      num(s.cash_collected),
      num(s.expenses_total),
      shiftState(s),
    ]),
  ])

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')

  a.href = url
  a.download = `shifts-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function notifySettlement(s: any, result: any) {
  const cashVariance = tenderVariance('CASH')

  const tail = (cashVariance === null || cashVariance === 0)
    ? t('exact match')
    : cashVariance > 0
      ? `${t('over by')} ${fmtMoney(Math.abs(cashVariance))}`
      : `${t('short by')} ${fmtMoney(Math.abs(cashVariance))}`

  const postedToSafe = result?.treasury_posting?.status === 'posted'
  const outcome = postedToSafe ? t('Added to Safe') : t('Settlement confirmed')

  notify(`${outcome} · ${fullName(s.user)} · ${fmtMoney(totalReceived.value)} UZS · ${tail}`, postedToSafe ? 'success' : 'info')
}

async function confirmReceive() {
  if (busy.value || !receiving.value || !canConfirmSettlement.value)
    return
  busy.value = true

  const s = receiving.value
  try {
    const cash = countedOf('CASH')
    const card = countedOf('HUMO')
    const payme = countedOf('PAYME')
    if (cash === null || card === null || payme === null)
      return

    // Keep the backend tender identities while showing the operational labels.
    const confirmed = {
      CASH: cash,
      HUMO: card,
      PAYME: payme,
    }

    const res = await axios.post(`/shifts/${s.id}/reconcile`, {
      // The backend still requires this cash audit field alongside the
      // cash, combined-card and Payme confirmation map.
      actual_cash: cash,
      confirmed,
      notes: note.value || undefined,
    })

    const result = res.data?.data ?? res.data ?? {}

    notifySettlement(s, result)
    receiving.value = null
    await loadShifts()
  }
  catch (e: any) {
    const status = e?.response?.status
    const beMsg = e?.response?.data?.message || ''
    if (status === 400 && /ended/i.test(beMsg) && s.status !== 'ENDED') {
      notify(t('Shift must be ended before reconciling'), 'error')
    }
    else {
      const msg = beMsg || e?.message || t('Failed to record settlement')

      notify(msg, 'error')
    }
  }
  finally {
    busy.value = false
  }
}

// ============================================================
// Status options for the filter select — use BE Shift.Status enum values directly.
// A separate "Awaiting cash" UX state is derived (status === ENDED) and surfaced
// via translation key shift_status_AWAITING_CASH in the badge logic below.
// ============================================================
const statusOptions: { value: '' | 'ACTIVE' | 'ENDED' | 'COMPLETED' | 'ABANDONED' }[] = [
  { value: 'ACTIVE' },
  { value: 'ENDED' },
  { value: 'COMPLETED' },
  { value: 'ABANDONED' },
]

const cashierSelectOptions = computed(() => cashiers.value.map(c => ({ value: String(c.id), label: fullName(c) })))

const orderedShifts = computed(() => [...filtered.value].sort((a, b) => {
  if (sortBy.value === 'revenue')
    return num(b.total_revenue) - num(a.total_revenue)
  if (sortBy.value === 'attention')
    return Number(shiftState(b) === 'awaiting') - Number(shiftState(a) === 'awaiting')
  const dateA = Date.parse(a.start_time || '') || 0
  const dateB = Date.parse(b.start_time || '') || 0
  return sortBy.value === 'oldest' ? dateA - dateB : dateB - dateA
}))

const sortOptions = computed(() => [
  { value: 'recent', label: t('shifts_workspace_recent') },
  { value: 'oldest', label: t('shifts_workspace_oldest') },
  { value: 'revenue', label: t('shifts_workspace_revenue') },
  { value: 'attention', label: t('shifts_workspace_attention') },
])

const statusSelectOptions = computed(() => statusOptions.filter(o => o.value).map(o => ({ value: o.value, label: t(`shift_status_${o.value}`) })))

// ============================================================
// Modal ergonomics: ESC to close + focus trap.
// Applies to both the receive-cash modal and the end-shift confirm modal.
// ============================================================
const receiveModalEl = ref<HTMLElement | null>(null)
const endModalEl = ref<HTMLElement | null>(null)
let receiveReturnFocus: HTMLElement | null = null
let endReturnFocus: HTMLElement | null = null

function focusableIn(root: HTMLElement | null): HTMLElement[] {
  if (!root)
    return []
  const sel = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  return Array.from(root.querySelectorAll<HTMLElement>(sel)).filter(el => !el.hasAttribute('aria-hidden'))
}
function trapTab(e: KeyboardEvent, root: HTMLElement | null) {
  if (e.key !== 'Tab' || !root)
    return
  const list = focusableIn(root)
  if (list.length === 0)
    return
  const first = list[0]
  const last = list[list.length - 1]
  const active = document.activeElement as HTMLElement | null
  if (e.shiftKey) {
    if (active === first || !root.contains(active)) {
      e.preventDefault()
      last.focus()
    }
  }
  else {
    if (active === last) {
      e.preventDefault()
      first.focus()
    }
  }
}

function onReceiveKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && !busy.value) {
    e.preventDefault()
    closeReceive()
  }
  else if (e.key === 'Tab') {
    trapTab(e, receiveModalEl.value)
  }
}
function onEndKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    cancelEndShift()
  }
  else if (e.key === 'Tab') {
    trapTab(e, endModalEl.value)
  }
}

watch(receiving, async val => {
  if (val) {
    receiveReturnFocus = document.activeElement as HTMLElement | null
    document.addEventListener('keydown', onReceiveKey)
    await nextTick()

    const list = focusableIn(receiveModalEl.value)

    list[0]?.focus()
  }
  else {
    document.removeEventListener('keydown', onReceiveKey)
    if (receiveReturnFocus?.isConnected)
      receiveReturnFocus.focus()
  }
})
watch(settlementReady, async ready => {
  if (!ready || !receiving.value)
    return
  await nextTick()
  receiveModalEl.value?.querySelector<HTMLInputElement>('.settlement-input')?.focus()
})
watch(endingShift, async val => {
  if (val) {
    endReturnFocus = document.activeElement as HTMLElement | null
    document.addEventListener('keydown', onEndKey)
    await nextTick()

    const list = focusableIn(endModalEl.value)

    list[0]?.focus()
  }
  else {
    document.removeEventListener('keydown', onEndKey)
    if (endReturnFocus?.isConnected)
      endReturnFocus.focus()
  }
})
onBeforeUnmount(() => {
  shiftsRequest++
  document.removeEventListener('keydown', onReceiveKey)
  document.removeEventListener('keydown', onEndKey)
})

// Guard for click-overlay-to-close so we don't dismiss the modal when the user
// click-drags from inside the dialog and releases outside. Only close when both
// mousedown and mouseup happened on the overlay itself.
const overlayMouseDownTarget = ref<EventTarget | null>(null)
function onOverlayMouseDown(e: MouseEvent) {
  overlayMouseDownTarget.value = e.target
}
function onOverlayMouseUp(e: MouseEvent, closeFn: () => void) {
  if (overlayMouseDownTarget.value === e.currentTarget && e.target === e.currentTarget && !busy.value)
    closeFn()
  overlayMouseDownTarget.value = null
}
</script>

<template>
  <WorkspacePage class="page shifts-workspace">
    <PageHeader
      :title="t('Shifts')"
      :subtitle="t('Reconcile cashiers and receive end-of-shift settlements')"
      :eyebrow="t('shifts_workspace_eyebrow')"
    >
      <template #actions>
        <Button
          icon="refresh"
          :loading="loading"
          @click="loadShifts"
        >
          {{ t('Refresh') }}
        </Button><Button
          icon="download"
          :disabled="!filtered.length || loading || loadError"
          @click="exportShifts"
        >
          {{ t('Export') }}
        </Button>
      </template>
    </PageHeader>

    <section
      class="shift-overview"
      :aria-label="t('shifts_workspace_overview')"
      :aria-busy="loading"
    >
      <div class="shift-overview__cash">
        <div class="shift-overview__cash-head">
          <span class="shift-overview__symbol"><DesignIcon
            name="wallet"
            :size="22"
          /></span><span>{{ t('Physical cash to receive') }}</span>
        </div>
        <div
          v-if="loading"
          class="shift-overview__skeleton"
        />
        <strong
          v-else
          class="shift-overview__amount"
        >{{ fmtMoney(loadError ? null : summary.physicalCash) }}<small>UZS</small></strong>
        <p>{{ t('Compare this amount with banknotes in the drawer') }}</p>
        <div class="shift-overview__totals">
          <div><span>{{ t('Non-cash settlement') }}</span><strong>{{ loading ? '…' : fmtMoney(loadError ? null : summary.noncash) }} <small>UZS</small></strong></div><div><span>{{ t('All-tender settlement total') }}</span><strong>{{ loading ? '…' : fmtMoney(loadError ? null : summary.allTenders) }} <small>UZS</small></strong></div>
        </div>
        <small class="shift-overview__note">{{ t('All payment types — not a physical cash count') }}</small>
      </div>
      <div class="shift-overview__operations">
        <button
          type="button"
          class="shift-overview__count"
          :aria-pressed="statusF === 'ACTIVE'"
          @click="setStatus(statusF === 'ACTIVE' ? '' : 'ACTIVE')"
        >
          <span class="shift-overview__count-label"><DesignIcon
            name="clock"
            :size="18"
          />{{ t('Active now') }}</span><strong>{{ loading ? '…' : fmtNum(loadError ? null : summary.active) }}</strong><span>{{ t('live shifts') }}<DesignIcon
            name="arrowright"
            :size="17"
          /></span>
        </button>
        <button
          type="button"
          class="shift-overview__count"
          :aria-pressed="statusF === 'ENDED'"
          @click="setStatus(statusF === 'ENDED' ? '' : 'ENDED')"
        >
          <span class="shift-overview__count-label"><DesignIcon
            name="inbox"
            :size="18"
          />{{ t('Outstanding handovers') }}</span><strong>{{ loading ? '…' : fmtNum(loadError ? null : summary.awaiting) }}</strong><span>{{ t('Ended shifts awaiting manager confirmation') }}<DesignIcon
            name="arrowright"
            :size="17"
          /></span>
        </button>
        <div class="shift-overview__variance">
          <div><span>{{ t('Net variance') }}</span><small>{{ t('in current results') }}</small></div><strong :class="{ 'is-short': summary.netVariance < 0 }">{{ loading ? '…' : fmtMoney(loadError ? null : summary.netVariance) }} <small>UZS</small></strong>
        </div>
      </div>
    </section>

    <section
      class="shift-register"
      :aria-label="t('shifts_workspace_activity')"
    >
      <div class="shift-register__head">
        <div><h2>{{ t('shifts_workspace_activity') }}</h2><p>{{ t('shifts_workspace_scope') }}</p></div><div
          class="shift-register__view"
          :aria-label="t('shifts_workspace_view')"
        >
          <button
            type="button"
            :aria-label="t('shifts_workspace_list')"
            :title="t('shifts_workspace_list')"
            :aria-pressed="viewMode === 'list'"
            @click="viewMode = 'list'"
          >
            <DesignIcon
              name="list"
              :size="18"
            />
          </button><button
            type="button"
            :aria-label="t('shifts_workspace_cards')"
            :title="t('shifts_workspace_cards')"
            :aria-pressed="viewMode === 'cards'"
            @click="viewMode = 'cards'"
          >
            <DesignIcon
              name="grid"
              :size="18"
            />
          </button>
        </div>
      </div>
      <div class="shift-register__filters">
        <div class="shift-register__search">
          <Input
            v-model="searchQuery"
            icon="search"
            type="search"
            :aria-label="t('shifts_workspace_search')"
            :placeholder="t('shifts_workspace_search')"
          />
        </div>
        <Select
          :model-value="cashierId === '' ? '' : String(cashierId)"
          icon="user"
          :placeholder="t('All cashiers')"
          :options="cashierSelectOptions"
          @update:model-value="cashierId = $event ? Number($event) : ''"
        />
        <Select
          :model-value="statusF"
          icon="filter"
          :placeholder="t('All statuses')"
          :options="statusSelectOptions"
          @update:model-value="setStatus($event)"
        />
        <DateRangePicker
          v-model="dateRange"
          :enable-time="false"
          :placeholder="t('All time')"
        />
        <button
          type="button"
          class="shift-register__live"
          role="switch"
          :aria-checked="liveOnly"
          @click="toggleLive"
        >
          <span
            class="switch"
            :class="{ 'is-on': liveOnly }"
            aria-hidden="true"
          />{{ t('Live only') }}
        </button>
      </div>
      <div
        v-if="activeFilters.length"
        class="shift-register__chips"
      >
        <span
          v-for="filter in activeFilters"
          :key="filter.k"
          class="chip"
        ><span>{{ filter.label }}: <b>{{ filter.val }}</b></span><button
          type="button"
          :aria-label="`${t('Clear filters')}: ${filter.label}`"
          @click="filter.clear()"
        ><DesignIcon
          name="close"
          :size="14"
        /></button></span><button
          type="button"
          @click="clearAllFilters"
        >
          {{ t('Clear all') }}
        </button>
      </div>
    </section>

    <div class="shift-results-heading">
      <span>{{ loading ? t('Loading') : t('shifts_workspace_count', { count: fmtNum(filtered.length), total: fmtNum(totalShifts ?? shifts.length) }) }}</span><Select
        v-model="sortBy"
        icon="sort"
        :options="sortOptions"
        :aria-label="t('shifts_workspace_sort')"
      />
    </div>
    <div
      v-if="loading"
      class="shift-record-grid"
      :class="{ 'is-cards': viewMode === 'cards' }"
      role="status"
      :aria-label="t('Loading')"
    >
      <div
        v-for="i in 2"
        :key="i"
        class="shift-record-skeleton"
      >
        <div><span /><span /></div><span /><span /><span />
      </div>
    </div>
    <StateFill
      v-else-if="loadError"
      class="shift-results-state"
      error
      icon="alert"
      :title="t('Failed to load shifts')"
      :sub="t('shifts_workspace_error_detail')"
    >
      <template #action>
        <Button
          icon="refresh"
          @click="loadShifts"
        >
          {{ t('Retry') }}
        </Button>
      </template>
    </StateFill>
    <StateFill
      v-else-if="!filtered.length"
      class="shift-results-state"
      icon="clock"
      :title="t('No shifts match your filters')"
      :sub="t('Adjust the cashier, status or date range.')"
    >
      <template #action>
        <Button @click="clearAllFilters">
          {{ t('Clear filters') }}
        </Button>
      </template>
    </StateFill>
    <ShiftLedger
      v-else-if="viewMode !== 'cards'"
      :shifts="orderedShifts"
      @receive="openReceive"
      @report="openReport"
      @end="askEndShift"
    />
    <div
      v-else
      class="shift-record-grid"
      :class="{ 'is-cards': viewMode === 'cards' }"
    >
      <ShiftCard
        v-for="shift in orderedShifts"
        :key="shift.id"
        :shift="shift"
        @receive="openReceive(shift)"
        @report="openReport(shift)"
        @end="askEndShift(shift)"
      />
    </div>
    <div
      v-if="hasMore && !loadError && !loading"
      class="shift-load-more"
    >
      <Button
        icon="plus"
        :loading="moreLoading"
        @click="loadMore"
      >
        {{ t('shifts_workspace_load_more') }}
      </Button>
    </div>

    <!-- Receive-money modal -->
    <div
      v-if="receiving"
      class="overlay workspace-overlay workspace-overlay--inline"
      @mousedown="onOverlayMouseDown"
      @mouseup="onOverlayMouseUp($event, closeReceive)"
    >
      <form
        ref="receiveModalEl"
        class="modal modal--receive"
        role="dialog"
        aria-modal="true"
        :aria-label="t('Receive money')"
        @submit.prevent="canConfirmSettlement && !busy && confirmReceive()"
        @mousedown.stop
        @mouseup.stop
      >
        <div class="modal__head">
          <div class="modal__identity">
            <div
              class="modal__symbol"
              aria-hidden="true"
            >
              <DesignIcon
                name="ws-shift"
                :size="24"
                :weight="1.6"
              />
            </div>
            <div class="modal__copy">
              <h3 class="modal__title">
                {{ t('Receive money') }} &middot; {{ fullName(receiving.user) }}
              </h3>
              <div class="modal__sub">
                {{ t('Shift') }} #{{ receiving.id }} &middot; {{ t('Cash, Card and Payme') }}
              </div>
            </div>
          </div>
          <button
            type="button"
            class="iconaction modal__close"
            :title="t('Close')"
            :aria-label="t('Close')"
            :disabled="busy"
            @click="closeReceive"
          >
            <DesignIcon
              name="close"
              :size="17"
            />
          </button>
        </div>
        <div class="modal__body">
          <div
            v-if="settlementLoading"
            class="settlement-state"
            role="status"
            :aria-label="t('Loading')"
          >
            <div class="shift-record-skeleton">
              <span /><span /><span />
            </div>
          </div>

          <div
            v-else-if="settlementError"
            class="settlement-state settlement-state--error"
          >
            <p>{{ t('Failed to load settlement') }}</p>
            <button
              type="button"
              class="btn btn--ghost btn--sm"
              @click="receiving && loadSettlement(receiving.id)"
            >
              {{ t('Retry') }}
            </button>
          </div>

          <template v-else-if="settlementReady">
            <div
              v-if="!settlementSetup.ok"
              class="settlement-contract-block"
              role="alert"
            >
              <strong>{{ t('Backend upgrade required for physical cash') }}</strong>
              <span>{{ t(`Reconcile setup ${settlementSetup.reason}`) }}</span>
            </div>

            <template v-else>
              <div class="settlement-hero">
                <span>{{ t('Physical cash to receive') }}</span>
                <strong class="mono">{{ fmtMoney(moneyNumber(settlementSetup.cashExpected)) }} UZS</strong>
                <small>{{ t('Compare this amount with banknotes in the drawer') }}</small>
              </div>

              <p class="settlement-intro">
                {{ t('Check the cash, total card and Payme amounts before confirming.') }}
              </p>

              <div class="settlement-grid reconcile-table">
                <div class="settlement-grid__head">
                  <span>{{ t('Payment type') }}</span>
                  <span>{{ t('Counted') }}</span>
                  <span>{{ t('System expected') }}</span>
                  <span>{{ t('Difference') }}</span>
                </div>

                <div
                  v-for="method in visibleTenders"
                  :key="method"
                  class="settlement-grid__row"
                >
                  <div class="settlement-grid__tender">
                    {{ tenderLabel(method) }}
                    <small v-if="cashierCountNote(method)">{{ cashierCountNote(method) }}</small>
                  </div>
                  <div class="settlement-grid__input">
                    <Input
                      :model-value="countedByTender[method]"
                      class="settlement-input"
                      inputmode="numeric"
                      :aria-label="`${tenderLabel(method)}: ${t('Counted')}`"
                      :placeholder="t('Enter counted amount')"
                      @input="setCountedAmount(method, $event)"
                    />
                  </div>
                  <div
                    class="settlement-grid__expected"
                    :data-label="t('System expected')"
                  >
                    <span
                      v-if="countedOf(method) !== null && expectedOf(method) !== null"
                      class="mono"
                    >
                      {{ fmtMoney(expectedOf(method)) }}
                    </span>
                    <span
                      v-else
                      class="tertiary"
                    >&mdash;</span>
                  </div>
                  <div
                    class="settlement-grid__difference"
                    :data-label="t('Difference')"
                  >
                    <template v-if="tenderVariance(method) !== null">
                      <span
                        class="settlement-difference"
                        :class="{
                          'settlement-difference--exact': tenderVariance(method) === 0,
                          'settlement-difference--over': (tenderVariance(method) ?? 0) > 0,
                          'settlement-difference--short': (tenderVariance(method) ?? 0) < 0,
                        }"
                      >
                        {{ tenderVariance(method) === 0 ? t('Exact') : (tenderVariance(method) ?? 0) > 0 ? t('Over') : t('Short') }}
                        {{ tenderVariance(method) === 0 ? '' : `${(tenderVariance(method) ?? 0) > 0 ? '+' : '-'}${fmtMoney(Math.abs(tenderVariance(method) ?? 0))}` }}
                      </span>
                    </template>
                    <span
                      v-else
                      class="tertiary"
                    >{{ countedOf(method) === null && settlementRowIsUncounted(rowForTender(method) ?? {}) ? t('Variance unavailable') : '—' }}</span>
                  </div>
                </div>
              </div>

              <div class="settlement-total">
                <div>
                  <div class="settlement-total__label">
                    {{ t('Total received') }}
                  </div>
                  <div class="settlement-total__hint">
                    {{ t('Cash, Card and Payme') }}
                  </div>
                </div>
                <strong class="mono">{{ fmtMoney(totalReceived) }} <span>UZS</span></strong>
              </div>

              <label
                class="field"
                style="margin-top:16px;"
              >
                <span class="field__label">{{ t('Note (optional)') }}</span>
                <Textarea
                  v-model="note"
                  class="control"
                  :placeholder="t('Reason for any difference, deposits, etc.')"
                />
              </label>
            </template>
          </template>
        </div>
        <div
          class="modal__foot"
          style="justify-content:flex-end;"
        >
          <button
            type="submit"
            class="btn btn--primary"
            :class="{ 'is-loading': busy }"
            :disabled="!canConfirmSettlement || busy"
          >
            <DesignIcon
              name="check"
              :size="18"
            />
            {{ t('Confirm settlement') }}
          </button>
        </div>
      </form>
    </div>

    <!-- End-shift confirm modal -->
    <div
      v-if="endingShift"
      class="overlay workspace-overlay workspace-overlay--inline"
      @mousedown="onOverlayMouseDown"
      @mouseup="onOverlayMouseUp($event, cancelEndShift)"
    >
      <div
        ref="endModalEl"
        class="modal modal--end"
        role="dialog"
        aria-modal="true"
        :aria-label="t('End this shift?')"
        @mousedown.stop
        @mouseup.stop
      >
        <div class="modal__head">
          <div class="modal__identity">
            <div
              class="modal__symbol"
              aria-hidden="true"
            >
              <DesignIcon
                name="ws-shift"
                :size="24"
                :weight="1.6"
              />
            </div>
            <div class="modal__copy">
              <h3 class="modal__title">
                {{ t('End this shift?') }}
              </h3>
              <div class="modal__sub">
                {{ t('Shift') }} #{{ endingShift.id }} · {{ fullName(endingShift.user) }}
              </div>
            </div>
          </div>
          <button
            type="button"
            class="iconaction modal__close"
            :title="t('Close')"
            :aria-label="t('Close')"
            :disabled="busy"
            @click="cancelEndShift"
          >
            <DesignIcon
              name="close"
              :size="17"
            />
          </button>
        </div>
        <div class="modal__body">
          <p style="font-size:14px;color:var(--text-secondary);line-height:1.5;margin:0;">
            {{ t('Once ended, the cashier will no longer be able to take orders and the drawer must be reconciled before the next shift starts.') }}
          </p>
        </div>
        <div
          class="modal__foot"
          style="justify-content:flex-end;"
        >
          <button
            type="button"
            class="btn btn--primary"
            :disabled="busy"
            @click="confirmEndShift"
          >
            {{ busy ? t('Ending…') : t('End shift') }}
          </button>
        </div>
      </div>
    </div>
  </WorkspacePage>
</template>

<route lang="yaml">
meta:
  action: manage
  subject: all
</route>

<style scoped>
.settlement-contract-block {
  display: grid;
  gap: 4px;
  padding: var(--sp-4);
  border: 1px solid var(--warning-border);
  border-radius: var(--r-md);
  background: var(--warning-weak);
  color: var(--warning);
}

.settlement-contract-block span { color: var(--text-secondary); font-size: 13px; }

.settlement-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 3px var(--sp-3);
  align-items: baseline;
  margin-bottom: var(--sp-4);
  padding: 12px 14px;
  border: 1px solid var(--success-border);
  border-radius: var(--r-md);
  background: var(--success-weak);
}

.settlement-hero span { color: var(--text); font-weight: 700; }
.settlement-hero strong { color: var(--success); font-size: 18px; }
.settlement-hero small { grid-column: 1 / -1; color: var(--text-secondary); }

.settlement-grid__tender small {
  display: block;
  margin-top: 2px;
  color: var(--text-tertiary);
  font-size: 10px;
  font-weight: 500;
}
/* Responsive shift cards grid — auto-fill with sensible breakpoints */
/* The toolbar should read as a compact set of filters, not four equal-width
   fields. Keep the date range flexible without stretching the selects. */

/* Hero amount in each shift card — long money values may overflow at phone widths */

/* Modals — collapse hard-coded widths on narrow viewports (canonical phone breakpoint 768px) */
.modal--receive {
  max-width: 680px;
  width: 100%;
}
.modal--end {
  max-width: 440px;
  width: 100%;
}

.settlement-state {
  display: grid;
  min-height: 144px;
  place-items: center;
  gap: var(--sp-3);
  color: var(--text-secondary);
  text-align: center;
}

.settlement-state p {
  margin: 0;
}

.settlement-state--error {
  color: var(--error);
}

.settlement-intro {
  margin: 0 0 var(--sp-4);
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.45;
}

.settlement-grid {
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
}

.settlement-grid__head,
.settlement-grid__row {
  display: grid;
  grid-template-columns: minmax(88px, 1fr) minmax(116px, 1.1fr) minmax(96px, 0.9fr) minmax(88px, 0.85fr);
  align-items: center;
  gap: var(--sp-3);
  padding: 10px 12px;
}

.settlement-grid__head {
  background: var(--surface-inset);
  color: var(--text-tertiary);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.settlement-grid__row + .settlement-grid__row {
  border-top: 1px solid var(--border);
}

.settlement-grid__tender {
  min-width: 0;
  font-size: 13px;
  font-weight: 650;
}

.settlement-grid__expected,
.settlement-grid__difference {
  min-width: 0;
  font-size: 13px;
  text-align: right;
}

.settlement-input {
  width: 100%;
  min-width: 0;
  height: 34px;
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-variant-numeric: tabular-nums;
  padding: 0 9px;
}

.settlement-input:focus {
  border-color: var(--primary);
  outline: 2px solid color-mix(in srgb, var(--primary) 20%, transparent);
  outline-offset: 1px;
}

.settlement-difference {
  display: inline-flex;
  justify-content: flex-end;
  gap: 4px;
  font-size: 12px;
  font-weight: 650;
  white-space: nowrap;
}

.settlement-difference--exact { color: var(--text-secondary); }
.settlement-difference--over { color: var(--success); }
.settlement-difference--short { color: var(--error); }

.settlement-total {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-4);
  margin-top: var(--sp-4);
  padding: 12px 14px;
  border: 1px solid var(--success-border);
  border-radius: var(--r-md);
  background: var(--success-weak);
}

.settlement-total__label {
  color: var(--text);
  font-size: 14px;
  font-weight: 700;
}

.settlement-total__hint {
  margin-top: 2px;
  color: var(--text-secondary);
  font-size: 12px;
}

.settlement-total strong {
  color: var(--success);
  font-size: 17px;
  white-space: nowrap;
}

.settlement-total strong span {
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 600;
}

@media (max-width: 600px) {

  .settlement-grid__head {
    display: none;
  }

  .settlement-grid__row {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    grid-template-areas:
      'tender input'
      'expected difference';
    gap: 8px 12px;
  }

  .settlement-grid__tender { grid-area: tender; }
  .settlement-grid__input { grid-area: input; }
  .settlement-grid__expected { grid-area: expected; text-align: left; }
  .settlement-grid__difference { grid-area: difference; }

  .settlement-grid__expected::before,
  .settlement-grid__difference::before {
    display: block;
    margin-bottom: 2px;
    color: var(--text-tertiary);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .settlement-grid__expected::before,
  .settlement-grid__difference::before { content: attr(data-label); }
}

@media (max-width: 768px) {
  .modal--receive,
  .modal--end {
    max-width: 100%;
    margin: var(--sp-3);
  }
}

/* KPI strip — keep 2-up on phone (cols-4 → 2 cols at 768) instead of collapsing to 1 col */
</style>
