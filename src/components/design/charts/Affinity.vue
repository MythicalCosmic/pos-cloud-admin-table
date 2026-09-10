<script setup lang="ts">
import { chartTextColor } from './chartTextColor'
import { useEChartTheme } from '@/composables/useEChartTheme'
import { getDashboard } from '@/services/dashboardRequests'
import Card from '@/components/design/Card.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import Skeleton from '@/components/design/Skeleton.vue'
import ReportState from '@/components/dashboard/ReportState.vue'
import DashboardNotice from '@/components/dashboard/DashboardNotice.vue'
import { cx } from '@/components/design/utils'
import { fmtAbbr, fmtMoney, fmtNum, fmtPct } from '@/components/design/utils/format'
import { type DateParamInput, buildDateParams, businessPreset } from '@/composables/useBusinessDay'

interface Props {
  loading?: boolean

  /** Optional canonical reporting-window override. Defaults to the last 30 business dates. */
  range?: DateParamInput | null

  /** Localized label of the active window, so the title stops hardcoding "30 days". */
  windowLabel?: string
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  range: null,
  windowLabel: '',
})

const { t } = useI18n({ useScope: 'global' })
const { tokens: chartColors } = useEChartTheme()

/* ---------- Data model ---------- */
interface AffProduct {
  id: number
  name: string
  color: string | null
  orders: number
  price: number
}
interface AffPair {
  a: number
  b: number
  count: number
}
interface AffData {
  products: AffProduct[]
  pairs: AffPair[]
  totalOrders: number
}

const data = ref<AffData | null>(null)
const fetching = ref(true)
const fetchFailed = ref(false)
const fetchError = shallowRef<unknown>(null)
let loadedRangeKey = ''

/* ---------- BE wiring ---------- */
function defaultRange(): DateParamInput {
  return businessPreset('30d')
}

function num(v: unknown): number {
  const n = typeof v === 'string' ? Number(v) : (v as number)
  return Number.isFinite(n) ? n : 0
}

const palette = [
  'rgb(var(--v-theme-c1))',
  'rgb(var(--v-theme-c2))',
  'rgb(var(--v-theme-c3))',
  'rgb(var(--v-theme-c4))',
  'rgb(var(--v-theme-c5))',
  'rgb(var(--v-theme-primary-hover))',
]

function paletteFor(i: number, raw: string | null): string {
  if (raw && raw.trim())
    return raw
  return palette[i % palette.length]
}

function mapAffinity(raw: any): AffData {
  const products: AffProduct[] = Array.isArray(raw?.products)
    ? raw.products.map((p: any, i: number) => ({
      id: num(p?.id),
      name: p?.name ?? '—',
      color: paletteFor(i, p?.color ?? null),
      orders: num(p?.orders),
      price: num(p?.price),
    }))
    : []

  // BE contract: a < b, count > 0. Defensive sort / filter so chord doesn't break.
  const pairs: AffPair[] = Array.isArray(raw?.pairs)
    ? raw.pairs
      .map((p: any) => ({ a: num(p?.a), b: num(p?.b), count: num(p?.count) }))
      .filter((p: AffPair) =>
        p.a !== p.b
          && p.count > 0
          && p.a >= 0
          && p.b >= 0
          && p.a < products.length
          && p.b < products.length,
      )
      .map((p: AffPair) => (p.a < p.b ? p : { a: p.b, b: p.a, count: p.count }))
    : []

  return {
    products,
    pairs,
    totalOrders: num(raw?.totalOrders),
  }
}

let affinityRequestId = 0

async function loadAffinity() {
  const requestId = ++affinityRequestId

  fetching.value = true
  fetchFailed.value = false
  fetchError.value = null

  const rangeKey = JSON.stringify(props.range || defaultRange())
  if (rangeKey !== loadedRangeKey)
    data.value = null
  loadedRangeKey = rangeKey
  try {
    const range = props.range || defaultRange()
    const params = { ...buildDateParams(range), limit: 10 }

    const res = await getDashboard('/analytics/products/affinity', {
      params,
    })

    const raw = res.data?.data ?? res.data
    if (requestId !== affinityRequestId)
      return
    data.value = mapAffinity(raw)
  }
  catch (error) {
    if (requestId !== affinityRequestId)
      return

    // Preserve a distinct error state instead of reporting zero pairings.
    if (!data.value)
      data.value = { products: [], pairs: [], totalOrders: 0 }
    fetchFailed.value = true
    fetchError.value = error
  }
  finally {
    if (requestId === affinityRequestId)
      fetching.value = false
  }
}

onMounted(loadAffinity)
onBeforeUnmount(() => { affinityRequestId++ })
watch(
  () => props.range,
  () => { loadAffinity() },
  { deep: true },
)

/* ---------- View state ---------- */
type ViewKey = 'chord' | 'matrix' | 'pairs'
const view = ref<ViewKey>('pairs')
const allPairs = ref(false)
const allProducts = ref(false)
const hover = ref<number | null>(null)
const focus = ref<number | null>(null) // pinned product idx
const pair = ref<{ a: number; b: number } | null>(null)

