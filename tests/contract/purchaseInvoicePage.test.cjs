const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const { parse } = require('@vue/compiler-sfc')
const { computed, ref } = require('vue')
const ts = require('typescript')

// Execute the actual script-setup logic and API normalizer without mounting a
// browser, loading authentication, or contacting any server. Vue's real refs
// and computed values preserve the form's reactive calculations. Watchers are
// intentionally inert so tests control asynchronous operations explicitly.
const root = path.resolve(__dirname, '../..')
const filename = path.join(root, 'src/pages/stock/purchase-invoices/index.vue')
const { descriptor, errors } = parse(fs.readFileSync(filename, 'utf8'), { filename })

assert.deepEqual(errors, [])
assert.ok(descriptor.scriptSetup)

const exposed = [
  'form', 'invoiceLines', 'catalogMode', 'lineErrors', 'formErrors',
  'submitError', 'editorOpen', 'confirmationOpen', 'saving', 'canCreate',
  'idempotencyKey', 'historySearch', 'historyRows', 'historyTotal',
  'historyState', 'historyError', 'historyLoading', 'selectedTotal',
  'validateEditor', 'receivePayload', 'receiveInvoice', 'handleReceiveError',
  'openEditor', 'openConfirmation', 'loadHistory', 'lineTotal',
  'loadSupplierProducts', 'catalogLoading', 'catalogError',
]

function compile(source) {
  return ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
  }).outputText
}

const compiledPage = compile(`${descriptor.scriptSetup.content}\nexport { ${exposed.join(', ')} }`)

function loadTypeScript(relativePath, dependencies) {
  const moduleFilename = path.join(root, relativePath)
  const loaded = new Module(moduleFilename, module)

  loaded.require = request => {
    assert.ok(Object.hasOwn(dependencies, request), `Unexpected dependency: ${request}`)
    return dependencies[request]
  }
  loaded._compile(compile(fs.readFileSync(moduleFilename, 'utf8')), moduleFilename)
  return loaded.exports
}

function emptyHistory() {
  return { data: { success: true, data: {
    invoices: [], total_uzs: 0, pagination: { total: 0, page: 1, per_page: 10, has_next: false },
  } } }
}

function historyResponse(id) {
  return { data: { success: true, data: {
    invoices: [{ id, receiving_number: `RCV-${id}`, status: 'POSTED', total_uzs: 100000 }],
    total_uzs: 100000,
    pagination: { total: 1, page: 1, per_page: 10, has_next: false },
  } } }
}

function loadPage({ permissions = ['stock.purchase_invoice.receive'], query = {}, transport = {} } = {}) {
  const stockApi = {
    get: async url => {
      if (url === '/purchase-invoices/')
        return emptyHistory()
      if (url === '/suppliers/')
        return { data: { data: { suppliers: [{ id: 59, name: 'Supplier', is_active: true }], total: 1 } } }
      if (url === '/locations/')
        return { data: { data: { locations: [{ id: 58, name: 'Warehouse', is_active: true }], total: 1 } } }
      throw new Error(`Unexpected GET ${url}`)
    },
    post: async () => { throw new Error('Test did not authorize a mock POST') },
    ...transport,
  }
  const api = loadTypeScript('src/services/purchaseInvoiceApi.ts', { '@/plugins/axios': { stockApi } })
  const priceUtils = loadTypeScript('src/utils/supplierItemPrice.ts', {})
  const mounted = []
  let keyNumber = 0
  const dependencies = {
    '@/plugins/axios': { stockApi },
    '@/services/purchaseInvoiceApi': api,
    '@/utils/supplierItemPrice': priceUtils,
    '@/composables/useApiError': { useApiError: () => ({ translate: error => error?.message || '' }) },
    '@/composables/useUserAccess': { useUserAccess: () => ({ hasPermission: permission => permissions.includes(permission) }) },
  }
  const context = vm.createContext({
    exports: {}, ref, computed,
    watch: () => {},
    useDebounceFn: callback => callback,
    onMounted: callback => mounted.push(callback),
    onUnmounted: () => {},
    useI18n: () => ({ t: key => key }),
    useFormatters: () => ({ formatCurrency: String, formatDate: String, formatDateShort: String }),
    useNotify: () => ({ notify: () => {} }),
    useRoute: () => ({ query }),
    crypto: { randomUUID: () => `test-operation-${++keyNumber}` },
    require: request => {
      if (request.startsWith('@/components/design/'))
        return {}
      assert.ok(Object.hasOwn(dependencies, request), `Unexpected page dependency: ${request}`)
      return dependencies[request]
    },
  })

  vm.runInContext(compiledPage, context, { filename })
  return { ...context.exports, mount: () => Promise.all(mounted.map(callback => callback())) }
}

