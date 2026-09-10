<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { getDashboard } from '@/services/dashboardRequests'
import Card from '@/components/design/Card.vue'
import DashboardNotice from '@/components/dashboard/DashboardNotice.vue'
import ReportState from '@/components/dashboard/ReportState.vue'
import ReportSkeleton from '@/components/dashboard/ReportSkeleton.vue'
import HeroKpi from '@/components/design/HeroKpi.vue'
import Radar from '@/components/design/charts/Radar.vue'
import Scatter from '@/components/design/charts/Scatter.vue'
import DistributionChart from '@/components/dashboard/DistributionChart.vue'
import Select from '@/components/design/Select.vue'

import { fmtAbbr, fmtNum } from '@/components/design/utils/format'
import { useFormatters } from '@/composables/useFormatters'
import { useDashboardData } from '@/composables/useDashboardData'
import { formatWindow } from '@/composables/useWindowLabel'
import { buildDateParams } from '@/composables/useBusinessDay'

// staffFixture mock dropped — real BE data only (Abrorbek deployed /staff/performance 2026-06-25).

const { t } = useI18n({ useScope: 'global' })
const { formatCurrency } = useFormatters()
const { range: sharedRange } = useDashboardData()
const windowLabel = computed(() => formatWindow(sharedRange.value, t))

/* ---------- Data shape (mirrors window.DASH.staff in handoff v3) ---------- */
interface StaffRow {
  id?: number | null
  name: string
  initials: string
  revenue: number
  orders: number
  aov: number
  hours: number
  accuracy: number
  shifts: number
}

const loading = ref(true)
const loadError = shallowRef<unknown>(null)
let loadedRangeKey = ''
const staff = ref<StaffRow[]>([])

/* ---------- BE → FE mapper ----------
   Confirmed contract (alpha_pos_server/admins/services/analytics_service.py
   → staff_performance):
     GET /staff/performance?range=30d  (or ?from=&to=)
       → { range, window_days,
            staff[{ user_id, name, role,
                    orders_total, orders_completed, orders_cancelled,
                    orders_paid, cancel_rate_pct,
                    revenue, avg_order_value, units_sold,
                    shifts_worked, hours_worked }],
            summary }
   Comparisons use only reported orders, revenue, hours and shifts.
   The cancellation complement is labeled explicitly, never as a skill score.
*/

function initialsOf(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length)
    return '?'
  if (parts.length === 1)
    return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function num(v: unknown): number {
  const n = typeof v === 'string' ? Number(v) : (v as number)
  return Number.isFinite(n) ? n : 0
}

function mapStaffPerformance(raw: any): StaffRow[] {
  const list = Array.isArray(raw?.staff) ? raw.staff : []
  return list.map((r: any) => {
    const revenue = num(r?.revenue)
    const orders = num(r?.orders_total)
    const aov = num(r?.avg_order_value)
    const hours = num(r?.hours_worked)
    const cancelRate = num(r?.cancel_rate_pct)

    const accuracy = Math.max(0, Math.min(100, Math.round(100 - cancelRate)))
    const shifts = num(r?.shifts_worked)
    return {
      id: r?.user_id ?? null,
      name: r?.name?.trim() || '—',
      initials: initialsOf(r?.name || ''),
      revenue,
      orders,
      aov,
      hours: Math.round(hours),
      accuracy,
      shifts,
    }
  })
}

let staffRequestId = 0

async function loadStaff() {
  const requestId = ++staffRequestId

  loading.value = true
  loadError.value = null

  const rangeKey = JSON.stringify(sharedRange.value)
  if (rangeKey !== loadedRangeKey)
    staff.value = []
  loadedRangeKey = rangeKey
  try {
    const sr = sharedRange.value

    const params: Record<string, string> = (sr?.from && sr?.to)
      ? buildDateParams({ from: sr.from, to: sr.to, fromTime: sr.fromTime, toTime: sr.toTime })
      : { range: sr?.preset || '30d' }

    const res = await getDashboard('/staff/performance', { params })
    const raw = res.data?.data ?? res.data
    if (requestId !== staffRequestId)
      return
    staff.value = mapStaffPerformance(raw)
  }
  catch (error) {
    if (requestId === staffRequestId)
      loadError.value = error
  }
  finally {
    if (requestId === staffRequestId)
      loading.value = false
  }
}

