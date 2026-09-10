/* ============================================================
   Compare Periods — delta math, series alignment, and B-range presets.
   Pure functions (unit-testable); useComparison() bundles them.
   ============================================================ */
import type { CompareMode, TimeseriesPoint } from '@/types/comparison'

export type DeltaDirection = 'up' | 'down' | 'flat' | 'new'
export type BadgeTone = 'positive' | 'negative' | 'neutral'

export interface DeltaResult {
  delta: number
  deltaPct: number | null // null = "New" (B was 0, A > 0)
  direction: DeltaDirection
}

/** delta = a - b. Div-by-zero rules:
 *  B==0 & A>0 → "New" (null pct); A==0 & B>0 → −100%; both 0 → flat/—. */
export function computeDelta(a: number, b: number): DeltaResult {
  const delta = a - b
  if (b === 0) {
    if (a > 0) return { delta, deltaPct: null, direction: 'new' }
    return { delta: 0, deltaPct: 0, direction: 'flat' }
  }
  const deltaPct = (delta / Math.abs(b)) * 100
  const direction: DeltaDirection = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
  return { delta, deltaPct, direction }
}

/** Colour by DIRECTION × isUpGood — a rise in refunds/discounts is bad, so a
 *  raw-sign colouring would be wrong. */
export function badgeColor(direction: DeltaDirection, isUpGood: boolean): BadgeTone {
  if (direction === 'flat') return 'neutral'
  if (direction === 'new') return isUpGood ? 'positive' : 'negative'
  const good = (direction === 'up') === isUpGood
  return good ? 'positive' : 'negative'
}

/** Daily-average normalisation for unequal-length ranges. */
export function normalize(value: number, days: number): number {
  return days > 0 ? value / days : 0
}

export interface AlignedPoint {
  index: number
  aValue: number | null
  bValue: number | null
  aDate: string | null
  bDate: string | null
}

/** Overlay A and B on a shared 1-based relative axis; shorter is padded with
 *  nulls so the longer defines the axis length. Both real dates ride along for
 *  the tooltip. */
export function alignSeries(a: TimeseriesPoint[], b: TimeseriesPoint[]): AlignedPoint[] {
  const n = Math.max(a.length, b.length)
  const out: AlignedPoint[] = []
  for (let i = 0; i < n; i++) {
    const pa = a[i]
    const pb = b[i]
    out.push({
      index: i + 1,
      aValue: pa ? pa.value : null,
      bValue: pb ? pb.value : null,
      aDate: pa ? pa.date : null,
      bDate: pb ? pb.date : null,
    })
  }
  return out
}

// ---- B-range presets ------------------------------------------------------
export interface DateRange { start: string, end: string }

function parse(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}
function iso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
export function dayCount(r: DateRange): number {
  return Math.round((parse(r.end).getTime() - parse(r.start).getTime()) / 86400000) + 1
}

/** B = the equal-length window immediately before A. */
export function previousPeriod(a: DateRange): DateRange {
  const len = dayCount(a)
  const bEnd = parse(a.start)
  bEnd.setDate(bEnd.getDate() - 1)
  const bStart = new Date(bEnd)
  bStart.setDate(bStart.getDate() - (len - 1))
  return { start: iso(bStart), end: iso(bEnd) }
}

/** B = A shifted back exactly one year. */
export function samePeriodLastYear(a: DateRange): DateRange {
  const s = parse(a.start)
  s.setFullYear(s.getFullYear() - 1)
  const e = parse(a.end)
  e.setFullYear(e.getFullYear() - 1)
  return { start: iso(s), end: iso(e) }
}

export function resolveBFromMode(a: DateRange, mode: CompareMode, custom?: DateRange): DateRange {
  if (mode === 'previous_period') return previousPeriod(a)
  if (mode === 'same_period_last_year') return samePeriodLastYear(a)
  return custom ?? previousPeriod(a)
}

export function useComparison() {
  return {
    computeDelta, badgeColor, normalize, alignSeries,
    dayCount, previousPeriod, samePeriodLastYear, resolveBFromMode,
  }
}
