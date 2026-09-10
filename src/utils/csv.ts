export interface CsvOptions {
  alwaysQuote?: boolean
  bom?: boolean
  lineEnding?: '\n' | '\r\n'
}

const FORMULA_MARKERS = new Set(['=', '+', '-', '@'])

function hasFormulaPrefix(text: string): boolean {
  let index = 0

  while (index < text.length) {
    const char = text[index]

    if (char.charCodeAt(0) > 32 && char.trim() !== '')
      break

    index++
  }

  return FORMULA_MARKERS.has(text[index] ?? '')
}

/**
 * Prevent a spreadsheet from interpreting user-controlled text as a formula.
 * Numeric values remain numeric; potentially executable string values receive
 * a leading apostrophe, which spreadsheet applications render as plain text.
 */
export function neutralizeCsvFormula(value: unknown): string {
  if (value === null || value === undefined)
    return ''

  const text = String(value)

  if (typeof value !== 'string')
    return text

  return hasFormulaPrefix(text) ? `'${text}` : text
}

export function csvCell(value: unknown, alwaysQuote = false): string {
  const safe = neutralizeCsvFormula(value)
  const escaped = safe.replace(/"/g, '""')

  if (alwaysQuote || /[",\r\n]/.test(safe))
    return `"${escaped}"`

  return escaped
}

export function buildCsv(
  rows: readonly (readonly unknown[])[],
  options: CsvOptions = {},
): string {
  const {
    alwaysQuote = false,
    bom = true,
    lineEnding = '\r\n',
  } = options

  const content = rows
    .map(row => row.map(value => csvCell(value, alwaysQuote)).join(','))
    .join(lineEnding)

  return `${bom ? '\uFEFF' : ''}${content}${content ? lineEnding : ''}`
}