watch(sharedRange, () => { loadStaff() })

// Localized label for the active date-picker window (see useWindowLabel).

onMounted(loadStaff)

/* Defensive ranks — fixture is pre-sorted by revenue desc, but normalise here
   so the leaderboard is correct whatever the BE returns. */
const ranked = computed(() => {
  return [...staff.value].sort((a, b) => b.revenue - a.revenue)
})

const maxRev = computed(() => {
  if (!ranked.value.length)
    return 1
  return Math.max(1, ...ranked.value.map(s => s.revenue))
})

const totalHours = computed(() => ranked.value.reduce((acc, s) => acc + s.hours, 0))

/* ---------- HeroKpi tiles (4) ---------- */
const avgAccuracy = computed(() => {
  if (!ranked.value.length)
    return 0
  return Math.round(ranked.value.reduce((acc, s) => acc + s.accuracy, 0) / ranked.value.length)
})

const heroKpis = computed(() => {
  const top = ranked.value[0]
  return [
    {
      label: t('Active staff'),
      value: ranked.value.length,
      icon: 'users',
      tone: 'primary' as const,
      sub: t('in {window}', { window: windowLabel.value }),
    },
    {
      label: t('Top performer'),
      value: top ? top.name : '—',
      icon: 'star',
      tone: 'warning' as const,
      sub: top ? `${fmtAbbr(top.revenue)} · ${windowLabel.value}` : '',
    },
    {
      label: t('dash_non_cancelled_rate'),
      value: `${avgAccuracy.value}%`,
      icon: 'check',
      tone: 'success' as const,
    },
    {
      label: t('Total hours · {window}', { window: windowLabel.value }),
      value: totalHours.value,
      icon: 'clock',
      tone: 'info' as const,
      sub: t('across team'),
    },
  ]
})

/* ---------- Leaderboard insight (templated) ----------
   Diff between top performer and runner-up, as % over runner-up. */
const leaderInsight = computed(() => {
  const a = ranked.value[0]
  const b = ranked.value[1]
  if (!a || !b || !b.revenue)
    return ''
  const pct = Math.round(((a.revenue - b.revenue) / b.revenue) * 100)
  return t('{name} leads by {pct}%', { name: a.name, pct })
})

/* Compare real measures, normalised against each measure's team maximum. */
const primaryStaff = ref(0)
const comparisonStaff = ref(1)
const expandedStaff = ref(false)
const visibleStaff = computed(() => expandedStaff.value ? ranked.value : ranked.value.slice(0, 5))
const staffOptions = computed(() => ranked.value.map((row, index) => ({ value: String(index), label: row.name })))
const comparisonOptions = computed(() => staffOptions.value.filter(option => Number(option.value) !== primaryStaff.value))

watch(() => ranked.value.map(row => row.id ?? row.name).join('|'), () => {
  primaryStaff.value = 0
  comparisonStaff.value = Math.floor(ranked.value.length / 2)
  expandedStaff.value = false
})
watch(primaryStaff, value => {
  if (comparisonStaff.value === value && ranked.value.length > 1)
    comparisonStaff.value = (value + 1) % ranked.value.length
})

const comparisonMeasures = computed(() => [
  { key: 'orders' as const, label: t('Orders') },
  { key: 'revenue' as const, label: t('Revenue') },
  { key: 'hours' as const, label: t('Hours worked') },
  { key: 'shifts' as const, label: t('Shifts') },
])

