<script setup lang="ts">
import WorkspacePage from '@/components/design/workspace/WorkspacePage.vue'
import axios from '@/plugins/axios'
import Badge from '@/components/design/Badge.vue'
import BarChart from '@/components/design/charts/BarChart.vue'
import Button from '@/components/design/Button.vue'
import Card from '@/components/design/Card.vue'
import ChartCard from '@/components/design/ChartCard.vue'
import Checkbox from '@/components/design/Checkbox.vue'
import DataTable, { type DataTableColumn } from '@/components/design/DataTable.vue'
import DateRangePicker, { type DateRangeValue } from '@/components/design/DateRangePicker.vue'
import DonutChart from '@/components/design/charts/DonutChart.vue'
import HBarChart from '@/components/design/charts/HBarChart.vue'
import Input from '@/components/design/Input.vue'
import Kpi from '@/components/design/Kpi.vue'
import LineAreaChart from '@/components/design/charts/LineAreaChart.vue'
import PageHeader from '@/components/design/PageHeader.vue'
import StateFill from '@/components/design/StateFill.vue'
import { buildDateParams, businessPreset } from '@/composables/useBusinessDay'

interface PickerOption {
  id: string
  label: string
  categoryId?: string | null
}

interface ProductOverviewResponse {
  avg_line_revenue?: unknown
  distinct_products_sold?: unknown
  gross_revenue?: unknown
  gross_units?: unknown
  order_lines?: unknown
  orders?: unknown
  refund_amount?: unknown
  refunded_units?: unknown
  total_revenue?: unknown
  total_units?: unknown
}

interface ProductCategoryResponseRow {
  category?: unknown
  category_id?: unknown
  gross_revenue?: unknown
  gross_units?: unknown
  pct_of_revenue?: unknown
  refund_amount?: unknown
  refunded_units?: unknown
  revenue?: unknown
  units?: unknown
}

interface ProductParetoResponseRow {
  class?: unknown
  cumulative_pct?: unknown
  gross_qty_sold?: unknown
  gross_revenue?: unknown
  pct_of_revenue?: unknown
  product_id?: unknown
  product_name?: unknown
  qty_sold?: unknown
  refund_amount?: unknown
  refunded_qty?: unknown
  revenue?: unknown
}

interface ProductTrendResponseRow {
  date?: unknown
  gross_revenue?: unknown
  gross_units?: unknown
  refund_amount?: unknown
  refunded_units?: unknown
  revenue?: unknown
  units?: unknown
}

interface ProductTableRow {
  id: string
  productId: string | null
  categoryId: string | null
  displayCategory: string
  displayName: string
  units: number
  grossUnits: number
  refundedUnits: number
  netSales: number
  grossSales: number
  refundAmount: number
  share: number
  paretoClass: string
}

interface DailyChartPoint {
  date: string
  netSales: number
  grossSales: number
  refundAmount: number
  label: string
  units: number
  grossUnits: number
  refundedUnits: number
}

interface PaginationResponse {
  has_next?: unknown
  total_orders?: unknown
  total_pages?: unknown
}

interface CatalogResponse {
  pagination?: PaginationResponse
  [key: string]: unknown
}

interface AnalyticsPayload {
  overview: ProductOverviewResponse
  categories: ProductCategoryResponseRow[]
  pareto: ProductParetoResponseRow[]
  trends: ProductTrendResponseRow[]
}

const { t, locale } = useI18n({ useScope: 'global' })
const { formatCurrency } = useFormatters()

const defaultRange = businessPreset('30d')
const CATALOG_PAGE_SIZE = 100
const dateRange = ref<DateRangeValue>({ ...defaultRange, preset: '30d' })
const appliedDateRange = ref<DateRangeValue | null>(null)
const overview = ref<ProductOverviewResponse | null>(null)
const backendCategories = ref<ProductCategoryResponseRow[]>([])
const backendProducts = ref<ProductParetoResponseRow[]>([])
const backendDaily = ref<ProductTrendResponseRow[]>([])
const catalogCategoryOptions = ref<PickerOption[]>([])
const catalogProductOptions = ref<PickerOption[]>([])
const selectedCategoryIds = ref<string[]>([])
const selectedProductIds = ref<string[]>([])
const categorySearch = ref('')
const productSearch = ref('')
const categoryPickerOpen = ref(false)
const productPickerOpen = ref(false)
const categoryPickerRef = ref<HTMLElement | null>(null)
const productPickerRef = ref<HTMLElement | null>(null)
const loading = ref(false)
const hasLoaded = ref(false)
const failed = ref(false)
const rankingMetric = ref<'gross' | 'units'>('gross')

let requestSequence = 0
let activeController: AbortController | null = null
let catalogController: AbortController | null = null

onClickOutside(categoryPickerRef, () => { categoryPickerOpen.value = false })
onClickOutside(productPickerRef, () => { productPickerOpen.value = false })

const localeTag = computed(() => {
  if (locale.value === 'ru')
    return 'ru-RU'
  if (locale.value === 'uz')
    return 'uz-UZ'
  return 'en-GB'
})

const quantityFormatter = computed(() => new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
}))

const categoryOptions = computed<PickerOption[]>(() => mergePickerOptions([
  ...catalogCategoryOptions.value,
  ...backendCategories.value
    .map<PickerOption | null>(category => {
      const id = optionId(category.category_id)
      return id
        ? { id, label: displayCategoryName(optionText(category.category, id)) }
        : null
    })
    .filter((option): option is PickerOption => option !== null),
]))

const catalogProductsById = computed(() => new Map(
  catalogProductOptions.value.map(product => [product.id, product]),
))

const productOptions = computed<PickerOption[]>(() => mergePickerOptions([
  ...catalogProductOptions.value,
  ...backendProducts.value
    .map<PickerOption | null>(product => {
      const id = optionId(product.product_id)
      return id
        ? {
          id,
          label: displayProductName(optionText(product.product_name, id)),
          categoryId: catalogProductsById.value.get(id)?.categoryId ?? null,
        }
        : null
    })
    .filter((option): option is PickerOption => option !== null),
]))

