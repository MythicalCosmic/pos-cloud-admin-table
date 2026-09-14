/**
 * Canonical translation keys for user-facing route names.
 *
 * File-based routes can have dynamic child segments, so consumers should use
 * `routeLabelForPath()` instead of looking up the current path directly.
 */
export const ROUTE_LABELS: Record<string, string> = {
  '/': 'Dashboard',
  '/design': 'Design System',
  '/dashboard': 'Dashboard',
  '/dash/executive': 'Executive Overview',
  '/dash/operations': 'Operations',
  '/dash/kitchen': 'Kitchen & Production',
  '/dash/finance': 'Financial Overview',
  '/dash/customers': 'Customer Insights',
  '/analytics': 'Analytics',
  '/analytics/shift-handover': 'Shift Handover Report',
  '/analytics/menu-engineering': 'Menu Engineering',
  '/analytics/product-statistics': 'Product sales analytics',
  '/reports/product-performance': 'report_title',
  '/analytics/compare': 'Product comparison',
  '/forecast/tomorrow': 'Demand Forecast',
  '/audit': 'Operational Audit',
  '/warehouse': 'Warehouse operations',
  '/ai-assistant': 'AI Assistant',
  '/shift-analytics': 'Shift Analytics',
  '/shifts': 'Shifts',
  '/shifts-analytics': 'Shifts',
  '/users': 'Users',
  '/categories': 'Categories',
  '/products': 'Products',
  '/orders': 'Orders',
  '/places': 'Places & Tables',
  '/discounts': 'Discounts',
  '/discounts/secret-word': 'discount_secret_title',
  '/cashbox/categories': 'Cashbox Expense Categories',
  '/money-control': 'Money Control',
  '/treasury': 'Safe & Bank',
  '/loyalty': 'Loyalty',
  '/sessions': 'Sessions',
  '/hr-employees': 'Employees',
  '/hr-departments': 'Departments',
  '/hr-salaries': 'Salaries',
  '/hr-attendance': 'Attendance',
  '/hr-leaves': 'Leave Requests',
  '/hr-contracts': 'Contracts',
  '/hr-expenses': 'Expenses',
  '/hr-cash': 'HR Cash',
  '/hr-documents': 'HR Documents',
  '/hr-events': 'Employment Events',
  '/hr-expense-categories': 'Expense Categories',
  '/hr-goals': 'Goals',
  '/hr-leave-balances': 'Leave Balances',
  '/hr-leave-types': 'Leave Types',
  '/hr-reviews': 'Performance Reviews',
  '/shift-templates': 'Shift Templates',
  '/stock/alerts': 'Stock Alerts',
  '/stock/receiving': 'PO receiving',
  '/stock/adjustments': 'Stock Adjustments',
  '/stock/adjustment-requests': 'Stock adjustment requests',
  '/stock/reservations': 'Stock Reservations',
  '/stock/batches': 'Batches',
  '/stock/categories': 'Stock Categories',
  '/stock/counts': 'Stock Counts',
  '/stock/items': 'Stock Items',
  '/stock/levels': 'Stock Levels',
  '/stock/locations': 'Stock Locations',
  '/stock/product-links': 'Product Stock Links',
  '/stock/production-orders': 'Production Orders',
  '/stock/purchase-invoices': 'Supplier invoices',
  '/stock/purchase-orders': 'Purchase Orders',
  '/stock/recipes': 'Recipes',
  '/stock/settings': 'Stock Settings',
  '/stock/suppliers': 'Suppliers',
  '/stock/transactions': 'Stock Transactions',
  '/stock/transfers': 'Stock Transfers',
  '/stock/units': 'Units',
  '/stock/variance-codes': 'Variance Codes',
  '/app-settings': 'App Settings',
  '/settings/roles': 'Roles & Permissions',
  '/fiscalization': 'Fiscalization',
  '/licensing/status': 'License Status',
  '/licensing/plans': 'License Plans',
  '/licensing/setup': 'License Setup',
  '/qr-codes': 'QR Codes',
  '/notifications': 'Notifications',
  '/notification-queue': 'Notification Queue',
  '/notification-settings': 'Notification Settings',
  '/notification-templates': 'Notification Templates',
  '/notification-types': 'Notification Types',
}

export function routeLabelForPath(path: string): string {
  const normalized = path.length > 1 ? path.replace(/\/+$/, '') : path
  const exact = ROUTE_LABELS[normalized]
  if (exact)
    return exact

  const parent = Object.keys(ROUTE_LABELS)
    .filter(candidate => candidate !== '/' && normalized.startsWith(`${candidate}/`))
    .sort((a, b) => b.length - a.length)[0]

  return parent ? ROUTE_LABELS[parent] : ''
}
