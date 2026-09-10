/* ============================================================
   Shared STATUS_TONE map — used by pages that render status
   badges (orders, shifts-analytics, analytics/shift-handover,
   etc.) so the same status renders the same color everywhere.

   Tones map to design-shell `.t-{tone}` badge classes:
   success / warning / error / info / primary / neutral
   ============================================================ */
export const STATUS_TONE: Record<string, string> = {
  // shift / order lifecycle
  ACTIVE: 'success',
  COMPLETED: 'success',
  READY: 'success',
  PAID: 'success',
  PREPARING: 'warning',
  PENDING: 'warning',
  OPEN: 'warning', // in-progress — must be warning (matches orders page)
  INACTIVE: 'neutral',
  CANCELLED: 'error',
  CANCELED: 'error',
  UNPAID: 'error',

  // order types
  HALL: 'neutral',
  DELIVERY: 'info',
  PICKUP: 'primary',

  // payment methods
  CASH: 'success',
  UZCARD: 'primary',
  HUMO: 'warning',
  PAYME: 'info',
  CLICK: 'info',
  MIXED: 'primary',

  // user / actor roles
  CASHIER: 'info',
  USER: 'neutral',
  MANAGER: 'primary',
  ADMIN: 'primary',
}

export function statusTone(v: string | undefined | null): string {
  if (!v) return 'neutral'
  return STATUS_TONE[String(v).toUpperCase()] || 'neutral'
}