const filteredCategoryOptions = computed(() => filterOptions(categoryOptions.value, categorySearch.value))

const filteredProductOptions = computed(() => {
  const visibleByCategory = selectedCategoryIds.value.length === 0
    ? productOptions.value
    : productOptions.value.filter(product => selectedCategoryIds.value.includes(product.categoryId ?? '')
      || selectedProductIds.value.includes(product.id))

  return filterOptions(visibleByCategory, productSearch.value)
})

const categoryTriggerLabel = computed(() => selectedLabel(
  categoryOptions.value,
  selectedCategoryIds.value,
  'All categories',
))

const productTriggerLabel = computed(() => selectedLabel(
  productOptions.value,
  selectedProductIds.value,
  'All products',
))

const hasClientFilters = computed(() => selectedCategoryIds.value.length > 0 || selectedProductIds.value.length > 0)
const initialLoading = computed(() => loading.value && !hasLoaded.value)
const displayedDateRange = computed(() => appliedDateRange.value ?? dateRange.value)

const hasUnappliedDateChange = computed(() => hasLoaded.value
  && appliedDateRange.value !== null
  && !sameDateRange(dateRange.value, appliedDateRange.value))

const pageSubtitle = computed(() => (
  (hasLoaded.value && appliedDateRange.value)
    ? t('Showing server-calculated product sales settled in {range}.', { range: formatDateRange(appliedDateRange.value) })
    : t('Analyze settled product sales and refunds in the selected business-day range.')
))

const allProductRows = computed<ProductTableRow[]>(() => backendProducts.value.map((product, index) => {
  const productId = optionId(product.product_id)
  const categoryId = productId ? catalogProductsById.value.get(productId)?.categoryId ?? null : null

  const categoryName = categoryId
    ? categoryOptions.value.find(option => option.id === categoryId)?.label ?? t('Uncategorized')
    : t('Uncategorized')

  return {
    id: productId ?? `unknown-${index}`,
    productId,
    categoryId,
    displayCategory: displayCategoryName(categoryName),
    displayName: displayProductName(optionText(product.product_name, t('Unknown'))),
    units: backendNumber(product.qty_sold),
    grossUnits: backendNumber(product.gross_qty_sold),
    refundedUnits: backendNumber(product.refunded_qty),
    netSales: backendNumber(product.revenue),
    grossSales: backendNumber(product.gross_revenue),
    refundAmount: backendNumber(product.refund_amount),
    share: backendNumber(product.pct_of_revenue),
    paretoClass: optionText(product.class, 'C').toUpperCase(),
  }
}))

// The delivered analytics contract has no product/category query parameters.
// Keep these as presentation filters over backend-calculated rows; the daily
// series deliberately remains the complete selected period.
const productRows = computed<ProductTableRow[]>(() => allProductRows.value.filter(product => {
  const productMatches = selectedProductIds.value.length === 0
    || (product.productId !== null && selectedProductIds.value.includes(product.productId))

  const categoryMatches = selectedCategoryIds.value.length === 0
    || (product.categoryId !== null && selectedCategoryIds.value.includes(product.categoryId))

  return productMatches && categoryMatches
}))

const viewTotals = computed(() => {
  if (!hasClientFilters.value && overview.value) {
    const units = backendNumber(overview.value.total_units)
    const netSales = backendNumber(overview.value.total_revenue)
    return {
      netSales,
      grossSales: backendNumber(overview.value.gross_revenue),
      refundAmount: backendNumber(overview.value.refund_amount),
      units,
      grossUnits: backendNumber(overview.value.gross_units),
      refundedUnits: backendNumber(overview.value.refunded_units),
      productCount: backendNumber(overview.value.distinct_products_sold),
      averageNetUnitRevenue: units > 0 ? netSales / units : 0,
    }
  }

  const totals = productRows.value.reduce((result, product) => {
    result.netSales += product.netSales
    result.grossSales += product.grossSales
    result.refundAmount += product.refundAmount
    result.units += product.units
    result.grossUnits += product.grossUnits
    result.refundedUnits += product.refundedUnits
    return result
  }, {
    netSales: 0,
    grossSales: 0,
    refundAmount: 0,
    units: 0,
    grossUnits: 0,
    refundedUnits: 0,
  })

  return {
    ...totals,
    productCount: productRows.value.length,
    averageNetUnitRevenue: totals.units > 0 ? totals.netSales / totals.units : 0,
  }
})

const hasSales = computed(() => hasLoaded.value && (
  viewTotals.value.grossSales !== 0
  || viewTotals.value.refundAmount !== 0
  || viewTotals.value.grossUnits !== 0
  || viewTotals.value.refundedUnits !== 0
  || viewTotals.value.productCount > 0
))

const dailyChart = computed<DailyChartPoint[]>(() => {
  const rows = backendDaily.value
    .map(row => {
      const date = typeof row.date === 'string' ? row.date.slice(0, 10) : ''
      return {
        date,
        netSales: backendNumber(row.revenue),
        grossSales: backendNumber(row.gross_revenue),
        refundAmount: backendNumber(row.refund_amount),
        units: backendNumber(row.units),
        grossUnits: backendNumber(row.gross_units),
        refundedUnits: backendNumber(row.refunded_units),
      }
    })
    .filter(row => /^\d{4}-\d{2}-\d{2}$/.test(row.date))

  const values = new Map(rows.map(row => [row.date, row]))
  const rangeDates = boundedRangeDates(displayedDateRange.value.from, displayedDateRange.value.to)

  const source = rangeDates.length
    ? rangeDates.map(date => ({
      date,
      netSales: values.get(date)?.netSales ?? 0,
      grossSales: values.get(date)?.grossSales ?? 0,
      refundAmount: values.get(date)?.refundAmount ?? 0,
      units: values.get(date)?.units ?? 0,
      grossUnits: values.get(date)?.grossUnits ?? 0,
      refundedUnits: values.get(date)?.refundedUnits ?? 0,
    }))
    : rows

  return source.map(row => ({ ...row, label: formatBusinessDate(row.date, false) }))
})

