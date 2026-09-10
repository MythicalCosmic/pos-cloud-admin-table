/**
 * Fail-closed selectors for the shift-money API.
 *
 * These values deliberately remain strings until the caller has checked the
 * associated evidence gate and hands the value to the existing UZS formatter.
 * Never replace a null canonical amount with a known/diagnostic subtotal.
 */

export type MoneyText = string

export interface SettlementRow {
  method?: unknown
  expected?: unknown
  frozen_expected?: unknown
  expected_source?: unknown
  counted?: unknown
  cashier_count_submitted?: unknown
  cashier_count_status?: unknown
  confirmed?: unknown
  manager_confirmed?: unknown
  confirmation_source?: unknown
  confirmation_difference?: unknown
  difference?: unknown
  frozen_difference?: unknown
  difference_source?: unknown
  status?: unknown
  reconciled?: unknown
  shift_reconciled?: unknown
  [key: string]: unknown
}

export interface ShiftReconciliation {
  expected_cash?: unknown
  actual_cash?: unknown
  difference?: unknown
  [key: string]: unknown
}

export interface ShiftMoneyRecord {
  financial_evidence_available?: unknown
  cash_to_receive?: unknown
  cash_to_receive_complete?: unknown
  known_cash_to_receive?: unknown
  noncash_to_receive?: unknown
  noncash_to_receive_complete?: unknown
  known_noncash_to_receive?: unknown
  all_tenders_to_receive?: unknown
  all_tenders_to_receive_complete?: unknown
  known_all_tenders_to_receive?: unknown
  total_expected_to_receive?: unknown
  total_expected_to_receive_scope?: unknown
  expected_by_tender?: unknown
  tender_attribution_complete?: unknown
  unattributed_expected_amount?: unknown
  unattributed_evidence_count?: unknown
  tender_totals_source?: unknown
  frozen_tender_evidence_complete?: unknown
  expected_cash?: unknown
  expected_cash_source?: unknown
  reconciliation?: ShiftReconciliation | null
  settlement?: SettlementRow[] | null
  [key: string]: unknown
}

export interface ShiftSummary extends Record<string, unknown> {
  live_count?: unknown
  awaiting_reconciliation_scope?: unknown
  awaiting_reconciliation_cash_to_receive?: unknown
  awaiting_reconciliation_cash_to_receive_complete?: unknown
  awaiting_reconciliation_noncash_to_receive?: unknown
  awaiting_reconciliation_noncash_to_receive_complete?: unknown
  awaiting_reconciliation_all_tenders_to_receive?: unknown
  awaiting_reconciliation_totals_available?: unknown
  awaiting_reconciliation_unavailable_shift_count?: unknown
  awaiting_reconciliation_count?: unknown
  total_confirmed_received?: unknown
  confirmed_all_tenders_complete?: unknown
  known_total_confirmed_received?: unknown
  incomplete_posted_all_tender_reconciliation_count?: unknown
  unattributed_evidence_count?: unknown
}

export type ReconciliationSetup =
  | { ok: true; cashExpected: MoneyText; cashRow: SettlementRow; rows: SettlementRow[] }
  | { ok: false; reason: ReconciliationSetupReason; rows: SettlementRow[] }

export type ReconciliationSetupReason =
  | 'ALREADY_RECONCILED'
  | 'FINANCIAL_EVIDENCE_UNAVAILABLE'
  | 'PHYSICAL_CASH_INCOMPLETE'
  | 'CASH_SETTLEMENT_ROW_MISSING'
  | 'CASH_EXPECTED_UNAVAILABLE'
  | 'CASH_PROVENANCE_UNSAFE'
  | 'CASH_CONTRACT_MISMATCH'

const SAFE_EXPECTED_SOURCES = new Set([
  'CANONICAL_DERIVED',
  'FROZEN_MATCHED',
  'RECONCILIATION_FROZEN',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/** Convert accepted API money into its display-safe string form. */
export function moneyText(value: unknown): MoneyText | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return (trimmed && Number.isFinite(Number(trimmed))) ? trimmed : null
  }
  if (typeof value === 'number' && Number.isFinite(value))
    return String(value)
  return null
}

/** Only call after a selector has proven the value is present. */
export function moneyNumber(value: MoneyText | null | undefined): number | null {
  if (value == null)
    return null
  const result = Number(value)
  return Number.isFinite(result) ? result : null
}

export function settlementRows(shift: ShiftMoneyRecord | null | undefined): SettlementRow[] {
  const rows = shift?.settlement
  return Array.isArray(rows) ? rows.filter(isRecord) as SettlementRow[] : []
}

export function settlementMethod(row: SettlementRow): string | null {
  const value = typeof row.method === 'string' ? row.method.trim().toUpperCase() : ''
  return value || null
}

export function settlementExpectedIsSafe(row: SettlementRow): boolean {
  const source = typeof row.expected_source === 'string' ? row.expected_source.trim().toUpperCase() : ''
  return SAFE_EXPECTED_SOURCES.has(source)
}

export function safeSettlementExpected(row: SettlementRow): MoneyText | null {
  if (!settlementExpectedIsSafe(row))
    return null
  return moneyText(row.expected)
}

export function methodIsManagerConfirmed(row: SettlementRow): boolean {
  return row.manager_confirmed === true && row.reconciled === true && moneyText(row.confirmed) != null
}

