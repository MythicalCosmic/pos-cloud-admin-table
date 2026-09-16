/**
 * Number/currency formatters — port of .tmp-design-bundle/project/app/format.js.
 * UZS with comma thousands grouping (1,240,000), abbreviate large values
 * (1,240,000 -> 1.24M). Used by the design components.
 */
// ---- Global number-format mode (persisted to localStorage) ----
import { computed, ref } from 'vue'

// Narrow no-break space between an amount and its unit ("1,240,000 UZS").
const NB = ' '

// Thousands separator, chosen by the owner (2026-09-16).
export const GROUP = ','

function group(intStr: string): string {
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, GROUP)
}

export type NumberFormatMode = 'full' | 'short'

function readMode(): NumberFormatMode {
  try {
    const v = localStorage.getItem('numberFormat')
    return v === 'short' ? 'short' : 'full'
  }
  catch { return 'full' }
}

const _mode = ref<NumberFormatMode>(readMode())

export function setNumberFormatMode(m: NumberFormatMode) {
  _mode.value = m
  try { localStorage.setItem('numberFormat', m) }
  catch { /* noop */ }
}

export function useFormatMode() {
  return { mode: computed(() => _mode.value), setMode: setNumberFormatMode }
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', e => {
    if (e.key === 'numberFormat')
      _mode.value = readMode()
  })
}

export function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n))
    return '—'
  const neg = n < 0
  const s = group(Math.round(Math.abs(n)).toString())

  return (neg ? '-' : '') + s
}

export function fmtAbbr(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n))
    return '—'
  const neg = n < 0
  const a = Math.abs(n)
  const trim = (x: number) => x.toFixed(2).replace(/\.?0+$/, '')
  const trim1 = (x: number) => x.toFixed(1).replace(/\.0$/, '')
  let out: string
  if (a >= 1e9)
    out = `${trim(a / 1e9)}B`
  else if (a >= 1e6)
    out = `${trim(a / 1e6)}M`
  else if (a >= 1e3)
    out = `${trim1(a / 1e3)}K`
  else
    out = String(Math.round(a))

  return (neg ? '-' : '') + out
}

export function fmtMoney(n: number | string | null | undefined, opts?: { unit?: boolean; exact?: boolean }): string {
  // Reports carry decimal strings from the accounting dataset. Preserve their
  // precision (including values beyond Number.MAX_SAFE_INTEGER) when requested.
  if (opts?.exact) {
    const match = String(n ?? '').match(/^(-?)(\d+)(?:\.(\d+))?$/)
    if (!match)
      return '—'
    const [, sign, integer, fraction] = match
    const decimals = (fraction && /[1-9]/.test(fraction)) ? `.${fraction.replace(/0+$/, '').padEnd(2, '0')}` : ''
    const value = `${sign}${group(integer)}${decimals}`
    return opts.unit ? `${value}${NB}UZS` : value
  }
  const num = typeof n === 'string' ? Number(n) : n

  const v = (_mode.value === 'short' && typeof num === 'number' && Math.abs(num) >= 10000)
    ? fmtAbbr(num)
    : fmtNum(num)

  if (v === '—')
    return v

  return opts?.unit ? `${v}${NB}UZS` : v
}

export function fmtMoneyAbbr(n: number | null | undefined, opts?: { unit?: boolean }): string {
  const v = fmtAbbr(n)
  if (v === '—')
    return v

  return opts?.unit ? `${v}${NB}UZS` : v
}

export function fmtPct(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n))
    return '—'

  return `${n.toFixed(digits).replace(/\.0$/, '')}%`
}

export function fmtDelta(n: number | null | undefined, digits?: number): string {
  if (n === null || n === undefined || Number.isNaN(n))
    return '—'
  const s = fmtPct(Math.abs(n), digits)

  return (n > 0 ? '+' : n < 0 ? '−' : '') + s
}

function parseDate(d: Date | string | number | null | undefined): Date | null {
  if (d === null || d === undefined || d === '')
    return null
  const x = d instanceof Date ? d : new Date(d)

  return Number.isNaN(x.getTime()) ? null : x
}

export function fmtTime(d: Date | string | number | null | undefined): string {
  const x = parseDate(d)
  if (!x)
    return '—'
  const p = (v: number) => v < 10 ? `0${v}` : `${v}`

  return `${p(x.getHours())}:${p(x.getMinutes())}`
}

export function fmtDate(d: Date | string | number | null | undefined): string {
  const x = parseDate(d)
  if (!x)
    return '—'
  const p = (v: number) => v < 10 ? `0${v}` : `${v}`

  return `${p(x.getDate())}.${p(x.getMonth() + 1)}.${x.getFullYear()}`
}

export function fmtDateTime(d: Date | string | number | null | undefined): string {
  const x = parseDate(d)
  if (!x)
    return '—'
  const p = (v: number) => v < 10 ? `0${v}` : `${v}`

  return `${fmtDate(x)}, ${p(x.getHours())}:${p(x.getMinutes())}`
}

export { NB }

/**
 * Aggregate object mirroring the original `window.Fmt` from format.uz.js so
 * ported JSX-style call sites (e.g. `Fmt.money(n)`) keep working unchanged.
 */
export const Fmt = {
  NB,
  num: fmtNum,
  abbr: fmtAbbr,
  money: fmtMoney,
  moneyAbbr: fmtMoneyAbbr,
  pct: fmtPct,
  delta: fmtDelta,
  date: fmtDate,
  dateTime: fmtDateTime,
  time: fmtTime,
} as const
