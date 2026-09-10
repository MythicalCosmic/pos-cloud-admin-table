<script setup lang="ts">
import Input from '@/components/design/Input.vue'
import PageHeader from '@/components/design/PageHeader.vue'
/* ============================================================
   ANALYTICS · SHIFT HANDOVER REPORT
   Ported 1:1 from .tmp-alpha-design/alpha-design-source/Analytics.ShiftHandover.jsx
   Plain HTML + design-shell.css. Inline SVG charts (Donut, Bar,
   HBar) — no Vuetify components on this page.
   ============================================================ */
import axios from '@/plugins/axios'
import { STATUS_TONE } from '@/constants/statusTones'
import Modal from '@/components/design/Modal.vue'
import {
  methodIsManagerConfirmed,
  moneyNumber,
  moneyText,
  reconciledCash,
  settlementRowIsUncounted,
} from '@/utils/shiftMoney'

const { t } = useI18n({ useScope: 'global' })
const { snackbar, snackbarMsg, snackbarColor, notify } = useNotify()
const { formatDate } = useFormatters()
const route = useRoute()
const router = useRouter()

// ============================================================
// Existing data wiring (UNCHANGED)
// ============================================================
const shiftIdInput = ref<number | null>(Number(route.query.shift) || null)
const data = ref<any>(null)
const loading = ref(false)
const loadError = ref<string | null>(null)
const exporting = ref(false)
const loadedShiftId = ref<number | null>(null)
let reportRequestId = 0

async function load() {
  loadError.value = null
  const requestedShiftId = Number(shiftIdInput.value)
  if (!Number.isInteger(requestedShiftId) || requestedShiftId <= 0) {
    data.value = null
    loadedShiftId.value = null
    return
  }
  const requestId = ++reportRequestId
  loading.value = true
  data.value = null
  loadedShiftId.value = null
  try {
    const res = await axios.get(`/analytics/shifts/${requestedShiftId}/report`)
    if (requestId !== reportRequestId)
      return
    data.value = res.data?.data ?? res.data
    loadedShiftId.value = Number(data.value?.shift?.id) || requestedShiftId
    router.replace({ query: { ...route.query, shift: String(requestedShiftId) } })
  }
  catch (e: any) {
    if (requestId !== reportRequestId)
      return
    const msg = e?.response?.data?.message ?? t('Failed to load')
    notify(msg, 'error')
    loadError.value = msg
    data.value = null
  }
  finally {
    if (requestId === reportRequestId)
      loading.value = false
  }
}

