<script setup lang="ts">
import DeltaBadge from './DeltaBadge.vue'
import Input from '@/components/design/Input.vue'

/* Detailed per-product table: Qty A/B, Revenue A/B, Δ, Δ%, share of A.
   Sortable, searchable, CSV export. */
import ChartCard from '@/components/design/ChartCard.vue'
import { fmtInt, fmtUZS } from '@/composables/useCurrency'
import type { ProductRow } from '@/types/comparison'
import { buildCsv } from '@/utils/csv'

const props = defineProps<Props>()

const { t } = useI18n({ useScope: 'global' })

interface Props { products: ProductRow[]; totalA: number }
type SortKey = 'name' | 'category' | 'a_qty' | 'b_qty' | 'a_revenue' | 'b_revenue' | 'delta' | 'delta_pct' | 'share'
const search = ref('')
const sortKey = ref<SortKey>('a_revenue')
const sortDir = ref<'asc' | 'desc'>('desc')

interface Row extends ProductRow { delta: number; share: number }

const enriched = computed<Row[]>(() =>
  props.products.map(p => ({
    ...p,
    delta: p.a_revenue - p.b_revenue,
    share: props.totalA > 0 ? Math.round((p.a_revenue / props.totalA) * 1000) / 10 : 0,
  })),
)

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()

  const list = q
    ? enriched.value.filter(r => r.name.toLowerCase().includes(q) || r.category.toLowerCase().includes(q))
    : enriched.value

  const dir = sortDir.value === 'asc' ? 1 : -1
  const k = sortKey.value
  return [...list].sort((a, b) => {
    const va = a[k]
    const vb = b[k]
    if (typeof va === 'string' && typeof vb === 'string')
      return va.localeCompare(vb) * dir
    return ((va as number) - (vb as number)) * dir
  })
})

