const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const { parse } = require('@vue/compiler-sfc')
const { computed, ref } = require('vue')
const ts = require('typescript')

// Execute the actual receive-money script with real Vue state and shift-money
// evidence selectors. No browser, credentials, or network access is involved.
const root = path.resolve(__dirname, '../..')
const filename = path.join(root, 'src/pages/shifts-analytics/index.vue')
const { descriptor, errors } = parse(fs.readFileSync(filename, 'utf8'), { filename })
assert.deepEqual(errors, [])
const exposed = [
  'visibleTenders', 'tenderLabel', 'countedByTender', 'receiving', 'note', 'busy',
  'settlementReady', 'settlementDetail', 'canConfirmSettlement', 'totalReceived',
  'expectedOf', 'tenderVariance', 'confirmReceive',
]
const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
}).outputText
const compiled = compile(`${descriptor.scriptSetup.content}\nexport { ${exposed.join(', ')} }`)
const moneyContext = vm.createContext({ exports: {} })
vm.runInContext(compile(fs.readFileSync(path.join(root, 'src/utils/shiftMoney.ts'), 'utf8')), moneyContext)

function readyPage(post = async () => ({ data: { data: {} } })) {
  const notifications = []
  const dependencies = {
    '@/plugins/axios': { default: { post, get: async () => ({ data: { data: { shifts: [] } } }) } },
    '@/utils/shiftMoney': moneyContext.exports,
    '@/utils/moneyInput': {},
    '@/utils/csv': {},
    '@/components/design/utils/format': { fmtNum: value => String(value), fmtMoney: value => String(value) },
    '@/composables/useWindowLabel': {},
  }
  const presentation = vm.createContext({ exports: {}, useI18n: () => ({ t: key => key }), require: request => { assert.equal(request, '@/utils/shiftMoney'); return moneyContext.exports } })
  vm.runInContext(compile(fs.readFileSync(path.join(root, 'src/composables/useShiftPresentation.ts'), 'utf8')), presentation)
  dependencies['@/composables/useShiftPresentation'] = presentation.exports
  dependencies['@/components/shifts/ShiftCard.vue'] = {}
  dependencies['@styles/pages/shifts.css'] = {}
  const context = vm.createContext({
    exports: {}, ref, computed,
    useStorage: (_key, value) => ref(value),
    watch: () => {}, onMounted: () => {}, onBeforeUnmount: () => {},
    useI18n: () => ({ t: key => key }),
    useNotify: () => ({ notify: (...args) => notifications.push(args) }),
    useRouter: () => ({ push: () => {} }),
    useCountUp: getter => computed(getter),
    require: request => {
      if (request.startsWith('@/components/design/') && !Object.hasOwn(dependencies, request)) return {}
      assert.ok(Object.hasOwn(dependencies, request), `Unexpected dependency: ${request}`)
      return dependencies[request]
    },
  })
  vm.runInContext(compiled, context, { filename })
  const page = context.exports
  page.receiving.value = { id: 11, status: 'ENDED', user: { name: 'Manager' } }
  page.settlementReady.value = true
  page.settlementDetail.value = {
    financial_evidence_available: true, cash_to_receive_complete: true,
    cash_to_receive: '2431000.00', expected_cash: '2431000.00',
    settlement: [['CASH', '2431000.00'], ['HUMO', '217000.00'], ['PAYME', '336000.00'], ['UZCARD', '0.00'], ['CARD', '0.00']]
      .map(([method, expected]) => ({ method, expected, expected_source: 'CANONICAL_DERIVED', status: 'UNCOUNTED' })),
  }
  return { ...page, notifications }
}

test('receive-money exposes Cash, Card and Payme without a separate Uzcard field', () => {
  const page = readyPage()
  assert.deepEqual(Array.from(page.visibleTenders), ['CASH', 'HUMO', 'PAYME'])
  assert.deepEqual(Array.from(page.visibleTenders, page.tenderLabel), ['Cash', 'Card', 'Payme'])
  assert.deepEqual(Object.keys(page.countedByTender.value), ['CASH', 'HUMO', 'PAYME'])
  assert.equal(page.expectedOf('HUMO'), 217000)
  assert.equal(page.expectedOf('PAYME'), 336000)
})

test('grouped amounts send exact numeric CASH, HUMO and PAYME without CARD or UZCARD', async () => {
  const requests = []
  const page = readyPage(async (url, body) => {
    requests.push({ url, body: JSON.parse(JSON.stringify(body)) })
    return { data: { data: {} } }
  })
  page.countedByTender.value = { CASH: '2\u202f431\u202f000', HUMO: '217 000', PAYME: '336\u00a0000' }
  assert.equal(page.canConfirmSettlement.value, true)
  assert.equal(page.totalReceived.value, 2984000)
  assert.equal(page.tenderVariance('HUMO'), 0)
  await page.confirmReceive()
  assert.deepEqual(requests, [{
    url: '/shifts/11/reconcile',
    body: { actual_cash: 2431000, confirmed: { CASH: 2431000, HUMO: 217000, PAYME: 336000 } },
  }])
  assert.equal(page.receiving.value, null)
})

test('all three counts require deliberate entry, including a zero Payme amount', async () => {
  let posts = 0
  const page = readyPage(async () => { posts += 1; return { data: {} } })
  page.countedByTender.value = { CASH: '2431000', HUMO: '217000', PAYME: '' }
  assert.equal(page.canConfirmSettlement.value, false)
  await page.confirmReceive()
  assert.equal(posts, 0)
  page.countedByTender.value.PAYME = '0'
  assert.equal(page.canConfirmSettlement.value, true)
  await page.confirmReceive()
  assert.equal(posts, 1)
})

test('duplicate submissions are blocked and rejected settlement keeps entered money', async () => {
  let rejectRequest
  let posts = 0
  const pending = new Promise((resolve, reject) => { rejectRequest = reject })
  const page = readyPage(() => { posts += 1; return pending })
  page.countedByTender.value = { CASH: '2431000', HUMO: '217000', PAYME: '0' }
  const first = page.confirmReceive()
  await page.confirmReceive()
  assert.equal(posts, 1)
  assert.equal(page.busy.value, true)
  rejectRequest({ response: { status: 422, data: { message: 'A manager confirmation is required.' } } })
  await first
  assert.equal(page.busy.value, false)
  assert.equal(page.receiving.value.id, 11)
  assert.equal(page.countedByTender.value.HUMO, '217000')
  assert.equal(page.countedByTender.value.PAYME, '0')
  assert.deepEqual(page.notifications, [['A manager confirmation is required.', 'error']])
})