const VIEWS: { key: ViewKey; icon: string; label: string }[] = [
  { key: 'chord', icon: 'share', label: 'Chord' },
  { key: 'matrix', icon: 'grid', label: 'Matrix' },
  { key: 'pairs', icon: 'list', label: 'Ranked' },
]

function setHover(i: number | null) { hover.value = i }
function setView(k: ViewKey) { view.value = k }

function samePair(p: { a: number; b: number } | null, a: number, b: number): boolean {
  return !!p && ((p.a === a && p.b === b) || (p.a === b && p.b === a))
}

function pickProduct(i: number) {
  // 1. Already on a pair → tapping any product resets to single-focus on it.
  if (pair.value) {
    pair.value = null
    focus.value = i
    return
  }

  // 2. Already focused on a DIFFERENT product → upgrade to pair-mode (focus + i).
  if (focus.value != null && focus.value !== i) {
    const a = Math.min(focus.value, i)
    const b = Math.max(focus.value, i)

    focus.value = null
    pair.value = { a, b }
    return
  }

  // 3. Toggle single-focus (tap same product again to clear).
  focus.value = focus.value === i ? null : i
}
function pickPair(pr: { a: number; b: number }) {
  focus.value = null
  pair.value = samePair(pair.value, pr.a, pr.b) ? null : { a: Math.min(pr.a, pr.b), b: Math.max(pr.a, pr.b) }
}
function reset() {
  focus.value = null
  pair.value = null
  hover.value = null
}

/* ---------- Header insight + stats ---------- */
const stats = computed(() => {
  const D = data.value
  if (!D)
    return { totalPairs: 0, totalTogether: 0, top: null as AffPair | null }
  const totalPairs = D.pairs.length
  const totalTogether = D.pairs.reduce((a, p) => a + p.count, 0)
  const top = [...D.pairs].sort((a, b) => b.count - a.count)[0] || null
  return { totalPairs, totalTogether, top }
})

const headerInsight = computed(() => {
  const D = data.value
  if (!D || !D.products.length)
    return t('Product pairings')
  if (pair.value)
    return t('Pair detail')
  if (focus.value != null)
    return D.products[focus.value].name
  if (stats.value.top)
    return `${D.products[stats.value.top.a].name} + ${D.products[stats.value.top.b].name}`
  return t('Product pairings')
})

const isEmpty = computed(() => {
  const D = data.value
  return !D || D.products.length === 0 || D.pairs.length === 0
})

/* ---------- Chord layout ---------- */
const CHORD_SIZE = 380
const CHORD_R = CHORD_SIZE / 2 - 54
const CHORD_RING = 13
const CHORD_CX = CHORD_SIZE / 2
const CHORD_CY = CHORD_SIZE / 2

function polar(centerX: number, centerY: number, r: number, ang: number): [number, number] {
  return [centerX + r * Math.cos(ang), centerY + r * Math.sin(ang)]
}

interface ChordArc {
  i: number
  start: number
  end: number
  mid: number
  weight: number
}
interface ChordLayout {
  arcs: ChordArc[]
  sub: Array<Record<number, [number, number]>>
  weight: number[]
}

const chordLayout = computed<ChordLayout>(() => {
  const D = data.value
  if (!D)
    return { arcs: [], sub: [], weight: [] }
  const N = D.products.length
  if (!N)
    return { arcs: [], sub: [], weight: [] }
  const m: number[][] = D.products.map(() => D.products.map(() => 0))

  D.pairs.forEach(p => {
    m[p.a][p.b] = p.count
    m[p.b][p.a] = p.count
  })

  const weight = m.map(row => row.reduce((a, b) => a + b, 0))
  const W = weight.reduce((a, b) => a + b, 0) || 1
  const gap = 0.035
  const avail = Math.PI * 2 - gap * N
  const scale = avail / W
  const arcs: ChordArc[] = []
  let cur = -Math.PI / 2
  const sub: Array<Record<number, [number, number]>> = D.products.map(() => ({}))
  for (let i = 0; i < N; i++) {
    const a0 = cur
    const span = weight[i] * scale
    let ptr = a0
    for (let j = 0; j < N; j++) {
      if (m[i][j] > 0) {
        const s = m[i][j] * scale

        sub[i][j] = [ptr, ptr + s]
        ptr += s
      }
    }
    arcs.push({ i, start: a0, end: a0 + span, mid: a0 + span / 2, weight: weight[i] })
    cur = a0 + span + gap
  }
  return { arcs, sub, weight }
})

function annular(a0: number, a1: number, rIn: number, rOut: number): string {
  const o0 = polar(CHORD_CX, CHORD_CY, rOut, a0)
  const o1 = polar(CHORD_CX, CHORD_CY, rOut, a1)
  const i1 = polar(CHORD_CX, CHORD_CY, rIn, a1)
  const i0 = polar(CHORD_CX, CHORD_CY, rIn, a0)
  const large = (a1 - a0) > Math.PI ? 1 : 0
  return `M${o0[0]} ${o0[1]} A${rOut} ${rOut} 0 ${large} 1 ${o1[0]} ${o1[1]} L${i1[0]} ${i1[1]} A${rIn} ${rIn} 0 ${large} 0 ${i0[0]} ${i0[1]} Z`
}

