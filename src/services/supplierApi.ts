import { stockApi } from '@/plugins/axios'

export interface SupplierSummary {
  id: number
  name: string
  code?: string
  phone?: string
  contact_person?: string
  current_balance_uzs: number | string
  is_active: boolean
}

export interface SupplierLedgerRow {
  id: number
  type: string
  amount_uzs: number
  change_uzs: number
  balance_after_uzs: number
  source_account: string | null
  note: string
  performed_by: { id: number; name: string } | null
  created_at: string
}

function payloadOf(response: any): Record<string, any> {
  return response?.data?.data ?? response?.data ?? {}
}

/** Every supplier (all pages), active ones first by debt. */
export async function listAllSuppliers() {
  const suppliers: SupplierSummary[] = []
  for (let page = 1; page <= 20; page += 1) {
    const data = payloadOf(await stockApi.get('/suppliers/', { params: { page, per_page: 100, active_only: 'false' } }))
    const batch = (data.suppliers ?? []) as SupplierSummary[]

    suppliers.push(...batch)

    const total = Number(data.pagination?.total_suppliers ?? suppliers.length)
    if (!batch.length || suppliers.length >= total)
      break
  }

  return suppliers
}

export async function getSupplier(id: number | string) {
  return payloadOf(await stockApi.get(`/suppliers/${id}/`)).supplier as SupplierSummary & Record<string, any>
}

export async function getSupplierLedger(id: number | string, params: { page?: number; per_page?: number } = {}) {
  const data = payloadOf(await stockApi.get(`/suppliers/${id}/ledger/`, { params }))

  return {
    rows: (data.transactions ?? []) as SupplierLedgerRow[],
    total: Number(data.pagination?.total ?? data.transactions?.length ?? 0),
  }
}
