export const ORDER_STATUS_COLOR: Record<string, string> = {
  OPEN: 'primary',
  PREPARING: 'warning',
  READY: 'success',
  COMPLETED: 'secondary',
  CANCELED: 'error',
}

export const TRANSFER_STATUS_COLOR: Record<string, string> = {
  DRAFT: 'default',
  REQUESTED: 'info',
  APPROVED: 'primary',
  IN_TRANSIT: 'warning',
  RECEIVED: 'success',
  CANCELED: 'error',
}

export const PURCHASE_ORDER_STATUS_COLOR: Record<string, string> = {
  DRAFT: 'default',
  SENT: 'info',
  CONFIRMED: 'primary',
  PARTIAL: 'warning',
  RECEIVED: 'success',
  CANCELED: 'error',
}

export const PAYMENT_STATUS_COLOR: Record<string, string> = {
  UNPAID: 'warning',
  PARTIAL: 'info',
  PAID: 'success',
}

export const PRODUCTION_ORDER_STATUS_COLOR: Record<string, string> = {
  DRAFT: 'default',
  PLANNED: 'info',
  IN_PROGRESS: 'warning',
  COMPLETED: 'success',
  CANCELED: 'error',
  ON_HOLD: 'secondary',
}

export const PRODUCTION_PRIORITY_COLOR: Record<string, string> = {
  LOW: 'default',
  NORMAL: 'info',
  HIGH: 'warning',
  URGENT: 'error',
}

export const COUNT_STATUS_COLOR: Record<string, string> = {
  DRAFT: 'default',
  IN_PROGRESS: 'warning',
  PENDING_APPROVAL: 'info',
  APPROVED: 'success',
  CANCELED: 'error',
}

export const ROLE_COLOR: Record<string, string> = {
  ADMIN: 'error',
  MANAGER: 'primary',
  CASHIER: 'warning',
  WAITER: 'info',
  RESELLER: 'info',
  USER: 'secondary',
}
