<script setup lang="ts">
import WorkspacePage from '@/components/design/workspace/WorkspacePage.vue'
import api from '@/plugins/axios'
import PageHeader from '@/components/design/PageHeader.vue'
import Field from '@/components/design/Field.vue'
import Input from '@/components/design/Input.vue'
import Select from '@/components/design/Select.vue'
import DateInput from '@/components/design/DateInput.vue'
import Button from '@/components/design/Button.vue'
import Badge from '@/components/design/Badge.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import Skeleton from '@/components/design/Skeleton.vue'
import DataTable, { type DataTableColumn } from '@/components/design/DataTable.vue'
import ReportState from '@/components/dashboard/ReportState.vue'
import ProductReportExport from '@/components/reports/ProductReportExport.vue'
import ProductPerformanceTable from '@/components/reports/ProductPerformanceTable.vue'
import { fmtDate, fmtDateTime, fmtMoney, fmtNum, fmtPct } from '@/components/design/utils/format'
import { exportProductPerformance, fetchProductPerformance, reportRangeError } from '@/services/productPerformance'
import { downloadBlob } from '@/utils/download'
import { PRODUCT_REPORT_PRESETS, PRODUCT_REPORT_SORTS, type ProductPerformanceReport, type ProductPerformanceRow, type ProductReportAggregate, type ProductReportFilters, type ProductReportFormat, type ProductReportPreset } from '@/types/productPerformance'

const { t } = useI18n({ useScope: 'global' })
const { translate } = useApiError()
const { notify } = useNotify()
const filters = reactive<ProductReportFilters>({ preset: 'today', sort: 'highest_revenue' })
const report = shallowRef<ProductPerformanceReport | null>(null)
const applied = shallowRef<ProductReportFilters | null>(null)
const loading = ref(true)
const error = shallowRef<unknown>(null)
const page = ref(1)
const perPage = ref(25)
const search = ref('')
const selectedProduct = ref('')
const presetDraft = ref<ProductReportPreset>('today')
const dateDraft = reactive({ from: '', to: '' })
const latestBusinessDate = ref<string>()
const rangeError = ref('')
const extraFilters = ref(false)
const categories = ref<Array<{ value: string; label: string }>>([])
const cashiers = ref<Array<{ value: string; label: string }>>([])
const categoryError = ref(false)
const cashierError = ref(false)
const categoryLoading = ref(false)
const cashierLoading = ref(false)
const exportsBusy = reactive(new Set<ProductReportFormat>())
const tab = ref<'products' | 'categories' | 'daily'>('products')
let controller: AbortController | null = null
const lookupController = new AbortController()
let sequence = 0
let disposed = false

const money = (value: string | null | undefined) => fmtMoney(value, { exact: true })
const percent = (value: string | null | undefined) => value == null ? '—' : fmtPct(Number(value), 2)
const businessDate = (value: string) => fmtDate(`${value}T12:00:00`)
const presets = computed(() => PRODUCT_REPORT_PRESETS.map(value => ({ value, label: t(`report_preset_${value}`) })))
const sorts = computed(() => PRODUCT_REPORT_SORTS.map(value => ({ value, label: t(`report_sort_${value}`) })))
const orderTypes = computed(() => ['HALL', 'DELIVERY', 'PICKUP'].map(value => ({ value, label: t(`report_type_${value}`) })))
const origins = computed(() => ['POS', 'QR', 'TELEGRAM'].map(value => ({ value, label: t(`report_origin_${value}`) })))
const payments = computed(() => ['CASH', 'UZCARD', 'HUMO', 'CARD', 'PAYME', 'MIXED'].map(value => ({ value, label: t(`report_payment_${value}`) })))
const activeFilterCount = computed(() => ['category_id', 'product_id', 'cashier_id', 'order_type', 'order_origin', 'payment_method', 'search'].filter(key => !!filters[key as keyof ProductReportFilters]).length)
const summary = computed(() => report.value?.summary)

