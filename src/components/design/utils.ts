/**
 * Shared helpers for the design primitives.
 * Port of the cx() helper + STATUS_TONE map from
 * .tmp-alpha-design/alpha-design-source/ui.primitives.jsx
 */

/** Whitespace-joined truthy class names (matches the React `cx` helper). */
export function cx(...parts: Array<string | undefined | null | false | 0>): string {
  return parts.filter(Boolean).join(' ')
}

export type Tone =
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'primary'
  | 'neutral'

/** Status string -> tone mapping. Verbatim port of STATUS_TONE in ui.primitives.jsx. */
export const STATUS_TONE: Record<string, Tone> = {
  ACTIVE: 'success',
  COMPLETED: 'success',
  READY: 'success',
  PAID: 'success',
  PREPARING: 'warning',
  PENDING: 'warning',
  INACTIVE: 'neutral',
  CANCELLED: 'error',
  CANCELED: 'error',
  UNPAID: 'error',
  CASHIER: 'info',
  USER: 'neutral',
  MANAGER: 'primary',
  ADMIN: 'primary',
  HALL: 'neutral',
  DELIVERY: 'info',
  PICKUP: 'primary',
}
