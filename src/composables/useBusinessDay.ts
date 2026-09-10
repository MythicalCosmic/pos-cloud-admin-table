/**
 * Business-day + operating-hours settings — single source of truth.
 *
 * Restaurants run an overnight service. Reporting is canonically fixed to
 * 07:00 on business date D through 03:00 on D+1, with the 03:00–07:00 gap
 * excluded. "Working hours" is a separate UI setting used as a convenient
 * exact-interval preset in the date picker.
 *
 * The operating-hour values are owned by the backend (`AppSettings`, exposed
 * at GET/PUT /api/admins/app-settings). We hydrate them on login and persist
 * changes with a localStorage mirror so the convenience preset works offline /
 * before the first fetch. The legacy business-day-start value is retained for
 * settings compatibility only; it no longer changes reporting windows.
 *
 * NOTE: this replaces the old two-key split (`businessDayStart` here vs
 * `alphapos-daystart` in SettingsMenu) — everything now reads these refs.
 */
import { computed, ref } from 'vue'
import axiosIns from '@/plugins/axios'

const HHMM = /^\d{1,2}:\d{2}$/
// Alfa POS's service window crosses midnight: the default business date runs
// from 07:00 on that date until 03:00 the following calendar day.
const DEFAULT_START = '07:00'
const DEFAULT_OPEN = '07:00'
const DEFAULT_CLOSE = '03:00'

function readLs(key: string, fallback: string): string {
  try {
    const v = localStorage.getItem(key)
    if (v && HHMM.test(v)) return v
  }
  catch { /* noop */ }
  return fallback
}
function writeLs(key: string, val: string) {
  try { localStorage.setItem(key, val) }
  catch { /* noop */ }
}

const _start = ref<string>(readLs('businessDayStart', DEFAULT_START))
const _open = ref<string>(readLs('businessOpen', DEFAULT_OPEN))
const _close = ref<string>(readLs('businessClose', DEFAULT_CLOSE))

export function setBusinessDayStart(hhmm: string) {
  if (!HHMM.test(hhmm)) return
  _start.value = hhmm
  writeLs('businessDayStart', hhmm)
}
export function setBusinessOpen(hhmm: string) {
  if (!HHMM.test(hhmm)) return
  _open.value = hhmm
  writeLs('businessOpen', hhmm)
}
export function setBusinessClose(hhmm: string) {
  if (!HHMM.test(hhmm)) return
  _close.value = hhmm
  writeLs('businessClose', hhmm)
}

/** Pull the operating-day settings from the backend (call after login). */
export async function hydrateBusinessSettings() {
  try {
    const res = await axiosIns.get('/app-settings')
    const s = res.data?.settings ?? res.data?.data?.settings ?? {}
    if (s.business_day_start) setBusinessDayStart(String(s.business_day_start).slice(0, 5))
    // business_open/business_close land once BE ships them; tolerate absence.
    if (s.business_open) setBusinessOpen(String(s.business_open).slice(0, 5))
    if (s.business_close) setBusinessClose(String(s.business_close).slice(0, 5))
  }
  catch { /* keep localStorage/defaults */ }
}

/** Persist the operating-day settings to the backend (PUT ignores unknown keys). */
export async function saveBusinessSettings(patch: {
  business_day_start?: string
  business_open?: string
  business_close?: string
}) {
  // Persist first. The visible/global values must never claim a setting was
  // saved when the server rejected or could not receive the update.
  await axiosIns.put('/app-settings', patch)
  if (patch.business_day_start) setBusinessDayStart(patch.business_day_start)
  if (patch.business_open) setBusinessOpen(patch.business_open)
  if (patch.business_close) setBusinessClose(patch.business_close)
}

const REPORTING_TIME_ZONE = 'Asia/Tashkent'
const REPORTING_CLOSE_HOUR = 3

function tashkentDateParts(now: Date): { year: number, month: number, day: number, hour: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: REPORTING_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(part => part.type === type)?.value || 0)

  return { year: value('year'), month: value('month'), day: value('day'), hour: value('hour') }
}

/**
 * Today as a BUSINESS calendar date (YYYY-MM-DD) in Asia/Tashkent.
 * Before the 03:00 close it is yesterday's operating date. During the
 * 03:00–07:00 quiet gap it is already the upcoming calendar date, matching
 * the server's canonical reporting window.
 */