function line(id, overrides = {}) {
  return {
    id: String(id), supplierItemId: id, stockItemId: id + 100, name: `Product ${id}`,
    sku: '', supplierSku: '', unitId: 1, unitName: 'kg', quantityDecimals: 4,
    suggestedPrice: null, trackBatches: false, trackExpiry: false, raw: {},
    quantity: '1', unitPrice: 100000, batchNumber: '', expiryDate: '',
    isFree: false, freeReason: '', notes: '', priceChangeConfirmed: false,
    priceChangeReason: '', ...overrides,
  }
}

function ready(page, lines = [line(72)]) {
  page.form.value = {
    supplierId: '59', locationId: '58', invoiceDate: '2026-09-01',
    supplierInvoiceNumber: 'INV-104', notes: '',
  }
  page.invoiceLines.value = lines
  page.catalogMode.value = 'receivable'
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })

  return { promise, resolve, reject }
}

// Matches core 6393830 stock/services/purchase_invoices/queries.py.
function receivableItem(id, overrides = {}) {
  return {
    supplier_item_id: id, supplier_id: 59, stock_item_id: id + 100,
    stock_item_name: `Product ${id}`, stock_item_sku: `RAW-${id}`, item_type: 'RAW',
    purchase_unit: { id: 1, name: 'Kilogram', short_name: 'kg', decimal_places: 4, conversion_to_base: 1 },
    base_unit: { id: 1, name: 'Kilogram', short_name: 'kg' },
    suggested_unit_price_uzs: null, price_is_known: false, last_price_update: null,
    track_batches: false, track_expiry: false, default_expiry_days: null,
    current_stock_base_quantity: 0, ...overrides,
  }
}

function catalogResponse(items, { page = 1, total = items.length, perPage = 100 } = {}) {
  return { data: { success: true, data: { items, pagination: {
    page, per_page: perPage, total, total_pages: Math.max(1, Math.ceil(total / perPage)),
    has_next: page * perPage < total, has_previous: page > 1,
  } } } }
}

test('deployed catalog maps purchase units and keeps unknown prices blank', async () => {
  const page = loadPage({ transport: { get: async () => catalogResponse([
    receivableItem(72), receivableItem(73, { suggested_unit_price_uzs: 100000, price_is_known: true }),
  ]) } })

  ready(page)
  await page.loadSupplierProducts()
  assert.equal(page.catalogMode.value, 'receivable')
  assert.equal(page.catalogLoading.value, false)
  assert.equal(page.catalogError.value, '')
  assert.equal(page.invoiceLines.value.length, 2)
  assert.equal(page.invoiceLines.value[0].unitId, 1)
  assert.equal(page.invoiceLines.value[0].unitName, 'kg')
  assert.equal(page.invoiceLines.value[0].quantityDecimals, 4)
  assert.equal(page.invoiceLines.value[0].suggestedPrice, null)
  assert.equal(page.invoiceLines.value[0].unitPrice, null)
  page.invoiceLines.value[1].quantity = '12'
  assert.equal(page.validateEditor(), true)
  page.openConfirmation()
  assert.equal(page.confirmationOpen.value, true)
  assert.equal(page.receivePayload().declared_total_uzs, 1200000)
})

