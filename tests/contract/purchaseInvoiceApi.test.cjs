const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const { test } = require('node:test')
const ts = require('typescript')

// Exercise the real boundary without loading browser authentication or making
// network requests. Fixtures follow backend core revision 6393830 and the
// server's docs/supplier-invoices/evidence/posted-response.json.
const filename = path.resolve(__dirname, '../../src/services/purchaseInvoiceApi.ts')
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
}).outputText

function loadApi(stockApi = {}) {
  const loaded = new Module(filename, module)

  loaded.require = request => {
    assert.equal(request, '@/plugins/axios')
    return { stockApi }
  }
  loaded._compile(compiled, filename)
  return loaded.exports
}

const posted = {
  id: 42,
  receiving_number: 'RCV-20260907-0001',
  total_uzs: 500000,
  supplier_balance_before_uzs: 200000,
  supplier_balance_after_uzs: 700000,
  status: 'POSTED',
  lines: [{
    supplier_item_id: 72,
    purchase_quantity: 5,
    purchase_unit_price_uzs: 100000,
    new_average_cost_uzs: 86666.6667,
    line_total_uzs: 500000,
    price_change_confirmed: false,
    price_change_reason: '',
  }],
  action_history: [{ action: 'POSTED', actor_id: 118, at: '2026-09-07T13:41:18.970855+05:00' }],
  replaces_invoice_id: null,
  replacement_invoice_ids: [],
  allowed_actions: [],
}

test('flat server price conflict retains the submitted line index without a supplier ID', () => {
  const api = loadApi()
  const result = api.normalizePurchaseInvoiceApiError({ response: { status: 409, data: {
    success: false,
    code: 'PRICE_CHANGE_CONFIRMATION_REQUIRED',
    message: 'Confirm this supplier price change with a reason.',
    errors: { 'lines.2.price_change_reason': ['Confirm this supplier price change with a reason.'] },
    details: { line_index: 2, old_price_uzs: 80000, new_price_uzs: 104000, difference_uzs: 24000, percentage: 30 },
  } } })

  assert.equal(result.known_code, 'PRICE_CHANGE_CONFIRMATION_REQUIRED')
  assert.deepEqual(result.price_changes, [{
    line_index: 2,
    supplier_item_id: undefined,
    old_unit_price_uzs: 80000,
    new_unit_price_uzs: 104000,
    difference_uzs: 24000,
    change_percent: 30,
  }])
  assert.ok(result.field_errors['lines.2.price_change_reason'])
})

test('multi-line conflict envelopes still preserve supplier identity and decreases', () => {
  const result = loadApi().normalizePurchaseInvoiceApiError({ response: { status: 409, data: {
    success: false,
    data: { code: 'PRICE_CHANGE_CONFIRMATION_REQUIRED', details: { changes: [{
      line_index: 0, supplier_item_id: 72, old_unit_price_uzs: 100000,
      new_unit_price_uzs: 70000, difference_uzs: -30000, change_percent: 30,
    }] } },
  } } })

  assert.equal(result.price_changes.length, 1)
  assert.equal(result.price_changes[0].supplier_item_id, 72)
  assert.equal(result.price_changes[0].difference_uzs, -30000)
})

test('reversal conflict keeps affected stock and batch IDs when the server omits names', () => {
  const result = loadApi().normalizePurchaseInvoiceApiError({ response: { status: 409, data: {
    code: 'INVOICE_REVERSAL_STOCK_CONSUMED',
    details: { affected_items: [
      { stock_item_id: 72, required_base_quantity: 5 },
      { stock_item_id: 73, batch_id: 8, reason: 'A later outbound or deleted movement exists' },
    ] },
  } } })

  assert.equal(result.stock_conflicts.length, 2)
  assert.equal(result.stock_conflicts[0].stock_item_id, 72)
  assert.equal(result.stock_conflicts[0].required_base_quantity, 5)
  assert.equal(result.stock_conflicts[0].stock_item_name, undefined)
  assert.equal(result.stock_conflicts[1].batch_id, 8)
  assert.equal(result.stock_conflicts[1].reason, 'A later outbound or deleted movement exists')
})

test('server pagination and aggregate invoice value cover the filtered set', () => {
  const api = loadApi()
  const result = api.normalizePurchaseInvoiceListResponse({ success: true, data: {
    invoices: [posted],
    pagination: { page: 1, per_page: 1, total: 12, total_pages: 12, has_next: true, has_previous: false },
    total_uzs: 6000000,
  } })

  assert.equal(result.pagination.total_items, 12)
  assert.equal(result.pagination.has_next, true)
  assert.equal(result.total_uzs, 6000000)
  assert.equal(api.normalizePurchaseInvoiceListResponse({ invoices: [] }).total_uzs, null)
})