function ribbonPath(sa: [number, number], sb: [number, number]): string {
  const a0 = polar(CHORD_CX, CHORD_CY, CHORD_R, sa[0])
  const a1 = polar(CHORD_CX, CHORD_CY, CHORD_R, sa[1])
  const b0 = polar(CHORD_CX, CHORD_CY, CHORD_R, sb[0])
  const b1 = polar(CHORD_CX, CHORD_CY, CHORD_R, sb[1])
  const la = (sa[1] - sa[0]) > Math.PI ? 1 : 0
  const lb = (sb[1] - sb[0]) > Math.PI ? 1 : 0
  return `M${a0[0]} ${a0[1]} A${CHORD_R} ${CHORD_R} 0 ${la} 1 ${a1[0]} ${a1[1]} Q${CHORD_CX} ${CHORD_CY} ${b0[0]} ${b0[1]} A${CHORD_R} ${CHORD_R} 0 ${lb} 1 ${b1[0]} ${b1[1]} Q${CHORD_CX} ${CHORD_CY} ${a0[0]} ${a0[1]} Z`
}

const activeIdx = computed<number | null>(() => {
  return hover.value != null ? hover.value : (focus.value != null ? focus.value : null)
})

interface RibbonRender {
  k: number
  p: AffPair
  d: string
  fill: string
  opacity: number
  title: string
}

function ribbonOpacity(isSel: boolean, connected: boolean, ai: number | null) {
  let op: number
  if (pair.value)
    op = isSel ? 0.8 : 0.05
  else if (ai != null)
    op = connected ? 0.62 : 0.06
  else op = 0.4
  return op
}

const chordRibbons = computed<RibbonRender[]>(() => {
  const D = data.value
  if (!D)
    return []
  const layout = chordLayout.value
  const ai = activeIdx.value
  return D.pairs.map((p, k) => {
    const sa = layout.sub[p.a]?.[p.b]
    const sb = layout.sub[p.b]?.[p.a]
    if (!sa || !sb)
      return null
    const isSel = samePair(pair.value, p.a, p.b)
    const connected = ai != null && (p.a === ai || p.b === ai)
    const op = ribbonOpacity(isSel, connected, ai)
    return {
      k,
      p,
      d: ribbonPath(sa, sb),
      fill: isSel ? 'var(--primary)' : 'var(--chord-ribbon)',
      opacity: op,
      title: `${D.products[p.a].name} + ${D.products[p.b].name} — ${p.count} ${t('orders')}`,
    } as RibbonRender
  }).filter(Boolean) as RibbonRender[]
})

interface ArcRender {
  arc: ChordArc
  product: AffProduct
  dim: boolean
  isFocus: boolean
  arcPath: string
  labelX: number
  labelY: number
}

function arcDimmed(index: number, ai: number | null, D: AffData) {
  let dim = false
  if (pair.value)
    dim = index !== pair.value.a && index !== pair.value.b
  else if (ai != null)
    dim = index !== ai && !D.pairs.some(pr => samePair(pr, index, ai))
  return dim
}

const chordArcs = computed<ArcRender[]>(() => {
  const D = data.value
  if (!D)
    return []
  const layout = chordLayout.value
  const ai = activeIdx.value
  return layout.arcs.map(arc => {
    const p = D.products[arc.i]
    const dim = arcDimmed(arc.i, ai, D)
    const lp = polar(CHORD_CX, CHORD_CY, CHORD_R + CHORD_RING + 12, arc.mid)
    const isFocus = focus.value === arc.i || (pair.value != null && (pair.value.a === arc.i || pair.value.b === arc.i))
    return {
      arc,
      product: p,
      dim,
      isFocus,
      arcPath: annular(arc.start, arc.end, CHORD_R, CHORD_R + CHORD_RING + (isFocus ? 3 : 0)),
      labelX: lp[0],
      labelY: lp[1],
    } as ArcRender
  })
})

/* ---------- Matrix ---------- */
const MATRIX_CELL = 30
const MATRIX_LABEL_W = 116
const MATRIX_LABEL_H = 92

const matrixGrid = computed(() => {
  const D = data.value
  if (!D)
    return { N: 0, mat: [] as number[][], max: 1, w: 0, h: 0 }
  const N = D.products.length
  const mat: number[][] = D.products.map(() => D.products.map(() => 0))

  D.pairs.forEach(p => {
    mat[p.a][p.b] = p.count
    mat[p.b][p.a] = p.count
  })

  const max = Math.max(1, ...D.pairs.map(p => p.count))
  return {
    N,
    mat,
    max,
    w: MATRIX_LABEL_W + N * MATRIX_CELL + 8,
    h: MATRIX_LABEL_H + N * MATRIX_CELL + 8,
  }
})