const radarAxes = computed(() => comparisonMeasures.value.map(measure => measure.label))
const comparedStaff = computed(() => [ranked.value[primaryStaff.value], ranked.value[comparisonStaff.value]].filter((row): row is StaffRow => !!row))

const radarSeries = computed(() => ranked.value.length < 2
  ? []
  : comparedStaff.value.map((row, index) => ({
    label: row.name,
    color: index === 0 ? 'var(--c1)' : 'var(--c2)',
    values: comparisonMeasures.value.map(measure => row[measure.key] / Math.max(1, ...ranked.value.map(member => member[measure.key])) * 100),
    valueLabels: comparisonMeasures.value.map(measure => `${fmtNum(row[measure.key])}${measure.key === 'revenue' ? ' UZS' : ''}`),
  })))

/* ---------- Scatter (orders vs revenue, bubble = AOV) ---------- */
const palette = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)']

const scatterData = computed(() => ranked.value.map((s, i) => ({
  x: s.orders,
  y: s.revenue,
  r: 8 + s.aov / 9000,
  label: s.name,
  color: palette[i % palette.length],
  details: [{ label: t('AOV'), value: `${formatCurrency(s.aov)} UZS` }],
})))

const hoursByStaff = computed(() => ranked.value.map(row => ({ label: row.name, value: row.hours })))

/* ---------- Helpers ---------- */
function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

function intFmt(v: number): string {
  return String(Math.round(v))
}
onBeforeUnmount(() => { staffRequestId++ })
</script>