const topProducts = computed(() => [...productRows.value]
  .sort((left, right) => rankingMetric.value === 'gross'
    ? right.grossSales - left.grossSales
    : right.grossUnits - left.grossUnits)
  .map(product => ({
    name: product.displayName,
    value: Math.max(0, rankingMetric.value === 'gross' ? product.grossSales : product.grossUnits),
  }))
  .filter(product => product.value > 0)
  .slice(0, 6))

const categoryDonut = computed(() => {
  const colors = ['#6366f1', '#0ea5e9', '#22c55e', '#f59e0b', '#ec4899', '#8b5cf6']

  const rows = hasClientFilters.value
    ? [...productRows.value.reduce((grouped, product) => {
      const current = grouped.get(product.displayCategory) ?? 0

      grouped.set(product.displayCategory, current + product.grossUnits)

      return grouped
    }, new Map<string, number>()).entries()].map(([label, value]) => ({ label, value }))
    : backendCategories.value.map(category => ({
      label: displayCategoryName(optionText(category.category, t('Uncategorized'))),
      value: backendNumber(category.gross_units),
    }))

  return rows
    .sort((left, right) => right.value - left.value)
    .filter(category => category.value > 0)
    .slice(0, 6)
    .map((category, index) => ({ ...category, color: colors[index % colors.length] }))
})

const peakDay = computed(() => dailyChart.value.reduce<DailyChartPoint | null>((peak, row) => {
  if (row.grossSales > 0 && (!peak || row.grossSales > peak.grossSales))
    return row
  return peak
}, null))

const peakUnitsDay = computed(() => dailyChart.value.reduce<DailyChartPoint | null>((peak, row) => {
  if (row.grossUnits > 0 && (!peak || row.grossUnits > peak.grossUnits))
    return row
  return peak
}, null))

const paretoBreakdown = computed(() => {
  const counts = new Map([['A', 0], ['B', 0], ['C', 0]])
  for (const product of productRows.value) {
    const key = counts.has(product.paretoClass) ? product.paretoClass : 'C'

    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const total = Math.max(1, productRows.value.length)
  return [...counts.entries()].map(([key, count]) => ({
    key,
    count,
    share: count / total * 100,
  }))
})

const productColumns = computed<DataTableColumn<ProductTableRow>[]>(() => [
  { key: 'displayName', label: t('Product'), sortable: true },
  { key: 'displayCategory', label: t('Category'), sortable: true },
  { key: 'units', label: t('Net units sold'), align: 'right', sortable: true },
  { key: 'netSales', label: t('Net product sales'), align: 'right', sortable: true },
  { key: 'grossSales', label: t('Gross sales'), align: 'right', sortable: true },
  { key: 'refundAmount', label: t('Refunds'), align: 'right', sortable: true },
  { key: 'share', label: t('Sales share'), align: 'right', sortable: true },
  { key: 'paretoClass', label: t('Pareto class'), align: 'center', sortable: true },
])

async function loadAnalytics() {
  const requestId = ++requestSequence
  const requestedRange: DateRangeValue = { ...dateRange.value }

  activeController?.abort()

  const controller = new AbortController()

  activeController = controller
  resetAnalyticsLoad()

  try {
    const payload = await fetchAnalytics(requestedRange, controller.signal, requestId)
    if (payload === null)
      return
    if (requestId !== requestSequence)
      return

    overview.value = payload.overview
    backendCategories.value = payload.categories
    backendProducts.value = payload.pareto
    backendDaily.value = payload.trends
    pruneUnavailableSelections()
    appliedDateRange.value = requestedRange
    hasLoaded.value = true
  }
  catch (error: unknown) {
    if (requestId !== requestSequence)
      return
    if (isCancellation(error))
      return

    failed.value = true
  }
  finally {
    if (requestId === requestSequence) {
      loading.value = false
      activeController = null
    }
  }
}

function resetAnalyticsLoad() {
  loading.value = true
  hasLoaded.value = false
  failed.value = false
  overview.value = null
  backendCategories.value = []
  backendProducts.value = []
  backendDaily.value = []
  categoryPickerOpen.value = false
  productPickerOpen.value = false
}

async function fetchAnalytics(
  requestedRange: DateRangeValue,
  signal: AbortSignal,
  requestId: number,
): Promise<AnalyticsPayload | null> {
  const params = buildDateParams(requestedRange)

  const [overviewResponse, categoriesResponse, paretoResponse, trendsResponse] = await Promise.all([
    axios.get('/analytics/products/overview', { params, signal }),
    axios.get('/analytics/products/categories', { params, signal }),
    axios.get('/analytics/products/pareto', { params, signal }),
    axios.get('/analytics/products/trends', { params: { ...params, top_n: 6 }, signal }),
  ])

  if (requestId !== requestSequence)
    return null

  const overviewPayload = asRecord(unwrapAnalyticsResponse(overviewResponse))
  const categoriesPayload = asRecord(unwrapAnalyticsResponse(categoriesResponse))
  const paretoPayload = asRecord(unwrapAnalyticsResponse(paretoResponse))
  const trendsPayload = asRecord(unwrapAnalyticsResponse(trendsResponse))
  if (!overviewPayload || !categoriesPayload || !paretoPayload || !trendsPayload)
    throw new Error('Invalid product analytics response')

  return {
    overview: overviewPayload,
    categories: recordRows(categoriesPayload.categories) as ProductCategoryResponseRow[],
    pareto: recordRows(paretoPayload.products) as ProductParetoResponseRow[],
    trends: recordRows(trendsPayload.daily) as ProductTrendResponseRow[],
  }
}

function reportedPageCount(value: unknown): number | null {
  const count = Number(value)
  if (!Number.isFinite(count) || count < 1)
    return null

  return Math.floor(count)
}

function pageHasNext(page: number, reportedPages: number | null, hasNext: unknown, rowCount: number): boolean {
  if (reportedPages !== null)
    return page < reportedPages
  if (hasNext === true)
    return true

  return hasNext === undefined && rowCount === CATALOG_PAGE_SIZE
}

async function loadCatalogOptions() {
  catalogController?.abort()

  const controller = new AbortController()

  catalogController = controller

  try {
    const [products, categories] = await Promise.all([
      fetchCatalogRows('/products', 'products', controller.signal),
      fetchCatalogRows('/categories', 'categories', controller.signal),
    ])

    if (catalogController !== controller)
      return

    catalogProductOptions.value = products
      .map(toCatalogProductOption)
      .filter((option): option is PickerOption => option !== null)
    catalogCategoryOptions.value = categories
      .map(toCatalogCategoryOption)
      .filter((option): option is PickerOption => option !== null)
    pruneUnavailableSelections()
  }
  catch {
    // The order-derived options remain usable when a catalog lookup is
    // unavailable, so there is no separate error state to distract from
    // the sales analysis.
  }
  finally {
    if (catalogController === controller)
      catalogController = null
  }
}

async function fetchCatalogRows(path: string, collectionKey: string, signal: AbortSignal): Promise<unknown[]> {
  const rows: unknown[] = []
  let page = 1
  let hasNext = true

  while (hasNext) {
    const params = path === '/products'
      ? { page, per_page: CATALOG_PAGE_SIZE, order_by: 'name', popular: false }
      : { page, per_page: CATALOG_PAGE_SIZE, order_by: 'sort_order' }

    const response = await axios.get(path, {
      params,
      signal,
    })

    const payload = (response.data?.data ?? response.data ?? {}) as CatalogResponse
    const collection = payload[collectionKey]
    const pageRows: unknown[] = Array.isArray(collection) ? collection : []
    const pagination = payload.pagination ?? {}
    const reportedPages = reportedPageCount(pagination.total_pages)

    rows.push(...pageRows)
    hasNext = pageHasNext(page, reportedPages, pagination.has_next, pageRows.length)
    if (hasNext && pageRows.length === 0 && reportedPages === null)
      hasNext = false
    page++
  }

  return rows
}

function unwrapAnalyticsResponse(response: unknown): unknown {
  const responseRecord = asRecord(response)
  const body = asRecord(responseRecord?.data)

  if (body?.success === false)
    throw new Error(optionText(body.message, 'Failed to load product analytics'))

  return (body && Object.prototype.hasOwnProperty.call(body, 'data'))
    ? body.data
    : responseRecord?.data
}

function recordRows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value))
    return []

  return value.filter((row): row is Record<string, unknown> => row !== null && typeof row === 'object')
}