function toggleSort(k: SortKey) {
  if (sortKey.value === k) { sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc' }
  else { sortKey.value = k; sortDir.value = 'desc' }
}
function sortIcon(k: SortKey) { return sortKey.value !== k ? '' : (sortDir.value === 'asc' ? '▲' : '▼') }

function exportCsv() {
  const head = ['Product', 'Category', 'Qty A', 'Qty B', 'Revenue A', 'Revenue B', 'Delta', 'Delta %', 'Share A %']

  const lines = filtered.value.map(r => [
    r.name,
    r.category,
    r.a_qty,
    r.b_qty,
    r.a_revenue,
    r.b_revenue,
    r.delta,
    r.delta_pct === null ? 'New' : r.delta_pct,
    r.share,
  ])

  const csv = buildCsv([head, ...lines], { alwaysQuote: true })
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')

  a.href = url
  a.download = `compare-products-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

const cols: { key: SortKey; label: string; num?: boolean }[] = [
  { key: 'name', label: 'Product' },
  { key: 'category', label: 'Category' },
  { key: 'a_qty', label: 'Qty A', num: true },
  { key: 'b_qty', label: 'Qty B', num: true },
  { key: 'a_revenue', label: 'Revenue A', num: true },
  { key: 'b_revenue', label: 'Revenue B', num: true },
  { key: 'delta', label: 'Δ', num: true },
  { key: 'delta_pct', label: 'Δ%', num: true },
  { key: 'share', label: 'Share of A', num: true },
]
</script>

<template>
  <ChartCard
    :eyebrow="t('Detail')"
    :title="t('Product-level comparison')"
  >
    <template #actions>
      <div class="ct__actions">
        <Input
          v-model="search"
          icon="search"
          :placeholder="t('Search products…')"
          :aria-label="t('Search products')"
        />
        <button
          type="button"
          class="ct__export"
          @click="exportCsv"
        >
          {{ t('Export CSV') }}
        </button>
      </div>
    </template>
    <div class="ct-mobile">
      <article
        v-for="r in filtered"
        :key="r.id"
        class="ct-mobile__card"
      >
        <div class="ct-mobile__head">
          <div>
            <strong>{{ r.name }}</strong>
            <span>{{ r.category }}</span>
          </div>
          <DeltaBadge
            :delta-pct="r.delta_pct"
            is-up-good
            size="sm"
          />
        </div>
        <dl class="ct-mobile__values">
          <div>
            <dt>A · {{ t('Current') }}</dt>
            <dd>{{ fmtUZS(r.a_revenue) }} <small>UZS</small></dd>
            <span>{{ fmtInt(r.a_qty) }} · {{ t('Items sold') }}</span>
          </div>
          <div>
            <dt>B · {{ t('Baseline') }}</dt>
            <dd>{{ fmtUZS(r.b_revenue) }} <small>UZS</small></dd>
            <span>{{ fmtInt(r.b_qty) }} · {{ t('Items sold') }}</span>
          </div>
        </dl>
        <div class="ct-mobile__foot">
          <span>{{ t('Difference') }}</span>
          <strong :class="r.delta > 0 ? 'up' : r.delta < 0 ? 'down' : ''">
            {{ r.delta > 0 ? '+' : r.delta < 0 ? '−' : '' }}{{ fmtUZS(Math.abs(r.delta)) }} UZS
          </strong>
          <small>{{ r.share }}% · {{ t('Share of A') }}</small>
        </div>
      </article>
      <div
        v-if="!filtered.length"
        class="ct__empty"
      >
        {{ t('No matching products') }}
      </div>
    </div>
    <div
      class="ct__wrap"
      tabindex="0"
      :aria-label="t('Product-level comparison')"
    >
      <table class="ct">
        <caption class="visually-hidden">
          {{ t('Product-level comparison') }}
        </caption>
        <thead>
          <tr>
            <th
              v-for="c in cols"
              :key="c.key"
              scope="col"
              :class="{ num: c.num, active: sortKey === c.key }"
              :aria-sort="sortKey === c.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'"
            >
              <button
                type="button"
                @click="toggleSort(c.key)"
              >
                {{ t(c.label) }} <span
                  class="ct__sort"
                  aria-hidden="true"
                >{{ sortIcon(c.key) }}</span>
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="r in filtered"
            :key="r.id"
          >
            <td class="ct__name">
              {{ r.name }}
            </td>
            <td class="ct__cat">
              {{ r.category }}
            </td>
            <td class="num mono">
              {{ fmtInt(r.a_qty) }}
            </td>
            <td class="num mono">
              {{ fmtInt(r.b_qty) }}
            </td>
            <td class="num mono">
              {{ fmtUZS(r.a_revenue) }}
            </td>
            <td class="num mono muted">
              {{ fmtUZS(r.b_revenue) }}
            </td>
            <td
              class="num mono"
              :class="r.delta > 0 ? 'up' : r.delta < 0 ? 'down' : ''"
            >
              {{ r.delta > 0 ? '+' : r.delta < 0 ? '−' : '' }}{{ fmtUZS(Math.abs(r.delta)) }}
            </td>
            <td class="num">
              <DeltaBadge
                :delta-pct="r.delta_pct"
                is-up-good
                size="sm"
              />
            </td>
            <td class="num mono muted">
              {{ r.share }}%
            </td>
          </tr>
          <tr v-if="!filtered.length">
            <td
              :colspan="cols.length"
              class="ct__empty"
            >
              {{ t('No matching products') }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </ChartCard>
</template>

<style scoped>
.ct__actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; min-width: 0; }
.ct-mobile { display: none; }
.ct__search { height: 32px; border: 1px solid var(--border-strong, var(--border)); border-radius: var(--r-sm); background: var(--surface); color: var(--text); padding: 0 10px; font: inherit; font-size: 13px; min-width: 180px; }
.ct__export { height: 32px; border: 1px solid var(--border-strong, var(--border)); border-radius: var(--r-sm); background: var(--surface); color: var(--text-secondary); font: inherit; font-size: 12px; font-weight: 500; padding: 0 12px; cursor: pointer; }
.ct__export:hover { background: var(--surface-2); color: var(--text); }
.ct__wrap { overflow-x: auto; max-width: 100%; max-height: 520px; overflow-y: auto; }
.ct { width: 100%; min-width: 920px; border-collapse: collapse; font-size: 13px; }
.ct thead th { position: sticky; top: 0; z-index: 1; background: var(--surface); text-align: left; font-size: var(--fs-label); text-transform: uppercase; letter-spacing: var(--tracking-label); color: var(--text-tertiary); font-weight: 600; padding: 9px 10px; border-bottom: 1px solid var(--border); white-space: nowrap; user-select: none; }
.ct thead button { display: inline-flex; align-items: center; justify-content: inherit; gap: 4px; inline-size: 100%; border: 0; color: inherit; background: transparent; font: inherit; letter-spacing: inherit; text-transform: inherit; cursor: pointer; }
.ct thead th.num button { justify-content: flex-end; }
.ct thead button:focus-visible { border-radius: 4px; outline: 2px solid var(--primary); outline-offset: 3px; }
.ct thead th.active { color: var(--text); }
.ct thead th.num, .ct td.num { text-align: right; }
.ct__sort { font-size: 9px; }
.ct td { padding: 8px 10px; border-bottom: 1px solid var(--border-soft, var(--border)); color: var(--text); }
.ct .mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
.ct .muted { color: var(--text-tertiary); }
.ct__name { font-weight: 500; }
.ct__cat { color: var(--text-secondary); }
.ct .up { color: var(--color-positive); }
.ct .down { color: var(--color-negative); }
.ct__empty { text-align: center; color: var(--text-tertiary); padding: 22px; }

@media (max-width: 650px) {
  .ct__actions { inline-size: 100%; }
  .ct__actions :deep(.control) { flex: 1 1 180px; min-inline-size: 0; }
  .ct__export { min-block-size: 42px; }
  .ct__wrap { display: none; }
  .ct-mobile { display: grid; gap: 10px; }
  .ct-mobile__card { overflow: hidden; border: 1px solid var(--border); border-radius: 15px; background: var(--surface-2); }
  .ct-mobile__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; padding: 13px; border-bottom: 1px solid var(--border); }
  .ct-mobile__head > div { display: grid; min-inline-size: 0; gap: 3px; }
  .ct-mobile__head strong { font-size: 13px; line-height: 1.35; overflow-wrap: anywhere; }
  .ct-mobile__head span { color: var(--text-secondary); font-size: 10px; }
  .ct-mobile__values { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 0; }
  .ct-mobile__values > div { display: grid; min-inline-size: 0; gap: 4px; padding: 13px; }
  .ct-mobile__values > div + div { border-inline-start: 1px solid var(--border); }
  .ct-mobile__values dt { color: var(--text-tertiary); font-size: 9px; font-weight: 750; letter-spacing: .08em; text-transform: uppercase; }
  .ct-mobile__values dd { margin: 0; font-family: var(--font-mono); font-size: 14px; font-variant-numeric: tabular-nums; font-weight: 650; overflow-wrap: anywhere; }
  .ct-mobile__values dd small { color: var(--text-tertiary); font: 500 9px var(--font-sans); }
  .ct-mobile__values span { color: var(--text-secondary); font-size: 10px; }
  .ct-mobile__foot { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: baseline; gap: 3px 10px; padding: 11px 13px; border-top: 1px solid var(--border); background: var(--surface); }
  .ct-mobile__foot > span { color: var(--text-tertiary); font-size: 10px; }
  .ct-mobile__foot strong { font-family: var(--font-mono); font-size: 12px; font-variant-numeric: tabular-nums; }
  .ct-mobile__foot small { grid-column: 1 / -1; color: var(--text-secondary); font-size: 9px; }
  .ct-mobile__foot .up { color: var(--color-positive); }
  .ct-mobile__foot .down { color: var(--color-negative); }
}
</style>
