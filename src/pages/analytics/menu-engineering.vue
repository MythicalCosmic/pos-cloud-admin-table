<script setup lang="ts">
import WorkspacePage from '@/components/design/workspace/WorkspacePage.vue'
import WorkspaceToolbar from '@/components/design/workspace/WorkspaceToolbar.vue'
import axios from '@/plugins/axios'
import Badge from '@/components/design/Badge.vue'
import Button from '@/components/design/Button.vue'
import DataTable, { type DataTableColumn } from '@/components/design/DataTable.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import Field from '@/components/design/Field.vue'
import Input from '@/components/design/Input.vue'
import PageHeader from '@/components/design/PageHeader.vue'
import { businessToday } from '@/composables/useBusinessDay'
import { buildCsv } from '@/utils/csv'

// ============================================================
// ALPHA POS — Menu Engineering (analytics)
// Refactor: design primitives only (no Vuetify).
// - Toolbar: flex-wrap, inputs collapse to 100% on mobile
// - KPI strip: .grid .cols-4 with click-to-filter behavior
// - DataTable replaces VDataTable; columns array + #cell.* slots
// - Every visible string goes through t('Key')
// ============================================================

const { t } = useI18n({ useScope: 'global' })
const { formatCurrency } = useFormatters()
const { notify } = useNotify()

function isoDay(offset = 0) {
  const today = businessToday()
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset, 12)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const dateFrom = ref(isoDay(-29))
const dateTo = ref(isoDay(0))
const cogsFraction = ref(0.35)
const loading = ref(false)
const data = ref<any>(null)
const appliedRange = ref({ from: dateFrom.value, to: dateTo.value, cogsFraction: cogsFraction.value })
let analysisRequestId = 0

const page = ref(1)
const itemsPerPage = ref(20)
const classFilter = ref<string | undefined>(undefined)
const searchQuery = ref('')

const cogsFractionValid = computed(() => cogsFraction.value >= 0.05 && cogsFraction.value <= 0.95)

// Bridge for the design <Input> primitive: it emits strings while
// cogsFraction is numeric.
const cogsFractionStr = computed<string>({
  get: () => String(cogsFraction.value),
  set: (v: string) => {
    const n = Number(v)
    if (!Number.isNaN(n))
      cogsFraction.value = n
  },
})

function applyPreset(days: number) {
  dateFrom.value = isoDay(-(Math.max(days, 1) - 1))
  dateTo.value = isoDay(0)
  load()
}

// Map menu-engineering class → tone (Kpi + Badge use the same Tone union)
const classTone: Record<string, 'success' | 'info' | 'warning' | 'error'> = {
  Star: 'success',
  Plowhorse: 'info',
  Puzzle: 'warning',
  Dog: 'error',
}

const classIcon: Record<string, string> = {
  Star: 'star',
  Plowhorse: 'trend',
  Puzzle: 'info',
  Dog: 'arrowdown',
}

// Menu-engineering matrix layout order (high margin on top, high popularity
// on the right — the classic Kasavana-Smith quadrant):
//   Puzzle | Star
//   Dog    | Plowhorse
const matrixOrder = ['Puzzle', 'Star', 'Dog', 'Plowhorse'] as const

async function load() {
  if (!cogsFractionValid.value) {
    notify(t('COGS fraction must be between 0.05 and 0.95'), 'error')
    return
  }
  const requestId = ++analysisRequestId

  const requested = {
    from: dateFrom.value,
    to: dateTo.value,
    cogsFraction: cogsFraction.value,
  }

  loading.value = true
  try {
    const res = await axios.get('/analytics/menu-engineering', {
      params: { from: requested.from, to: requested.to, cogs_fraction: requested.cogsFraction },
    })

    if (requestId !== analysisRequestId)
      return
    data.value = res.data?.data ?? res.data
    appliedRange.value = requested
    page.value = 1
  }
  catch (e: any) {
    if (requestId !== analysisRequestId)
      return
    notify(e?.response?.data?.message ?? t('Failed to load'), 'error')
  }
  finally {
    if (requestId === analysisRequestId)
      loading.value = false
  }
}

