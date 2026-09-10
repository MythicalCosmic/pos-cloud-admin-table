import type { DashSharedPayload } from '@/composables/useDashboardData'

type Cell = string | number | null | undefined
type Translate = (key: string) => string
interface SnapshotMetadata {
  from: string
  to: string
  startAt?: string
  endAt?: string
  timezone: string
  generatedAt: string
  fetchedAt?: string
}
interface CategoryRow { category?: string; quantity?: number; revenue?: Cell }
interface OrderRow {
  id?: Cell
  order_number?: Cell
  display_id?: Cell
  order_type?: string
  status?: string
  total_amount?: Cell
  created_at?: string
}
type Snapshot = DashSharedPayload & { category_stats?: CategoryRow[]; live_order_feed?: OrderRow[] }

function csvCell(value: Cell): string {
  let text = String(value ?? '')

  // Names and labels are text, even when they begin with spreadsheet formulas.
  // Preserve numeric negatives and decimal strings without floating-point casts.
  if (typeof value === 'string' && /^\s*[=+\-@\t\r\n]/u.test(value) && !/^-?\d+(?:\.\d+)?$/.test(value))
    text = `'${value}`
  return `"${text.replace(/"/g, '""')}"`
}

function paymentRows(data: Snapshot, t: Translate): Cell[][] {
  return Object.entries(data.payment_breakdown ?? data.payment_breakdown_today ?? {})
    .filter(([, value]) => value === null || typeof value !== 'object')
    .map(([key, value]) => [
      ['CASH', 'CARD', 'UZCARD', 'HUMO', 'PAYME', 'MIXED'].includes(key.toUpperCase()) ? t(`report_payment_${key.toUpperCase()}`) : key,
      value,
    ])
}

function orderRows(data: Snapshot, t: Translate): Cell[][] {
  return (data.live_order_feed ?? []).map(order => [
    order.order_number ?? order.display_id ?? order.id,
    order.order_type ? t(`report_type_${order.order_type}`) : '',
    order.status ? t(order.status) : '',
    order.total_amount,
    order.created_at,
  ])
}

/** Export only the loaded snapshot; absent values remain blank and lists are not truncated again. */
export function dashboardSnapshotCsv(data: Snapshot, metadata: SnapshotMetadata, t: Translate): string {
  const rows: Cell[][] = [
    [t('dash_export_snapshot')],
    [t('dash_export_snapshot_scope')],
    [t('Generated'), metadata.generatedAt],
    [t('Last updated'), metadata.fetchedAt],
    [t('Start date'), metadata.from],
    [t('End date'), metadata.to],
    [t('report_exact_window'), metadata.startAt, metadata.endAt],
    [t('dash_export_timezone'), metadata.timezone],
    [],
    [t('Overview'), t('Value')],
    [t('Revenue'), data.revenue ?? data.today?.revenue],
    [t('Orders'), data.orders ?? data.today?.orders],
    [t('Paid orders'), data.paid_orders ?? data.today?.paid_orders],
    [t('Cancelled orders'), data.cancelled ?? data.today?.cancelled],
    [t('Units sold'), data.units_sold ?? data.today?.units_sold],
    [],
    [t('Payment method'), `${t('Revenue')} (UZS)`],
  ]

  rows.push(...paymentRows(data, t))

  const products = data.top_products ?? data.top_products_today ?? []

  rows.push([], [t('dash_export_snapshot_products'), t('Units sold'), `${t('Revenue')} (UZS)`])
  for (const product of products)
    rows.push([product.product_name, product.quantity, product.revenue])

  rows.push([], [t('Category'), t('Units sold'), `${t('Revenue')} (UZS)`])
  for (const category of data.category_stats ?? data.category_stats_today ?? [])
    rows.push([category.category, category.quantity, category.revenue])

  rows.push([], [t('Recent activity'), t('Order type'), t('Status'), `${t('Revenue')} (UZS)`, t('Date')])
  rows.push(...orderRows(data, t))

  // UTF-8 BOM and CRLF preserve Cyrillic/Uzbek text in spreadsheet applications.
  return `\uFEFF${rows.map(row => row.map(csvCell).join(',')).join('\r\n')}\r\n`
}
