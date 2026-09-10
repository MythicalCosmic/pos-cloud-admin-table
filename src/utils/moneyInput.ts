import { fmtNum } from '@/components/design/utils/format'

interface MoneyInputOptions {
  allowFraction?: boolean
  maxFractionDigits?: number
}

function moneyParts(value: string | null | undefined, options: MoneyInputOptions) {
  const raw = String(value ?? '')
  const allowFraction = options.allowFraction ?? false
  const separatorIndex = allowFraction ? raw.search(/[.,]/) : -1
  const integerSource = separatorIndex >= 0 ? raw.slice(0, separatorIndex) : raw
  const fractionSource = separatorIndex >= 0 ? raw.slice(separatorIndex + 1) : ''
  const maxFractionDigits = options.maxFractionDigits ?? 4

  return {
    hasSeparator: separatorIndex >= 0,
    integer: integerSource.replace(/\D/g, ''),
    fraction: fractionSource.replace(/\D/g, '').slice(0, maxFractionDigits),
  }
}

/** Format a UZS input while retaining an optional fractional component. */
export function formatMoneyInput(
  value: string | null | undefined,
  options: MoneyInputOptions = {},
): string {
  const parts = moneyParts(value, options)
  if (!parts.integer && !parts.fraction)
    return parts.hasSeparator ? '0.' : ''

  const amount = Number(parts.integer || '0')
  if (!Number.isSafeInteger(amount))
    return ''

  const whole = fmtNum(amount)
  if (!parts.hasSeparator)
    return whole

  return `${whole}.${parts.fraction}`
}

/** Parse a grouped UZS input into a number suitable for JSON payloads. */
export function parseMoneyInput(
  value: string | null | undefined,
  options: MoneyInputOptions = {},
): number | null {
  const parts = moneyParts(value, options)
  if (!parts.integer && !parts.fraction)
    return null

  const amount = Number(`${parts.integer || '0'}${parts.hasSeparator ? `.${parts.fraction}` : ''}`)
  return (Number.isFinite(amount) && Number.isSafeInteger(Math.trunc(amount))) ? amount : null
}

/**
 * Format whole-number UZS while keeping the stored value safe for the API.
 * Uses the canonical formatter, including narrow no-break-space grouping.
 */
export function formatWholeMoneyInput(value: string | null | undefined): string {
  return formatMoneyInput(value)
}

/** Parse a grouped whole-number UZS input without accepting negative amounts. */
export function parseWholeMoneyInput(value: string | null | undefined): number | null {
  return parseMoneyInput(value)
}

/** Return the caret offset immediately after the requested typed digit. */
export function caretAfterDigitCount(value: string, digitCount: number): number {
  if (digitCount <= 0)
    return 0

  let seen = 0
  for (let index = 0; index < value.length; index += 1) {
    if (/\d/.test(value[index]))
      seen += 1
    if (seen === digitCount)
      return index + 1
  }
  return value.length
}