function backendNumber(value: unknown): number {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number(value.trim())
      : Number.NaN

  return Number.isFinite(parsed) ? parsed : 0
}

function isCancellation(error: unknown): boolean {
  return typeof error === 'object' && error !== null
    && (('code' in error && (error as { code?: unknown }).code === 'ERR_CANCELED')
      || ('name' in error && (error as { name?: unknown }).name === 'CanceledError'))
}

function toggleCategoryPicker() {
  categoryPickerOpen.value = !categoryPickerOpen.value
  if (categoryPickerOpen.value)
    productPickerOpen.value = false
}

function toggleProductPicker() {
  productPickerOpen.value = !productPickerOpen.value
  if (productPickerOpen.value)
    categoryPickerOpen.value = false
}

function setCategorySelected(id: string, selected: boolean) {
  selectedCategoryIds.value = selected
    ? Array.from(new Set([...selectedCategoryIds.value, id]))
    : selectedCategoryIds.value.filter(value => value !== id)
}

function setProductSelected(id: string, selected: boolean) {
  selectedProductIds.value = selected
    ? Array.from(new Set([...selectedProductIds.value, id]))
    : selectedProductIds.value.filter(value => value !== id)
}

function clearClientFilters() {
  selectedCategoryIds.value = []
  selectedProductIds.value = []
  categorySearch.value = ''
  productSearch.value = ''
}

function pruneUnavailableSelections() {
  const categoryIds = new Set(categoryOptions.value.map(option => option.id))
  const productIds = new Set(productOptions.value.map(option => option.id))

  selectedCategoryIds.value = selectedCategoryIds.value.filter(id => categoryIds.has(id))
  selectedProductIds.value = selectedProductIds.value.filter(id => productIds.has(id))
}

function selectedLabel(options: PickerOption[], selectedIds: string[], fallbackKey: string): string {
  if (selectedIds.length === 0)
    return t(fallbackKey)

  const labels = selectedIds
    .map(id => options.find(option => option.id === id)?.label)
    .filter((label): label is string => Boolean(label))

  if (labels.length <= 2)
    return labels.join(', ')
  return `${labels.slice(0, 2).join(', ')} +${labels.length - 2}`
}

function filterOptions(options: PickerOption[], search: string): PickerOption[] {
  const query = search.trim().toLocaleLowerCase(localeTag.value)
  if (!query)
    return options
  return options.filter(option => option.label.toLocaleLowerCase(localeTag.value).includes(query))
}

function mergePickerOptions(options: PickerOption[]): PickerOption[] {
  const byId = new Map<string, PickerOption>()
  for (const option of options) {
    if (!byId.has(option.id))
      byId.set(option.id, option)
  }
  return [...byId.values()].sort((left, right) => left.label.localeCompare(right.label, localeTag.value))
}

function toCatalogProductOption(row: unknown): PickerOption | null {
  const record = asRecord(row)
  const id = optionId(record?.id)
  if (!id)
    return null

  const category = asRecord(record?.category)
  return {
    id,
    label: optionText(record?.name, id),
    categoryId: optionId(record?.category_id) ?? optionId(category?.id),
  }
}

function toCatalogCategoryOption(row: unknown): PickerOption | null {
  const record = asRecord(row)
  const id = optionId(record?.id)
  if (!id)
    return null

  return { id, label: optionText(record?.name, id) }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return (value !== null && typeof value === 'object') ? value as Record<string, unknown> : null
}

function optionId(value: unknown): string | null {
  if (typeof value === 'number')
    return Number.isFinite(value) ? String(value) : null
  if (typeof value === 'string')
    return value.trim() || null
  return null
}

