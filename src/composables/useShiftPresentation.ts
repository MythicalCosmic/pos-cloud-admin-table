import { completeAllTendersToReceive, methodIsManagerConfirmed, moneyNumber } from '@/utils/shiftMoney'

export function shiftNumber(value: unknown): number {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

export function useShiftPresentation() {
  const { t } = useI18n({ useScope: 'global' })
  const num = shiftNumber
  function fmtDateTime(d: string | Date | null | undefined): string {
    if (!d)
      return '—'
    const x = d instanceof Date ? d : new Date(d)
    if (Number.isNaN(x.getTime()))
      return '—'
    const p = (v: number) => v < 10 ? `0${v}` : `${v}`
    return `${p(x.getDate())}.${p(x.getMonth() + 1)} ${p(x.getHours())}:${p(x.getMinutes())}`
  }
  function fmtDuration(min: number | null | undefined): string {
    if (min === null || min === undefined || !Number.isFinite(Number(min)))
      return '—'
    const total = Math.max(0, Math.floor(Number(min)))
    const h = Math.floor(total / 60)
    const m = total % 60
    return h
      ? `${h} ${t('time_hour_short')} ${String(m).padStart(2, '0')} ${t('time_minute_short')}`
      : `${m} ${t('time_minute_short')}`
  }
  function fmtPrep(sec: number | null | undefined): string {
    if (sec === null || sec === undefined)
      return '—'
    const n = Number(sec)
    if (!Number.isFinite(n) || n <= 0)
      return '—'
    if (n < 60)
      return `${Math.round(n)} ${t('time_second_short')}`
    return `${Math.floor(n / 60)} ${t('time_minute_short')} ${String(Math.round(n % 60)).padStart(2, '0')} ${t('time_second_short')}`
  }
  function fmtPeak(p: any): string {
    if (!p || p.hour === undefined || p.hour === null)
      return '—'
    const h = String(p.hour).padStart(2, '0')
    return p.orders !== undefined ? `${h}:00 (${p.orders})` : `${h}:00`
  }
  function initialsOf(first?: string, last?: string, email?: string, name?: string): string {
  // BE list serializer returns user as { id, uuid, name } only (no first_name/last_name/email).
  // Prefer the combined `name` field; fall back to first/last/email for other endpoints (e.g. /users).
    const f = (first || '').trim()
    const l = (last || '').trim()
    if (f || l)
      return ((f[0] || '') + (l[0] || '')).toUpperCase() || '?'
    const combined = (name || '').trim()
    if (combined) {
      const parts = combined.split(/\s+/)
      const a = parts[0]?.[0] || ''
      const b = parts[1]?.[0] || ''
      return (a + b).toUpperCase() || '?'
    }
    if (email)
      return email.slice(0, 2).toUpperCase()
    return '?'
  }
  function fullName(u: any): string {
    if (!u)
      return t('Unknown')

    // BE shift serializer returns { id, uuid, name }. Other endpoints (e.g. /users) return first/last/email.
    if (u.name)
      return String(u.name).trim() || `#${u.id}`
    const n = `${u.first_name || ''} ${u.last_name || ''}`.trim()
    return n || u.email || `#${u.id}`
  }

  function shiftState(s: any): 'active' | 'awaiting' | 'reconciled' | 'closed' {
    if ((s.status === 'ACTIVE' || s.status === 'OPEN'))
      return 'active'

    // BE reconciliation shape: { id, expected_cash, actual_cash, difference, notes, reconciled_by, created_at }.
    // Old keys (counted_cash, reported) kept as soft fallback for any cached/older response.
    if (s.reconciliation && (s.reconciliation.id || s.reconciliation.actual_cash !== undefined || s.reconciliation.counted_cash !== undefined || s.reconciliation.reported !== undefined))
      return 'reconciled'
    if (s.status === 'ENDED')
      return 'awaiting'
    return 'closed'
  }
  function expectedCash(s: any): number {
  // BE reconciliation carries the authoritative expected_cash (cash_collected - expenses). The list
  // serializer (_serialize_shift) omits expenses_total entirely — it only appears on dashboard/cashbox
  // views. Without a reconciliation row we cannot subtract expenses, so fall back to cash_collected.
    if (s.reconciliation?.expected_cash !== undefined && s.reconciliation?.expected_cash !== null)
      return num(s.reconciliation.expected_cash)
    return num(s.cash_collected)
  }
  function expectedSettlement(s: any): number | null {
    return moneyNumber(completeAllTendersToReceive(s))
  }
  function confirmedSettlement(s: any): number | null {
    const rows = Array.isArray(s?.settlement) ? s.settlement : []
    if (!rows.length || rows.some((row: any) => !methodIsManagerConfirmed(row)))
      return null
    return rows.reduce(
      (total: number, row: any) => total + num(row?.confirmed),
      0,
    )
  }
  function reportedCash(s: any): number {
    const r = s.reconciliation || {}

    // BE returns `actual_cash`. Old fallback keys retained for safety.
    return num(r.actual_cash ?? r.counted_cash ?? r.reported ?? r.amount)
  }
  function reportedBy(s: any): string {
    const r = s.reconciliation || {}

    // BE returns `reconciled_by: { id, name }`. Keep legacy fallbacks for older data shapes.
    const u = r.reconciled_by || r.reported_by_user || r.reported_by || r.user
    if (typeof u === 'string')
      return u
    return u ? fullName(u) : t('Manager')
  }
  function varianceOf(s: any): number {
    const r = s.reconciliation || {}

    // BE returns `difference` (actual - expected); old client code used `variance`. Use either.
    if (r.difference !== undefined && r.difference !== null)
      return num(r.difference)
    if (r.variance !== undefined && r.variance !== null)
      return num(r.variance)
    const counted = r.actual_cash ?? r.counted_cash
    if (counted !== undefined)
      return num(counted) - expectedCash(s)
    return 0
  }

  // Returns [{ method, amount }] sorted desc, excluding zero entries.
  // Used to surface per-tender breakdown (CASH/UZCARD/HUMO/PAYME/MIXED) in the card.
  // NOTE: payment_mix is only present on detail responses (_serialize_shift detail=True via _shift_stats).
  // The /shifts list endpoint does NOT include it, so this expander only renders when a detail payload is loaded.
  function paymentMixRows(s: any): { method: string; amount: number }[] {
    const mix = s.payment_mix || {}
    const out: { method: string; amount: number }[] = []
    for (const k of Object.keys(mix)) {
      const amt = num((mix as any)[k]?.amount)
      if (amt > 0)
        out.push({ method: k, amount: amt })
    }
    out.sort((a, b) => b.amount - a.amount)
    return out
  }

  function cardPayments(s: any): number {
  // payment_mix is detail-only (omitted from /shifts list serializer); the fallback
  // total_revenue - cash_collected is what actually runs in list view.
    const mix = s.payment_mix || {}
    let total = 0
    for (const k of Object.keys(mix)) {
      if (k === 'CASH')
        continue
      total += num((mix as any)[k]?.amount)
    }
    if (total > 0)
      return total
    return Math.max(0, num(s.total_revenue) - num(s.cash_collected))
  }
  function avgTicket(s: any): number {
  // total_revenue arrives as a string from BE (str(...) coerce). Wrap both in num() for safety.
    const o = num(s.total_orders)
    return o > 0 ? num(s.total_revenue) / o : 0
  }
  function netOf(s: any): number | null {
  // BE /shifts list serializer omits net_revenue, expenses_total and cancelled_orders_value entirely.
  // Use net_revenue when present in detail payloads.
  // Missing net figures remain unavailable until a detail response provides them.
    if (s.net_revenue !== undefined && s.net_revenue !== null)
      return num(s.net_revenue)
    return null
  }

  return { fmtDateTime, fmtDuration, fmtPrep, fmtPeak, initialsOf, fullName, shiftState, expectedCash, expectedSettlement, confirmedSettlement, reportedCash, reportedBy, varianceOf, paymentMixRows, cardPayments, avgTicket, netOf }
}