test('canonical catalog loads every page before making products receivable', async () => {
  const requests = []
  const items = Array.from({ length: 102 }, (_, index) => receivableItem(index + 1))
  const page = loadPage({ transport: { get: async (url, config) => {
    requests.push({ url, ...config.params })
    const number = config.params.page
    return catalogResponse(items.slice((number - 1) * 100, number * 100), { page: number, total: 102 })
  } } })

  ready(page)
  await page.loadSupplierProducts()
  assert.deepEqual(requests, [
    { url: '/suppliers/59/receivable-items/', page: 1, per_page: 100 },
    { url: '/suppliers/59/receivable-items/', page: 2, per_page: 100 },
  ])
  assert.equal(page.invoiceLines.value.length, 102)
  assert.equal(page.invoiceLines.value[101].supplierItemId, 102)
  assert.equal(page.catalogMode.value, 'receivable')
})

test('missing canonical routes use a display-only preview that cannot post', async () => {
  for (const status of [404, 405]) {
    const requests = []
    let posts = 0
    const page = loadPage({ transport: {
      get: async url => {
        requests.push(url)
        if (url.endsWith('/receivable-items/'))
          throw { response: { status, data: {} } }
        return catalogResponse([receivableItem(72, { suggested_unit_price_uzs: 100000, price_is_known: true })])
      },
      post: async () => { posts += 1 },
    } })

    ready(page)
    await page.loadSupplierProducts()
    assert.deepEqual(requests, ['/suppliers/59/receivable-items/', '/suppliers/59/items/'])
    assert.equal(page.catalogMode.value, 'preview')
    page.invoiceLines.value[0].quantity = '1'
    assert.equal(page.validateEditor(), false)
    page.openConfirmation()
    await page.receiveInvoice()
    assert.equal(page.confirmationOpen.value, false)
    assert.equal(posts, 0)
  }
})

test('catalog authorization, outage and structured not-found errors never fall back', async () => {
  for (const [status, data] of [[403, {}], [500, {}], [404, { code: 'SUPPLIER_NOT_FOUND' }]]) {
    const requests = []
    const page = loadPage({ transport: { get: async url => {
      requests.push(url)
      throw { response: { status, data } }
    } } })

    ready(page)
    await page.loadSupplierProducts()
    assert.deepEqual(requests, ['/suppliers/59/receivable-items/'])
    assert.equal(page.catalogMode.value, 'none')
    assert.equal(page.catalogLoading.value, false)
    assert.ok(page.catalogError.value)
    assert.equal(page.invoiceLines.value.length, 0)
  }
})

test('switching supplier ignores stale catalog successes and failures', async () => {
  for (const fails of [false, true]) {
    const first = deferred()
    const second = deferred()
    const requests = []
    const page = loadPage({ transport: { get: url => {
      requests.push(url)
      return requests.length === 1 ? first.promise : second.promise
    } } })

    ready(page)
    const oldLoad = page.loadSupplierProducts()
    page.form.value.supplierId = '60'
    const currentLoad = page.loadSupplierProducts()

    second.resolve(catalogResponse([receivableItem(80, { supplier_id: 60 })]))
    await currentLoad
    if (fails)
      first.reject({ response: { status: 404, data: {} } })
    else
      first.resolve(catalogResponse([receivableItem(72)]))
    await oldLoad
    assert.equal(page.invoiceLines.value.length, 1)
    assert.equal(page.invoiceLines.value[0].supplierItemId, 80)
    assert.equal(page.catalogMode.value, 'receivable')
    assert.equal(page.catalogError.value, '')
    assert.equal(page.catalogLoading.value, false)
    assert.equal(requests.length, 2)
  }
})