function optionText(value: unknown, fallback: string): string {
  return (typeof value === 'string' && value.trim()) ? value.trim() : fallback
}

function displayProductName(name: string): string {
  return name === 'Unknown product' ? t('Unknown') : name
}

function displayCategoryName(name: string): string {
  return name === 'Uncategorized' ? t('Uncategorized') : name
}

function formatQuantity(value: number): string {
  return quantityFormatter.value.format(value)
}

function formatBusinessDate(value: string, includeYear: boolean): string {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day)
    return value

  return new Intl.DateTimeFormat(localeTag.value, {
    day: 'numeric',
    month: 'short',
    ...(includeYear ? { year: 'numeric' as const } : {}),
  }).format(new Date(year, month - 1, day, 12))
}

function formatDateRange(range: DateRangeValue): string {
  if (!range.from || !range.to)
    return t('All time')
  if (range.from === range.to)
    return formatBusinessDate(range.from, true)
  return `${formatBusinessDate(range.from, false)} — ${formatBusinessDate(range.to, true)}`
}

function sameDateRange(left: DateRangeValue, right: DateRangeValue): boolean {
  return left.from === right.from
    && left.to === right.to
    && (left.fromTime ?? '') === (right.fromTime ?? '')
    && (left.toTime ?? '') === (right.toTime ?? '')
}

function boundedRangeDates(from: string, to: string): string[] {
  if (!from || !to)
    return []
  const [fromYear, fromMonth, fromDay] = from.split('-').map(Number)
  const [toYear, toMonth, toDay] = to.split('-').map(Number)
  if (!fromYear || !fromMonth || !fromDay || !toYear || !toMonth || !toDay)
    return []

  const start = new Date(fromYear, fromMonth - 1, fromDay)
  const end = new Date(toYear, toMonth - 1, toDay)
  const diff = Math.floor((end.getTime() - start.getTime()) / 86_400_000)
  if (diff < 0 || diff > 90)
    return []

  return Array.from({ length: diff + 1 }, (_, index) => {
    const date = new Date(start)

    date.setDate(date.getDate() + index)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  })
}

onMounted(() => {
  loadAnalytics()
  loadCatalogOptions()
})
onBeforeUnmount(() => {
  requestSequence++
  activeController?.abort()
  catalogController?.abort()
})
</script>