function truncName(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}

/* ---------- Ranked pairs ---------- */
const rankedPairs = computed<AffPair[]>(() => {
  const D = data.value
  if (!D)
    return []
  return [...D.pairs].sort((a, b) => b.count - a.count)
})

const visiblePairs = computed(() => allPairs.value ? rankedPairs.value : rankedPairs.value.slice(0, 5))
const rankedMax = computed(() => rankedPairs.value[0]?.count || 1)

/* ---------- Drill-down: product panel ---------- */
interface PartnerRow { other: number; count: number }
interface ProductDrill {
  product: AffProduct
  partners: PartnerRow[]
  combined: number
  distinct: number
  attach: number
  maxc: number
}

const productDrill = computed<ProductDrill | null>(() => {
  const D = data.value
  if (!D || focus.value == null)
    return null
  const i = focus.value
  const p = D.products[i]
  if (!p)
    return null

  const partners: PartnerRow[] = D.pairs
    .filter(pr => pr.a === i || pr.b === i)
    .map(pr => ({ other: pr.a === i ? pr.b : pr.a, count: pr.count }))
    .sort((x, y) => y.count - x.count)

  const combined = partners.reduce((a, pp) => a + pp.count, 0)
  return {
    product: p,
    partners,
    combined,
    distinct: partners.length,
    attach: p.orders ? combined / p.orders : 0,
    maxc: partners[0]?.count || 1,
  }
})

/* ---------- Drill-down: pair panel ---------- */
interface PairDrill {
  A: AffProduct
  B: AffProduct
  count: number
  confAB: number
  confBA: number
  lift: number
  revenue: number
  liftStrong: boolean
}

const pairDrill = computed<PairDrill | null>(() => {
  const D = data.value
  const pr = pair.value
  if (!D || !pr)
    return null
  const A = D.products[pr.a]
  const B = D.products[pr.b]
  if (!A || !B)
    return null
  const found = D.pairs.find(x => samePair(x, pr.a, pr.b))
  const count = found ? found.count : 0
  const confAB = A.orders ? count / A.orders : 0
  const confBA = B.orders ? count / B.orders : 0
  const N = D.totalOrders || 1
  const lift = (A.orders && B.orders) ? (count * N) / (A.orders * B.orders) : 0
  const revenue = count * ((A.price || 0) + (B.price || 0))
  return { A, B, count, confAB, confBA, lift, revenue, liftStrong: lift >= 1.15 }
})

/* ---------- Idle list (all products + partner totals) ---------- */
interface IdleRow { idx: number; product: AffProduct; partners: number }

const idleProductRows = computed<IdleRow[]>(() => {
  const D = data.value
  if (!D)
    return []
  return D.products.map((p, i) => {
    const partners = D.pairs
      .filter(pr => pr.a === i || pr.b === i)
      .reduce((a, pr) => a + pr.count, 0)

    return { idx: i, product: p, partners }
  })
})

function firstWord(s: string): string {
  return s.split(' ')[0]
}
</script>

