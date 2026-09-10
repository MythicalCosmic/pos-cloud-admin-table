/**
 * Localized "active window" label for dashboard cards.
 *
 * The dashboard tabs fetch their data for whatever range the shared
 * DateRangePicker holds, but their card titles used to hardcode "· 30 days" /
 * "· last 7 days" — so the label lied when the user picked Today / a custom
 * range. `formatWindow` turns the current range into a short localized string
 * that cards interpolate as `{window}`.
 *
 * Presets resolve to their existing localized labels (Bugun, Oxirgi 30 kun, …).
 * A custom range renders locale-neutral day.month (e.g. "09.06–09.07") so no
 * per-locale month names are needed. Empty range falls back to Last 30 days,
 * matching the hub's default.
 */
import type { DateRangeValue } from '@/components/design/DateRangePicker.vue'

const PRESET_LABEL: Record<string, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  month: 'This month',
  prevmonth: 'Last month',
  year: 'This year',
  all: 'All time',
}

function dayMonth(ymd: string): string {
  const p = String(ymd).split('-')
  return p.length >= 3 ? `${p[2]}.${p[1]}` : String(ymd)
}

function nextDate(ymd: string): string {
  const [year, month, day] = String(ymd).split('-').map(Number)
  const date = new Date(year, month - 1, day)
  date.setDate(date.getDate() + 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function formatWindow(
  range: DateRangeValue | null | undefined,
  t: (key: string) => string,
): string {
  const r = range
  if (r?.from && r?.to && r.fromTime && r.toTime) {
    const end = r.from === r.to && r.toTime <= r.fromTime ? nextDate(r.to) : r.to
    return `${dayMonth(r.from)} ${r.fromTime}–${dayMonth(end)} ${r.toTime}`
  }
  if (r?.preset && PRESET_LABEL[r.preset])
    return t(PRESET_LABEL[r.preset])
  if (r?.from && r?.to)
    return r.from === r.to ? dayMonth(r.from) : `${dayMonth(r.from)}–${dayMonth(r.to)}`
  if (r?.from)
    return dayMonth(r.from)
  return t('Last 30 days')
}