<template>
  <WorkspacePage class="page product-statistics">
    <PageHeader
      :title="t('Product sales analytics')"
      :subtitle="pageSubtitle"
    >
      <template #actions>
        <Button
          data-testid="product-statistics-analyze"
          variant="primary"
          icon="refresh"
          :loading="loading"
          :disabled="loading"
          @click="loadAnalytics"
        >
          {{ t('Analyze') }}
        </Button>
      </template>
    </PageHeader>

    <Card class-name="product-statistics__filters-card">
      <fieldset
        class="product-statistics__filters"
        :disabled="loading"
      >
        <div class="product-statistics__filter-field product-statistics__filter-field--period">
          <span class="product-statistics__filter-label">{{ t('Period') }}</span>
          <DateRangePicker
            v-model="dateRange"
            :enable-time="false"
            :placeholder="t('All time')"
          />
        </div>

        <div
          ref="categoryPickerRef"
          class="product-statistics__filter-field product-statistics__picker"
        >
          <span class="product-statistics__filter-label">{{ t('Category') }}</span>
          <button
            data-testid="product-statistics-category-filter"
            type="button"
            class="product-statistics__select-trigger"
            :aria-expanded="categoryPickerOpen"
            :aria-label="t('Category')"
            aria-haspopup="dialog"
            @click="toggleCategoryPicker"
            @keydown.escape.stop="categoryPickerOpen = false"
          >
            <span :title="categoryTriggerLabel">{{ categoryTriggerLabel }}</span>
            <span aria-hidden="true">⌄</span>
          </button>
          <div
            v-if="categoryPickerOpen"
            class="product-statistics__picker-popover"
            role="dialog"
            :aria-label="t('Category')"
            @keydown.escape.stop="categoryPickerOpen = false"
          >
            <Input
              v-model="categorySearch"
              :placeholder="t('Search categories')"
              :aria-label="t('Search categories')"
            />
            <div class="product-statistics__picker-actions">
              <span class="product-statistics__picker-count">{{ selectedCategoryIds.length }}</span>
              <Button
                v-if="selectedCategoryIds.length"
                size="sm"
                variant="ghost"
                @click="selectedCategoryIds = []"
              >
                {{ t('Clear categories') }}
              </Button>
            </div>
            <div
              v-if="filteredCategoryOptions.length"
              class="product-statistics__picker-list"
            >
              <label
                v-for="option in filteredCategoryOptions"
                :key="option.id"
                class="product-statistics__picker-option"
                :data-testid="`product-statistics-category-option-${option.id}`"
              >
                <Checkbox
                  :model-value="selectedCategoryIds.includes(option.id)"
                  @update:model-value="value => setCategorySelected(option.id, value)"
                />
                <span>{{ option.label }}</span>
              </label>
            </div>
            <StateFill
              v-else
              icon="inbox"
              :title="t('No matching categories')"
              style="padding-block: var(--sp-5);"
            />
          </div>
        </div>

        <div
          ref="productPickerRef"
          class="product-statistics__filter-field product-statistics__picker"
        >
          <span class="product-statistics__filter-label">{{ t('Product') }}</span>
          <button
            data-testid="product-statistics-product-filter"
            type="button"
            class="product-statistics__select-trigger"
            :aria-expanded="productPickerOpen"
            :aria-label="t('Product')"
            aria-haspopup="dialog"
            @click="toggleProductPicker"
            @keydown.escape.stop="productPickerOpen = false"
          >
            <span :title="productTriggerLabel">{{ productTriggerLabel }}</span>
            <span aria-hidden="true">⌄</span>
          </button>
          <div
            v-if="productPickerOpen"
            class="product-statistics__picker-popover"
            role="dialog"
            :aria-label="t('Product')"
            @keydown.escape.stop="productPickerOpen = false"
          >
            <Input
              v-model="productSearch"
              :placeholder="t('Search products')"
              :aria-label="t('Search products')"
            />
            <div class="product-statistics__picker-actions">
              <span class="product-statistics__picker-count">{{ selectedProductIds.length }}</span>
              <Button
                v-if="selectedProductIds.length"
                size="sm"
                variant="ghost"
                @click="selectedProductIds = []"
              >
                {{ t('Clear products') }}
              </Button>
            </div>
            <div
              v-if="filteredProductOptions.length"
              class="product-statistics__picker-list"
            >
              <label
                v-for="option in filteredProductOptions"
                :key="option.id"
                class="product-statistics__picker-option"
                :data-testid="`product-statistics-product-option-${option.id}`"
              >
                <Checkbox
                  :model-value="selectedProductIds.includes(option.id)"
                  @update:model-value="value => setProductSelected(option.id, value)"
                />
                <span>{{ option.label }}</span>
              </label>
            </div>
            <StateFill
              v-else
              icon="inbox"
              :title="t('No matching products')"
              style="padding-block: var(--sp-5);"
            />
          </div>
        </div>

        <div class="product-statistics__scope">
          <Badge
            tone="success"
            dot
          >
            {{ t('Server-calculated sales and refunds') }}
          </Badge>
          <Badge
            v-if="hasClientFilters"
            tone="info"
            dot
          >
            {{ t('Product and category filters apply to summary totals and rankings.') }}
          </Badge>
          <Badge
            v-if="hasUnappliedDateChange"
            tone="warning"
            dot
          >
            {{ t('Analyze to apply date changes') }}
          </Badge>
          <Button
            v-if="hasClientFilters"
            size="sm"
            variant="ghost"
            @click="clearClientFilters"
          >
            {{ t('Clear filters') }}
          </Button>
        </div>
      </fieldset>
    </Card>

    <div
      v-if="loading"
      class="product-statistics__loading"
      role="status"
      aria-live="polite"
    >
      <span
        class="product-statistics__loading-dot"
        aria-hidden="true"
      />
      <div>
        <strong>{{ t('Loading product analytics') }}</strong>
        <span>{{ t('The server is calculating sales and refunds for the selected period.') }}</span>
      </div>
    </div>

    <div
      v-if="failed"
      class="product-statistics__state-card"
    >
      <StateFill
        error
        icon="alert"
        :title="t('Failed to load product sales')"
        :sub="t('Try another business-day range or clear the product and category filters.')"
      >
        <Button
          variant="secondary"
          @click="loadAnalytics"
        >
          {{ t('Retry') }}
        </Button>
      </StateFill>
    </div>

    <template v-else>
      <section
        class="product-statistics__kpis"
        :aria-busy="initialLoading ? 'true' : undefined"
      >
        <Kpi
          :data="{
            label: t('Net product sales'),
            value: hasLoaded ? viewTotals.netSales : null,
            money: true,
            icon: 'coins',
            tone: 'success',
            sub: t('After product refunds'),
          }"
        />
        <Kpi
          :data="{
            label: t('Net units sold'),
            value: hasLoaded ? viewTotals.units : null,
            icon: 'box',
            tone: 'primary',
            sub: t('After refunded units'),
          }"
        />
        <Kpi
          :data="{
            label: t('Products sold'),
            value: hasLoaded ? viewTotals.productCount : null,
            icon: 'grid',
            tone: 'info',
            sub: hasLoaded ? t('All products sold in this range') : undefined,
          }"
        />
        <Kpi
          :data="{
            label: t('Gross sales'),
            value: hasLoaded ? viewTotals.grossSales : null,
            money: true,
            icon: 'receipt',
            tone: 'warning',
            sub: t('Before product refunds'),
          }"
        />
      </section>

      <section
        v-if="hasSales"
        class="product-statistics__fact-grid"
      >
        <Card>
          <div class="product-statistics__fact">
            <span>{{ t('Refunds') }}</span>
            <strong class="mono">{{ formatCurrency(viewTotals.refundAmount) }} UZS</strong>
          </div>
        </Card>
        <Card>
          <div class="product-statistics__fact">
            <span>{{ t('Refunded units') }}</span>
            <strong class="mono">{{ formatQuantity(viewTotals.refundedUnits) }}</strong>
          </div>
        </Card>
        <Card>
          <div class="product-statistics__fact">
            <span>{{ t('Average net unit revenue') }}</span>
            <strong class="mono">{{ formatCurrency(viewTotals.averageNetUnitRevenue) }} UZS</strong>
          </div>
        </Card>
        <Card>
          <div class="product-statistics__fact">
            <span>{{ t('Overall peak gross-sales day') }}</span>
            <strong>{{ peakDay ? formatBusinessDate(peakDay.date, true) : '—' }}</strong>
          </div>
        </Card>
      </section>

      <section
        v-if="hasSales"
        class="product-statistics__method-card"
        aria-live="polite"
      >
        <div>
          <strong>{{ t('Calculated by the server from settled product sales.') }}</strong>
          <span>{{ t('Sales follow payment time; refunds follow refund time.') }}</span>
        </div>
        <p>{{ t('Gross sales include settled line revenue after allocated discounts. Net sales subtract product refund events.') }}</p>
      </section>

      <section
        v-if="hasSales"
        class="product-statistics__charts"
      >
        <ChartCard
          :title="t('Daily product sales')"
          :sub="t('All products in the selected period')"
        >
          <LineAreaChart
            :categories="dailyChart.map(row => row.label)"
            :series="[
              { key: 'gross', label: t('Gross sales'), color: 'rgb(var(--v-theme-chart-revenue))', data: dailyChart.map(row => row.grossSales) },
              { key: 'refunds', label: t('Refunds'), color: 'rgb(var(--v-theme-error))', data: dailyChart.map(row => row.refundAmount), dashed: true },
            ]"
            :height="270"
            :y-format="formatCurrency"
            :loading="initialLoading"
          />
        </ChartCard>

        <ChartCard
          :title="t('Daily gross units sold')"
          :sub="t('All products in the selected period')"
        >
          <BarChart
            :data="dailyChart.map(row => ({ label: row.label, value: row.grossUnits, peak: peakUnitsDay?.date === row.date }))"
            :height="270"
            :value-label="t('Gross units sold')"
            :y-format="formatQuantity"
            :x-label-every="Math.max(1, Math.ceil(dailyChart.length / 7))"
            :loading="initialLoading"
          />
        </ChartCard>

        <ChartCard
          :title="t('Top products')"
          :sub="rankingMetric === 'gross' ? t('By gross sales') : t('By gross units sold')"
        >
          <template #actions>
            <div
              class="seg"
              role="tablist"
              :aria-label="t('Top products')"
            >
              <button
                type="button"
                class="seg__btn"
                :class="{ 'is-active': rankingMetric === 'gross' }"
                :aria-selected="rankingMetric === 'gross'"
                role="tab"
                @click="rankingMetric = 'gross'"
              >
                {{ t('Gross sales') }}
              </button>
              <button
                type="button"
                class="seg__btn"
                :class="{ 'is-active': rankingMetric === 'units' }"
                :aria-selected="rankingMetric === 'units'"
                role="tab"
                @click="rankingMetric = 'units'"
              >
                {{ t('Gross units sold') }}
              </button>
            </div>
          </template>
          <HBarChart
            :data="topProducts"
            :value-format="rankingMetric === 'gross' ? formatCurrency : formatQuantity"
            :loading="initialLoading"
          />
        </ChartCard>

        <ChartCard
          :title="t('Category mix')"
          :sub="t('By gross units sold')"
        >
          <DonutChart
            :data="categoryDonut"
            :center-label="t('Gross units sold')"
            :center-value="formatQuantity(viewTotals.grossUnits)"
            :size="180"
            :loading="initialLoading"
          />
        </ChartCard>
      </section>

      <section
        v-if="hasSales"
        class="product-statistics__bottom-grid"
      >
        <Card>
          <div class="card__head">
            <div class="card__head-text">
              <div class="kpi__label">
                {{ t('Pareto distribution') }}
              </div>
              <h2 class="card__title">
                {{ t('Product concentration') }}
              </h2>
            </div>
          </div>
          <div class="card__body product-statistics__type-list">
            <div
              v-for="row in paretoBreakdown"
              :key="row.key"
              class="product-statistics__type-row"
            >
              <div class="product-statistics__type-head">
                <span>{{ t('Class {class}', { class: row.key }) }}</span>
                <strong class="mono">{{ formatQuantity(row.count) }}</strong>
              </div>
              <div class="product-statistics__type-track">
                <span :style="{ width: `${row.share}%` }" />
              </div>
              <small>{{ row.share.toFixed(1) }}% · {{ t('Products').toLocaleLowerCase() }}</small>
            </div>
          </div>
        </Card>

        <Card class-name="product-statistics__table-card">
          <div class="card__head">
            <div class="card__head-text">
              <div class="kpi__label">
                {{ t('Product performance') }}
              </div>
              <h2 class="card__title">
                {{ t('All products sold in this range') }}
              </h2>
            </div>
          </div>
          <div class="card__divider" />
          <div data-testid="product-statistics-table">
            <DataTable
              :columns="productColumns"
              :rows="productRows"
              row-key="id"
              :loading="initialLoading"
              :empty-title="t('No product sales activity found')"
              :empty-sub="t('Try another business-day range or clear the product and category filters.')"
              :per-page="10"
            >
              <template #cell.displayName="{ row }">
                <span
                  class="cell-strong"
                  :title="row.displayName"
                >{{ row.displayName }}</span>
              </template>
              <template #cell.displayCategory="{ row }">
                <span
                  class="cell-muted"
                  :title="row.displayCategory"
                >{{ row.displayCategory }}</span>
              </template>
              <template #cell.units="{ row }">
                <span class="mono">{{ formatQuantity(row.units) }}</span>
              </template>
              <template #cell.netSales="{ row }">
                <span class="mono cell-strong">{{ formatCurrency(row.netSales) }}</span>
              </template>
              <template #cell.grossSales="{ row }">
                <span class="mono">{{ formatCurrency(row.grossSales) }}</span>
              </template>
              <template #cell.refundAmount="{ row }">
                <span class="mono">{{ formatCurrency(row.refundAmount) }}</span>
              </template>
              <template #cell.share="{ row }">
                <span class="mono">{{ row.share.toFixed(1) }}%</span>
              </template>
              <template #cell.paretoClass="{ row }">
                <Badge :tone="row.paretoClass === 'A' ? 'success' : row.paretoClass === 'B' ? 'warning' : 'neutral'">
                  {{ row.paretoClass }}
                </Badge>
              </template>
            </DataTable>
          </div>
        </Card>
      </section>

      <section
        v-if="hasLoaded && !hasSales"
        class="product-statistics__state-card"
      >
        <StateFill
          icon="box"
          :title="t('No product sales activity found')"
          :sub="t('Try another business-day range or clear the product and category filters.')"
        >
          <Button
            v-if="hasClientFilters"
            variant="secondary"
            @click="clearClientFilters"
          >
            {{ t('Clear filters') }}
          </Button>
        </StateFill>
      </section>
    </template>
  </WorkspacePage>
