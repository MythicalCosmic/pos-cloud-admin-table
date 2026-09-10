<script setup lang="ts">
import Card from '@/components/design/Card.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import Skeleton from '@/components/design/Skeleton.vue'
import TimeSeriesExplorer from '@/components/dashboard/TimeSeriesExplorer.vue'
import ReportState from '@/components/dashboard/ReportState.vue'
import ReportSkeleton from '@/components/dashboard/ReportSkeleton.vue'
import DistributionChart from '@/components/dashboard/DistributionChart.vue'
import DashboardNotice from '@/components/dashboard/DashboardNotice.vue'
import KitchenSpeed from '@/components/dashboard/KitchenSpeed.vue'
import { fmtNum } from '@/components/design/utils/format'
import { getDashboard } from '@/services/dashboardRequests'
import { useDashboardData } from '@/composables/useDashboardData'
import { buildDateParams, businessPreset } from '@/composables/useBusinessDay'
import { formatWindow } from '@/composables/useWindowLabel'

// Kitchen-category details already appear in Products on the continuous page.
// Preserve them on this view's existing standalone route.
defineProps<{ embedded?: boolean }>()

const { t } = useI18n({ useScope: 'global' })
const { range: sharedRange } = useDashboardData()
const windowLabel = computed(() => formatWindow(sharedRange.value, t))
interface OrdersStats { preparing_orders?: number; ready_orders?: number; unpaid_orders?: number }
interface TableCell { n: number; status: 'free' | 'seated' | 'reserved' | 'cleaning'; guests: number; mins: number }
interface FunnelRow { status: string; value: number; color: string }
interface PrepRow { label: string; mins: number; target: number; orders: number }
interface HourPoint { label: string; value: number; peak: boolean }
interface OperationsData { funnel: FunnelRow[]; prep: PrepRow[]; hours: HourPoint[]; tables: TableCell[] }
const stats = ref<OrdersStats | null>(null)
const data = ref<OperationsData | null>(null)
const statsError = shallowRef<unknown>(null)
const loadError = shallowRef<unknown>(null)
const loading = ref(true)
let requestId = 0
let loadedRangeKey = ''

const colors: Record<string, string> = {
  OPEN: 'var(--warning)',
  PAID: 'var(--info)',
  PREPARING: 'var(--info)',
  READY: 'var(--success)',
  COMPLETED: 'var(--success-strong)',
  CANCELED: 'var(--error)',
}

const statusLabels = { free: 'table_status_AVAILABLE', seated: 'Seated', reserved: 'Reserved', cleaning: 'Cleaning' }
const num = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0

const counters = computed(() => [
  { key: 'Open orders', value: stats.value ? num(stats.value.preparing_orders) + num(stats.value.ready_orders) + num(stats.value.unpaid_orders) : null, icon: 'receipt', tone: 'warning', period: t('Today') },
  { key: 'In kitchen', value: stats.value ? num(stats.value.preparing_orders) : null, icon: 'clock', tone: 'info', period: t('Today') },
  { key: 'Ready to serve', value: stats.value ? num(stats.value.ready_orders) : null, icon: 'check', tone: 'success', period: t('Today') },
  { key: 'Tables seated', value: data.value ? data.value.tables.filter(table => table.status === 'seated').length : null, icon: 'table', tone: 'primary', period: windowLabel.value },
])

function arrayRows(value: any): any[] { return Array.isArray(value) ? value : [] }

function mapOperations(raw: any): OperationsData {
  const hourRows = arrayRows(raw.ordersByHour ?? raw.orders_by_hour)
  const peak = Math.max(0, ...hourRows.map((row: any) => num(row.orders)))
  const prepRows = raw.prepByCategory ?? raw.prep_by_category
  const tables = raw.tableGrid ?? raw.tables
  return {
    funnel: arrayRows(raw.funnel).map((row: any) => ({
      status: String(row.status ?? row.stage ?? ''), value: num(row.count ?? row.value), color: colors[row.status] ?? 'var(--text-secondary)',
    })),
    hours: hourRows.map((row: any) => ({ label: `${String(row.hour ?? '').padStart(2, '0')}:00`, value: num(row.orders), peak: num(row.orders) === peak && peak > 0 })),
    prep: arrayRows(prepRows).map((row: any) => ({
      label: String(row.label ?? row.category ?? '—'), mins: num(row.mins ?? row.avg_prep_minutes ?? num(row.avg_prep_seconds) / 60), target: num(row.target ?? row.target_minutes), orders: num(row.orders ?? row.count),
    })).sort((a: PrepRow, b: PrepRow) => b.mins - a.mins),
    tables: arrayRows(tables).filter((row: any) => Object.keys(statusLabels).includes(row.status)).map((row: any) => ({
      n: num(row.n), status: row.status, guests: num(row.guests), mins: num(row.mins),
    })),
  }
}