async function doExport() {
  if (!loadedShiftId.value || exporting.value) return
  const shiftId = loadedShiftId.value
  exporting.value = true
  try {
    const res = await axios.get(
      `/analytics/shifts/${shiftId}/report/export`,
      { responseType: 'blob' },
    )
    const blob = new Blob([res.data], { type: res.headers?.['content-type'] || 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `shift-${shiftId}-handover.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    notify(t('Export downloaded'), 'success')
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Export failed'), 'error')
  }
  finally {
    exporting.value = false
  }
}

onMounted(load)

const shift = computed<any>(() => data.value?.shift)
const receipts = computed<any[]>(() => data.value?.receipts ?? [])
function isCancelledReceipt(receipt: any): boolean {
  return ['CANCELED', 'CANCELLED'].includes(String(receipt?.status ?? '').toUpperCase())
}
const sortedReceipts = computed<any[]>(() => receipts.value
  .map((receipt, index) => ({ receipt, index }))
  .sort((a, b) => Number(isCancelledReceipt(b.receipt)) - Number(isCancelledReceipt(a.receipt)) || a.index - b.index)
  .map(({ receipt }) => receipt))
const products = computed<any[]>(() => data.value?.products ?? [])

const PRODUCTS_PREVIEW = 10
const showAllProducts = ref(false)
const productsShown = computed(() => showAllProducts.value
  ? products.value
  : products.value.slice(0, PRODUCTS_PREVIEW))

const selectedReceipt = ref<any>(null)
const selectedItems = ref<any[]>([])
const selectedLoading = ref(false)

async function openReceipt(r: any) {
  selectedReceipt.value = r
  if (Array.isArray(r.items) && r.items.length) {
    selectedItems.value = r.items
    return
  }
  selectedItems.value = []
  selectedLoading.value = true
  try {
    const res = await axios.get(`/orders/${r.order_id}`)
    const d = res.data?.data ?? res.data
    selectedItems.value = d?.items ?? d?.order?.items ?? []
  }
  catch { selectedItems.value = [] }
  finally { selectedLoading.value = false }
}
function closeReceipt() {
  selectedReceipt.value = null
  selectedItems.value = []
}
function receiptId(r: any) {
  return r.order_id ?? '—'
}
const distribution = computed<any>(() => data.value?.distribution)
const settlement = computed<any[]>(() => data.value?.settlement ?? [])
const cashExpenses = computed<any[]>(() => data.value?.cash_expenses ?? [])
const cashExpensesTotal = computed(() =>
  cashExpenses.value.reduce((acc, e: any) => acc + Number(e.total || 0), 0),
)
function settlementDiffColor(diff: unknown): string {
  const n = moneyNumber(moneyText(diff))
  if (n == null) return 'neutral'
  if (Math.abs(n) < 0.01) return 'success'
  return n < 0 ? 'error' : 'warning'
}
function settlementDifferenceText(row: any): string {
  return moneyText(row?.difference) == null ? t('Variance unavailable') : fmtMoney(row.difference)
}
function cashierCountText(row: any): string {
  return settlementRowIsUncounted(row) ? t('Cashier count not submitted') : fmtMoney(row?.counted)
}
function managerConfirmedText(row: any): string {
  return methodIsManagerConfirmed(row) ? fmtMoney(row?.confirmed) : '—'
}

function fmtSec(s: number | null | undefined): string {
  if (!s && s !== 0) return '—'
  const m = Math.floor((s as number) / 60)
  const sec = (s as number) % 60
  return `${m}${t('time_min_suffix')} ${sec}${t('time_sec_suffix')}`
}

// ============================================================
// Number formatters (mirror bundle Fmt helpers)
// NB = U+202F narrow no-break space — kept literal per convention
// ============================================================
const NB = ' '
function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—'
  const neg = Number(n) < 0
  const s = Math.round(Math.abs(Number(n))).toString().replace(/\B(?=(\d{3})+(?!\d))/g, NB)
  return (neg ? '−' : '') + s
}
function fmtMoney(n: number | null | undefined): string { return fmtNum(n) }
function fmtAbbr(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—'
  const v = Number(n)
  const a = Math.abs(v)
  const trim2 = (x: number) => x.toFixed(2).replace(/\.?0+$/, '')
  const trim1 = (x: number) => x.toFixed(1).replace(/\.0$/, '')
  let out: string
  if (a >= 1e9) out = `${trim2(a / 1e9)}B`
  else if (a >= 1e6) out = `${trim2(a / 1e6)}M`
  else if (a >= 1e3) out = `${trim1(a / 1e3)}K`
  else out = String(Math.round(a))
  return (v < 0 ? '−' : '') + out
}
function fmtPct(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—'
  return `${Number(n).toFixed(digits).replace(/\.0$/, '')}%`
}

// ============================================================
// Status / tone maps — shared map at @/constants/statusTones
// ============================================================
function tone(v: string | undefined | null): string {
  if (!v) return 'neutral'
  return STATUS_TONE[String(v).toUpperCase()] || 'neutral'
}
function titleCase(v: any): string {
  if (!v) return '—'
  const s = String(v)
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}
function reconTone(rec: any): string {
  if (!reconciledCash({ reconciliation: rec })) return 'neutral'
  if (rec.is_short) return 'error'
  if (rec.is_over) return 'warning'
  return moneyNumber(moneyText(rec.difference)) === 0 ? 'success' : 'warning'
}
function reconColor(rec: any): string {
  const tone = reconTone(rec)
  if (tone === 'error') return 'var(--error)'
  if (tone === 'warning') return 'var(--warning)'
  if (tone === 'success') return 'var(--success)'
  return 'var(--text-tertiary)'
}

// ============================================================
// Orders-by-hour bar data
// ============================================================
const byHour = computed<any[]>(() => {
  const series = distribution.value?.by_hour ?? []
  const maxV = series.reduce((m: number, b: any) => Math.max(m, Number(b.orders) || 0), 0)
  return series.map((b: any) => ({
    label: `${String(b.hour).padStart(2, '0')}:00`,
    value: Number(b.orders) || 0,
    peak: Number(b.orders) === maxV && maxV > 0,
  }))
})
const peakHourLabel = computed<string | null>(() => {
  const p = byHour.value.find(b => b.peak)
  if (p) return p.label
  if (data.value?.peak_hour !== undefined && data.value?.peak_hour !== null)
    return `${String(data.value.peak_hour).padStart(2, '0')}:00`
  return null
})

// ============================================================
// Top products (HBar)
// ============================================================
const topProductsForChart = computed(() =>
  products.value.slice(0, 8).map((p: any) => ({
    name: p.name,
    value: Number(p.revenue) || 0,
    units: Number(p.units_sold) || 0,
  })),
)
const topProductMax = computed(() => Math.max(1, ...topProductsForChart.value.map(p => p.value)))

// ============================================================
// niceTicks utility (verbatim port from charts.jsx)
// ============================================================
function niceTicks(max: number, count: number): { ticks: number[]; top: number } {
  const raw = (max || 1) / count
  const mag = 10 ** Math.floor(Math.log10(raw || 1))
  const norm = (raw || 1) / mag
  let step: number
  if (norm <= 1) step = 1
  else if (norm <= 2) step = 2
  else if (norm <= 2.5) step = 2.5
  else if (norm <= 5) step = 5
  else step = 10
  step *= mag
  const top = Math.ceil((max || 1) / step) * step
  const ticks: number[] = []
  for (let v = 0; v <= top + 1e-6; v += step) ticks.push(v)
  return { ticks, top }
}

// ============================================================
// BarChart geometry (orders by hour)
// padL 44, padR 12, padT 14, padB 28, height 236 (per source)
// ============================================================
const BAR_PAD_L = 44
const BAR_PAD_R = 12
const BAR_PAD_T = 14
const BAR_PAD_B = 28
const BAR_H = 236
const BAR_W = ref(700)
const barEl = ref<HTMLElement | null>(null)
const barHover = ref<number | null>(null)

watch(barEl, (el, _old, onCleanup) => {
  if (!el) return
  const ro = new ResizeObserver((es) => {
    const e = es[0]
    if (e) BAR_W.value = e.contentRect.width
  })
  ro.observe(el)
  BAR_W.value = el.clientWidth
  onCleanup(() => ro.disconnect())
}, { flush: 'post', immediate: true })

const barMax = computed(() => Math.max(1, ...byHour.value.map(d => d.value)))
const barTicks = computed(() => niceTicks(barMax.value, 4))
const barIW = computed(() => Math.max(10, BAR_W.value - BAR_PAD_L - BAR_PAD_R))
const barIH = BAR_H - BAR_PAD_T - BAR_PAD_B
const barBand = computed(() => barIW.value / Math.max(1, byHour.value.length))
const barWidth = computed(() => Math.min(barBand.value * 0.62, 40))
function barY(v: number): number {
  return BAR_PAD_T + barIH - (v / (barTicks.value.top || 1)) * barIH
}

// ============================================================
// Entrance animations (parity with bundle anim.jsx::useShown)
// ============================================================
const barShown = useShown(120)
const hbarShown = useShown(140)

// ============================================================
// Header KPIs — count-ups
// ============================================================
const revenueT = computed(() => Number(shift.value?.money?.revenue ?? 0))
const cashT = computed(() => Number(shift.value?.money?.cash ?? 0))
function paymentAmount(source: any, method: string): number {
  const raw = source?.[method] ?? source?.[method.toLowerCase()]

  return Number(raw?.amount ?? raw ?? 0) || 0
}
function cardPaymentTotal(money: any): number {
  const byTender = money?.card_detail ?? money?.payment_mix ?? {}
  const detailedTotal = ['CARD', 'HUMO', 'UZCARD'].reduce(
    (total, method) => total + paymentAmount(byTender, method),
    0,
  )

  // The current report contract supplies `money.card` as the combined total;
  // the detail/mix calculation also supports older deployments that expose
  // Humo, Uzcard, and generic card separately.
  return detailedTotal || paymentAmount(money, 'CARD')
}
const cardT = computed(() => cardPaymentTotal(shift.value?.money))
const aovT = computed(() => Number(shift.value?.money?.avg_order_value ?? 0))
const revenueCounted = useCountUp(revenueT)
const cashCounted = useCountUp(cashT)
const cardCounted = useCountUp(cardT)
const aovCounted = useCountUp(aovT)

const cashPctOfRevenue = computed(() => {
  const r = revenueT.value
  return r > 0 ? Math.round((cashT.value / r) * 100) : 0
})
const cardPctOfRevenue = computed(() => {
  const r = revenueT.value
  return r > 0 ? Math.round((cardT.value / r) * 100) : 0
})

function initialsOf(name: string | undefined | null): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return ((parts[0][0] || '') + (parts[parts.length - 1][0] || '')).toUpperCase()
}
function shiftDurationLabel(): string {
  const dm = Number(shift.value?.duration_minutes || 0)
  const h = Math.floor(dm / 60)
  const m = dm % 60
  return h
    ? `${h}${t('hour_suffix')} ${String(m).padStart(2, '0')}${t('time_min_suffix')}`
    : `${m}${t('time_min_suffix')}`
}
</script>

<template>
  <div class="page">
    <!-- ===== Page head ===== -->
    <PageHeader :title="t('Shift Handover Report')" :subtitle="t('Per-shift performance, payments and punctuality')">
<template #actions><div class="field shift-handover__shift-field">
          <div class="field__label">
            {{ t('Shift ID') }}
          </div>
          <Input
          v-model.number="shiftIdInput"
          icon="search"
          type="number"
          :placeholder="t('Enter shift id')"
          @keydown.enter="load"
        />
        </div><button class="btn btn--primary shift-handover__load-btn" :class="{ 'is-loading': loading }" :disabled="loading" style="align-self:flex-end;" @click="load">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 17 9 11 13 15 21 7" /><polyline points="15 7 21 7 21 13" /></svg>
          {{ t('Load') }}
        </button></template>
</PageHeader>

    <!-- ===== Empty / loading boot ===== -->
    <div v-if="!shift && !loading && loadError" class="card">
      <div class="statefill" style="padding: 64px 24px;">
        <div class="statefill__icon" style="color: var(--error);">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
        </div>
        <div class="statefill__title">
          {{ t('Could not load shift report') }}
        </div>
        <div class="statefill__sub">
          {{ loadError }}
        </div>
        <div class="row" style="gap:10px; margin-top:18px; justify-content:center; flex-wrap:wrap;">
          <button class="btn btn--primary" :class="{ 'is-loading': loading }" :disabled="loading" @click="load">
            {{ t('Retry') }}
          </button>
          <button class="btn btn--secondary" @click="router.push('/shifts-analytics')">
            {{ t('Browse shifts') }}
          </button>
        </div>
      </div>
    </div>
    <div v-else-if="!shift && !loading" class="card">
      <div class="statefill" style="padding: 64px 24px;">
        <div class="statefill__icon">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
        </div>
        <div class="statefill__title">
          {{ t('Pick a shift to load the handover report') }}
        </div>
        <div class="statefill__sub">
          {{ t('Enter a shift ID above and press Load') }}
        </div>
        <div class="row" style="gap:10px; margin-top:18px; justify-content:center; flex-wrap:wrap;">
          <button class="btn btn--secondary" @click="router.push('/shifts-analytics')">
            {{ t('Browse shifts') }}
          </button>
        </div>
      </div>
    </div>

    <div v-else-if="loading && !shift" class="card">
      <div class="card__body" style="padding: var(--sp-5);">
        <div class="skel" style="height:120px;border-radius:10px;margin-bottom:var(--sp-5);" />
        <div class="grid cols-4" style="margin-bottom:var(--sp-5);">
          <div v-for="i in 4" :key="`bs${i}`" class="skel" style="height:118px;border-radius:10px;" />
        </div>
        <div class="skel" style="height:300px;border-radius:10px;" />
      </div>
    </div>

    <template v-else-if="shift">
      <!-- ===== Shift summary banner ===== -->
      <div class="card" style="margin-bottom:var(--sp-5);">
        <div class="row between shift-handover__summary" style="padding:var(--sp-5); flex-wrap:wrap; gap:16px;">
          <div class="row" style="gap:16px; flex-wrap:wrap; min-width:0;">
            <div class="avatar" style="width:48px;height:48px;flex-basis:48px;font-size:17px;">
              {{ initialsOf(data?.cashier?.name) }}
            </div>
            <div>
              <div class="row" style="gap:10px;align-items:center;flex-wrap:wrap;">
                <span style="font-size:var(--fs-h2); font-weight:700; letter-spacing:-0.01em;">{{ data?.cashier?.name ?? t('Unknown') }}</span>
                <span class="badge badge--dot" :class="`t-${tone(shift.status)}`">{{ shift.status ? t(`shift_status_${shift.status}`) : '—' }}</span>
              </div>
              <div class="muted" style="font-size:13px;margin-top:2px;">
                {{ t('Shift') }} {{ t('id_prefix') }}{{ loadedShiftId }} · {{ formatDate(shift.start_time) }} —
                {{ shift.end_time ? formatDate(shift.end_time) : t('in progress') }} ·
                {{ shiftDurationLabel() }}
              </div>
            </div>
          </div>
          <div class="row shift-handover__summary-kpis" style="gap:28px; flex-wrap:wrap;">
            <div class="shift-handover__summary-kpi" style="text-align:right;">
              <div class="kpi__label">
                {{ t('Receipts') }}
              </div>
              <div class="mono shift-handover__summary-kpi-value" style="font-size:20px;font-weight:700;margin-top:2px;color:var(--text);max-width:180px;">
                {{ fmtNum(data?.receipt_count) }}
              </div>
            </div>
            <div class="shift-handover__summary-kpi" style="text-align:right;">
              <div class="kpi__label">
                {{ t('Avg / hour') }}
              </div>
              <div class="mono shift-handover__summary-kpi-value" style="font-size:20px;font-weight:700;margin-top:2px;color:var(--text);max-width:180px;">
                {{ Number(shift.speed?.orders_per_hour ?? 0).toFixed(1) }}
              </div>
            </div>
            <div v-if="data?.best_seller" class="shift-handover__summary-kpi" style="text-align:right;">
              <div class="kpi__label">
                {{ t('Top product') }}
              </div>
              <div class="shift-handover__summary-kpi-value" style="font-size:15px;font-weight:700;margin-top:2px;color:var(--primary);max-width:180px;overflow-wrap:anywhere;">
                {{ data.best_seller.name }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ===== KPI row ===== -->
      <div class="grid cols-4 shift-handover__kpi-grid" style="margin-bottom:var(--sp-5);">
        <div class="kpi">
          <div class="kpi__top">
            <div class="kpi__icon t-primary">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12V7H5a2 2 0 010-4h14v4" /><path d="M3 5v14a2 2 0 002 2h16v-5" /><path d="M18 12a2 2 0 000 4h4v-4z" /></svg>
            </div>
            <div class="kpi__label">
              {{ t('Revenue') }}
            </div>
          </div>
          <div class="kpi__value">
            {{ fmtAbbr(revenueCounted) }}<span class="kpi__unit">{{ t('currency_uzs') }}</span>
          </div>
          <div class="kpi__foot">
            <span class="kpi__subtext">{{ fmtAbbr(shift.money?.revenue_per_hour) }} / {{ t('hour_suffix') }}</span>
          </div>
        </div>

        <div class="kpi">
          <div class="kpi__top">
            <div class="kpi__icon t-success">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6" /><path d="M18.09 10.37A6 6 0 1115.61 21.66" /><line x1="7" y1="6" x2="7" y2="10" /></svg>
            </div>
            <div class="kpi__label">
              {{ t('Cash') }}
            </div>
          </div>
          <div class="kpi__value">
            {{ fmtAbbr(cashCounted) }}<span class="kpi__unit">{{ t('currency_uzs') }}</span>
          </div>
          <div class="kpi__foot">
            <span class="kpi__subtext">{{ cashPctOfRevenue }}% {{ t('of revenue') }}</span>
          </div>
        </div>

        <div class="kpi">
          <div class="kpi__top">
            <div class="kpi__icon t-info">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /></svg>
            </div>
            <div class="kpi__label">
              {{ t('Card') }}
            </div>
          </div>
          <div class="kpi__value">
            {{ fmtAbbr(cardCounted) }}<span class="kpi__unit">{{ t('currency_uzs') }}</span>
          </div>
          <div class="kpi__foot">
            <span class="kpi__subtext">{{ cardPctOfRevenue }}% {{ t('of revenue') }}</span>
          </div>
        </div>

        <div class="kpi">
          <div class="kpi__top">
            <div class="kpi__icon t-neutral">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 17 9 11 13 15 21 7" /><polyline points="15 7 21 7 21 13" /></svg>
            </div>
            <div class="kpi__label">
              {{ t('Avg Order Value') }}
            </div>
          </div>
          <div class="kpi__value">
            {{ fmtAbbr(aovCounted) }}<span class="kpi__unit">{{ t('currency_uzs') }}</span>
          </div>
          <div class="kpi__foot">
            <span class="kpi__subtext">{{ t('vs shift avg') }}</span>
          </div>
        </div>
      </div>

      <!-- ===== Orders by hour ===== -->
      <div style="margin-bottom:var(--sp-5);">
        <div class="card">
          <div class="card__head">
            <div class="card__head-text">
              <div class="kpi__label" style="margin-bottom:3px;">
                {{ t('Orders by hour') }}
              </div>
              <h3 class="card__insight">
                {{ peakHourLabel ? t('Peak trade at {hour}', { hour: peakHourLabel }) : t('No orders this shift') }}
              </h3>
              <div class="card__sub">
                {{ t('Busiest window of the shift') }}
              </div>
            </div>
          </div>
          <div class="card__body">
            <div v-if="!byHour.length" class="statefill" :style="`height:${BAR_H}px;`">
              <div class="statefill__icon">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 17 9 11 13 15 21 7" /></svg>
              </div>
              <div class="statefill__title">
                {{ t('No data for this range') }}
              </div>
            </div>
            <div v-else ref="barEl" style="position:relative;overflow-x:auto;max-inline-size:100%;">
              <svg :width="BAR_W" :height="BAR_H" style="display:block;">
                <g v-for="(tv, i) in barTicks.ticks" :key="`bg${i}`">
                  <line :x1="BAR_PAD_L" :x2="BAR_W - BAR_PAD_R" :y1="barY(tv)" :y2="barY(tv)" stroke="var(--chart-grid)" stroke-width="1" />
                  <text :x="BAR_PAD_L - 9" :y="barY(tv) + 4" text-anchor="end" font-size="11" fill="var(--chart-axis)" font-family="var(--font-mono)">{{ Math.round(tv) }}</text>
                </g>
                <g v-for="(d, i) in byHour" :key="`b${i}`">
                  <rect
                    class="bar-rise"
                    :x="BAR_PAD_L + barBand * i + (barBand - barWidth) / 2"
                    :y="barY(d.value)"
                    :width="barWidth"
                    :height="Math.max((d.value / (barTicks.top || 1)) * barIH, 1)"
                    rx="4"
                    :fill="d.peak ? 'var(--chart-revenue)' : (barHover === i ? 'var(--primary-hover)' : 'var(--c4)')"
                    :opacity="barHover !== null && barHover !== i && !d.peak ? 0.55 : 1"
                    :style="{ transition: 'opacity .12s ease, transform .6s cubic-bezier(.2,.8,.2,1)', transform: barShown ? 'scaleY(1)' : 'scaleY(0)', transitionDelay: `${(0.04 + i * 0.03).toFixed(3)}s` }"
                  />
                  <text
                    v-if="d.peak"
                    :x="BAR_PAD_L + barBand * i + barBand / 2"
                    :y="barY(d.value) - 7"
                    text-anchor="middle"
                    font-size="11"
                    font-weight="700"
                    fill="var(--chart-revenue)"
                  >{{ d.value }}</text>
                  <text
                    :x="BAR_PAD_L + barBand * i + barBand / 2"
                    :y="BAR_H - 9"
                    text-anchor="middle"
                    font-size="11"
                    fill="var(--chart-axis)"
                  >{{ d.label }}</text>
                  <rect
                    :x="BAR_PAD_L + barBand * i"
                    :y="BAR_PAD_T"
                    :width="barBand"
                    :height="barIH"
                    fill="transparent"
                    @mouseenter="barHover = i"
                    @mouseleave="barHover = null"
                  />
                </g>
              </svg>
            </div>
          </div>
        </div>
      </div>

      <!-- ===== Orders breakdown + Speed & punctuality ===== -->
      <div class="grid cols-2" style="margin-bottom:var(--sp-5);">
        <div class="card">
          <div class="card__head">
            <div class="card__head-text">
              <h3 class="card__title">
                {{ t('Orders breakdown') }}
              </h3>
            </div>
          </div>
          <div class="card__body">
            <div class="row shift-handover__orders-stats" style="gap:0; margin-bottom:18px;">
              <div style="flex:1;">
                <div style="font-size:12px; font-weight:600; color:var(--success); margin-bottom:4px;">
                  {{ t('Completed') }}
                </div>
                <div class="mono shift-handover__orders-stat-value" style="font-size:26px; font-weight:700; letter-spacing:-0.02em;">
                  {{ fmtNum(shift.orders?.completed) }}
                </div>
              </div>
              <div style="flex:1;">
                <div style="font-size:12px; font-weight:600; color:var(--error); margin-bottom:4px;">
                  {{ t('Cancelled') }} ({{ fmtPct(shift.orders?.cancel_rate_pct, 1) }})
                </div>
                <div class="mono shift-handover__orders-stat-value" style="font-size:26px; font-weight:700; letter-spacing:-0.02em;">
                  {{ fmtNum(shift.orders?.cancelled) }}
                </div>
              </div>
              <div style="flex:1;">
                <div style="font-size:12px; font-weight:600; color:var(--primary); margin-bottom:4px;">
                  {{ t('Paid') }}
                </div>
                <div class="mono shift-handover__orders-stat-value" style="font-size:26px; font-weight:700; letter-spacing:-0.02em;">
                  {{ fmtNum(shift.orders?.paid) }}
                </div>
              </div>
            </div>
            <div class="row between" style="padding:7px 0;">
              <span class="muted" style="font-size:14px;">{{ t('Hall') }}</span>
              <span class="mono" style="font-weight:600; font-size:14px;">{{ fmtNum(shift.orders?.by_type?.hall) }}</span>
            </div>
            <div class="row between" style="padding:7px 0;">
              <span class="muted" style="font-size:14px;">{{ t('Delivery') }}</span>
              <span class="mono" style="font-weight:600; font-size:14px;">{{ fmtNum(shift.orders?.by_type?.delivery) }}</span>
            </div>
            <div class="row between" style="padding:7px 0;">
              <span class="muted" style="font-size:14px;">{{ t('Pickup') }}</span>
              <span class="mono" style="font-weight:600; font-size:14px;">{{ fmtNum(shift.orders?.by_type?.pickup) }}</span>
            </div>
            <div class="hr" style="margin:12px 0;" />
            <div class="row between" style="padding:7px 0;">
              <span class="muted" style="font-size:14px;">{{ t('Items') }} · {{ shift.items?.line_items }} {{ t('lines') }}</span>
              <span style="font-weight:600; font-size:14px;">{{ t('{n} units', { n: shift.items?.units_sold ?? 0 }) }}</span>
            </div>
            <div class="row between" style="padding:7px 0;">
              <span class="muted" style="font-size:14px;">{{ t('Discounts') }}</span>
              <span style="font-weight:600; font-size:14px;">{{ fmtMoney(shift.discounts?.total_given) }} ({{ t('{n} orders', { n: shift.discounts?.discounted_orders ?? 0 }) }})</span>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card__head">
            <div class="card__head-text">
              <h3 class="card__title">
                {{ t('Speed & punctuality') }}
              </h3>
            </div>
          </div>
          <div class="card__body">
            <div class="row between" style="padding:7px 0;">
              <span class="muted" style="font-size:14px;">{{ t('Avg prep time') }}</span>
              <span style="font-weight:600; font-size:14px;">{{ fmtSec(shift.speed?.avg_prep_seconds) }}</span>
            </div>
            <div class="row between" style="padding:7px 0;">
              <span class="muted" style="font-size:14px;">{{ t('Orders / hour') }}</span>
              <span class="mono" style="font-weight:600; font-size:14px;">{{ Number(shift.speed?.orders_per_hour ?? 0).toFixed(2) }}</span>
            </div>
            <div class="hr" style="margin:12px 0;" />
            <div class="row between" style="padding:7px 0;">
              <span class="muted" style="font-size:14px;">{{ t('Scheduled start') }}</span>
              <span style="font-weight:600; font-size:14px;">{{ shift.punctuality?.scheduled_start ? formatDate(shift.punctuality.scheduled_start) : '—' }}</span>
            </div>
            <div class="row between" style="padding:7px 0;">
              <span class="muted" style="font-size:14px;">{{ t('Actual start') }}</span>
              <span style="font-weight:600; font-size:14px;">{{ formatDate(shift.punctuality?.actual_start) }}</span>
            </div>
            <div class="row between" style="padding:7px 0;">
              <span class="muted" style="font-size:14px;">{{ t('Late') }}</span>
              <span v-if="shift.punctuality?.late_minutes !== null && shift.punctuality?.late_minutes !== undefined" style="color:var(--warning); font-weight:600; font-size:14px;">
                {{ shift.punctuality?.is_late ? t('late_by_minutes', { n: shift.punctuality.late_minutes }) : t('On time') }}
              </span>
              <span v-else class="tertiary">{{ t('No schedule') }}</span>
            </div>
            <div v-if="shift.punctuality?.attendance" class="hr" style="margin:12px 0;" />
            <div v-if="shift.punctuality?.attendance">
              <div class="kpi__label" style="margin-bottom:8px;">
                {{ t('Attendance') }}
              </div>
              <div class="row between" style="padding:7px 0;">
                <span class="muted" style="font-size:14px;">{{ t('Check in') }} / {{ t('out') }}</span>
                <span style="font-weight:600; font-size:14px;">
                  {{ formatDate(shift.punctuality.attendance.check_in) }} /
                  {{ shift.punctuality.attendance.check_out ? formatDate(shift.punctuality.attendance.check_out) : '—' }}
                </span>
              </div>
              <div class="row between" style="padding:7px 0;">
                <span class="muted" style="font-size:14px;">{{ t('Work / Overtime') }}</span>
                <span class="mono" style="font-weight:600; font-size:14px; text-align:right; overflow-wrap:anywhere;">{{ shift.punctuality.attendance.work_hours }}{{ t('hour_suffix') }} / {{ shift.punctuality.attendance.overtime_hours }}{{ t('hour_suffix') }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ===== Top products HBar + product detail table ===== -->
      <div class="grid cols-2" style="margin-bottom:var(--sp-5);">
        <div class="card">
          <div class="card__head">
            <div class="card__head-text">
              <div class="kpi__label" style="margin-bottom:3px;">
                {{ t('Top products · this shift') }}
              </div>
              <h3 class="card__insight">
                {{ topProductsForChart.length ? t('{name} leads revenue', { name: topProductsForChart[0].name }) : t('No sales yet') }}
              </h3>
              <div class="card__sub">
                {{ t('By revenue contribution') }}
              </div>
            </div>
            <div v-if="data?.best_seller" class="card__actions">
              <span class="badge t-success">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" style="margin-right:4px;"><path d="M12 2L14.6 8.6 21.5 9.1 16.2 13.5 17.8 20.3 12 16.7 6.2 20.3 7.8 13.5 2.5 9.1 9.4 8.6Z" /></svg>
                {{ data.best_seller.name }}
              </span>
            </div>
          </div>
          <div class="card__body">
            <div v-if="!topProductsForChart.length" class="statefill">
              <div class="statefill__icon">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 17 9 11 13 15 21 7" /></svg>
              </div>
              <div class="statefill__title">
                {{ t('No data') }}
              </div>
            </div>
            <div v-else style="display:flex; flex-direction:column; gap:14px;">
              <div v-for="(d, i) in topProductsForChart" :key="`hp${i}`" class="hbar-row">
                <div class="row between" style="margin-bottom:6px;">
                  <span style="font-weight:500; font-size:var(--fs-sm); display:flex; align-items:center; gap:7px;">
                    <svg v-if="i === 0" viewBox="0 0 24 24" width="14" height="14" fill="currentColor" style="color: var(--warning);"><path d="M12 2L14.6 8.6 21.5 9.1 16.2 13.5 17.8 20.3 12 16.7 6.2 20.3 7.8 13.5 2.5 9.1 9.4 8.6Z" /></svg>
                    {{ d.name }}
                    <span v-if="d.units" class="tertiary" style="font-size:var(--fs-label);">· {{ d.units }} {{ t('units') }}</span>
                  </span>
                  <span class="mono" style="font-weight:700; font-size:var(--fs-sm);">{{ fmtAbbr(d.value) }}</span>
                </div>
                <div style="height:10px; border-radius:99px; background:var(--chart-track); overflow:hidden;">
                  <div
                    class="hbar-fill"
                    :style="{
                      width: `${hbarShown ? (d.value / topProductMax) * 100 : 0}%`,
                      height: '100%',
                      borderRadius: '99px',
                      background: i === 0 ? 'var(--chart-revenue)' : 'var(--c4)',
                      transitionDelay: `${(0.05 + i * 0.06).toFixed(2)}s`,
                    }"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card__head">
            <div class="card__head-text">
              <h3 class="card__title">
                {{ t('Product detail') }}
              </h3>
              <div class="card__sub">
                {{ t('{n} products', { n: products.length }) }}
              </div>
            </div>
          </div>
          <div class="card__divider" />
          <div v-if="!products.length" class="statefill">
            <div class="statefill__icon">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7L12 3 4 7v10l8 4 8-4V7z" /></svg>
            </div>
            <div class="statefill__title">
              {{ t('No products sold') }}
            </div>
          </div>
          <div v-else class="dtable-scroll">
            <table class="dtable">
              <thead>
                <tr>
                  <th>{{ t('Name') }}</th>
                  <th class="num">
                    {{ t('Units') }}
                  </th>
                  <th class="num">
                    {{ t('Orders') }}
                  </th>
                  <th class="num">
                    {{ t('Revenue') }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="p in productsShown" :key="p.product_id">
                  <td class="cell-strong">
                    {{ p.name }}
                  </td>
                  <td class="num mono">
                    {{ p.units_sold }}
                  </td>
                  <td class="num mono cell-muted">
                    {{ p.times_sold }}
                  </td>
                  <td class="num mono cell-strong">
                    {{ fmtMoney(p.revenue) }}
                  </td>
                </tr>
              </tbody>
            </table>
            <div
              v-if="products.length > PRODUCTS_PREVIEW"
              style="display: flex; justify-content: center; padding: var(--sp-4) 0;"
            >
              <button
                class="btn btn--secondary btn--sm"
                @click="showAllProducts = !showAllProducts"
              >
                {{ showAllProducts
                  ? t('Show less')
                  : t('Show more ({n})', { n: products.length - PRODUCTS_PREVIEW }) }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- ===== Reconciliation card (extra: kept from existing data layer) ===== -->
      <div v-if="shift.reconciliation" class="card" style="margin-bottom:var(--sp-5);">
        <div class="card__head">
          <div class="card__head-text">
            <h3 class="card__title">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:6px;color:var(--primary);"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
              {{ t('Cash Reconciliation') }}
            </h3>
            <div class="card__sub">
              {{ t('Expected vs counted cash & manager sign-off') }}
            </div>
          </div>
          <div class="card__actions">
            <span class="badge" :class="`t-${reconTone(shift.reconciliation)}`">
              <span class="mono">{{ fmtMoney(shift.reconciliation.difference) }}</span>
            </span>
          </div>
        </div>
        <div class="card__divider" />
        <div class="card__body" style="padding-top:var(--sp-5);">
          <div class="grid cols-4 shift-handover__recon-grid" style="gap:var(--sp-5);">
            <div>
              <div class="kpi__label">
                {{ t('Expected') }}
              </div>
              <div class="mono" style="font-size:20px;font-weight:700;margin-top:4px;">
                {{ fmtMoney(shift.reconciliation.expected_cash) }}
              </div>
            </div>
            <div>
              <div class="kpi__label">
                {{ t('Cashier reported') }}
              </div>
              <div class="mono" style="font-size:20px;font-weight:700;margin-top:4px;">
                {{ fmtMoney(shift.reconciliation.actual_cash) }}
              </div>
            </div>
            <div>
              <div class="kpi__label">
                {{ t('Difference') }}
              </div>
              <div class="mono" style="font-size:20px;font-weight:700;margin-top:4px;" :style="{ color: reconColor(shift.reconciliation) }">
                {{ fmtMoney(shift.reconciliation.difference) }}
              </div>
            </div>
            <div>
              <div class="kpi__label">
                {{ t('Reconciled by') }}
              </div>
              <div style="font-size:14px;font-weight:600;margin-top:4px;">
                {{ shift.reconciliation.reconciled_by }}
              </div>
              <div class="tertiary" style="font-size:12px;margin-top:2px;">
                {{ formatDate(shift.reconciliation.reconciled_at) }}
              </div>
            </div>
          </div>
          <div v-if="shift.reconciliation.notes" class="muted" style="margin-top:var(--sp-4);font-size:13px;padding-top:var(--sp-4);border-top:1px solid var(--border);">
            {{ shift.reconciliation.notes }}
          </div>
        </div>
      </div>

      <!-- ===== Per-tender settlement table (extra) ===== -->
      <div v-if="settlement.length" class="card" style="margin-bottom:var(--sp-5);">
        <div class="card__head">
          <div class="card__head-text">
            <h3 class="card__title">
              {{ t('Per-tender Settlement') }}
            </h3>
            <div class="card__sub">
              {{ t('System vs counted vs confirmed per payment method') }}
            </div>
          </div>
        </div>
        <div class="card__divider" />
        <div class="dtable-scroll">
          <table class="dtable">
            <thead>
              <tr>
                <th>{{ t('Method') }}</th>
                <th class="num">
                  {{ t('Expected (system)') }}
                </th>
              <th class="num">
                {{ t('Cashier counted') }}
              </th>
              <th class="num">
                {{ t('Manager confirmed') }}
              </th>
              <th class="num">
                {{ t('Difference') }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in settlement" :key="row.method">
              <td>
                <span class="badge" :class="`t-${tone(row.method)}`">{{ row.method ? t(`payment_method_${row.method}`) : '—' }}</span>
              </td>
              <td class="num mono">
                {{ fmtMoney(row.expected) }}
              </td>
              <td class="num mono">
                {{ cashierCountText(row) }}
              </td>
              <td class="num mono cell-strong">
                {{ managerConfirmedText(row) }}
              </td>
              <td class="num">
                <span class="badge" :class="`t-${settlementDiffColor(row.difference)}`">
                  <span class="mono">{{ settlementDifferenceText(row) }}</span>
                </span>
              </td>
            </tr>
          </tbody>
        </table>
        </div>
      </div>

      <!-- ===== Cash drawer expenses (extra) ===== -->
      <div v-if="cashExpenses.length" class="card" style="margin-bottom:var(--sp-5);">
        <div class="card__head">
          <div class="card__head-text">
            <h3 class="card__title">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:6px;color:var(--error);"><circle cx="12" cy="12" r="10" /><line x1="8" y1="12" x2="16" y2="12" /></svg>
              {{ t('Cash drawer expenses') }}
            </h3>
          </div>
          <div class="card__actions">
            <span class="mono" style="color:var(--error);font-weight:700;overflow-wrap:anywhere;">{{ t('negative_amount', { amount: fmtMoney(cashExpensesTotal) }) }}</span>
          </div>
        </div>
        <div class="card__divider" />
        <div class="dtable-scroll">
        <table class="dtable">
          <thead>
            <tr>
              <th>{{ t('Category') }}</th>
              <th class="num">
                {{ t('Count') }}
              </th>
              <th class="num">
                {{ t('Total') }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in cashExpenses" :key="e.category">
              <td class="cell-strong">
                {{ e.category }}
              </td>
              <td class="num mono">
                {{ e.count }}
              </td>
              <td class="num mono" style="color:var(--error);font-weight:600;">
                {{ t('negative_amount', { amount: fmtMoney(e.total) }) }}
              </td>
            </tr>
          </tbody>
        </table>
        </div>
      </div>

      <!-- ===== All receipts (.dtable) ===== -->
      <div class="card">
        <div class="card__head">
          <div class="card__head-text">
            <h3 class="card__title">
              {{ t('All receipts') }}
            </h3>
            <div class="card__sub">
              {{ receipts.length }} {{ t('of') }} {{ data?.receipt_count }} {{ t('shown') }}
            </div>
          </div>
          <div class="card__actions">
            <button class="btn btn--secondary btn--sm" :class="{ 'is-loading': exporting }" :disabled="exporting || !receipts.length" @click="doExport">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
              {{ t('Export') }}
            </button>
          </div>
        </div>
        <div class="card__divider" />
        <div v-if="!receipts.length" class="statefill">
          <div class="statefill__icon">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 1 2V2l-1 2-3-2-3 2-3-2-3 2-3-2z" /></svg>
          </div>
          <div class="statefill__title">
            {{ t('No receipts') }}
          </div>
        </div>
        <div v-else class="dtable-scroll">
        <table class="dtable">
          <thead>
            <tr>
              <th>{{ t('id_prefix') }}</th>
              <th>{{ t('Status') }}</th>
              <th>{{ t('Type') }}</th>
              <th>{{ t('Payment') }}</th>
              <th class="num">
                {{ t('Lines') }}
              </th>
              <th class="num">
                {{ t('Units') }}
              </th>
              <th class="num">
                {{ t('Discount') }}
              </th>
              <th class="num">
                {{ t('Total') }}
              </th>
              <th>{{ t('Paid at') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="r in sortedReceipts"
              :key="r.order_id"
              :class="{ 'shift-handover__receipt--cancelled': isCancelledReceipt(r) }"
              style="cursor: pointer;"
              @click="openReceipt(r)"
            >
              <td class="cell-strong mono">
                {{ t('id_prefix') }}{{ receiptId(r) }}
              </td>
              <td>
                <span class="badge badge--dot" :class="`t-${tone(r.status)}`">{{ r.status ? t(`order_status_${r.status}`) : '—' }}</span>
              </td>
              <td>
                <span class="badge t-neutral">{{ r.order_type ? t(`order_type_${r.order_type}`) : '—' }}</span>
              </td>
              <td>
                <span class="badge" :class="`t-${tone(r.payment_method)}`">{{ r.payment_method ? t(`payment_method_${r.payment_method}`) : '—' }}</span>
              </td>
              <td class="num mono">
                {{ r.line_items }}
              </td>
              <td class="num mono">
                {{ r.units }}
              </td>
              <td class="num">
                <span v-if="Number(r.discount_amount) > 0" class="mono" style="color:var(--warning);">{{ t('negative_amount', { amount: fmtMoney(r.discount_amount) }) }}</span>
                <span v-else class="cell-muted">—</span>
              </td>
              <td class="num mono cell-strong">
                {{ fmtMoney(r.total_amount) }}
              </td>
              <td class="cell-muted mono">
                {{ r.paid_at ? formatDate(r.paid_at) : '—' }}
              </td>
            </tr>
          </tbody>
        </table>
        </div>
      </div>
    </template>

    <!-- Receipt quick-view modal -->
    <Modal
      :open="selectedReceipt !== null"
      :width="640"
      :title="selectedReceipt
        ? t('Order') + ' ' + t('id_prefix') + receiptId(selectedReceipt)
        : ''"
      @close="closeReceipt"
    >
      <div v-if="selectedReceipt" class="receipt-modal">
        <div class="receipt-modal__meta">
          <div class="receipt-modal__cell">
            <div class="receipt-modal__lbl">{{ t('Status') }}</div>
            <span class="badge badge--dot" :class="`t-${tone(selectedReceipt.status)}`">
              {{ selectedReceipt.status ? t(`order_status_${selectedReceipt.status}`) : '—' }}
            </span>
          </div>
          <div class="receipt-modal__cell">
            <div class="receipt-modal__lbl">{{ t('Type') }}</div>
            <span class="badge t-neutral">{{ selectedReceipt.order_type ? t(`order_type_${selectedReceipt.order_type}`) : '—' }}</span>
          </div>
          <div class="receipt-modal__cell">
            <div class="receipt-modal__lbl">{{ t('Payment') }}</div>
            <span class="badge" :class="`t-${tone(selectedReceipt.payment_method)}`">
              {{ selectedReceipt.payment_method ? t(`payment_method_${selectedReceipt.payment_method}`) : '—' }}
            </span>
          </div>
          <div class="receipt-modal__cell">
            <div class="receipt-modal__lbl">{{ t('Paid at') }}</div>
            <div class="cell-muted mono">{{ selectedReceipt.paid_at ? formatDate(selectedReceipt.paid_at) : '—' }}</div>
          </div>
        </div>

        <div class="kpi__label" style="margin-top: var(--sp-4); margin-bottom: 8px;">
          {{ t('Order Items') }}
        </div>
        <div class="tablewrap">
          <table class="dtable">
            <thead>
              <tr>
                <th>{{ t('Product') }}</th>
                <th class="num">{{ t('Qty') }}</th>
                <th class="num">{{ t('Price') }}</th>
                <th class="num">{{ t('Subtotal') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="selectedLoading">
                <td colspan="4" class="center cell-muted">{{ t('Loading…') }}</td>
              </tr>
              <tr v-else-if="!selectedItems.length">
                <td colspan="4" class="center cell-muted">{{ t('No items') }}</td>
              </tr>
              <tr v-for="(li, i) in selectedItems" v-else :key="i">
                <td class="cell-strong">{{ li.product?.name ?? '—' }}</td>
                <td class="num mono">{{ li.quantity ?? '—' }}</td>
                <td class="num mono cell-muted">{{ fmtMoney(li.price ?? 0) }}</td>
                <td class="num mono cell-strong">{{ fmtMoney(li.subtotal) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="receipt-modal__totals">
          <div v-if="Number(selectedReceipt.discount_amount) > 0" class="row" style="justify-content: space-between;">
            <span class="cell-muted">{{ t('Discount') }}</span>
            <span class="mono" style="color: var(--warning);">{{ t('negative_amount', { amount: fmtMoney(selectedReceipt.discount_amount) }) }}</span>
          </div>
          <div class="row" style="justify-content: space-between; font-weight: 600; font-size: 16px;">
            <span>{{ t('Total') }}</span>
            <span class="mono">{{ fmtMoney(selectedReceipt.total_amount) }}</span>
          </div>
        </div>
      </div>
    </Modal>

    <!-- Snackbar — kept as Vuetify primitive since it's a portal/overlay, not a layout element -->
    <VSnackbar v-model="snackbar" :color="snackbarColor" :timeout="3000">
      {{ snackbarMsg }}
    </VSnackbar>
  </div>
</template>

<style scoped>
/* Animated HBar fill width */
.hbar-fill {
  transition: width .55s cubic-bezier(.2, .8, .3, 1);
}

.receipt-modal__meta {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--sp-3);
  margin-bottom: var(--sp-4);
}
.receipt-modal__cell { min-width: 0; }
.receipt-modal__lbl {
  font-size: var(--fs-micro);
  font-weight: var(--fw-semibold);
  letter-spacing: var(--tracking-label);
  text-transform: uppercase;
  color: var(--text-tertiary);
  margin-bottom: 4px;
}
.receipt-modal__totals {
  margin-top: var(--sp-4);
  padding-top: var(--sp-3);
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
@media (max-width: 600px) {
  .receipt-modal__meta { grid-template-columns: 1fr; }
}

/* Shift handover toolbar — wrap on narrow viewports */
.shift-handover__head-actions {
  flex-wrap: wrap;
  gap: 12px;
}

.shift-handover__shift-field {
  width: 200px;
  min-width: 160px;
}

/* Horizontal scroll wrapper for data tables on narrow screens */
.dtable-scroll {
  inline-size: 100%;
  overflow-x: auto;
}

/* Canceled receipts stay at the top of the report and are visibly distinct
   without obscuring their normal status badge or row content. */
.shift-handover__receipt--cancelled > td {
  background: color-mix(in srgb, var(--error) 6%, transparent);
}
.shift-handover__receipt--cancelled > td:first-child {
  box-shadow: inset 3px 0 0 var(--error);
}

/* Orders breakdown stat row — stack columns on small screens */
.shift-handover__orders-stats {
  flex-wrap: wrap;
  row-gap: 14px;
}

/* Tablet: collapse outer 2-up chart grids to a single column at 1024 */
@media (max-width: 1024px) {
  .grid.cols-2 {
    grid-template-columns: 1fr !important;
  }
}

/* Phone: canonical 768 — KPI cols-4 stays 2-up (NOT 1-col).
   Reconciliation cols-4 also stays 2-up. Toolbars stack. */
@media (max-width: 768px) {
  .shift-handover__shift-field {
    width: 100%;
    min-width: 0;
  }

  .shift-handover__load-btn {
    align-self: stretch !important;
    justify-content: center;
  }

  /* KPI strip stays 2-up at phone per canonical rules */
  .shift-handover__kpi-grid,
  .shift-handover__recon-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  }

  /* Generic cols-2 already collapsed at 1024; ensure cols-4 elsewhere is 2-up */
  .grid.cols-4 {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  }

  /* Summary banner KPI strip — tighter gap, allow wrap; clear right-align so it
     does not collide with avatar block when wrapped */
  .shift-handover__summary-kpis {
    gap: 14px !important;
    width: 100%;
  }
  .shift-handover__summary-kpi {
    text-align: left !important;
    flex: 1 1 calc(50% - 14px);
    min-width: 0;
  }
  .shift-handover__summary-kpi-value {
    max-width: none !important;
    overflow-wrap: anywhere;
  }

  /* Orders breakdown columns stack 1-col at phone, shrink large numeric font */
  .shift-handover__orders-stats > div {
    flex: 1 1 100%;
  }
  .shift-handover__orders-stat-value {
    font-size: 22px !important;
    overflow-wrap: anywhere;
  }

  /* KPI tags wider so translated labels are not cramped */
  .kpi__label {
    max-width: none;
  }
}

/* Small phone: tighten further. */
@media (max-width: 420px) {
  /* All cols-4 collapse to single col on tiny screens */
  .shift-handover__kpi-grid,
  .shift-handover__recon-grid,
  .grid.cols-4 {
    grid-template-columns: 1fr !important;
  }

  .shift-handover__summary-kpi {
    flex: 1 1 100%;
  }

  .shift-handover__orders-stat-value {
    font-size: 20px !important;
  }
}
</style>

<route lang="yaml">
meta:
  action: manage
  subject: all
</route>