test('flat price conflict maps the submitted index past unselected catalog rows', () => {
  const page = loadPage()

  ready(page, [line(70, { quantity: '' }), line(71, { quantity: '0' }), line(72)])
  const submittedPayload = page.receivePayload()

  assert.equal(submittedPayload.lines.length, 1)
  assert.equal(submittedPayload.lines[0].supplier_item_id, 72)
  page.confirmationOpen.value = true
  page.handleReceiveError({ response: { status: 409, data: {
    code: 'PRICE_CHANGE_CONFIRMATION_REQUIRED',
    message: 'Confirm this supplier price change with a reason.',
    details: { line_index: 0, old_price_uzs: 50000, new_price_uzs: 100000, difference_uzs: 50000, percentage: 100 },
  } } }, submittedPayload)

  assert.equal(page.invoiceLines.value[0].suggestedPrice, null)
  assert.equal(page.invoiceLines.value[1].suggestedPrice, null)
  assert.equal(page.invoiceLines.value[2].suggestedPrice, 50000)
  assert.equal(page.editorOpen.value, true)
  assert.equal(page.confirmationOpen.value, false)
  assert.equal(page.validateEditor(), false)
  assert.match(page.lineErrors.value['72'], /Confirm the large price change/)
  page.invoiceLines.value[2].priceChangeConfirmed = true
  page.invoiceLines.value[2].priceChangeReason = 'Supplier increased the purchase price'
  assert.equal(page.validateEditor(), true)
  assert.equal(page.receivePayload().lines[0].price_change_confirmed, true)
})

test('server field errors use the submitted payload even when catalog order changes', () => {
  const page = loadPage()

  ready(page, [line(70, { quantity: '0' }), line(72), line(73)])
  const submittedPayload = page.receivePayload()

  page.invoiceLines.value.reverse()
  page.handleReceiveError({ response: { status: 400, data: {
    code: 'VALIDATION_ERROR', errors: { 'lines.1.batch_number': ['Batch is required'] },
  } } }, submittedPayload)

  assert.equal(page.lineErrors.value['73'], 'Batch is required')
  assert.equal(page.lineErrors.value['72'], undefined)
  assert.equal(page.editorOpen.value, true)
})

test('malformed, nonfinite and excessive quantities cannot hide beside a valid line', () => {
  const page = loadPage()
  const invalidQuantities = ['Infinity', 'NaN', '1e309', '9'.repeat(400), '100000000000', '99999999999.99999', '-1', '1.00001']

  for (const quantity of invalidQuantities) {
    ready(page, [line(72), line(73, { quantity, isFree: true, unitPrice: 0, freeReason: 'Promotion' })])
    assert.equal(page.validateEditor(), false, `Accepted quantity ${quantity}`)
    assert.ok(page.lineErrors.value['73'], `Missing error for quantity ${quantity}`)
  }
})

test('quantity maximum and unit precision follow the backend decimal contract', () => {
  const page = loadPage()

  ready(page, [line(72, { quantity: '99999999999.9999', isFree: true, unitPrice: 0, freeReason: 'Promotion' })])
  assert.equal(page.validateEditor(), true)
  page.invoiceLines.value[0].quantity = '100000000000'
  assert.equal(page.validateEditor(), false)
  page.invoiceLines.value[0].quantity = '1.5'
  page.invoiceLines.value[0].quantityDecimals = 0
  assert.equal(page.validateEditor(), false)
})

test('unit-price and rounded line-total maxima are enforced independently', () => {
  const page = loadPage()

  ready(page, [line(72, { unitPrice: 99999999999 })])
  assert.equal(page.validateEditor(), true)
  page.invoiceLines.value[0].unitPrice = 100000000000
  assert.equal(page.validateEditor(), false)
  assert.equal(page.lineErrors.value['72'], 'purchaseInvoice.unitPriceTooLarge')
  page.invoiceLines.value[0].unitPrice = 50000000000
  page.invoiceLines.value[0].quantity = '2'
  assert.equal(page.validateEditor(), false)
  assert.equal(page.lineErrors.value['72'], 'purchaseInvoice.lineTotalTooLarge')
  page.invoiceLines.value[0].quantity = '1'
  page.invoiceLines.value[0].unitPrice = 1.5
  assert.equal(page.validateEditor(), false)
})

test('invoice total accepts its exact maximum and rejects one UZS more', () => {
  const page = loadPage()
  const lines = Array.from({ length: 100 }, (_, index) => line(index + 1, { unitPrice: 99999999999 }))

  lines.push(line(101, { unitPrice: 99 }))
  ready(page, lines)
  assert.equal(page.selectedTotal.value, 9999999999999)
  assert.equal(page.validateEditor(), true)
  page.invoiceLines.value[100].unitPrice = 100
  assert.equal(page.validateEditor(), false)
  assert.equal(page.submitError.value, 'Invoice total is too large')
})