export function reconciledCash(shift: ShiftMoneyRecord | null | undefined): {
  expected: MoneyText
  actual: MoneyText
  difference: MoneyText
} | null {
  const rec = isRecord(shift?.reconciliation) ? shift?.reconciliation : null
  if (!rec)
    return null
  const expected = moneyText(rec.expected_cash)
  const actual = moneyText(rec.actual_cash)
  const difference = moneyText(rec.difference)
  if (expected == null || actual == null || difference == null)
    return null
  return { expected, actual, difference }
}

export function unreconciledPhysicalCash(shift: ShiftMoneyRecord | null | undefined): MoneyText | null {
  if (isRecord(shift?.reconciliation))
    return null
  if (shift?.financial_evidence_available !== true)
    return null
  if (shift?.cash_to_receive_complete !== true)
    return null
  return moneyText(shift?.cash_to_receive)
}

export function completeNoncashToReceive(shift: ShiftMoneyRecord | null | undefined): MoneyText | null {
  if (shift?.noncash_to_receive_complete !== true)
    return null
  return moneyText(shift?.noncash_to_receive)
}

export function completeAllTendersToReceive(shift: ShiftMoneyRecord | null | undefined): MoneyText | null {
  if (shift?.all_tenders_to_receive_complete !== true)
    return null
  return moneyText(shift?.all_tenders_to_receive)
}

export function hasAttributionWarning(shift: ShiftMoneyRecord | null | undefined): boolean {
  const eventCount = moneyNumber(moneyText(shift?.unattributed_evidence_count)) ?? 0
  return shift?.tender_attribution_complete !== true || eventCount > 0
}

export function outstandingPhysicalCash(summary: ShiftSummary | null | undefined): MoneyText | null {
  if (summary?.awaiting_reconciliation_scope !== 'ENDED_WITHOUT_RECONCILIATION')
    return null
  if (summary?.awaiting_reconciliation_cash_to_receive_complete !== true)
    return null
  return moneyText(summary?.awaiting_reconciliation_cash_to_receive)
}

export function outstandingNoncash(summary: ShiftSummary | null | undefined): MoneyText | null {
  if (summary?.awaiting_reconciliation_scope !== 'ENDED_WITHOUT_RECONCILIATION')
    return null
  if (summary?.awaiting_reconciliation_noncash_to_receive_complete !== true)
    return null
  return moneyText(summary?.awaiting_reconciliation_noncash_to_receive)
}

export function outstandingAllTenders(summary: ShiftSummary | null | undefined): MoneyText | null {
  if (summary?.awaiting_reconciliation_scope !== 'ENDED_WITHOUT_RECONCILIATION')
    return null
  if (summary?.awaiting_reconciliation_totals_available !== true)
    return null
  return moneyText(summary?.awaiting_reconciliation_all_tenders_to_receive)
}

export function completeAllTenderConfirmation(summary: ShiftSummary | null | undefined): MoneyText | null {
  if (summary?.confirmed_all_tenders_complete !== true)
    return null
  return moneyText(summary?.total_confirmed_received)
}

function amountsMatch(...values: Array<MoneyText | null>): boolean {
  const numbers = values.map(moneyNumber)
  if (numbers.some(value => value == null))
    return false
  return numbers.every(value => value === numbers[0])
}

/**
 * The reconcile dialog has an intentionally stricter gate than a card. It
 * must receive a fresh detail response whose canonical CASH values all agree.
 */
export function reconciliationSetup(shift: ShiftMoneyRecord | null | undefined): ReconciliationSetup {
  const rows = settlementRows(shift)
  if (isRecord(shift?.reconciliation))
    return { ok: false, reason: 'ALREADY_RECONCILED', rows }
  if (shift?.financial_evidence_available !== true)
    return { ok: false, reason: 'FINANCIAL_EVIDENCE_UNAVAILABLE', rows }

  const physicalCash = unreconciledPhysicalCash(shift)
  if (physicalCash == null)
    return { ok: false, reason: 'PHYSICAL_CASH_INCOMPLETE', rows }

  const cashRow = rows.find(row => settlementMethod(row) === 'CASH')
  if (!cashRow)
    return { ok: false, reason: 'CASH_SETTLEMENT_ROW_MISSING', rows }
  if (!settlementExpectedIsSafe(cashRow))
    return { ok: false, reason: 'CASH_PROVENANCE_UNSAFE', rows }

  const rowExpected = moneyText(cashRow.expected)
  const flatExpected = moneyText(shift?.expected_cash)
  if (rowExpected == null || flatExpected == null)
    return { ok: false, reason: 'CASH_EXPECTED_UNAVAILABLE', rows }

  if (!amountsMatch(physicalCash, rowExpected, flatExpected))
    return { ok: false, reason: 'CASH_CONTRACT_MISMATCH', rows }

  return { ok: true, cashExpected: rowExpected, cashRow, rows }
}

export function rowRequiresManagerConfirmation(row: SettlementRow): boolean {
  if (settlementMethod(row) === 'CASH')
    return true
  const expected = moneyNumber(moneyText(row.expected)) ?? 0
  const cashierCounted = moneyNumber(moneyText(row.counted)) ?? 0
  return expected !== 0 || cashierCounted !== 0
}

export function settlementRowIsUncounted(row: SettlementRow): boolean {
  return String(row.status ?? '').toUpperCase() === 'UNCOUNTED'
}

export function settlementRowStatus(row: SettlementRow): 'OPEN' | 'UNCOUNTED' | 'COUNTED' | 'CONFIRMED' | null {
  const status = String(row.status ?? '').trim().toUpperCase()
  return ['OPEN', 'UNCOUNTED', 'COUNTED', 'CONFIRMED'].includes(status)
    ? status as 'OPEN' | 'UNCOUNTED' | 'COUNTED' | 'CONFIRMED'
    : null
}