test('a missing cost basis identifies the affected stock item from flat details', () => {
  const result = loadApi().normalizePurchaseInvoiceApiError({ response: { status: 409, data: {
    code: 'STOCK_COST_BASIS_MISSING',
    message: 'Existing stock has no verified average cost basis.',
    details: { stock_item_id: 72 },
  } } })

  assert.equal(result.known_code, 'STOCK_COST_BASIS_MISSING')
  assert.equal(result.stock_conflicts.length, 1)
  assert.equal(result.stock_conflicts[0].stock_item_id, 72)
})

test('catalog pagination does not stop at the first server page', () => {
  const result = loadApi().normalizeSupplierReceivableItemsResponse({ success: true, data: {
    items: [{ supplier_item_id: 72, suggested_unit_price_uzs: null, price_is_known: false }],
    pagination: { page: 1, per_page: 1, total: 103, total_pages: 103, has_next: true, has_previous: false },
  } })

  assert.equal(result.items[0].suggested_unit_price_uzs, null)
  assert.equal(result.pagination.total_items, 103)
  assert.equal(result.pagination.has_next, true)
})

test('creator and poster filter aliases are sent with the actual backend names', async () => {
  let request
  const api = loadApi({ get: async (url, config) => {
    request = { url, ...config }
    return { data: { success: true, data: { invoices: [], total_uzs: 0 } } }
  } })

  await api.fetchPurchaseInvoices({ created_by_id: 118, posted_by_id: 119, creator_id: 120, search: '', page: 2 })
  assert.equal(request.url, '/purchase-invoices/')
  assert.deepEqual(request.params, { creator_id: 120, poster_id: 119, page: 2 })
})

test('receive preserves numeric accounting inputs, replacement link and caller retry key', async () => {
  const requests = []
  const api = loadApi({ post: async (url, body, config) => {
    requests.push({ url, body: JSON.parse(JSON.stringify(body)), ...config })
    return { data: { success: true, data: { invoice: posted } } }
  } })
  const payload = {
    supplier_id: 59, location_id: 58, invoice_date: '2026-09-06',
    supplier_invoice_number: 'INV-104', currency: 'UZS', declared_total_uzs: 500000,
    notes: '', replaces_invoice_id: 41,
    lines: [{ supplier_item_id: 72, quantity: 5, unit_price_uzs: 100000,
      is_free: false, free_reason: '', batch_number: '', expiry_date: null, notes: '' }],
  }
  const response = await api.receivePurchaseInvoice(payload, 'same-retry-key')

  await api.receivePurchaseInvoice(payload, 'same-retry-key')
  assert.deepEqual(requests[0], requests[1])
  assert.equal(requests[0].url, '/purchase-invoices/receive/')
  assert.equal(requests[0].headers['Idempotency-Key'], 'same-retry-key')
  assert.deepEqual(requests[0].body, payload)
  assert.equal(typeof requests[0].body.lines[0].unit_price_uzs, 'number')
  assert.equal(response.invoice.lines[0].new_average_cost_uzs, 86666.6667)
  assert.equal(response.invoice.supplier_balance_after_uzs, 700000)
  assert.equal(response.invoice.action_history[0].actor_id, 118)
})

test('reverse keeps compensating history and retries with the supplied key', async () => {
  const requests = []
  const reversed = { ...posted, status: 'REVERSED', reversal: {
    version: 1, correction_id: 9, reason: 'Wrong quantity',
    reversed_at: '2026-09-07T15:00:00+05:00', reversed_by_id: 120,
    stock_transaction_ids: [49], supplier_transaction_id: 104, total_uzs: 500000,
  }, replacement_invoice_ids: [43] }
  const api = loadApi({ post: async (url, body, config) => {
    requests.push({ url, body, ...config })
    return { data: { success: true, data: { invoice: reversed } } }
  } })

  const result = await api.reversePurchaseInvoice(42, { reason: 'Wrong quantity' }, 'reverse-key')

  await api.purchaseInvoiceApi.reverse(42, { reason: 'Wrong quantity' }, 'reverse-key')
  assert.deepEqual(requests[0], requests[1])
  assert.equal(requests[0].url, '/purchase-invoices/42/reverse/')
  assert.equal(requests[0].headers['Idempotency-Key'], 'reverse-key')
  assert.deepEqual(result.invoice.reversal.stock_transaction_ids, [49])
  assert.deepEqual(result.invoice.replacement_invoice_ids, [43])
})

test('missing command keys fail before any transport call', async () => {
  let calls = 0
  const api = loadApi({ post: async () => { calls += 1 } })

  await assert.rejects(api.receivePurchaseInvoice({}, '  '), /Idempotency-Key is required/)
  await assert.rejects(api.reversePurchaseInvoice(42, { reason: 'Correction' }, ''), /Idempotency-Key is required/)
  assert.equal(calls, 0)
})