<template>
  <Card class="affinity-report">
    <DashboardNotice
      v-if="fetchError"
      :error="fetchError"
      :loading="fetching"
      :stale="!!data?.pairs.length"
      @retry="loadAffinity"
    />
    <!-- Loading: full-card skeleton inside the card chrome -->
    <template v-if="(props.loading || fetching) && !data">
      <div class="card__head">
        <div class="card__head-text">
          <Skeleton
            :h="12"
            w="180px"
          />
          <Skeleton
            :h="22"
            w="260px"
            style="margin-top: 8px;"
          />
          <Skeleton
            :h="12"
            w="220px"
            style="margin-top: 8px;"
          />
        </div>
        <div class="card__actions">
          <Skeleton
            :h="32"
            w="110px"
          />
        </div>
      </div>
      <div class="card__divider" />
      <div
        class="card__body"
        style="padding-top: var(--sp-5);"
      >
        <div class="affinity-body">
          <div class="affinity-viz">
            <Skeleton
              :h="340"
              w="100%"
            />
          </div>
          <div class="affinity-list">
            <Skeleton
              :h="16"
              w="60%"
            />
            <Skeleton
              v-for="i in 8"
              :key="`sk-list-${i}`"
              :h="32"
              w="100%"
              style="margin-top: 8px;"
            />
          </div>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="card__head">
        <div class="card__head-text">
          <div class="kpi__label">
            {{ windowLabel
              ? t('Frequently bought together · {window}', { window: windowLabel })
              : t('Frequently bought together · 30 days') }}
          </div>
          <h3 class="card__insight">
            {{ headerInsight }}
          </h3>
          <div class="card__sub">
            <button
              v-if="!isEmpty && (focus != null || pair)"
              class="affcrumb"
              type="button"
              @click="reset"
            >
              <DesignIcon
                name="arrowleft"
                :size="13"
              />
              {{ t('All products') }}
            </button>
            <template v-else-if="!isEmpty">
              {{ t('{n} product pairs · {m} combined orders', { n: stats.totalPairs, m: fmtNum(stats.totalTogether) }) }}
            </template>
            <template v-else>
              {{ fetchFailed ? t('Affinity data not available yet') : t('No pairings in this window') }}
            </template>
          </div>
        </div>
        <div class="card__actions">
          <div
            class="viewtoggle"
            role="group"
            :aria-label="t('Change visualization')"
          >
            <button
              v-for="v in VIEWS"
              :key="v.key"
              type="button"
              :class="cx('viewtoggle__btn', view === v.key && 'is-active')"
              :title="t(v.label)"
              :aria-label="t(v.label)"
              :aria-pressed="view === v.key"
              @click="setView(v.key)"
            >
              <DesignIcon
                :name="v.icon"
                :size="16"
              />
            </button>
          </div>
        </div>
      </div>
      <div class="card__divider" />

      <div
        class="card__body"
        style="padding-top: var(--sp-5);"
      >
        <!-- Empty state when BE has no data (or endpoint not shipped) -->
        <ReportState
          v-if="isEmpty"
          icon="share"
          :title="fetchFailed ? t('Affinity data not available yet') : t('No pairings in this window')"
          :description="fetchFailed
            ? t('Could not load affinity data. Check your connection and try again.')
            : t('Once orders contain multiple products, pairings will appear here')"
        />

        <div
          v-else
          class="affinity-body"
        >
          <!-- ============== Visualization column ============== -->
          <div class="affinity-viz">
            <!-- Chord -->
            <svg
              v-if="view === 'chord'"
              width="100%"
              :viewBox="`0 0 ${CHORD_SIZE} ${CHORD_SIZE}`"
              overflow="visible"
              :style="{ display: 'block', maxWidth: `${CHORD_SIZE}px`, margin: '0 auto', overflow: 'visible' }"
            >
              <path
                v-for="r in chordRibbons"
                :key="`rib-${r.k}`"
                :d="r.d"
                :fill="r.fill"
                :opacity="r.opacity"
                style="transition: opacity .18s, fill .18s; cursor: pointer;"
                @mouseenter="!pair && setHover(r.p.a)"
                @mouseleave="setHover(null)"
                @click.stop="pickPair({ a: r.p.a, b: r.p.b })"
              >
                <title>{{ r.title }}</title>
              </path>

              <g
                v-for="a in chordArcs"
                :key="`arc-${a.arc.i}`"
                :style="{ cursor: 'pointer', transition: 'opacity .18s', opacity: a.dim ? 0.28 : 1 }"
                @mouseenter="setHover(a.arc.i)"
                @mouseleave="setHover(null)"
                @click.stop="pickProduct(a.arc.i)"
              >
                <title>{{ a.product.name }}</title>
                <path
                  :d="a.arcPath"
                  :fill="a.product.color || ''"
                />
                <text
                  :x="a.labelX"
                  :y="a.labelY"
                  font-size="13"
                  :font-weight="a.isFocus ? 700 : 500"
                  text-anchor="middle"
                  dominant-baseline="middle"
                  :fill="a.isFocus ? 'var(--text)' : 'var(--text-secondary)'"
                >{{ a.arc.i + 1 }}</text>
              </g>
            </svg>

            <!-- Matrix -->
            <div
              v-else-if="view === 'matrix'"
              style="overflow-x: auto;"
            >
              <svg
                :width="matrixGrid.w"
                :height="matrixGrid.h"
                style="display: block; margin: 0 auto;"
              >
                <!-- column labels (rotated -45) -->
                <text
                  v-for="(p, j) in data?.products || []"
                  :key="`mc-${j}`"
                  :x="MATRIX_LABEL_W + j * MATRIX_CELL + MATRIX_CELL / 2"
                  :y="MATRIX_LABEL_H - 6"
                  font-size="10"
                  :fill="(activeIdx === j || (pair && (pair.a === j || pair.b === j))) ? 'var(--text)' : 'var(--text-tertiary)'"
                  :font-weight="(activeIdx === j || (pair && (pair.a === j || pair.b === j))) ? 600 : 400"
                  text-anchor="start"
                  :transform="`rotate(-45 ${MATRIX_LABEL_W + j * MATRIX_CELL + MATRIX_CELL / 2} ${MATRIX_LABEL_H - 6})`"
                  style="cursor: pointer;"
                  @click="pickProduct(j)"
                >{{ truncName(p.name, 13) }}</text>

                <!-- rows -->
                <g
                  v-for="(p, i) in data?.products || []"
                  :key="`mr-${i}`"
                >
                  <text
                    :x="MATRIX_LABEL_W - 8"
                    :y="MATRIX_LABEL_H + i * MATRIX_CELL + MATRIX_CELL / 2"
                    font-size="10.5"
                    text-anchor="end"
                    dominant-baseline="middle"
                    :fill="(activeIdx === i || (pair && (pair.a === i || pair.b === i))) ? 'var(--text)' : 'var(--text-secondary)'"
                    :font-weight="(activeIdx === i || (pair && (pair.a === i || pair.b === i))) ? 600 : 400"
                    style="cursor: pointer;"
                    @click="pickProduct(i)"
                    @mouseenter="setHover(i)"
                    @mouseleave="setHover(null)"
                  >{{ truncName(p.name, 15) }}</text>

                  <g
                    v-for="(_q, j) in data?.products || []"
                    :key="`mcell-${i}-${j}`"
                  >
                    <rect
                      v-if="i === j"
                      :x="MATRIX_LABEL_W + j * MATRIX_CELL + 1"
                      :y="MATRIX_LABEL_H + i * MATRIX_CELL + 1"
                      :width="MATRIX_CELL - 2"
                      :height="MATRIX_CELL - 2"
                      rx="4"
                      fill="var(--surface-inset)"
                    />
                    <template v-else>
                      <rect
                        :x="MATRIX_LABEL_W + j * MATRIX_CELL + 1"
                        :y="MATRIX_LABEL_H + i * MATRIX_CELL + 1"
                        :width="MATRIX_CELL - 2"
                        :height="MATRIX_CELL - 2"
                        rx="4"
                        :fill="matrixGrid.mat[i][j] ? 'var(--primary)' : 'var(--surface-2)'"
                        :opacity="matrixGrid.mat[i][j] ? (samePair(pair, i, j) ? 1 : 0.14 + (matrixGrid.mat[i][j] / matrixGrid.max) * 0.86) : 1"
                        :stroke="samePair(pair, i, j) ? 'var(--text)' : 'none'"
                        :stroke-width="samePair(pair, i, j) ? 1.5 : 0"
                        :style="{ transition: 'opacity .15s', cursor: matrixGrid.mat[i][j] ? 'pointer' : 'default' }"
                        @mouseenter="matrixGrid.mat[i][j] && setHover(i)"
                        @mouseleave="setHover(null)"
                        @click="matrixGrid.mat[i][j] && pickPair({ a: i, b: j })"
                      >
                        <title v-if="matrixGrid.mat[i][j]">{{ data?.products[i].name }} + {{ data?.products[j].name }} — {{ matrixGrid.mat[i][j] }} {{ t('orders') }}</title>
                      </rect>
                      <text
                        v-if="matrixGrid.mat[i][j]"
                        :x="MATRIX_LABEL_W + j * MATRIX_CELL + MATRIX_CELL / 2"
                        :y="MATRIX_LABEL_H + i * MATRIX_CELL + MATRIX_CELL / 2"
                        font-size="9.5"
                        text-anchor="middle"
                        dominant-baseline="middle"
                        :fill="chartTextColor(chartColors.primary, chartColors.surface, samePair(pair, i, j) ? 1 : 0.14 + matrixGrid.mat[i][j] / matrixGrid.max * 0.86)"
                        font-family="var(--font-mono)"
                        style="pointer-events: none;"
                      >{{ matrixGrid.mat[i][j] }}</text>
                    </template>
                  </g>
                </g>
              </svg>
            </div>

            <!-- Ranked pairs list -->
            <div
              v-else
              class="affinity-pairs"
            >
              <button
                v-for="(p, k) in visiblePairs"
                :key="`rp-${k}`"
                type="button"
                :class="cx('pairrow', samePair(pair, p.a, p.b) && 'is-active')"
                :aria-pressed="samePair(pair, p.a, p.b)"
                :style="{ opacity: (!pair || samePair(pair, p.a, p.b)) ? 1 : 0.4 }"
                @click="pickPair({ a: p.a, b: p.b })"
                @mouseenter="setHover(p.a)"
                @mouseleave="setHover(null)"
              >
                <div
                  class="row between"
                  style="margin-bottom: 5px;"
                >
                  <span
                    class="row"
                    style="gap: 7px; font-size: 13px; font-weight: 500; min-width: 0;"
                  >
                    <span style="display: inline-flex; align-items: center; gap: 5px;">
                      <span
                        class="legend-swatch"
                        :style="{ background: data?.products[p.a].color || '' }"
                      />
                      {{ data?.products[p.a].name }}
                    </span>
                    <span
                      class="tertiary"
                      style="font-weight: 400;"
                    >+</span>
                    <span style="display: inline-flex; align-items: center; gap: 5px;">
                      <span
                        class="legend-swatch"
                        :style="{ background: data?.products[p.b].color || '' }"
                      />
                      {{ data?.products[p.b].name }}
                    </span>
                  </span>
                  <span
                    class="mono"
                    style="font-weight: 700; font-size: 13px; flex: 0 0 auto; margin-left: 8px;"
                  >
                    {{ p.count }}<span
                      class="tertiary"
                      style="font-weight: 400; font-size: 11px;"
                    >×</span>
                  </span>
                </div>
                <div style="height: 7px; border-radius: 99px; background: var(--chart-track); overflow: hidden;">
                  <div
                    :style="{
                      width: `${(p.count / rankedMax) * 100}%`,
                      height: '100%',
                      borderRadius: '99px',
                      background: k === 0 ? 'var(--chart-revenue)' : 'var(--c4)',
                    }"
                  />
                </div>
              </button>
              <button
                v-if="rankedPairs.length > 5"
                type="button"
                class="report-more"
                :aria-expanded="allPairs"
                @click="allPairs = !allPairs"
              >
                {{ allPairs ? t('Show less') : t('dash_all_pairs', { n: rankedPairs.length }) }}
              </button>
            </div>
          </div>

          <!-- ============== Side panel ============== -->
          <div class="affinity-list">
            <!-- Pair detail -->
            <div v-if="pairDrill">
              <div class="affpairhead">
                <button
                  class="affchip"
                  type="button"
                  @click="pickProduct(pair!.a)"
                >
                  <span
                    class="legend-swatch"
                    :style="{ background: pairDrill.A.color || '' }"
                  />
                  {{ pairDrill.A.name }}
                </button>
                <DesignIcon
                  name="plus"
                  :size="14"
                  class="tertiary"
                />
                <button
                  class="affchip"
                  type="button"
                  @click="pickProduct(pair!.b)"
                >
                  <span
                    class="legend-swatch"
                    :style="{ background: pairDrill.B.color || '' }"
                  />
                  {{ pairDrill.B.name }}
                </button>
              </div>
              <div
                class="affstats"
                style="margin-top: 14px;"
              >
                <div class="affstat">
                  <div
                    class="affstat__v mono"
                    style="color: var(--primary);"
                  >
                    {{ fmtNum(pairDrill.count) }}
                  </div>
                  <div class="affstat__l">
                    {{ t('Bought together') }}
                  </div>
                </div>
                <div class="affstat">
                  <div
                    class="affstat__v mono"
                    :style="{ color: pairDrill.liftStrong ? 'var(--success)' : 'var(--text)' }"
                  >
                    {{ pairDrill.lift.toFixed(2) }}×
                  </div>
                  <div class="affstat__l">
                    {{ t('Lift vs chance') }}
                  </div>
                </div>
                <div class="affstat">
                  <div class="affstat__v mono">
                    {{ fmtAbbr(pairDrill.revenue) }}
                  </div>
                  <div class="affstat__l">
                    {{ t('Est. revenue') }}
                  </div>
                </div>
              </div>

              <div
                class="kpi__label"
                style="margin: 16px 0 8px;"
              >
                {{ t('Directional confidence') }}
              </div>
              <div class="affconf">
                <div
                  class="row between"
                  style="margin-bottom: 4px;"
                >
                  <span style="font-size: 12.5px;">
                    {{ t('Buyers of {a} also add {b}', { a: firstWord(pairDrill.A.name), b: firstWord(pairDrill.B.name) }) }}
                  </span>
                  <span
                    class="mono"
                    style="font-weight: 700; font-size: 13px;"
                  >
                    {{ fmtPct(pairDrill.confAB * 100, 0) }}
                  </span>
                </div>
                <div class="affbar affbar--lg">
                  <span
                    class="affbar__fill"
                    :style="{
                      width: `${Math.min(100, pairDrill.confAB * 100)}%`,
                      background: pairDrill.A.color || '',
                    }"
                  />
                </div>
                <div
                  class="row between"
                  style="margin: 10px 0 4px;"
                >
                  <span style="font-size: 12.5px;">
                    {{ t('Buyers of {a} also add {b}', { a: firstWord(pairDrill.B.name), b: firstWord(pairDrill.A.name) }) }}
                  </span>
                  <span
                    class="mono"
                    style="font-weight: 700; font-size: 13px;"
                  >
                    {{ fmtPct(pairDrill.confBA * 100, 0) }}
                  </span>
                </div>
                <div class="affbar affbar--lg">
                  <span
                    class="affbar__fill"
                    :style="{
                      width: `${Math.min(100, pairDrill.confBA * 100)}%`,
                      background: pairDrill.B.color || '',
                    }"
                  />
                </div>
              </div>

              <div :class="cx('affsuggest', pairDrill.liftStrong ? 'is-good' : 'is-soft')">
                <DesignIcon
                  :name="pairDrill.liftStrong ? 'sparkle' : 'info'"
                  :size="16"
                />
                <span>
                  {{ pairDrill.liftStrong
                    ? t('Strong pairing — bundle as a combo or upsell {b} at checkout.', { b: firstWord(pairDrill.B.name) })
                    : t('Mild pairing — worth a test promo, but not a natural combo yet.') }}
                </span>
              </div>
            </div>

            <!-- Product focused -->
            <div v-else-if="productDrill">
              <div
                class="row"
                style="gap: 10px; margin-bottom: 14px;"
              >
                <span
                  class="affdot"
                  :style="{ background: productDrill.product.color || '' }"
                />
                <div style="min-width: 0;">
                  <div style="font-weight: 700; font-size: 15px; letter-spacing: -0.01em;">
                    {{ productDrill.product.name }}
                  </div>
                  <div
                    class="tertiary"
                    style="font-size: 12px;"
                  >
                    {{ t('{n} orders · {p} UZS', { n: fmtNum(productDrill.product.orders), p: fmtMoney(productDrill.product.price) }) }}
                  </div>
                </div>
              </div>
              <div class="affstats">
                <div class="affstat">
                  <div
                    class="affstat__v mono"
                    style="color: var(--primary);"
                  >
                    {{ fmtNum(productDrill.combined) }}
                  </div>
                  <div class="affstat__l">
                    {{ t('Bought with others') }}
                  </div>
                </div>
                <div class="affstat">
                  <div class="affstat__v mono">
                    {{ productDrill.distinct }}
                  </div>
                  <div class="affstat__l">
                    {{ t('Partner items') }}
                  </div>
                </div>
                <div class="affstat">
                  <div
                    class="affstat__v mono"
                    style="color: var(--success);"
                  >
                    {{ fmtNum(productDrill.attach * 100) }}
                  </div>
                  <div class="affstat__l">
                    {{ t('dash_pairs_per_100') }}
                  </div>
                </div>
              </div>
              <div
                class="kpi__label"
                style="margin: 16px 0 8px;"
              >
                {{ t('Pairs with {n} · click to drill in', { n: firstWord(productDrill.product.name) }) }}
              </div>
              <div class="affinity-partners">
                <button
                  v-for="pt in productDrill.partners"
                  :key="`pt-${pt.other}`"
                  type="button"
                  class="afflist__row"
                  @click="pickPair({ a: focus!, b: pt.other })"
                  @mouseenter="setHover(pt.other)"
                  @mouseleave="setHover(null)"
                >
                  <span
                    class="legend-swatch"
                    :style="{ background: data?.products[pt.other].color || '' }"
                  />
                  <span class="afflist__name">{{ data?.products[pt.other].name }}</span>
                  <span class="affbar">
                    <span
                      class="affbar__fill"
                      :style="{ width: `${(pt.count / productDrill.maxc) * 100}%` }"
                    />
                  </span>
                  <span class="mono afflist__count">{{ pt.count }}</span>
                </button>
              </div>
            </div>

            <!-- Idle: product directory -->
            <div v-else>
              <div
                class="row between"
                style="margin-bottom: 10px;"
              >
                <span class="kpi__label">{{ t('Products · click to explore') }}</span>
                <span class="badge t-neutral">{{ data?.products.length }}</span>
              </div>
              <div class="affinity-directory">
                <button
                  v-for="row in allProducts ? idleProductRows : idleProductRows.slice(0, 6)"
                  :key="`idl-${row.idx}`"
                  type="button"
                  :class="cx('afflist__row', hover === row.idx && 'is-active')"
                  @mouseenter="setHover(row.idx)"
                  @mouseleave="setHover(null)"
                  @click="pickProduct(row.idx)"
                >
                  <span
                    class="legend-swatch"
                    :style="{ background: row.product.color || '' }"
                  />
                  <span class="afflist__index">{{ row.idx + 1 }}</span>
                  <span class="afflist__name">{{ row.product.name }}</span>
                  <span class="mono afflist__count">{{ row.partners }}</span>
                  <DesignIcon
                    name="arrowright"
                    :size="14"
                    class="afflist__go"
                  />
                </button>                <button
                  v-if="idleProductRows.length > 6"
                  type="button"
                  class="report-more"
                  :aria-expanded="allProducts"
                  @click="allProducts = !allProducts"
                >
                  {{ allProducts ? t('Show less') : t('dash_all_breakdown', { n: idleProductRows.length }) }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </Card>
</template>

<style scoped>
.affinity-pairs, .affinity-directory, .affinity-partners { display: grid; gap: 4px; }
.affinity-pairs .pairrow { padding: 12px; border-radius: 10px; min-height: 54px; }
.affinity-pairs .pairrow > .row { gap: 8px; }
.affinity-pairs .pairrow > .row > .row { flex-wrap: wrap; }
.affinity-pairs .pairrow > .row > .row > span { overflow-wrap: anywhere; }
.affinity-report .affinity-body { grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); gap: 20px; }
.affinity-report .afflist__row { min-height: 44px; }
.affinity-report .afflist__name { overflow: visible; white-space: normal; overflow-wrap: anywhere; }
.affinity-report .viewtoggle__btn { width: 40px; height: 40px; }
.affinity-report .viewtoggle__btn:focus-visible, .affinity-report .pairrow:focus-visible, .affinity-report .afflist__row:focus-visible, .report-more:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
@media (max-width: 850px) { .affinity-report .affinity-body { grid-template-columns: minmax(0, 1fr); } .affinity-report .affinity-list { border-left: 0; border-top: 1px solid var(--border); padding-left: 0; padding-top: 16px; } }
@media (max-width: 600px) { .affinity-report .viewtoggle__btn { width: 44px; height: 44px; } }
</style>