const metrics = computed(() => [
  { key: 'units', label: t('Units sold'), value: fmtNum(summary.value?.total_units_sold), unit: '', hint: t('report_units_hint') },
  { key: 'revenue', label: t('Revenue'), value: money(summary.value?.total_revenue), unit: report.value?.currency, hint: t('report_revenue_hint') },
  { key: 'cost', label: t('report_ingredient_cost'), value: money(summary.value?.total_ingredient_cost), unit: report.value?.currency, hint: t('report_cost_hint') },
  { key: 'profit', label: t('report_gross_profit'), value: money(summary.value?.total_gross_profit), unit: report.value?.currency, hint: t('report_profit_hint') },
  { key: 'margin', label: t('Margin'), value: percent(summary.value?.gross_profit_margin_pct), unit: '', hint: t('report_margin_hint') },
  { key: 'coverage', label: t('report_cost_coverage'), value: percent(summary.value?.cost_coverage_pct), unit: '', hint: t('report_coverage_hint') },
])

const errorMessage = computed(() => {
  const status = (error.value as { response?: { status?: number } })?.response?.status
  return status === 404 ? t('report_unavailable_body') : translate(error.value)
})

const aggregateRows = computed(() => (tab.value === 'categories' ? report.value?.categories ?? [] : report.value?.daily ?? [])
  .map((row, index) => ({ ...row, id: index, name: tab.value === 'categories' ? (row.category_name || t('Uncategorized')) : businessDate(row.business_date || row.date || ''), units: row.units_sold ?? row.total_units_sold })))

type AggregateRow = ProductReportAggregate & { id: number; name: string; units?: number }

const aggregateColumns = computed<DataTableColumn<AggregateRow>[]>(() => [
  { key: 'name', label: t(tab.value === 'categories' ? 'Category' : 'Date') },
  { key: 'units', label: t('Units sold'), align: 'right', render: row => fmtNum(row.units) },
  { key: 'net_units', label: t('Net units sold'), align: 'right', render: row => fmtNum(row.net_units) },
  { key: 'total_revenue', label: t('Revenue'), align: 'right', render: row => money(row.total_revenue) },
  { key: 'total_ingredient_cost', label: t('report_ingredient_cost'), align: 'right', render: row => money(row.total_ingredient_cost) },
  { key: 'gross_profit', label: t('report_gross_profit'), align: 'right', render: row => money(row.gross_profit !== undefined ? row.gross_profit : row.total_gross_profit) },
  { key: 'gross_profit_margin_pct', label: t('Margin'), align: 'right', render: row => percent(row.gross_profit_margin_pct) },
])

async function loadReport() {
  const request = ++sequence

  controller?.abort()
  controller = new AbortController()
  loading.value = true
  error.value = null
  report.value = null

  const snapshot = { ...filters }
  try {
    const result = await fetchProductPerformance(snapshot, { page: page.value, per_page: perPage.value }, controller.signal)
    if (request !== sequence || disposed)
      return
    report.value = result
    if (result.range.preset === 'today')
      latestBusinessDate.value = result.range.to
    applied.value = snapshot
    page.value = result.pagination.page
    if (presetDraft.value !== 'custom') {
      dateDraft.from = result.range.from
      dateDraft.to = result.range.to
    }
  }
  catch (failure) {
    if (request !== sequence || disposed || (failure as { code?: string }).code === 'ERR_CANCELED')
      return
    error.value = failure
    notify(errorMessage.value, 'error')
  }
  finally {
    if (request === sequence && !disposed)
      loading.value = false
  }
}

function selectPreset(value: string) {
  presetDraft.value = value as ProductReportPreset
  rangeError.value = ''
  if (value !== 'custom') {
    filters.preset = value as ProductReportPreset
    delete filters.from
    delete filters.to
  }
}
function applyDates() {
  const invalid = reportRangeError(dateDraft.from, dateDraft.to)

  rangeError.value = invalid ? t(`report_error_${invalid}`) : ''
  if (!invalid)
    Object.assign(filters, { preset: 'custom', from: dateDraft.from, to: dateDraft.to })
}
function changePage(value: number) { page.value = value; loadReport() }
function changePerPage(value: number) { perPage.value = value; page.value = 1; loadReport() }
function focusProduct(row: ProductPerformanceRow) { selectedProduct.value = row.product_name; filters.product_id = String(row.product_id) }
function clearFilters() {
  search.value = ''
  selectedProduct.value = ''
  Object.assign(filters, { category_id: '', product_id: '', search: '', cashier_id: '', order_type: '', order_origin: '', payment_method: '', sort: 'highest_revenue' })
}