</template>

<style scoped>
.product-statistics {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--sp-4);
  min-width: 0;
}

.product-statistics__filters-card {
  position: relative;
  z-index: 4;
  padding: var(--sp-4);
}

.product-statistics__filters {
  display: flex;
  align-items: end;
  flex-wrap: wrap;
  gap: var(--sp-3);
  min-inline-size: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.product-statistics__filters:disabled {
  opacity: .72;
}

.product-statistics__filter-field {
  display: grid;
  flex: 1 1 220px;
  gap: 7px;
  min-width: 0;
}

.product-statistics__filter-field--period {
  flex-basis: 210px;
}

.product-statistics__filter-label {
  color: rgb(var(--v-theme-text-tertiary));
  font-size: var(--fs-label);
  font-weight: var(--fw-semibold);
  letter-spacing: var(--tracking-label);
  text-transform: uppercase;
}

.product-statistics__picker {
  position: relative;
}

.product-statistics__select-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  min-height: 38px;
  padding: 0 11px;
  border: 1px solid rgb(var(--v-theme-border));
  border-radius: var(--r-sm);
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.product-statistics__select-trigger:hover,
.product-statistics__select-trigger:focus-visible {
  border-color: rgb(var(--v-theme-primary));
  outline: none;
}

.product-statistics__select-trigger > span:first-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.product-statistics__picker-popover {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  left: 0;
  display: grid;
  gap: var(--sp-2);
  max-height: min(390px, 60vh);
  padding: var(--sp-3);
  overflow: hidden;
  border: 1px solid rgb(var(--v-theme-border));
  border-radius: var(--r-md);
  background: rgb(var(--v-theme-surface));
  box-shadow: var(--shadow-lg);
}

.product-statistics__picker-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 28px;
}