onMounted(load)

const summary = computed(() => data.value?.summary ?? null)

const items = computed(() => {
  let all = data.value?.items ?? []
  if (classFilter.value)
    all = all.filter((i: any) => i.class === classFilter.value)
  const q = searchQuery.value.trim().toLowerCase()
  if (q)
    all = all.filter((i: any) => String(i.product_name ?? '').toLowerCase().includes(q))
  return all
})

// DataTable handles its own pagination — feed it the filtered items
const itemsWithKey = computed(() =>
  items.value.map((i: any, idx: number) => ({
    ...i,
    _key: i.product_id ?? i.id ?? `${i.product_name ?? 'row'}-${idx}`,
  })),
)

const columns = computed<DataTableColumn<any>[]>(() => [
  { key: 'class', label: t('Class'), sortable: true, width: '140px' },
  { key: 'product_name', label: t('Product'), sortable: true },
  { key: 'price', label: t('Price'), sortable: true, align: 'right' },
  { key: 'qty_sold', label: t('Sold'), sortable: true, align: 'right' },
  { key: 'revenue', label: t('Revenue'), sortable: true, align: 'right' },
  { key: 'margin_per_unit', label: t('Margin/unit'), sortable: true, align: 'right' },
  { key: 'profit', label: t('Profit'), sortable: true, align: 'right' },
])

const dtPagination = computed(() => ({
  page: page.value,
  perPage: itemsPerPage.value,
  total: items.value.length,
  onPage: (p: number) => { page.value = p },
  onPerPage: (n: number) => { itemsPerPage.value = n; page.value = 1 },
}))

// Slice the rows ourselves so DataTable in controlled-pagination mode
// gets the right page (it does not re-slice when controlled).
const pageRows = computed(() => {
  const start = (page.value - 1) * itemsPerPage.value
  return itemsWithKey.value.slice(start, start + itemsPerPage.value)
})

function toggleClass(key: string) {
  classFilter.value = classFilter.value === key ? undefined : key
  page.value = 1
}

function clearClassFilter() {
  classFilter.value = undefined
  page.value = 1
}

const subtitle = computed(() => `${appliedRange.value.from} — ${appliedRange.value.to}`)

watch(searchQuery, () => { page.value = 1 })

// Aggregate totals over the currently filtered set — a real operator wants
// to see the cash impact of whatever slice they're looking at.
const totals = computed(() => {
  return items.value.reduce(
    (acc: { revenue: number; profit: number; units: number }, i: any) => {
      acc.revenue += Number(i.revenue) || 0
      acc.profit += Number(i.profit) || 0
      acc.units += Number(i.qty_sold) || 0
      return acc
    },
    { revenue: 0, profit: 0, units: 0 },
  )
})

