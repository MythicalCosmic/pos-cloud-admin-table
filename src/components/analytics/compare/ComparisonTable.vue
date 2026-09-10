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
    <div class="ct__wrap">
      <table class="ct">
        <thead>
          <tr>
            <th
              v-for="c in cols"
              :key="c.key"
              class="sortable"
              :class="{ num: c.num, active: sortKey === c.key }"
              @click="toggleSort(c.key)"
            >
              {{ t(c.label) }} <span class="ct__sort">{{ sortIcon(c.key) }}</span>
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
.ct__search { height: 32px; border: 1px solid var(--border-strong, var(--border)); border-radius: var(--r-sm); background: var(--surface); color: var(--text); padding: 0 10px; font: inherit; font-size: 13px; min-width: 180px; }
.ct__export { height: 32px; border: 1px solid var(--border-strong, var(--border)); border-radius: var(--r-sm); background: var(--surface); color: var(--text-secondary); font: inherit; font-size: 12px; font-weight: 500; padding: 0 12px; cursor: pointer; }
.ct__export:hover { background: var(--surface-2); color: var(--text); }
.ct__wrap { overflow-x: auto; max-width: 100%; max-height: 520px; overflow-y: auto; }
.ct { width: 100%; border-collapse: collapse; font-size: 13px; }
.ct thead th { position: sticky; top: 0; z-index: 1; background: var(--surface); text-align: left; font-size: var(--fs-label); text-transform: uppercase; letter-spacing: var(--tracking-label); color: var(--text-tertiary); font-weight: 600; padding: 9px 10px; border-bottom: 1px solid var(--border); white-space: nowrap; user-select: none; }
.ct thead th.sortable { cursor: pointer; }
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
</style>