async function loadCategories() {
  categoryLoading.value = true
  categoryError.value = false
  try {
    const response = await api.get('/categories/active', { signal: lookupController.signal })
    const payload = response.data?.data ?? response.data
    const rows = Array.isArray(payload) ? payload : payload?.categories ?? []

    categories.value = rows.map((row: { id: number; name: string }) => ({ value: String(row.id), label: row.name }))
  }
  catch {
    if (!disposed)
      categoryError.value = true
  }
  finally {
    if (!disposed)
      categoryLoading.value = false
  }
}

function cashierName(row: Record<string, string>) {
  return [row.first_name, row.last_name].filter(Boolean).join(' ') || row.name || row.email || String(row.id)
}

async function loadCashiers() {
  if (cashierLoading.value)
    return
  cashierLoading.value = true
  cashierError.value = false
  try {
    const result = new Map<string, string>()
    let next = true
    for (let index = 1; next && index <= 100; index++) {
      const response = await api.get('/users', { params: { role: 'CASHIER', per_page: 100, page: index }, signal: lookupController.signal })
      const payload = response.data?.data ?? response.data
      const rows = payload?.users ?? []
      const previousSize = result.size
      for (const row of rows)
        result.set(String(row.id), cashierName(row))
      const totalPages = Number(payload.pagination?.total_pages ?? payload.total_pages)

      next = rows.length > 0 && result.size > previousSize && (totalPages > 0 ? index < totalPages : rows.length === 100)
    }
    cashiers.value = [...result].map(([value, label]) => ({ value, label }))
  }
  catch {
    if (!disposed)
      cashierError.value = true
  }
  finally {
    if (!disposed)
      cashierLoading.value = false
  }
}

async function download(format: ProductReportFormat) {
  if (!applied.value || loading.value || exportsBusy.has(format))
    return
  exportsBusy.add(format)
  try {
    const file = await exportProductPerformance({ ...applied.value }, format)

    downloadBlob(file.blob, file.filename)
    if (!disposed)
      notify(t('report_download_ready', { filename: file.filename }))
  }
  catch (failure) {
    if (!disposed)
      notify(translate(failure), 'error')
  }
  finally { exportsBusy.delete(format) }
}

watchDebounced(search, value => { filters.search = value.trim() }, { debounce: 300 })
watch(() => JSON.stringify(filters), () => { page.value = 1; loadReport() })
watch(extraFilters, value => {
  if (value && !cashiers.value.length)
    loadCashiers()
})
onMounted(() => { loadReport(); loadCategories() })
onBeforeUnmount(() => {
  disposed = true
  sequence++
  controller?.abort()
  lookupController.abort()
})
</script>

