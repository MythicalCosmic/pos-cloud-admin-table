import axios from '@/plugins/axios'

export type TreasuryAccountKind = 'SAFE' | 'BANK'

export interface TreasuryAccount {
  kind: TreasuryAccountKind
  balance: string
  balance_uzs?: number
  last_updated?: string | null
}

export interface TreasuryTransaction {
  id: number
  account: TreasuryAccountKind | null
  type: string
  delta: string
  delta_uzs: number
  fee_uzs: number
  balance_after: string
  counterparty: TreasuryAccountKind | null
  category: string
  description: string
  reference_type: string
  reference_id: number | null
  performed_by: string | null
  created_at: string
}

export interface TreasuryHistoryParams {
  page?: number
  per_page?: number
  account?: TreasuryAccountKind
  type?: string
  date_from?: string
  date_to?: string
  search?: string
  reference_type?: string
  reference_id?: number
}

function payloadOf(response: any): Record<string, any> {
  return response?.data?.data ?? response?.data ?? {}
}

/** Safe and Bank balances, keyed by account kind. */
export async function getTreasuryAccounts() {
  const data = payloadOf(await axios.get('/treasury/accounts'))

  return (data.accounts ?? {}) as Partial<Record<TreasuryAccountKind, TreasuryAccount>>
}

export async function getTreasuryHistory(params: TreasuryHistoryParams = {}) {
  const data = payloadOf(await axios.get('/treasury/history', { params }))

  return {
    transactions: (data.transactions ?? []) as TreasuryTransaction[],
    total: Number(data.pagination?.total ?? data.transactions?.length ?? 0),
  }
}
