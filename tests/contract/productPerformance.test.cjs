const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const { test } = require('node:test')
const ts = require('typescript')

function loadSource(relative, api = {}) {
  const filename = path.resolve(__dirname, '../../src', relative)
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const loaded = new Module(filename, module)
  loaded.require = request => request === '@/plugins/axios' ? { default: api } : require(request)
  loaded._compile(compiled, filename)
  return loaded.exports
}
const filters = { preset: 'custom', from: '2026-09-01', to: '2026-09-09', category_id: '4', product_id: '44', cashier_id: '9', search: ' Burger ', order_type: 'HALL', order_origin: 'POS', payment_method: 'CARD', sort: 'highest_profit' }

test('report and export share all applied filters, but export omits pagination', async () => {
  const calls = []
  const api = loadSource('services/productPerformance.ts', { get: async (url, config) => {
    calls.push({ url, ...config })
    return url.endsWith('/export')
      ? { data: new Blob(['report'], { type: 'text/csv' }), headers: {} }
      : { data: { data: { summary: {}, range: {}, pagination: {}, products: [] } } }
  } })
  await api.fetchProductPerformance(filters, { page: 3, per_page: 25 })
  await api.exportProductPerformance(filters, 'csv')
  const { page: current, per_page: size, ...screen } = calls[0].params
  const { format, ...download } = calls[1].params
  assert.equal(current, 3); assert.equal(size, 25); assert.equal(format, 'csv')
  assert.deepEqual(screen, download)
  assert.equal(download.search, 'Burger')
  assert.equal(download.payment_method, 'CARD')
  assert.equal(download.branch_id, undefined)
  assert.equal(calls[1].responseType, 'blob')
  assert.equal(filters.search, ' Burger ')
})

test('all six sorts pass to the server unchanged and presets omit obsolete custom dates', () => {
  const api = loadSource('services/productPerformance.ts')
  for (const sort of ['highest_units', 'highest_revenue', 'highest_profit', 'lowest_profit', 'highest_profit_margin', 'lowest_profit_margin']) {
    const params = api.productReportParams({ preset: 'today', sort, from: '2020-01-01', to: '2020-02-01', category_id: '', search: ' ' })
    assert.deepEqual(params, { preset: 'today', sort })
  }
})

test('inclusive custom ranges accept 366 dates, reject 367, reversed and invalid dates', () => {
  const { reportRangeError } = loadSource('services/productPerformance.ts')
  assert.equal(reportRangeError('2024-01-01', '2024-12-31'), null)
  assert.equal(reportRangeError('2024-01-01', '2025-01-01'), 'REPORT_RANGE_TOO_LARGE')
  assert.equal(reportRangeError('2026-09-10', '2026-09-09'), 'INVALID_REPORT_RANGE')
  for (const date of ['', '2026-02-30', '2026-13-01', '2026-00-01'])
    assert.equal(reportRangeError(date, '2026-09-09'), 'INVALID_REPORT_RANGE')
})

test('financial response keeps decimal strings, null historical costs and server totals', async () => {
  const data = { summary: { total_revenue: '9007199254740993.12', total_gross_profit: null }, range: { from: '2026-09-01', to: '2026-09-09' }, pagination: { total: 185 }, products: [{ product_id: 44, current_catalog_price: '250000.00', total_revenue: '195000.55', total_ingredient_cost: null, gross_profit: null, cost_complete: false }] }
  const api = loadSource('services/productPerformance.ts', { get: async () => ({ data: { success: true, data } }) })
  const result = await api.fetchProductPerformance(filters, { page: 1, per_page: 1 })
  assert.deepEqual(result, data)
  assert.equal(result.summary.total_revenue, '9007199254740993.12')
  assert.equal(result.products[0].gross_profit, null)
  assert.equal(result.pagination.total, 185)
})

test('backend UTF-8 download filenames take precedence with safe malformed fallback', () => {
  const { productReportFilename } = loadSource('services/productPerformance.ts')
  assert.equal(productReportFilename("attachment; filename=report.xlsx; filename*=UTF-8''Hisobot%20%E2%80%94%20sentabr.xlsx", 'xlsx'), 'Hisobot — sentabr.xlsx')
  assert.equal(productReportFilename("attachment; filename=report.pdf; filename*=UTF-8''bad%zz", 'pdf'), 'report.pdf')
  assert.equal(productReportFilename('attachment; filename="sales.csv"', 'csv'), 'sales.csv')
  assert.equal(productReportFilename('', 'csv'), 'product-performance.csv')
  assert.equal(productReportFilename("attachment; filename*=UTF-8''..%2Freport%0A.csv", 'csv'), '.._report_.csv')
})

test('blob validation failures retain stable code, field errors and HTTP status', async () => {
  const payload = { success: false, code: 'INVALID_REPORT_RANGE', message: 'End before start', errors: { to: 'Must be on or after from' } }
  const api = loadSource('services/productPerformance.ts', { get: async () => { throw { response: { status: 422, data: new Blob([JSON.stringify(payload)], { type: 'application/json' }) } } } })
  await assert.rejects(api.exportProductPerformance(filters, 'xlsx'), error => {
    assert.equal(error.response.status, 422)
    assert.deepEqual(error.response.data, payload)
    return true
  })
})

test('a successful HTTP response carrying JSON error never becomes a downloaded report', async () => {
  const api = loadSource('services/productPerformance.ts', { get: async () => ({ status: 200, data: new Blob([JSON.stringify({ success: false, code: 'REPORT_TOO_LARGE' })], { type: 'application/json' }), headers: {} }) })
  await assert.rejects(api.exportProductPerformance(filters, 'pdf'), error => error.response.data.code === 'REPORT_TOO_LARGE')
})

test('shared exact money formatting preserves cents, weighted prices and unsafe-sized integers', () => {
  const { fmtMoney } = loadSource('components/design/utils/format.ts')
  assert.equal(fmtMoney('9007199254740993.12', { exact: true }), '9\u202f007\u202f199\u202f254\u202f740\u202f993.12')
  assert.equal(fmtMoney('109701.4925', { exact: true }), '109\u202f701.4925')
  assert.equal(fmtMoney('120000.5500', { exact: true }), '120\u202f000.55')
  assert.equal(fmtMoney('7250000.00', { exact: true }), '7\u202f250\u202f000')
  assert.equal(fmtMoney(null, { exact: true }), '—')
  assert.equal(fmtMoney(undefined, { exact: true }), '—')
  assert.equal(fmtMoney('0.00', { exact: true }), '0')
  assert.equal(fmtMoney(1234.56), '1\u202f235')
})