.product-statistics__picker-count {
  min-width: 22px;
  color: rgb(var(--v-theme-text-tertiary));
  font-family: var(--font-mono);
  font-size: var(--fs-sm);
  font-variant-numeric: tabular-nums;
}

.product-statistics__picker-list {
  display: grid;
  gap: 2px;
  max-height: 250px;
  overflow: auto;
}

.product-statistics__picker-option {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  padding: 7px 5px;
  border-radius: var(--r-xs);
  color: rgb(var(--v-theme-on-surface));
  cursor: pointer;
  font-size: var(--fs-sm);
}

.product-statistics__picker-option:hover {
  background: rgb(var(--v-theme-surface-inset));
}

.product-statistics__picker-option > span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.product-statistics__scope {
  display: flex;
  flex: 0 1 auto;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--sp-2);
  max-width: 100%;
  min-height: 38px;
}

.product-statistics__scope :deep(.badge) {
  height: auto;
  min-height: 22px;
  padding-block: 3px;
  line-height: 1.3;
  white-space: normal;
}

.product-statistics__loading {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border: 1px solid rgb(var(--v-theme-primary-border));
  border-radius: var(--r-sm);
  background: rgb(var(--v-theme-primary-weak));
  color: rgb(var(--v-theme-primary));
  font-size: var(--fs-sm);
}

.product-statistics__loading strong,
.product-statistics__loading span:not(.product-statistics__loading-dot) {
  display: block;
}

.product-statistics__loading span:not(.product-statistics__loading-dot) {
  margin-top: 2px;
  color: rgb(var(--v-theme-text-secondary));
}

.product-statistics__loading-dot {
  width: 10px;
  height: 10px;
  flex: 0 0 10px;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: product-statistics-spin .7s linear infinite;
}

.product-statistics__kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--sp-3);
}

.product-statistics__fact-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--sp-3);
}

.product-statistics__fact-grid > .card {
  padding: var(--sp-3) var(--sp-4);
}

.product-statistics__fact {
  display: grid;
  gap: 6px;
}

.product-statistics__fact > span {
  color: rgb(var(--v-theme-text-tertiary));
  font-size: var(--fs-label);
  font-weight: var(--fw-semibold);
  letter-spacing: var(--tracking-label);
  text-transform: uppercase;
}

.product-statistics__fact > strong {
  overflow: hidden;
  color: rgb(var(--v-theme-on-surface));
  font-size: var(--fs-base);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.product-statistics__method-card {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sp-4);
  padding: var(--sp-3) var(--sp-4);
  border: 1px solid rgb(var(--v-theme-info-border));
  border-radius: var(--r-md);
  background: rgb(var(--v-theme-info-weak));
}

.product-statistics__method-card div {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.product-statistics__method-card strong {
  color: rgb(var(--v-theme-on-surface));
  font-size: var(--fs-sm);
}

.product-statistics__method-card span,
.product-statistics__method-card p {
  margin: 0;
  color: rgb(var(--v-theme-text-secondary));
  font-size: var(--fs-sm);
  line-height: 1.45;
}

.product-statistics__method-card p {
  max-width: 560px;
}

.product-statistics__charts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--sp-4);
}

.product-statistics__bottom-grid {
  display: grid;
  grid-template-columns: minmax(260px, .72fr) minmax(0, 1.8fr);
  gap: var(--sp-4);
}

.product-statistics__type-list {
  display: grid;
  gap: var(--sp-4);
}

.product-statistics__type-row {
  display: grid;
  gap: 6px;
}

.product-statistics__type-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2);
  font-size: var(--fs-sm);
}

.product-statistics__type-head strong {
  white-space: nowrap;
}

.product-statistics__type-track {
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: rgb(var(--v-theme-chart-track));
}

.product-statistics__type-track span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: rgb(var(--v-theme-chart-revenue));
}

.product-statistics__type-row small {
  color: rgb(var(--v-theme-text-tertiary));
  font-size: var(--fs-label);
}

.product-statistics__table-card {
  min-width: 0;
}

.product-statistics__state-card {
  border: 1px solid rgb(var(--v-theme-border));
  border-radius: var(--r-md);
  background: rgb(var(--v-theme-surface));
}

.product-statistics :deep(.hbar-name) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@keyframes product-statistics-spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 1150px) {
  .product-statistics__kpis,
  .product-statistics__fact-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .product-statistics__bottom-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 780px) {
  .product-statistics__charts {
    grid-template-columns: minmax(0, 1fr);
  }

  .product-statistics__method-card {
    display: grid;
  }
}

@media (max-width: 620px) {
  .product-statistics__filters-card {
    z-index: 5;
  }

  .product-statistics__filter-field,
  .product-statistics__scope {
    flex-basis: 100%;
    width: 100%;
  }

  .product-statistics__scope {
    justify-content: flex-start;
  }

  .product-statistics__picker-popover {
    position: fixed;
    top: auto;
    right: 12px;
    bottom: 12px;
    left: 12px;
    max-height: min(520px, calc(100vh - 24px));
    z-index: 30;
  }

  .product-statistics__kpis,
  .product-statistics__fact-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>

<route lang="yaml">
meta:
  action: manage
  subject: all
</route>
