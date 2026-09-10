import api from '@/plugins/axios'
import type { ProductPerformanceReport, ProductReportFilters, ProductReportFormat, ReportExport } from '@/types/productPerformance'

class ProductReportResponseError extends Error {
  constructor(public response: { status: number; data: unknown }) {
    super('Product report request failed')
  }
}

// JSON and downloads share this query builder. Exports intentionally omit UI
// pagination, and no totals or historical costs are recomputed in the browser.
export function productReportParams(filters: ProductReportFilters, pagination?: { page: number; per_page: number }): Record<string, string | number> {
  const params: Record<string, string | number> = { preset: filters.preset, sort: filters.sort }
  if (filters.preset === 'custom') {
    params.from = filters.from ?? ''
    params.to = filters.to ?? ''
  }
  for (const key of ['category_id', 'product_id', 'cashier_id', 'order_type', 'order_origin', 'payment_method'] as const) {
    const value = filters[key]
    if (value)
      params[key] = value
  }
  const search = filters.search?.trim()
  if (search)
    params.search = search
  if (pagination) {
    params.page = pagination.page
    params.per_page = pagination.per_page
  }
  return params
}

export function reportRangeError(from?: string, to?: string): 'INVALID_REPORT_RANGE' | 'REPORT_RANGE_TOO_LARGE' | null {
  const validDate = (value = '') => {
    const parsed = new Date(`${value}T00:00:00Z`)
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
  }

  if (!validDate(from) || !validDate(to) || String(to) < String(from))
    return 'INVALID_REPORT_RANGE'
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1
  return days > 366 ? 'REPORT_RANGE_TOO_LARGE' : null
}

export async function fetchProductPerformance(filters: ProductReportFilters, pagination: { page: number; per_page: number }, signal?: AbortSignal): Promise<ProductPerformanceReport> {
  const response = await api.get('/reports/product-performance', { params: productReportParams(filters, pagination), signal })
  const envelope = response.data
  if (envelope?.success === false)
    throw new ProductReportResponseError({ status: response.status, data: envelope })
  const report = envelope?.data ?? envelope
  if (!report?.summary || !report?.range || !report?.pagination || !Array.isArray(report?.products))
    throw new Error('Invalid product performance response')
  return report
}

export function productReportFilename(disposition: string, format: ProductReportFormat): string {
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  const simple = disposition.match(/filename="?([^";]+)"?/i)?.[1]
  let candidate = simple?.trim() || `product-performance.${format}`
  if (encoded) {
    try { candidate = decodeURIComponent(encoded.trim().replace(/^"|"$/g, '')) }
    catch { /* Retain the plain filename when a server sends malformed encoding. */ }
  }

  // Keep the backend-selected name while excluding path and control characters.
  return [...candidate].map(character => (character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127 || '/\\'.includes(character)) ? '_' : character).join('') || `product-performance.${format}`
}

export async function readableReportError(error: unknown): Promise<unknown> {
  const original = error as { response?: { status?: number; data?: unknown } }
  const body = original?.response?.data
  if (!(body instanceof Blob))
    return error
  try {
    return { response: { ...original.response, data: JSON.parse(await body.text()) } }
  }
  catch {
    return { response: { ...original.response, data: {} } }
  }
}

export async function exportProductPerformance(filters: ProductReportFilters, format: ProductReportFormat): Promise<ReportExport> {
  try {
    const response = await api.get('/reports/product-performance/export', {
      params: { ...productReportParams(filters), format },
      responseType: 'blob',
    })

    const blob = response.data as Blob
    if (blob.type.includes('json'))
      throw new ProductReportResponseError({ status: response.status, data: blob })
    if (!blob.size || blob.type.includes('text/html'))
      throw new Error('Invalid report download')
    const header = (key: string) => response.headers[key] == null ? null : String(response.headers[key])
    const complete = header('x-report-cost-complete')
    return {
      blob,
      filename: productReportFilename(header('content-disposition') ?? '', format),
      count: header('x-export-count'),
      from: header('x-report-from'),
      to: header('x-report-to'),
      costComplete: complete === null ? null : complete === 'true',
    }
  }
  catch (error) {
    throw await readableReportError(error)
  }
}