<template>
  <WorkspacePage class="page product-performance-page">
    <PageHeader
      :title="t('report_title')"
      :subtitle="t('report_subtitle')"
    >
      <template #actions>
        <Button
          icon="refresh"
          :loading="loading"
          @click="loadReport"
        >
          {{ t('Refresh') }}
        </Button>
      </template>
    </PageHeader>

    <section
      class="report-filters"
      :aria-label="t('Filters')"
    >
      <div class="report-toolbar">
        <Field :label="t('Date range')">
          <Select
            :model-value="presetDraft"
            :options="presets"
            @update:model-value="selectPreset"
          />
        </Field>
        <Field :label="t('Category')">
          <Select
            v-model="filters.category_id"
            :options="categories"
            :placeholder="t('All categories')"
            :disabled="categoryLoading"
          />
        </Field>
        <Field
          class="report-search"
          :label="t('Search')"
        >
          <Input
            v-model="search"
            icon="search"
            :placeholder="t('report_search')"
            maxlength="100"
          />
        </Field>
        <Field
          class="report-sort"
          :label="t('Sort by')"
        >
          <Select
            v-model="filters.sort"
            :options="sorts"
          />
        </Field>
        <ProductReportExport
          :busy="exportsBusy"
          :disabled="loading || !report"
          :formats="report?.options.formats"
          @export="download"
        />
      </div>
      <form
        v-if="presetDraft === 'custom'"
        class="report-custom-dates"
        @submit.prevent="applyDates"
      >
        <Field :label="t('Start date')">
          <DateInput
            v-model="dateDraft.from"
            :error="!!rangeError"
            :max="latestBusinessDate"
          />
        </Field>
        <span
          class="report-date-arrow"
          aria-hidden="true"
        >→</span>
        <Field :label="t('End date')">
          <DateInput
            v-model="dateDraft.to"
            :error="!!rangeError"
            :max="latestBusinessDate"
          />
        </Field>
        <Button
          type="submit"
          icon="check"
        >
          {{ t('Apply') }}
        </Button>
        <p
          v-if="rangeError"
          class="report-range-error"
          role="alert"
        >
          {{ rangeError }}
        </p>
      </form>
      <div class="report-filter-footer">
        <button
          type="button"
          class="report-more-filters"
          :aria-expanded="extraFilters"
          aria-controls="report-advanced"
          @click="extraFilters = !extraFilters"
        >
          <DesignIcon
            name="sliders"
            :size="14"
          />{{ t('report_more_filters') }}<span v-if="activeFilterCount">{{ activeFilterCount }}</span>
        </button>
        <button
          v-if="activeFilterCount"
          type="button"
          class="report-clear"
          @click="clearFilters"
        >
          {{ t('Clear filters') }}
        </button>
        <button
          v-if="filters.product_id"
          class="report-selected-product"
          type="button"
          :aria-label="t('report_clear_product')"
          @click="filters.product_id = ''; selectedProduct = ''"
        >
          <DesignIcon
            name="box"
            :size="13"
          />{{ selectedProduct }}<DesignIcon
            name="close"
            :size="13"
          />
        </button>
        <span class="report-business-note"><DesignIcon
          name="clock"
          :size="13"
        />{{ t('report_business_window') }}</span>
      </div>
      <div
        v-if="extraFilters"
        id="report-advanced"
        class="report-advanced"
      >
        <Field :label="t('Cashier')">
          <Select
            v-model="filters.cashier_id"
            :options="cashiers"
            :placeholder="t('All cashiers')"
            :disabled="cashierLoading"
          />
        </Field>
        <Field :label="t('Order type')">
          <Select
            v-model="filters.order_type"
            :options="orderTypes"
            :placeholder="t('All')"
          />
        </Field>
        <Field :label="t('report_order_origin')">
          <Select
            v-model="filters.order_origin"
            :options="origins"
            :placeholder="t('All')"
          />
        </Field>
        <Field :label="t('Payment method')">
          <Select
            v-model="filters.payment_method"
            :options="payments"
            :placeholder="t('All')"
          />
        </Field>
      </div>
      <p
        v-if="categoryError"
        class="report-lookup-error"
        role="status"
      >
        {{ t('report_categories_error') }} <button
          type="button"
          @click="loadCategories"
        >
          {{ t('Retry') }}
        </button>
      </p>
      <p
        v-if="cashierError && extraFilters"
        class="report-lookup-error"
        role="status"
      >
        {{ t('report_cashiers_error') }} <button
          type="button"
          @click="loadCashiers"
        >
          {{ t('Retry') }}
        </button>
      </p>
    </section>

    <ReportState
      v-if="error"
      error
      :title="t('report_load_error')"
      :description="errorMessage"
      :action="t('Retry')"
      @action="loadReport"
    />
    <template v-else>
      <section
        class="report-summary"
        :aria-label="t('report_summary')"
        :aria-busy="loading"
      >
        <article
          v-for="metric in metrics"
          :key="metric.key"
          :data-metric="metric.key"
          class="report-stat"
          :title="metric.hint"
        >
          <h2>{{ metric.label }}</h2><Skeleton
            v-if="loading"
            :h="28"
            w="70%"
          /><p
            v-else
            class="report-stat__value"
          >
            {{ metric.value }}<small v-if="metric.unit && metric.value !== '—'">{{ metric.unit }}</small>
          </p><span>{{ metric.hint }}</span>
        </article>
      </section>
      <div
        v-if="loading"
        class="report-loading"
        role="status"
        :aria-label="t('report_loading')"
      >
        <span>{{ t('report_loading') }}</span><div
          v-for="row in 6"
          :key="row"
        >
          <Skeleton
            w="30%"
            :h="12"
          /><Skeleton
            w="18%"
            :h="12"
          /><Skeleton
            w="12%"
            :h="12"
          />
        </div>
      </div>
      <template v-else-if="report">
        <aside
          v-if="!report.summary.cost_complete"
          class="report-cost-warning"
          role="status"
        >
          <DesignIcon
            name="alert"
            :size="19"
          /><div><strong>{{ t('report_cost_warning', { n: report.summary.products_missing_cost }) }}</strong><p>{{ t('report_cost_warning_body') }}</p></div>
        </aside>
        <div class="report-context">
          <strong>{{ businessDate(report.range.from) }} — {{ businessDate(report.range.to) }}</strong>
          <span>{{ t('report_products_count', { n: fmtNum(report.summary.product_count) }) }}</span><span>{{ t('report_orders_count', { n: fmtNum(report.summary.order_count) }) }}</span><span>{{ t('report_refunds_count', { n: fmtNum(report.summary.total_units_refunded) }) }}</span>
          <Badge
            v-if="report.status === 'PROVISIONAL'"
            tone="warning"
          >
            {{ t('report_provisional') }}
          </Badge>
        </div>
        <section class="report-data">
          <div class="report-data__head">
            <div
              class="report-tabs"
              role="group"
              :aria-label="t('report_views')"
            >
              <button
                v-for="view in (['products', 'categories', 'daily'] as const)"
                :key="view"
                type="button"
                :aria-pressed="tab === view"
                @click="tab = view"
              >
                {{ t(`report_tab_${view}`) }}<span>{{ fmtNum(view === 'products' ? report.pagination.total : report[view].length) }}</span>
              </button>
            </div>
            <span>{{ report.currency }} · {{ t('report_full_scope') }}</span>
          </div>
          <ProductPerformanceTable
            v-if="tab === 'products'"
            :report="report"
            @page="changePage"
            @per-page="changePerPage"
            @product="focusProduct"
            @clear="clearFilters"
          />
          <DataTable
            v-else
            :key="tab"
            :columns="aggregateColumns"
            :rows="aggregateRows"
            row-key="id"
            mobile-cards
            :mobile-summary="['units', 'total_revenue', 'gross_profit']"
            :per-page="25"
            :per-page-options="[25, 50, 100]"
            class="report-aggregate-table"
          >
            <template #empty>
              <ReportState
                :title="t('report_empty')"
                :description="t('report_empty_body')"
              />
            </template>
          </DataTable>
        </section>
        <details class="report-methodology">
          <summary>
            {{ t('report_methodology') }}<DesignIcon
              name="chevdown"
              :size="15"
            />
          </summary>
          <div><p>{{ t('report_methodology_body') }}</p><p>{{ t('report_refund_policy') }}</p><p>{{ t('report_tender_policy') }}</p><p>{{ t('report_time_policy') }}</p><dl><div><dt>{{ t('report_exact_window') }}</dt><dd>{{ report.range.start_at }} — {{ report.range.end_at }} · {{ report.range.timezone }}</dd></div><div><dt>{{ t('report_known_cost') }}</dt><dd>{{ money(report.summary.known_ingredient_cost) }} {{ report.currency }}</dd></div><div><dt>{{ t('report_generated') }}</dt><dd>{{ fmtDateTime(report.generated_at) }}</dd></div></dl></div>
        </details>
      </template>
    </template>
  </WorkspacePage>