test('fractional receipt quantities round half up and emit numeric accounting fields', () => {
  const page = loadPage()

  ready(page, [line(72, { quantity: '0.5', unitPrice: 1 }), line(73, { quantity: '12.5', unitPrice: 100000 })])
  assert.equal(page.validateEditor(), true)
  assert.equal(page.lineTotal(page.invoiceLines.value[0]), 1)
  const payload = page.receivePayload()

  assert.equal(payload.declared_total_uzs, 1250001)
  assert.equal(payload.lines[1].quantity, 12.5)
  assert.equal(payload.lines[1].unit_price_uzs, 100000)
  assert.equal(typeof payload.lines[1].unit_price_uzs, 'number')
})

test('read-only users cannot enter receiving through a supplier query or command', async () => {
  let posts = 0
  const page = loadPage({
    permissions: ['stock.purchase_invoice.read'], query: { supplier: '59' },
    transport: { post: async () => { posts += 1 } },
  })

  await page.mount()
  assert.equal(page.canCreate.value, false)
  assert.equal(page.editorOpen.value, false)
  page.openEditor()
  assert.equal(page.editorOpen.value, false)
  ready(page)
  page.openConfirmation()
  await page.receiveInvoice()
  assert.equal(page.confirmationOpen.value, false)
  assert.equal(posts, 0)
})

test('an obsolete history completion cannot clear the current loading state', async () => {
  const first = deferred()
  const second = deferred()
  let requests = 0
  const page = loadPage({ transport: { get: () => (++requests === 1 ? first.promise : second.promise) } })
  const firstLoad = page.loadHistory()

  page.historySearch.value = 'latest'
  const secondLoad = page.loadHistory()

  first.resolve(historyResponse(1))
  await firstLoad
  assert.equal(page.historyLoading.value, true)
  assert.equal(page.historyRows.value.length, 0)
  second.resolve(historyResponse(2))
  await secondLoad
  assert.equal(page.historyRows.value[0].id, 2)
  assert.equal(page.historyLoading.value, false)
})

test('an obsolete history failure cannot replace a newer successful result', async () => {
  const first = deferred()
  const second = deferred()
  let requests = 0
  const page = loadPage({ transport: { get: () => (++requests === 1 ? first.promise : second.promise) } })
  const firstLoad = page.loadHistory()
  const secondLoad = page.loadHistory()

  second.resolve(historyResponse(2))
  await secondLoad
  first.reject({ response: { status: 404, data: {} } })
  await firstLoad
  assert.equal(page.historyRows.value[0].id, 2)
  assert.equal(page.historyState.value, 'ready')
  assert.equal(page.historyError.value, '')
  assert.equal(page.historyTotal.value, 1)
})

test('double clicks are blocked and identical retries keep the operation key after errors', async () => {
  const first = deferred()
  const requests = []
  const failure = { response: { status: 503, data: { message: 'Temporary outage' } } }
  const page = loadPage({ transport: { post: (url, body, config) => {
    requests.push({ url, body: JSON.parse(JSON.stringify(body)), key: config.headers['Idempotency-Key'] })
    return requests.length === 1 ? first.promise : Promise.reject(failure)
  } } })

  ready(page)
  const firstAttempt = page.receiveInvoice()

  await page.receiveInvoice()
  assert.equal(requests.length, 1)
  assert.equal(page.saving.value, true)
  first.reject(failure)
  await firstAttempt
  assert.equal(page.saving.value, false)
  assert.ok(page.submitError.value)
  await page.receiveInvoice()
  assert.equal(requests.length, 2)
  assert.deepEqual(requests[0], requests[1])
  page.invoiceLines.value[0].quantity = '2'
  await page.receiveInvoice()
  assert.equal(requests.length, 3)
  assert.notEqual(requests[2].key, requests[1].key)
  assert.equal(requests[2].body.lines[0].quantity, 2)
})