export function businessToday(now: Date = new Date()): Date {
  const local = tashkentDateParts(now)
  const d = new Date(local.year, local.month - 1, local.day)
  if (local.hour < REPORTING_CLOSE_HOUR)
    d.setDate(d.getDate() - 1)
  return d
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Resolve a preset key → { from, to } in YYYY-MM-DD using business days.
 * BE expands each calendar date to its [date @ start, date+1 @ start) window.
 */
export function businessPreset(key: string): { from: string, to: string } {
  const today = businessToday()
  if (key === 'today') return { from: ymd(today), to: ymd(today) }
  if (key === 'yesterday') {
    const y = new Date(today); y.setDate(today.getDate() - 1)
    return { from: ymd(y), to: ymd(y) }
  }
  if (key === '7d') {
    const s = new Date(today); s.setDate(today.getDate() - 6)
    return { from: ymd(s), to: ymd(today) }
  }
  if (key === '30d') {
    const s = new Date(today); s.setDate(today.getDate() - 29)
    return { from: ymd(s), to: ymd(today) }
  }
  if (key === 'month')
    return { from: ymd(new Date(today.getFullYear(), today.getMonth(), 1)), to: ymd(today) }
  if (key === 'prevmonth') {
    const s = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const e = new Date(today.getFullYear(), today.getMonth(), 0)
    return { from: ymd(s), to: ymd(e) }
  }
  if (key === 'year')
    return { from: ymd(new Date(today.getFullYear(), 0, 1)), to: ymd(today) }
  return { from: '', to: '' }
}

/**
 * Build request params from a picker value. Bare dates are expanded by the
 * backend to canonical business-day windows. A clock pair is instead sent as
 * one exact continuous Asia/Tashkent ISO interval (`from_at`/`to_at`), never as
 * the old repeated-per-day `tod_*` filter. `orders:true` swaps bare date keys.
 */
export interface DateParamInput {
  from?: string
  to?: string
  fromTime?: string
  toTime?: string
  fromAt?: string
  toAt?: string
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

function addCalendarDay(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  date.setDate(date.getDate() + 1)
  return ymd(date)
}

function exactTimestamp(isoDate: string, hhmm: string): string {
  return `${isoDate}T${hhmm}:00+05:00`
}
export function buildDateParams(
  range: DateParamInput | null | undefined,
  opts: { orders?: boolean } = {},
): Record<string, string> {
  const p: Record<string, string> = {}
  if (!range) return p
  const fromAt = range.fromAt?.trim()
  const toAt = range.toAt?.trim()
  if (fromAt && toAt) {
    p.from_at = fromAt
    p.to_at = toAt
    return p
  }
  if (range.from && range.to && TIME_RE.test(range.fromTime || '') && TIME_RE.test(range.toTime || '')) {
    const startTime = range.fromTime as string
    const endTime = range.toTime as string
    // An overnight rollover is only implied when the user selected one
    // calendar date. For a multi-day interval, an earlier clock time on the
    // chosen end date is still a valid continuous range and must not extend
    // it by another day.
    const endDate = range.from === range.to && endTime <= startTime
      ? addCalendarDay(range.to)
      : range.to
    p.from_at = exactTimestamp(range.from, startTime)
    p.to_at = exactTimestamp(endDate, endTime)
    return p
  }
  const fromKey = opts.orders ? 'date_from' : 'from'
  const toKey = opts.orders ? 'date_to' : 'to'
  if (range.from) p[fromKey] = range.from
  if (range.to) p[toKey] = range.to
  if (range.from && range.to)
    p.granularity = range.from === range.to ? 'hour' : 'day'
  return p
}

export function useBusinessDay() {
  return {
    start: computed(() => _start.value),
    open: computed(() => _open.value),
    close: computed(() => _close.value),
    setStart: setBusinessDayStart,
    setOpen: setBusinessOpen,
    setClose: setBusinessClose,
    save: saveBusinessSettings,
    hydrate: hydrateBusinessSettings,
    today: businessToday,
    preset: businessPreset,
    buildParams: buildDateParams,
  }
}
