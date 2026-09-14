import { computeDelta } from '@/composables/useComparison'
import { getComparisonMock } from '@/mocks/comparisonMock'
import type {
  ComparisonParams,
  ComparisonResponse,
  HourPoint,
  KpiCell,
  MixSlice,
  ProductRow,
  TimeseriesPoint,
  WeekdayPoint,
} from '@/types/comparison'

export interface ProductComparisonMockSelection {
  id: string
  name: string
  category?: string
}

function hash(value: string): number {
  let result = 2166136261

  for (const char of value) {
    result ^= char.charCodeAt(0)
    result = Math.imul(result, 16777619)
  }

  return result >>> 0
}

function kpi(a: number, b: number, isUpGood: boolean): KpiCell {
  const { delta, deltaPct } = computeDelta(a, b)

  return { a, b, delta, delta_pct: deltaPct, is_up_good: isUpGood }
}

function scaleValues<T>(rows: T[], value: (row: T) => number, total: number, update: (row: T, scaled: number) => T): T[] {
  const sourceTotal = rows.reduce((sum, row) => sum + Math.max(0, value(row)), 0)
  if (!rows.length)
    return []
  if (sourceTotal <= 0)
    return rows.map(row => update(row, 0))

  let assigned = 0

  return rows.map((row, index) => {
    const scaled = index === rows.length - 1
      ? Math.max(0, total - assigned)
      : Math.round(total * Math.max(0, value(row)) / sourceTotal)

    assigned += scaled

    return update(row, scaled)
  })
}

function scaleSeries(rows: TimeseriesPoint[], total: number): TimeseriesPoint[] {
  return scaleValues(rows, row => row.value, total, (row, scaled) => ({ ...row, value: scaled }))
}

function scaleHours(rows: HourPoint[], total: number): HourPoint[] {
  return scaleValues(rows, row => row.value, total, (row, scaled) => ({ ...row, value: scaled }))
}

function scaleWeekdays(rows: WeekdayPoint[], total: number): WeekdayPoint[] {
  return scaleValues(rows, row => row.value, total, (row, scaled) => ({ ...row, value: scaled }))
}

function scaleMatrix(rows: number[][], total: number): number[][] {
  const flat = rows.flat()
  const scaled = scaleValues(flat, value => value, total, (_value, next) => next)
  let offset = 0

  return rows.map(row => {
    const result = scaled.slice(offset, offset + row.length)

    offset += row.length

    return result
  })
}

function scaleMix(rows: MixSlice[], total: number): MixSlice[] {
  return scaleValues(rows, row => row.value, total, (row, scaled) => ({ ...row, value: scaled }))
}

function safeProductId(id: string, fallback: number): number {
  const parsed = Number(id)

  return Number.isSafeInteger(parsed) ? parsed : fallback
}

export function getProductComparisonMock(
  params: ComparisonParams,
  selection?: ProductComparisonMockSelection,
): ComparisonResponse {
  const base = getComparisonMock(params)
  if (!selection)
    return { ...base, selection: { scope: 'all_products' } }

  const source = base.products[hash(selection.id) % Math.max(1, base.products.length)]
  if (!source)
    return { ...base, selection: { scope: 'all_products' } }

  const product: ProductRow = {
    ...source,
    id: safeProductId(selection.id, source.id),
    name: selection.name,
    category: selection.category || source.category,
  }

  const grossA = product.a_revenue
  const grossB = product.b_revenue
  const discountsA = Math.round(grossA * 0.024)
  const discountsB = Math.round(grossB * 0.021)
  const refundsA = Math.round(grossA * 0.008)
  const refundsB = Math.round(grossB * 0.011)
  const netA = grossA - discountsA - refundsA
  const netB = grossB - discountsB - refundsB
  const ordersA = Math.max(0, Math.round(product.a_qty / 1.2))
  const ordersB = Math.max(0, Math.round(product.b_qty / 1.2))

  return {
    ...base,
    selection: {
      scope: 'product',
      product_id: selection.id,
      product_name: selection.name,
      category_name: product.category,
    },
    kpis: {
      gross_revenue: kpi(grossA, grossB, true),
      net_revenue: kpi(netA, netB, true),
      orders: kpi(ordersA, ordersB, true),
      items_sold: kpi(product.a_qty, product.b_qty, true),
      aov: kpi(ordersA ? Math.round(netA / ordersA) : 0, ordersB ? Math.round(netB / ordersB) : 0, true),
      avg_items_per_order: kpi(ordersA ? product.a_qty / ordersA : 0, ordersB ? product.b_qty / ordersB : 0, true),
      discounts: kpi(discountsA, discountsB, false),
      refunds: kpi(refundsA, refundsB, false),
    },
    revenue_timeseries: {
      ...base.revenue_timeseries,
      a: scaleSeries(base.revenue_timeseries.a, netA),
      b: scaleSeries(base.revenue_timeseries.b, netB),
    },
    categories: [{
      id: 1,
      name: product.category,
      a_revenue: grossA,
      b_revenue: grossB,
      a_qty: product.a_qty,
      b_qty: product.b_qty,
      delta_pct: product.delta_pct,
    }],
    products: [product],
    top_gainers: product.a_revenue >= product.b_revenue
      ? [{ name: product.name, a: grossA, b: grossB, delta: grossA - grossB, delta_pct: product.delta_pct }]
      : [],
    top_losers: product.a_revenue < product.b_revenue
      ? [{ name: product.name, a: grossA, b: grossB, delta: grossA - grossB, delta_pct: product.delta_pct }]
      : [],
    by_hour: {
      a: scaleHours(base.by_hour.a, ordersA),
      b: scaleHours(base.by_hour.b, ordersB),
    },
    by_weekday: {
      a: scaleWeekdays(base.by_weekday.a, netA),
      b: scaleWeekdays(base.by_weekday.b, netB),
    },
    hour_weekday: base.hour_weekday
      ? {
        a: scaleMatrix(base.hour_weekday.a, ordersA),
        b: scaleMatrix(base.hour_weekday.b, ordersB),
      }
      : undefined,
    payment_methods: {
      a: scaleMix(base.payment_methods.a, netA),
      b: scaleMix(base.payment_methods.b, netB),
    },
    order_types: {
      a: scaleMix(base.order_types.a, ordersA),
      b: scaleMix(base.order_types.b, ordersB),
    },
    by_branch: undefined,
    by_cashier: undefined,
  }
}
