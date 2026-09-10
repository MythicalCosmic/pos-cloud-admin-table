# Compare Periods — Analytics page design

**Route:** `/analytics/compare` · **Status:** approved 2026-07-05 · build FE against mock, wire to BE when shipped, then merge to main.

## Goal
Period-over-period comparison. User picks **Period A** (primary) and **Period B** (baseline); page answers "what changed and by how much" with KPI scorecards, a dual revenue trend, category/product breakdown, top movers, hourly/weekday patterns, payment/order-type mix, a delta heatmap, and a detailed table.

## Reconciled decisions (vs the pasted spec)
- **Charts: ECharts via `vue-echarts`** (user choice). Not the existing SVG primitives. All charts go through one themed `<EChart>` wrapper + `useEChartTheme()` that maps CSS tokens → an ECharts theme (Hanken Grotesk labels, JetBrains Mono `tabular-nums` figures, series colors from A/B tokens, deltas from positive/negative, grid/axis/tooltip from tokens; light+dark aware). No hardcoded colors.
- **Backend:** owned by Abrorbek. Single endpoint `GET /api/admins/analytics/comparison/` (spec sent via dev-bot msg 71). FE builds against a realistic **mock fixture** (flag-gated) until it ships.
- **v1 scope:** control bar + presets, KPI scorecards, dual revenue trend, category/product breakdown (+ diverging-delta toggle), top movers, hourly, weekday, payment + order-type mix, **delta heatmap**, detailed table. **Deferred:** waterfall decomposition, AI auto-insight. `by_branch`/`by_cashier` render only if the payload carries them.

## New design tokens
`--color-period-a` (→ primary), `--color-period-b` (→ neutral/muted), `--color-positive` (→ success), `--color-negative` (→ error). Added to the token stylesheet; every chart + badge references these.

## Core comparison rules (in `useComparison`)
- `computeDelta(a,b)` → `{ delta:a-b, deltaPct, direction }`. Div-by-zero: `b==0 && a>0` → `direction:'new'` (badge "▲ New"); `a==0 && b>0` → `-100%`; both 0 → `neutral` ("—").
- `badgeColor(direction, isUpGood)` → positive|negative|neutral (direction × isUpGood, NOT raw sign — a rise in discounts/refunds is bad).
- `normalize(value, days)` for the Total / Daily-average toggle.
- `alignSeries(a[], b[])` → relative-index points `{index, aValue, bValue, aDate, bDate}`, shorter padded to longer's length (aligned axis; tooltip shows both real dates).
- Preset resolvers: `previousPeriod(a)`, `samePeriodLastYear(a)`.
- `useCurrency`: UZS space-separators (`12 345 000`), abbreviate (`12.3M` / `450K`), integer math only.

## Data flow
`ComparePeriodsPage` holds `{ aRange, bRange, mode, granularity, branchId, avgMode }` → synced to URL query (shareable) → single fetch (mock or real) → typed `ComparisonResponse` → passed to blocks. Progressive per-block skeleton loading; per-block error + retry. Default view = **This month vs Last month**.

## Component tree
```
pages/analytics/compare.vue        # route container (state, URL sync, fetch, layout)
components/analytics/compare/
  ComparisonControlBar.vue         # A/B pickers, mode presets, granularity, branch, total/avg, export
  KpiScorecardRow.vue → KpiScorecard.vue → DeltaBadge.vue
  RevenueTrendChart.vue            # dual series, aligned relative axis, dual-date tooltip, net/gross + date-axis toggles
  CategoryComparisonChart.vue      # grouped bars + diverging-delta toggle
  TopProductsChart.vue             # grouped bar top N
  TopMoversPanel.vue               # gainers + losers, abs/% toggle
  HourlyPatternChart.vue           # 0-23 overlaid
  WeekdayPatternChart.vue          # Mon-Sun grouped
  MixDonutPair.vue                 # payment methods / order types (used twice)
  DeltaHeatmap.vue                 # hour x weekday, cell = change
  ComparisonTable.vue              # sortable, searchable, CSV export
  EChart.vue                       # themed ECharts wrapper (shared)
components/design/ChartCard.vue    # reuse existing card wrapper (title/subtitle/actions/loading/empty)
composables/useComparison.ts
composables/useCurrency.ts
composables/useEChartTheme.ts
mocks/comparisonMock.ts            # realistic fixture, flag-gated
types/comparison.ts                # ComparisonResponse etc.
```

## Metrics catalog (KPIs)
gross_revenue✅ net_revenue✅ orders✅ items_sold✅ aov✅ avg_items_per_order✅ discounts❌ refunds❌ gross_profit✅(if COGS) margin_pct✅(if COGS). Each `{key,label,value_a,value_b,delta,delta_pct,is_up_good}`. Omit gracefully when absent.

## States
Loading → skeleton scorecards + shimmer charts, progressive. Empty period → 0 + delta per rules; charts show "No sales in this period". Error → per-block retry. Unequal-length ranges → warning chip ("Ranges differ: 30 vs 31 days") + Total/Daily-average toggle. Long ranges → auto-bump granularity to week/month.

## Formatting / i18n / a11y
UZS space-separated, chart axes abbreviated, tooltips/table full precision, integers only. Percentages 1 decimal with sign; `+0.0%` → neutral "—"; never NaN/Infinity. Every string via i18n (uz/ru/en). Delta badges carry word `aria-label`; the detailed table exposes each chart's numbers. Keyboard-operable control bar + table sort.

## Build order
1. Types + mock + `useComparison` + `useCurrency` + `EChart`/`useEChartTheme` + tokens.
2. Route + page shell (state, URL sync, fetch mock, skeletons).
3. Control bar.
4. KPI scorecards + delta badges.
5. Revenue trend (aligned axis) — the anchor.
6. Category/product + detailed table.
7. Movers, hourly, weekday, mix donuts, delta heatmap.
8. i18n + a11y + nav entry; typecheck; verify on dev.
9. Wire to real endpoint when Abrorbek ships; merge feat→main.