<template>
  <div
    class="staff-dash"
    :aria-busy="loading"
  >
    <DashboardNotice
      v-if="loadError"
      :error="loadError"
      :loading="loading"
      :stale="!!staff.length"
      @retry="loadStaff"
    />
    <ReportSkeleton v-if="loading && !staff.length" />
    <ReportState
      v-else-if="!staff.length && !loadError"
      :title="t('No staff data for this range')"
      :description="t('Try a different date range.')"
      icon="users"
    />

    <!-- Loaded state -->
    <div
      v-else-if="staff.length"
      class="report-content"
    >
      <!-- Hero KPI strip (4 columns) -->
      <div class="grid staff-hero report-metrics">
        <HeroKpi
          v-for="k in heroKpis"
          :key="k.label"
          :data="k as any"
        />
      </div>

      <!-- Leaderboard + Radar -->
      <div class="grid staff-row-1">
        <Card>
          <div class="card__head">
            <div class="card__head-text">
              <div class="kpi__label">
                {{ t('Cashier leaderboard · revenue') }}
              </div>
              <h3 class="card__insight">
                {{ leaderInsight || t('Cashier leaderboard · revenue') }}
              </h3>
            </div>
          </div>
          <div
            class="card__body"
            style="padding-top: 4px;"
          >
            <button
              v-for="(s, i) in visibleStaff"
              :key="s.name"
              class="lb-row"
              type="button"
              :aria-pressed="primaryStaff === i"
              @click="primaryStaff = i"
            >
              <span :class="cx('lb-rank', `is-${i + 1}`)">{{ i + 1 }}</span>
              <div class="avatar avatar--sm">
                {{ s.initials }}
              </div>
              <div style="flex: 1; min-width: 0;">
                <div class="row between">
                  <span
                    class="cell-strong"
                    style="font-size: 14px;"
                  >{{ s.name }}</span>
                  <span
                    class="mono cell-strong"
                    style="font-size: 13px;"
                  >{{ formatCurrency(s.revenue) }}</span>
                </div>
                <div class="lb-bar">
                  <div :style="{ width: `${(s.revenue / maxRev) * 100}%` }" />
                </div>
                <div
                  class="row"
                  style="gap: 14px; margin-top: 5px; font-size: 11px; color: rgb(var(--v-theme-text-tertiary));"
                >
                  <span>{{ fmtNum(s.orders) }} {{ t('orders') }}</span>
                  <span>{{ t('AOV') }} {{ fmtAbbr(s.aov) }}</span>
                  <span>{{ s.hours }}{{ t('h') }}</span>
                </div>
              </div>
            </button>
            <button
              v-if="ranked.length > 5"
              type="button"
              class="report-more"
              :aria-expanded="expandedStaff"
              @click="expandedStaff = !expandedStaff"
            >
              {{ expandedStaff ? t('Show less') : t('dash_all_breakdown', { n: ranked.length }) }}
            </button>
          </div>
        </Card>

        <Card>
          <div class="card__head">
            <div class="card__head-text">
              <div class="kpi__label">
                {{ t('dash_staff_scale') }}
              </div>
              <h3 class="card__title">
                {{ t('dash_compare_staff') }}
              </h3>
            </div>
          </div>
          <div class="card__body">
            <div
              v-if="ranked.length > 1"
              class="staff-comparison-controls"
            >
              <div class="staff-comparison-person">
                <i style="background: var(--c1)" /><Select
                  :model-value="String(primaryStaff)"
                  :options="staffOptions"
                  :aria-label="t('dash_staff_primary')"
                  @update:model-value="primaryStaff = Number($event)"
                />
              </div>
              <div class="staff-comparison-person">
                <i style="background: var(--c2)" /><Select
                  :model-value="String(comparisonStaff)"
                  :options="comparisonOptions"
                  :aria-label="t('dash_staff_comparison')"
                  @update:model-value="comparisonStaff = Number($event)"
                />
              </div>
            </div>
            <Radar
              v-if="radarSeries.length"
              :axes="radarAxes"
              :series="radarSeries"
              :max="100"
              :size="230"
              :show-legend="false"
            />
            <ReportState
              v-else
              :title="t('dash_staff_single')"
              :description="t('dash_staff_single_body')"
              icon="users"
            />
            <details
              v-if="radarSeries.length"
              class="staff-comparison-values"
            >
              <summary>{{ t('dash_view_data') }}</summary>
              <table>
                <thead>
                  <tr>
                    <th>{{ t('Metric') }}</th><th
                      v-for="(person, index) in comparedStaff"
                      :key="index"
                    >
                      {{ person.name }}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="measure in comparisonMeasures"
                    :key="measure.key"
                  >
                    <th>{{ measure.label }}</th><td
                      v-for="(person, index) in comparedStaff"
                      :key="index"
                    >
                      {{ fmtNum(person[measure.key]) }}{{ measure.key === 'revenue' ? ' UZS' : '' }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </details>
          </div>
        </Card>
      </div>

      <!-- Scatter + Stacked bar -->
      <div class="grid staff-row-2">
        <Card>
          <div class="card__head">
            <div class="card__head-text">
              <div class="kpi__label">
                {{ t('Orders vs revenue') }}
              </div>
              <h3 class="card__insight">
                {{ t('Bubble size = avg order value') }}
              </h3>
            </div>
          </div>
          <div class="card__body">
            <Scatter
              :data="scatterData as any"
              :height="260"
              :x-label="t('orders')"
              :y-label="t('Revenue')"
              y-unit="UZS"
              :point-label="t('dash_staff_select')"
              :selected-index="primaryStaff"
              :x-format="intFmt"
              :y-format="fmtAbbr"
              @select="primaryStaff = $event"
            />
          </div>
        </Card>

        <Card>
          <div class="card__head">
            <div class="card__head-text">
              <div class="kpi__label">
                {{ t('Total hours · {window}', { window: windowLabel }) }}
              </div>
              <h3 class="card__title">
                {{ t('Hours worked') }}
              </h3>
            </div>
          </div>
          <div class="card__body">
            <DistributionChart
              :data="hoursByStaff"
              visual="bars"
              :label="t('Total hours · {window}', { window: windowLabel })"
              :unit="t('h')"
              ranked
            />
          </div>
        </Card>
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  action: manage
  subject: all
</route>
