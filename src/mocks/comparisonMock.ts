/* ============================================================
   Realistic, deterministic mock for the Compare Periods page so the whole
   UI is buildable/clickable before the BE endpoint ships. Toggle via the
   `mock` flag in the page. Deltas are computed with the real helper so they
   stay internally consistent.
   ============================================================ */
import { computeDelta } from '@/composables/useComparison'
import type {
  CategoryRow, ComparisonParams, ComparisonResponse, KpiCell, KpiKey,
  MixSlice, MoverRow, ProductRow, TimeseriesPoint,
} from '@/types/comparison'

// Small seeded PRNG so the mock is stable across reloads (no Math.random()).
function makeRng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0xFFFFFFFF
  }
}

function parse(d: string): Date {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, day ?? 1)
}
function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function dayList(start: string, end: string): string[] {
  const out: string[] = []
  const s = parse(start)
  const e = parse(end)
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) out.push(iso(new Date(d)))
  return out
}

function kpi(a: number, b: number, isUpGood: boolean): KpiCell {
  const { delta, deltaPct } = computeDelta(a, b)
  return { a, b, delta, delta_pct: deltaPct, is_up_good: isUpGood }
}

const CATS = ['Lavashlar', 'Pitsalar', 'Non burgerlar', 'Hot doglar', 'Ichimliklar', 'Souslar', 'Choylar', 'Tovuq']
const PROD_BY_CAT: Record<string, string[]> = {
  Lavashlar: ['Lavash katta', 'Tandir lavash', 'Lavash kichik', 'Lavash tovuqli', 'Lavash combo'],
  Pitsalar: ['Pitsa peperoni', 'Pitsa 4 pishloq', 'Pitsa go\'shtli', 'Pitsa margarita', 'Pitsa achchiq'],
  'Non burgerlar': ['Non burger standart', 'Non burger dubl', 'Non burger tovuq', 'Non burger cheese'],
  'Hot doglar': ['Hot Dog mini', 'Hot Dog Kanada', 'Hot Dog klassik', 'Hot Dog jumbo'],
  Ichimliklar: ['Milliy cola 0.5', 'Milliy cola 1.5', 'Be Fresh 450', 'Suv 0.5', 'Fanta 1L'],
  Souslar: ['Ketchup', 'Mayonez', 'Cheese sous', 'Achchiq sous'],
  Choylar: ['Qora choy', 'Ko\'k choy', 'Limonli choy'],
  Tovuq: ['Tovuq lavash', 'Qanotlar', 'Strips', 'Naggets'],
}

