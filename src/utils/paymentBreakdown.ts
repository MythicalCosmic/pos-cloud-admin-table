export interface PaymentMethodAmount { type: string; amount: number | string }

/** Physical card networks share a displayed total; digital tenders stay distinct. */
export function groupPaymentMethods(methods: PaymentMethodAmount[]) {
  const grouped = new Map<string, number>()
  for (const method of methods) {
    const raw = String(method.type ?? '').toUpperCase()
    const type = ['CARD', 'HUMO', 'UZCARD'].includes(raw) ? 'CARD' : raw
    const amount = Number(method.amount)
    if (!type || !Number.isFinite(amount) || amount <= 0)
      continue
    grouped.set(type, (grouped.get(type) ?? 0) + amount)
  }
  return Array.from(grouped, ([type, amount]) => ({ type, amount }))
}

export const paymentMethodNames: Record<string, string> = {
  CASH: 'Cash', CARD: 'Card', UZCARD: 'Uzcard', HUMO: 'Humo', PAYME: 'Payme', CLICK: 'Click',
}
export const paymentMethodColors: Record<string, string> = {
  CASH: 'var(--c2)', CARD: 'var(--c4)', UZCARD: 'var(--c1)', HUMO: 'var(--c4)', PAYME: 'var(--c3)', CLICK: 'var(--c5)',
}
