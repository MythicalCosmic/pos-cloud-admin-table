import axiosIns from '@/plugins/axios'
import { listExpenses } from '@/services/expenseControlApi'

export interface TodaySales {
  revenue: string
  paid_orders: number
  orders: number
  open: number
  cancelled: number
  payments: Record<'cash' | 'card' | 'payme', number>
}

export async function getTodaySales(): Promise<TodaySales> {
  const data = (await axiosIns.get('/dashboard/today'))?.data?.data ?? {}
  const today = data.today ?? {}
  const breakdown = data.payment_breakdown_today ?? {}

  return {
    revenue: String(today.revenue ?? '0'),
    paid_orders: Number(today.paid_orders ?? 0),
    orders: Number(today.orders ?? 0),
    open: Number(today.open ?? 0),
    cancelled: Number(today.cancelled ?? 0),
    payments: {
      cash: Number(breakdown.cash ?? 0),
      card: Number(breakdown.card ?? 0),
      payme: Number(breakdown.payme ?? 0),
    },
  }
}

/** Expenses waiting for the owner: pending approval, or approved and not yet paid. */
export async function getWaitingExpenses() {
  const [pending, approved] = await Promise.all([
    listExpenses({ status: 'PENDING', per_page: 100 }),
    listExpenses({ status: 'APPROVED', per_page: 100 }),
  ])

  return { pending: pending.expenses, approved: approved.expenses }
}