// Client-side CSV export of the current (filtered) rows — no backend export
// endpoint exists for this report, so we build it from what's on screen.
const exporting = ref(false)
function exportCsv() {
  if (exporting.value)
    return
  if (!items.value.length) {
    notify(t('Nothing to export'), 'error')
    return
  }
  exporting.value = true
  try {
    const headers = [
      t('Class'),
      t('Product'),
      t('Price'),
      t('Sold'),
      t('Revenue'),
      t('Margin/unit'),
      t('Margin %'),
      t('Profit'),
    ]

    const rows: unknown[][] = [headers]
    for (const i of items.value as any[]) {
      rows.push([
        t(`menu_class_${String(i.class).toUpperCase()}`),
        i.product_name ?? '',
        i.price ?? 0,
        i.qty_sold ?? 0,
        i.revenue ?? 0,
        i.margin_per_unit ?? 0,
        i.margin_pct ?? 0,
        i.profit ?? 0,
      ])
    }
    const blob = new Blob([buildCsv(rows)], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')

    a.href = url
    a.download = `menu-engineering-${appliedRange.value.from}_${appliedRange.value.to}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    notify(t('Exported'), 'success')
  }
  catch {
    notify(t('Failed to load'), 'error')
  }
  finally {
    exporting.value = false
  }
}
</script>

<template>
  <WorkspacePage class="page">
    <PageHeader
      :title="t('Menu Engineering')"
      :subtitle="subtitle"
    />

    <!-- Filter toolbar -->
    <div
      class="card"
      style="margin-bottom: var(--sp-5);"
    >
      <WorkspaceToolbar class="toolbar me-toolbar">
        <Field
          :label="t('From')"
          class="me-field me-field--date"
        >
          <Input
            v-model="dateFrom"
            type="date"
            :aria-label="t('From')"
          />
        </Field>
        <Field
          :label="t('To')"
          class="me-field me-field--date"
        >
          <Input
            v-model="dateTo"
            type="date"
            :aria-label="t('To')"
          />
        </Field>
        <Field
          :label="t('COGS fraction')"
          :error="!cogsFractionValid ? t('COGS fraction must be between 0.05 and 0.95') : undefined"
          class="me-field me-field--cogs"
        >
          <Input
            v-model="cogsFractionStr"
            type="number"
            step="0.05"
            min="0.05"
            max="0.95"
            :error="!cogsFractionValid"
            :aria-label="t('COGS fraction')"
          />
        </Field>

        <div class="me-presets">
          <Button
            variant="secondary"
            size="sm"
            @click="applyPreset(1)"
          >
            {{ t('Today') }}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            @click="applyPreset(7)"
          >
            {{ t('Last 7 days') }}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            @click="applyPreset(30)"
          >
            {{ t('Last 30 days') }}
          </Button>
        </div>

        <div class="me-field me-field--search">
          <Input
            v-model="searchQuery"
            icon="search"
            :placeholder="t('Search products')"
            :aria-label="t('Search products')"
          />
        </div>

        <Button
          variant="primary"
          size="sm"
          icon="search"
          :loading="loading"
          :disabled="!cogsFractionValid"
          @click="load"
        >
          {{ t('Analyze') }}
        </Button>

        <Button
          variant="secondary"
          size="sm"
          icon="download"
          :loading="exporting"
          :disabled="loading || !items.length"
          @click="exportCsv"
        >
          {{ t('Export CSV') }}
        </Button>
      </WorkspaceToolbar>
    </div>

    <!--
      Menu-engineering 2×2 matrix — click a quadrant to filter by class.
      High margin on top, high popularity on the right.
    -->
    <div
      v-if="summary"
      class="me-matrix-block"
      style="margin-bottom: var(--sp-5);"
    >
      <div class="me-matrix-body">
        <!-- Y-axis (margin) -->
        <div class="me-axis me-axis--y">
          <span>{{ t('Higher margin') }}</span>
          <span class="me-axis-arrow">↑</span>
          <span class="me-axis-title">{{ t('Profitability') }}</span>
          <span class="me-axis-arrow">↓</span>
          <span>{{ t('Lower margin') }}</span>
        </div>

        <div class="me-matrix">
          <div
            v-for="key in matrixOrder"
            :key="key"
            class="me-quad"
            :class="[`me-quad--${classTone[key]}`, { 'is-active': classFilter === key, 'is-dim': classFilter && classFilter !== key }]"
            role="button"
            tabindex="0"
            :aria-pressed="classFilter === key"
            :aria-label="t(`menu_class_${key.toUpperCase()}`)"
            @click="toggleClass(key)"
            @keydown.enter.prevent="toggleClass(key)"
            @keydown.space.prevent="toggleClass(key)"
          >
            <div class="me-quad__head">
              <span class="me-quad__icon">
                <DesignIcon
                  :name="classIcon[key]"
                  :size="16"
                />
              </span>
              <span class="me-quad__name">{{ t(`menu_class_${key.toUpperCase()}`) }}</span>
              <span class="me-quad__count">{{ ({ Star: summary.stars, Plowhorse: summary.plowhorses, Puzzle: summary.puzzles, Dog: summary.dogs })[key] ?? 0 }}</span>
            </div>
            <p class="me-quad__hint">
              {{ t(`menu_action_${key.toUpperCase()}`) }}
            </p>
          </div>
        </div>
      </div>

      <!-- X-axis (popularity) -->
      <div class="me-axis me-axis--x">
        <span>← {{ t('Less popular') }}</span>
        <span class="me-axis-title">{{ t('Popularity') }}</span>
        <span>{{ t('More popular') }} →</span>
      </div>
    </div>

    <!-- Results -->
    <div class="card">
      <!-- Filter chip + meta row -->
      <div
        v-if="classFilter || summary"
        class="toolbar"
        style="padding-bottom: 0;"
      >
        <div class="chips">
          <span
            v-if="classFilter"
            class="chip"
          >
            <span>{{ t('Class') }}: <b>{{ t(`menu_class_${(classFilter as string).toUpperCase()}`) }}</b></span>
            <button
              type="button"
              class="chip__x"
              role="button"
              :aria-label="t('Clear filter')"
              @click="clearClassFilter"
            >
              <DesignIcon
                name="close"
                :size="13"
              />
            </button>
          </span>
        </div>
        <div style="flex: 1;" />
        <div
          v-if="summary"
          class="me-meta"
        >
          <span class="me-meta__stat">
            <span class="me-meta__label">{{ t('Revenue') }}</span>
            <b class="mono">{{ formatCurrency(totals.revenue) }}</b>
          </span>
          <span class="me-meta__stat">
            <span class="me-meta__label">{{ t('Total profit') }}</span>
            <b class="mono">{{ formatCurrency(totals.profit) }}</b>
          </span>
          <span class="me-meta__stat">
            <span class="me-meta__label">{{ t('Avg quantity') }}</span>
            <b class="mono">{{ summary.avg_qty }}</b>
          </span>
          <span class="me-meta__note">{{ t('{count} days analyzed', { count: summary.window_days }) }}</span>
        </div>
      </div>

      <div
        v-if="classFilter || summary"
        class="card__divider"
        style="margin-top: var(--sp-4);"
      />

      <DataTable
        :columns="columns"
        :rows="pageRows"
        row-key="_key"
        :loading="loading"
        :pagination="dtPagination"
        :per-page-options="[10, 20, 50, 100]"
        :empty-title="t('No menu items')"
        :empty-sub="t('Try a different date range or COGS fraction.')"
      >
        <template #cell.class="{ row }">
          <Badge
            :tone="classTone[row.class] ?? 'neutral'"
            dot
          >
            {{ t(`menu_class_${String(row.class).toUpperCase()}`) }}
          </Badge>
        </template>

        <template #cell.product_name="{ row }">
          <span class="cell-strong">{{ row.product_name ?? '—' }}</span>
        </template>

        <template #cell.price="{ row }">
          <span class="mono">{{ formatCurrency(row.price) }}</span>
        </template>

        <template #cell.qty_sold="{ row }">
          <span class="mono">{{ row.qty_sold ?? 0 }}</span>
        </template>

        <template #cell.revenue="{ row }">
          <span class="mono">{{ formatCurrency(row.revenue) }}</span>
        </template>

        <template #cell.margin_per_unit="{ row }">
          <div
            class="me-margin"
            style="display: inline-flex; flex-direction: column; align-items: flex-end; gap: 2px;"
          >
            <span class="mono">{{ formatCurrency(row.margin_per_unit) }}</span>
            <span class="cell-muted me-margin-pct">({{ row.margin_pct }}%)</span>
          </div>
        </template>

        <template #cell.profit="{ row }">
          <span class="mono cell-strong">{{ formatCurrency(row.profit) }}</span>
        </template>
      </DataTable>
    </div>
  </WorkspacePage>
</template>

<style scoped>
/* Toolbar — design-shell .toolbar already does flex-wrap+gap.
   The inline fields below collapse to 100% on narrow widths. */
.me-toolbar {
  align-items: flex-end;
}

.me-field {
  min-inline-size: 0;
}
.me-field--date { width: 170px; }
.me-field--cogs { width: 200px; }
.me-field--search { width: 240px; flex: 1 1 240px; }

.me-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

/* ── Menu-engineering matrix ─────────────────────────────── */
.me-matrix-body {
  display: flex;
  align-items: stretch;
  gap: var(--sp-3);
}

.me-axis {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--text-tertiary, var(--text-secondary));
  font-size: var(--fs-label);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  white-space: nowrap;
}
.me-axis--y {
  flex-direction: column;
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  padding-block: var(--sp-2);
}
.me-axis--x {
  flex-wrap: wrap;
  white-space: normal;
  row-gap: 8px;
  margin-top: var(--sp-3);
  justify-content: space-between;
  padding-inline: var(--sp-1);
}
.me-axis-title {
  color: var(--text-secondary);
  font-weight: 700;
}
.me-axis-arrow {
  font-size: 13px;
  line-height: 1;
}

.me-matrix {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--sp-3);
}

.me-quad {
  cursor: pointer;
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  padding: var(--sp-4);
  outline: none;
  background: var(--surface);
  transition: transform 0.12s ease, box-shadow 0.12s ease, opacity 0.12s ease;
  min-height: 108px;
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.me-quad:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}
.me-quad:focus-visible {
  box-shadow: var(--shadow-focus);
}
.me-quad.is-active {
  box-shadow: 0 0 0 2px currentColor, var(--shadow-md);
}
.me-quad.is-dim {
  opacity: 0.5;
}

.me-quad--success { color: var(--success); background: var(--success-weak); border-color: var(--success-border); }
.me-quad--info    { color: var(--info);    background: var(--info-weak);    border-color: var(--info-border); }
.me-quad--warning { color: var(--warning); background: var(--warning-weak); border-color: var(--warning-border); }
.me-quad--error   { color: var(--error);   background: var(--error-weak);   border-color: var(--error-border); }

.me-quad__head {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}
.me-quad__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  inline-size: 26px;
  block-size: 26px;
  border-radius: var(--r-md);
  background: color-mix(in srgb, currentColor 16%, transparent);
  flex-shrink: 0;
}
.me-quad__name {
  font-weight: 700;
  font-size: var(--fs-sm);
  color: var(--text-primary);
}
.me-quad__count {
  margin-inline-start: auto;
  font-size: var(--fs-h4, 1.35rem);
  font-weight: 800;
  line-height: 1;
}
.me-quad__hint {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--fs-label);
  line-height: 1.35;
}

.me-meta {
  display: flex;
  align-items: center;
  gap: var(--sp-4);
  flex-wrap: wrap;
  color: var(--text-secondary);
  font-size: var(--fs-sm);
}
.me-meta__stat {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
}
.me-meta__label {
  color: var(--text-tertiary, var(--text-secondary));
  font-size: var(--fs-label);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.me-meta__stat b {
  color: var(--text-primary);
}
.me-meta__note {
  color: var(--text-tertiary, var(--text-secondary));
}

.me-margin-pct {
  font-size: var(--fs-label);
}

@media (max-width: 1024px) {
  .me-field--date,
  .me-field--cogs,
  .me-field--search {
    width: 100%;
    flex-basis: 100%;
  }
  .me-presets {
    width: 100%;
  }
}

@media (max-width: 768px) {
  .me-toolbar {
    flex-wrap: wrap;
  }
  .me-axis--y {
    display: none;
  }
  .me-meta {
    flex: 1 1 100%;
    word-break: break-word;
  }
}

@media (max-width: 420px) {
  .me-matrix {
    grid-template-columns: 1fr;
  }
}
</style>

<route lang="yaml">
meta:
  action: manage
  subject: all
</route>
