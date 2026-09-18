import { hrApi } from '@/plugins/axios'

export interface SalaryRecord {
  id: number
  employee_id: number
  employee: { id: number; position: string; user?: { id: number; first_name: string; last_name: string } } | null
  period_year: number
  period_month: number
  base_amount: string
  bonus: string
  deduction: string
  net_amount: string
  status: 'PENDING' | 'APPROVED' | 'PAID'
  paid_at: string | null
  notes: string
}

export interface SalarySummary {
  count: number
  total_base: string
  total_bonus: string
  total_deduction: string
  total_net: string
  by_status: Record<string, string>
}

function payloadOf(response: any): Record<string, any> {
  return response?.data?.data ?? response?.data ?? {}
}

export async function listSalaries(params: { year: number; month: number; employee_id?: number }) {
  const data = payloadOf(await hrApi.get('/salaries/', { params: { ...params, per_page: 100 } }))

  return (data.salaries ?? []) as SalaryRecord[]
}

export async function getSalarySummary(year: number, month: number) {
  return payloadOf(await hrApi.get('/salaries/summary/', { params: { year, month } })) as SalarySummary
}