</template>

<style scoped>
.product-performance-page { display: grid; gap: 18px; min-width: 0; max-width: none; }
.product-performance-page :deep(.page__head) { margin-bottom: 2px; }
.report-filters { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 16px; }
.report-toolbar { display: grid; grid-template-columns: minmax(140px, .9fr) minmax(140px, 1fr) minmax(180px, 1.3fr) minmax(180px, 1.1fr) auto; gap: 12px; align-items: end; }
.report-toolbar > *, .report-advanced > *, .report-custom-dates > * { min-width: 0; }
.report-sort :deep(.control--select) { height: auto; min-height: 44px; padding-block: 10px; }
.report-sort :deep(.select__label) { white-space: normal; overflow: visible; text-overflow: clip; line-height: 1.4; overflow-wrap: anywhere; }
.report-filter-footer { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 14px; margin-top: 10px; color: var(--text-secondary); font-size: 11px; }
.report-more-filters, .report-clear, .report-selected-product { display: inline-flex; align-items: center; gap: 6px; min-height: 34px; color: var(--text-secondary); }
.report-more-filters > span { display: grid; place-items: center; min-width: 18px; height: 18px; padding: 0 4px; border-radius: 4px; background: var(--primary-weak); color: var(--primary); }
.report-selected-product { color: var(--primary); border-radius: 6px; background: var(--primary-weak); padding: 5px 8px; max-width: 100%; overflow-wrap: anywhere; text-align: left; }
.report-selected-product > svg { flex-shrink: 0; }
.report-business-note { display: flex; align-items: center; gap: 6px; margin-inline-start: auto; line-height: 1.5; }
.report-business-note svg { flex-shrink: 0; }
.report-advanced { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; border-top: 1px solid var(--border); padding-top: 14px; margin-top: 8px; }
.report-custom-dates { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) auto; align-items: end; gap: 10px; padding-top: 14px; max-width: 740px; }
.report-date-arrow { align-self: end; line-height: 44px; color: var(--text-secondary); }
.report-range-error { grid-column: 1 / -1; color: var(--error); font-size: 12px; margin: 0; }
.report-lookup-error { font-size: 12px; color: var(--text-secondary); margin: 8px 0 0; }
.report-lookup-error button { color: var(--primary); min-height: 36px; padding: 0 8px; }
.report-summary { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); border: 1px solid var(--border); background: var(--surface); border-radius: 14px; overflow: hidden; }
.report-stat { padding: 17px 16px; min-width: 0; border-inline-end: 1px solid var(--border); }
.report-stat:last-child { border-inline-end: 0; }
.report-stat h2 { margin: 0 0 12px; color: var(--text-secondary); font-size: 11px; font-weight: 500; }
.report-stat__value { margin: 0; font: 500 clamp(17px, 1.35vw, 24px) var(--font-mono); color: var(--text); letter-spacing: -.03em; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.report-stat__value small { display: inline-block; margin-inline-start: 4px; font: 9px var(--font-sans); color: var(--text-secondary); letter-spacing: 0; }
.report-stat > span { display: block; margin-top: 9px; font-size: 10px; line-height: 1.5; color: var(--text-secondary); }
.report-stat[data-metric="revenue"] { background: var(--primary-weak); }
.report-loading { border: 1px solid var(--border); border-radius: 14px; background: var(--surface); padding: 20px; }
.report-loading > span { display: block; margin-bottom: 20px; color: var(--text-secondary); font-size: 12px; }
.report-loading > div { display: flex; justify-content: space-between; gap: 20px; min-height: 49px; align-items: center; border-top: 1px solid var(--border); }
.report-cost-warning { display: flex; align-items: flex-start; gap: 11px; padding: 14px 16px; border: 1px solid rgb(var(--v-theme-warning-border)); border-radius: 10px; background: rgb(var(--v-theme-warning-weak)); color: rgb(var(--v-theme-warning-strong)); }
.report-cost-warning > svg { flex-shrink: 0; margin-top: 1px; }
.report-cost-warning strong { font-size: 12px; font-weight: 600; }
.report-cost-warning p { margin: 4px 0 0; font-size: 12px; line-height: 1.5; }
.report-context { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 18px; font-size: 11px; color: var(--text-secondary); }
.report-context strong { color: var(--text); font-weight: 500; }
.report-context > .badge { margin-inline-start: auto; }
.report-data { min-width: 0; background: var(--surface); border: 1px solid var(--border); border-radius: 14px; overflow: hidden; }
.report-data__head { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; border-bottom: 1px solid var(--border); padding: 9px 16px; }
.report-data__head > span { font-size: 10px; color: var(--text-secondary); }
.report-tabs { display: flex; flex-wrap: wrap; gap: 4px; }
.report-tabs button { display: flex; align-items: center; gap: 7px; min-height: 40px; padding: 8px 10px; border-radius: 7px; color: var(--text-secondary); font-size: 12px; }
.report-tabs button[aria-pressed="true"] { color: var(--primary); background: var(--primary-weak); }
.report-tabs button > span { font: 10px var(--font-mono); opacity: .8; }
.report-aggregate-table :deep(.dtable td.num) { font: 12px var(--font-mono); white-space: nowrap; }
.report-aggregate-table :deep(.dtable) { min-width: 900px; }
.report-methodology { border-top: 1px solid var(--border); font-size: 12px; color: var(--text-secondary); }
.report-methodology summary { display: flex; justify-content: space-between; gap: 12px; align-items: center; cursor: pointer; min-height: 48px; color: var(--text); list-style: none; }
.report-methodology summary::-webkit-details-marker { display: none; }
.report-methodology[open] summary svg { transform: rotate(180deg); }
.report-methodology p { max-width: 95ch; margin: 5px 0 12px; line-height: 1.7; }
.report-methodology dl { display: flex; flex-wrap: wrap; gap: 16px 26px; padding: 12px 0; }
.report-methodology dt { font-size: 10px; margin-bottom: 5px; }
.report-methodology dd { color: var(--text); margin: 0; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
.product-performance-page button:focus-visible, .report-methodology summary:focus-visible { outline: 2px solid var(--primary); outline-offset: 3px; border-radius: 4px; }
@media (max-width: 1350px) { .report-toolbar { grid-template-columns: repeat(2, minmax(0, 1fr)) minmax(170px, 1.2fr); } .report-search { grid-column: 3; grid-row: 1; } .report-toolbar > .report-export { grid-column: 3; } .report-toolbar > .field:nth-child(4) { grid-column: span 2; } .report-summary { grid-template-columns: repeat(3, minmax(0, 1fr)); } .report-stat:nth-child(3) { border-inline-end: 0; } .report-stat:nth-child(n+4) { border-top: 1px solid var(--border); } }
@media (max-width: 700px) { .product-performance-page { gap: 14px; } .report-toolbar { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 11px; } .report-search { grid-column: 1 / -1; grid-row: 2; } .report-toolbar > .field:nth-child(4) { grid-column: 1; } .report-toolbar > .report-export { grid-column: 2; } .report-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); } .report-stat:nth-child(3) { border-inline-end: 1px solid var(--border); } .report-stat:nth-child(2n) { border-inline-end: 0; } .report-stat:nth-child(n+3) { border-top: 1px solid var(--border); } .report-stat { padding: 14px 12px; } .report-stat__value { font-size: 19px; } .report-custom-dates { grid-template-columns: repeat(2, minmax(0, 1fr)); } .report-date-arrow { display: none; } .report-custom-dates > button { grid-column: 1 / -1; } .report-advanced { grid-template-columns: repeat(2, minmax(0, 1fr)); } .report-business-note { margin-inline-start: 0; flex-basis: 100%; } .report-filter-footer { column-gap: 12px; } .report-more-filters, .report-clear { min-height: 44px; } .report-context { gap: 8px 12px; } .report-context strong { flex-basis: 100%; } .report-tabs { width: 100%; justify-content: space-between; gap: 0; } .report-tabs button { padding: 8px; font-size: 11px; min-height: 44px; gap: 5px; } .report-data__head { padding: 8px; } .report-data__head > span { padding-inline: 8px; } }
@media (max-width: 700px) {
  .report-toolbar > .field.report-sort, .report-toolbar > .report-export { grid-column: 1 / -1; }
  .product-performance-page :deep(.page__head) { display: grid; grid-template-columns: minmax(0, 1fr) 44px; align-items: start; gap: 12px; }
  .product-performance-page :deep(.page__head-actions) { width: 44px; margin: 0; padding-top: 2px; }
  .product-performance-page :deep(.page__head-actions .btn) { width: 44px; height: 44px; min-width: 44px; padding: 0; }
  .product-performance-page :deep(.page__head-actions .btn__label) { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  .report-stat > span { display: none; }
  .report-stat h2 { margin-bottom: 8px; }
}
</style>

<route lang="yaml">
meta:
  action: manage
  subject: all
  allowedRoles: [ADMIN, MANAGER]
</route>
