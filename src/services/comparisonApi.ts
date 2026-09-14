import axios from '@/plugins/axios'
import type { ComparisonParams, ComparisonResponse } from '@/types/comparison'

export interface ComparisonProductOption {
  id: string
  name: string
  category?: string
}

const CATALOG_PAGE_SIZE = 100
const MAX_CATALOG_PAGES = 100

function asRecord(value: unknown): Record<string, unknown> | null {
  return (value !== null && typeof value === 'object' && !Array.isArray(value))
    ? value as Record<string, unknown>
    : null
}

function unwrapResponse(value: unknown): unknown {
  const body = asRecord(value)

  return (body && Object.prototype.hasOwnProperty.call(body, 'data'))
    ? body.data
    : value
}

function comparisonResponse(value: unknown): ComparisonResponse {
  const payload = asRecord(unwrapResponse(value))
  const revenue = asRecord(payload?.revenue_timeseries)
  const byHour = asRecord(payload?.by_hour)
  const byWeekday = asRecord(payload?.by_weekday)
  const payments = asRecord(payload?.payment_methods)
  const orderTypes = asRecord(payload?.order_types)

  const valid = payload
    && asRecord(payload.period_a)
    && asRecord(payload.period_b)
    && asRecord(payload.kpis)
    && revenue
    && Array.isArray(revenue.a)
    && Array.isArray(revenue.b)
    && Array.isArray(payload.categories)
    && Array.isArray(payload.products)
    && byHour
    && Array.isArray(byHour.a)
    && Array.isArray(byHour.b)
    && byWeekday
    && Array.isArray(byWeekday.a)
    && Array.isArray(byWeekday.b)
    && payments
    && Array.isArray(payments.a)
    && Array.isArray(payments.b)
    && orderTypes
    && Array.isArray(orderTypes.a)
    && Array.isArray(orderTypes.b)

  if (!valid)
    throw new Error('Invalid comparison response')

  return payload as unknown as ComparisonResponse
}

export async function getPeriodComparison(params: ComparisonParams, signal?: AbortSignal): Promise<ComparisonResponse> {
  const response = await axios.get('/analytics/comparison', { params, signal })

  return comparisonResponse(response.data)
}

export function comparisonEndpointUnavailable(error: unknown): boolean {
  const response = asRecord(asRecord(error)?.response)
  const status = response?.status
  const body = asRecord(response?.data)
  const code = String(body?.code ?? '').toUpperCase()

  if (status === 501)
    return true
  if (status !== 404)
    return false

  return !code || code === 'ANALYTICS_COMPARISON_UNAVAILABLE'
}

function pageCount(value: unknown): number | null {
  const parsed = Number(value)

  return (Number.isFinite(parsed) && parsed >= 1) ? Math.floor(parsed) : null
}

function nextCatalogPage(pagination: Record<string, unknown>, rowCount: number, page: number): boolean {
  const totalPages = pageCount(pagination.total_pages)
  if (totalPages !== null)
    return page < totalPages

  return pagination.has_next === true
    || (pagination.has_next === undefined && rowCount === CATALOG_PAGE_SIZE)
}

function catalogProduct(value: unknown): ComparisonProductOption | null {
  const row = asRecord(value)
  const id = row?.id ?? row?.product_id
  const name = row?.name ?? row?.product_name
  if (!row || (typeof id !== 'number' && typeof id !== 'string') || !String(name ?? '').trim())
    return null

  const category = asRecord(row.category)?.name ?? row.category_name

  return {
    id: String(id),
    name: String(name).trim(),
    category: category == null ? undefined : String(category),
  }
}

export async function listComparisonProducts(signal?: AbortSignal): Promise<ComparisonProductOption[]> {
  const products: ComparisonProductOption[] = []
  const seen = new Set<string>()
  let page = 1
  let hasNext = true

  while (hasNext && page <= MAX_CATALOG_PAGES) {
    const response = await axios.get('/products', {
      params: { page, per_page: CATALOG_PAGE_SIZE, order_by: 'name', popular: false },
      signal,
    })

    const payload = asRecord(unwrapResponse(response.data)) ?? {}
    const rows = Array.isArray(payload.products) ? payload.products : []
    const pagination = asRecord(payload.pagination) ?? {}

    for (const row of rows) {
      const product = catalogProduct(row)
      if (product && !seen.has(product.id)) {
        seen.add(product.id)
        products.push(product)
      }
    }

    hasNext = nextCatalogPage(pagination, rows.length, page)
    page++
  }

  return products.sort((a, b) => a.name.localeCompare(b.name))
}
