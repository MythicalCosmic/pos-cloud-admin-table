const MONTH_KEYS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

type Translate = (key: string) => unknown

export function formatMonthNumber(
  month: unknown,
  translate: Translate,
  year?: unknown,
): string | null {
  const monthNumber = Number(month)
  if (!Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12)
    return null

  const name = String(translate(MONTH_KEYS[monthNumber - 1]))
  const normalizedYear = String(year ?? '').trim()

  return normalizedYear ? `${name} ${normalizedYear}` : name
}

/**
 * Convert API/report bucket codes such as M07, M07-2026, or 2026-M07 into
 * existing i18n month names. The whole label must be a month bucket so product
 * names and identifiers that merely contain "M07" remain untouched.
 */
export function formatMonthCodeLabel(value: unknown, translate: Translate): string {
  const label = String(value ?? '').trim()
  if (!label)
    return label

  const monthFirst = label.match(/^M(0[1-9]|1[0-2])(?:[\s./-]+(\d{4}))?$/i)
  if (monthFirst)
    return formatMonthNumber(monthFirst[1], translate, monthFirst[2]) ?? label

  const yearFirst = label.match(/^(\d{4})[\s./-]+M(0[1-9]|1[0-2])$/i)
  if (yearFirst)
    return formatMonthNumber(yearFirst[2], translate, yearFirst[1]) ?? label

  return label
}