async function load() {
  const id = ++requestId
  const range = sharedRange.value?.from ? sharedRange.value : businessPreset('30d')
  const params = buildDateParams(range)
  const key = JSON.stringify(params)
  if (key !== loadedRangeKey)
    data.value = null
  loadedRangeKey = key
  loading.value = true
  loadError.value = null
  statsError.value = null

  const [operations, today] = await Promise.allSettled([
    getDashboard('/dashboard/operations', { params }),
    getDashboard('/orders/stats', { params: buildDateParams(businessPreset('today'), { orders: true }) }),
  ])

  if (id !== requestId)
    return
  if (operations.status === 'fulfilled')
    data.value = mapOperations(operations.value.data?.data ?? operations.value.data ?? {})
  else loadError.value = operations.reason
  if (today.status === 'fulfilled')
    stats.value = today.value.data?.data ?? today.value.data ?? {}
  else statsError.value = today.reason
  loading.value = false
}
watch(sharedRange, () => { load() })
onMounted(load)
onBeforeUnmount(() => { requestId++ })
</script>

<template>
  <div
    class="operations-dash"
    :aria-busy="loading"
  >
    <DashboardNotice
      v-if="loadError || statsError"
      :error="loadError || statsError"
      :loading="loading"
      :stale="!!data || !!stats"
      @retry="load"
    />
    <div class="operations-metrics report-metrics">
      <div
        v-for="counter in counters"
        :key="counter.key"
        class="herokpi"
      >
        <div class="herokpi__top">
          <span class="herokpi__label">{{ t(counter.key) }}</span><span
            class="herokpi__icon"
            :class="`t-${counter.tone}`"
          ><DesignIcon
            :name="counter.icon"
            :size="17"
          /></span>
        </div>
        <Skeleton
          v-if="loading && counter.value === null"
          :h="28"
          w="60%"
        />
        <div
          v-else
          class="herokpi__value"
        >
          {{ counter.value === null ? '—' : fmtNum(counter.value) }}
        </div>
        <div class="herokpi__foot">
          <span class="herokpi__sub">{{ counter.period }}</span>
        </div>
      </div>
    </div>
    <ReportSkeleton
      v-if="loading && !data"
      :metrics="0"
    />
    <div
      v-else
      class="operations-grid"
    >
      <Card>
        <div class="card__head">
          <div class="card__head-text">
            <div class="kpi__label">
              {{ windowLabel }}
            </div><h3 class="card__title">
              {{ t('Order pipeline') }}
            </h3>
          </div>
        </div>
        <div class="card__body">
          <Skeleton
            v-if="loading && !data"
            :h="220"
          />
          <DistributionChart
            v-else-if="data?.funnel.length"
            :data="data.funnel.map(stage => ({ label: t(`order_status_${stage.status}`), value: stage.value, color: stage.color }))"
            :label="t('Orders')"
            :unit="t('Orders')"
          />
          <ReportState
            v-else
            :title="t(loadError ? 'Failed to load operations data' : 'No operations data for this window')"
          />
        </div>
      </Card>
      <Card>
        <div class="card__head">
          <div class="card__head-text">
            <div class="kpi__label">
              {{ windowLabel }}
            </div><h3 class="card__title">
              {{ t('Orders by hour') }}
            </h3>
          </div>
        </div>
        <div class="card__body">
          <Skeleton
            v-if="loading && !data"
            :h="300"
          />
          <TimeSeriesExplorer
            v-else-if="data?.hours.length"
            :categories="data.hours.map(row => row.label)"
            :series="[{ key: 'hourly-orders', label: t('Orders'), data: data.hours.map(row => row.value) }]"
            :height="260"
            mode="bar"
            compact
          />
          <ReportState
            v-else
            :title="t('No data for this range')"
            :description="t('Try a different date range.')"
          />
        </div>
      </Card>
    </div>
    <div class="operations-grid">
      <Card v-if="!embedded">
        <div class="card__head">
          <div class="card__head-text">
            <div class="kpi__label">
              {{ windowLabel }}
            </div><h3 class="card__title">
              {{ t('Avg prep time by category') }}
            </h3>
          </div>
        </div>
        <div class="card__body">
          <KitchenSpeed
            v-if="data?.prep.length"
            :data="data.prep"
          />
          <ReportState
            v-else
            :title="t('No data for this range')"
            :description="t('Try a different date range.')"
          />
        </div>
      </Card>
      <Card>
        <div class="card__head">
          <div class="card__head-text">
            <div class="kpi__label">
              {{ t('Floor · {n} tables', { n: data?.tables.length ?? '—' }) }}
            </div><h3 class="card__title">
              {{ t('Table occupancy') }}
            </h3>
          </div>
        </div>
        <div class="card__body">
          <Skeleton
            v-if="loading && !data"
            :h="100"
          />
          <div
            v-else-if="data?.tables.length"
            class="tablegrid"
          >
            <div
              v-for="cell in data.tables"
              :key="cell.n"
              class="tablecell"
              :class="`s-${cell.status}`"
            >
              <span class="tablecell__n">{{ cell.n }}</span><span class="tablecell__m">{{ t(statusLabels[cell.status]) }}<template v-if="cell.status === 'seated'"> · {{ t('dash_table_guests', { n: cell.guests }) }} · {{ cell.mins }} {{ t('min') }}</template></span>
            </div>
          </div>
          <ReportState
            v-else
            :title="t('No data for this range')"
            :description="t('Try a different date range.')"
          />
        </div>
      </Card>
    </div>
  </div>
</template>

<style src="@styles/pages/dashboard.css" />

<route lang="yaml">
meta:
  action: manage
  subject: all
</route>
