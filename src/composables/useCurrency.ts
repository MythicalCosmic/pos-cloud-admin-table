/* ============================================================
   UZS currency formatting for the Compare Periods page.
   Reuses the canonical narrow no-break-space UZS/number formatters.
   ============================================================ */
import { NB, fmtAbbr, fmtNum } from '@/components/design/utils/format'

/** 12345000 -> "12 345 000" */
export function fmtUZS(n: number): string {
  return Number.isFinite(n) ? fmtNum(n) : '—'
}

/** 12345000 -> a narrow-no-break-space grouped UZS value. */
export function fmtUZSUnit(n: number): string {
  if (!Number.isFinite(n))
    return '—'

  return `${fmtUZS(n)}${NB}UZS`
}

/** 12345000 -> "12.3M", 450000 -> "450K" (for chart axes/compact chips) */
export function abbrUZS(n: number): string {
  return Number.isFinite(n) ? fmtAbbr(n) : '—'
}

/** Plain integer with space groups (orders, items counts). */
export function fmtInt(n: number): string {
  return Number.isFinite(n) ? fmtNum(n) : '—'
}

/** 12.234 -> "+12.2%" / -8.4 -> "−8.4%" / null -> "New" / 0 -> "—" */
export function fmtPct(pct: number | null, opts: { newLabel?: string; zeroDash?: boolean } = {}): string {
  if (pct === null)
    return opts.newLabel ?? 'New'
  if (pct === 0)
    return opts.zeroDash === false ? '0.0%' : '—'

  const rounded = Math.round(pct * 10) / 10
  const sign = rounded > 0 ? '+' : '−'
  return `${sign}${Math.abs(rounded).toFixed(1)}%`
}

export function useCurrency() {
  return { fmtUZS, fmtUZSUnit, abbrUZS, fmtInt, fmtPct }
}