export function getComparisonMock(params: ComparisonParams): ComparisonResponse {
  const aDays = dayList(params.a_start, params.a_end)
  const bDays = dayList(params.b_start, params.b_end)
  const rng = makeRng(aDays.length * 7 + bDays.length * 13 + 42)

  // ---- revenue timeseries (day granularity mock) ----
  const mkSeries = (dates: string[], base: number, amp: number): TimeseriesPoint[] =>
    dates.map((date, i) => {
      const dow = parse(date).getDay() // weekend lift
      const weekend = (dow === 5 || dow === 6) ? 1.35 : 1
      const noise = 0.75 + rng() * 0.5
      return { index: i + 1, date, value: Math.round(base * weekend * noise + amp * Math.sin(i / 3)) }
    })
  const aSeries = mkSeries(aDays, 12_000_000, 2_500_000)
  const bSeries = mkSeries(bDays, 10_800_000, 2_200_000)
  const aRev = aSeries.reduce((s, p) => s + p.value, 0)
  const bRev = bSeries.reduce((s, p) => s + p.value, 0)

  const aOrders = Math.round(aRev / 49_800)
  const bOrders = Math.round(bRev / 50_400)
  const aItems = Math.round(aOrders * 2.6)
  const bItems = Math.round(bOrders * 2.55)
  const aDisc = Math.round(aRev * 0.031)
  const bDisc = Math.round(bRev * 0.028)
  const aRef = Math.round(aRev * 0.006)
  const bRef = Math.round(bRev * 0.009)
  const aNet = aRev - aDisc - aRef
  const bNet = bRev - bDisc - bRef

  const kpis: Partial<Record<KpiKey, KpiCell>> = {
    gross_revenue: kpi(aRev, bRev, true),
    net_revenue: kpi(aNet, bNet, true),
    orders: kpi(aOrders, bOrders, true),
    items_sold: kpi(aItems, bItems, true),
    aov: kpi(Math.round(aNet / aOrders), Math.round(bNet / bOrders), true),
    avg_items_per_order: kpi(Math.round((aItems / aOrders) * 100) / 100, Math.round((bItems / bOrders) * 100) / 100, true),
    discounts: kpi(aDisc, bDisc, false),
    refunds: kpi(aRef, bRef, false),
  }

  // ---- categories ----
  const categories: CategoryRow[] = CATS.map((name, i) => {
    const ar = Math.round((aRev / CATS.length) * (0.6 + rng() * 0.9))
    const br = Math.round((bRev / CATS.length) * (0.6 + rng() * 0.9))
    return {
      id: i + 1, name,
      a_revenue: ar, b_revenue: br,
      a_qty: Math.round(ar / 30_000), b_qty: Math.round(br / 30_000),
      delta_pct: computeDelta(ar, br).deltaPct,
    }
  })

  // ---- products (top ~40 + Others) ----
  const products: ProductRow[] = []
  for (const cat of CATS) {
    for (const pname of PROD_BY_CAT[cat] ?? []) {
      const ar = Math.round((aRev / 42) * (0.4 + rng() * 1.4))
      const br = Math.round((bRev / 42) * (0.4 + rng() * 1.4))
      products.push({
        id: products.length + 1, name: pname, category: cat,
        a_qty: Math.round(ar / 28_000), b_qty: Math.round(br / 28_000),
        a_revenue: ar, b_revenue: br, delta_pct: computeDelta(ar, br).deltaPct,
      })
    }
  }
  products.sort((x, y) => y.a_revenue - x.a_revenue)

  // ---- movers ----
  const withDelta = products.map(p => ({ name: p.name, a: p.a_revenue, b: p.b_revenue, ...computeDelta(p.a_revenue, p.b_revenue) }))
  const gainers = [...withDelta].sort((x, y) => y.delta - x.delta).slice(0, 6)
    .map<MoverRow>(m => ({ name: m.name, a: m.a, b: m.b, delta: m.delta, delta_pct: m.deltaPct }))
  const losers = [...withDelta].sort((x, y) => x.delta - y.delta).slice(0, 6)
    .map<MoverRow>(m => ({ name: m.name, a: m.a, b: m.b, delta: m.delta, delta_pct: m.deltaPct }))

  // ---- hourly / weekday ----
  const by_hour = {
    a: Array.from({ length: 24 }, (_, h) => ({ hour: h, value: hourShape(h, aOrders, rng, 13) })),
    b: Array.from({ length: 24 }, (_, h) => ({ hour: h, value: hourShape(h, bOrders, rng, 12) })),
  }
  const by_weekday = {
    a: Array.from({ length: 7 }, (_, w) => ({ weekday: w, value: Math.round(aRev / 7 * (0.7 + rng() * 0.7)) })),
    b: Array.from({ length: 7 }, (_, w) => ({ weekday: w, value: Math.round(bRev / 7 * (0.7 + rng() * 0.7)) })),
  }
  const mkMatrix = (dailyOrders: number, peak: number) =>
    Array.from({ length: 7 }, (_, w) => Array.from({ length: 24 }, (_, h) => {
      const weekend = (w === 4 || w === 5) ? 1.3 : 1
      return Math.round(hourShape(h, dailyOrders, rng, peak) * weekend)
    }))
  const hour_weekday = { a: mkMatrix(aOrders, 13), b: mkMatrix(bOrders, 12) }

  // ---- mixes ----
  const payMix = (total: number, split: number[]): MixSlice[] => {
    const methods = ['cash', 'card', 'digital']
    return methods.map((method, i) => ({ method, value: Math.round(total * split[i]), share: Math.round(split[i] * 1000) / 10 }))
  }
  const otMix = (total: number, split: number[]): MixSlice[] => {
    const types = ['dine_in', 'takeaway', 'delivery']
    return types.map((type, i) => ({ type, value: Math.round(total * split[i]), share: Math.round(split[i] * 1000) / 10 }))
  }

  const cashiers = ['Nigina Smart', 'Ruxsora Smart', 'Umida Smart', 'Kechki Smena', 'Povr Smart']

  return {
    period_a: { start: params.a_start, end: params.a_end, days: aDays.length },
    period_b: { start: params.b_start, end: params.b_end, days: bDays.length },
    kpis,
    revenue_timeseries: { granularity: params.granularity, a: aSeries, b: bSeries },
    categories,
    products: products.slice(0, 40),
    top_gainers: gainers,
    top_losers: losers,
    by_hour,
    by_weekday,
    hour_weekday,
    payment_methods: { a: payMix(aNet, [0.62, 0.30, 0.08]), b: payMix(bNet, [0.66, 0.27, 0.07]) },
    order_types: { a: otMix(aOrders, [0.55, 0.25, 0.20]), b: otMix(bOrders, [0.60, 0.24, 0.16]) },
    by_cashier: cashiers.map((name, i) => {
      const a = Math.round((aRev / cashiers.length) * (0.6 + rng() * 0.9))
      const b = Math.round((bRev / cashiers.length) * (0.6 + rng() * 0.9))
      return { id: i + 1, name, a, b, delta_pct: computeDelta(a, b).deltaPct }
    }),
  }
}

function hourShape(h: number, dailyOrders: number, rng: () => number, peak: number): number {
  // Restaurant curve: closed early morning, lunch + dinner humps.
  const open = h >= 9 && h <= 23
  if (!open) return 0
  const lunch = Math.exp(-((h - 13) ** 2) / 6)
  const dinner = Math.exp(-((h - peak + 6) ** 2) / 8)
  const base = (lunch + dinner) * (dailyOrders / 30)
  return Math.round(base * (0.8 + rng() * 0.4))
}
