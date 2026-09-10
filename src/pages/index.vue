<script setup lang="ts">
import '@styles/pages/dashboard.css'
import type { Component } from 'vue'
import { toast } from 'vue-sonner'
import ExecutiveDashboard from '@/pages/dash/executive.vue'
import SalesDashboard from '@/pages/dash/sales.vue'
import ProductsDashboard from '@/pages/dash/products.vue'
import StaffDashboard from '@/pages/dash/staff.vue'
import OperationsDashboard from '@/pages/dash/operations.vue'
import { settleDashboardRequests, useDashboardRequests } from '@/services/dashboardRequests'
import { useAIPageContext } from '@/composables/useAIPageContext'
import Button from '@/components/design/Button.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import type { DateRangeValue } from '@/components/design/DateRangePicker.vue'
import DashboardFilters from '@/components/dashboard/DashboardFilters.vue'
import DashboardDirectory from '@/components/dashboard/DashboardDirectory.vue'
import TodayOrdersCard from '@/components/dashboard/TodayOrdersCard.vue'
import { fmtDateTime } from '@/components/design/utils/format'
import { cx } from '@/components/design/utils'
import { useDashboardData } from '@/composables/useDashboardData'
import { businessPreset } from '@/composables/useBusinessDay'

const { t } = useI18n({ useScope: 'global' })

const {
  shared: sharedDash,
  loading: sharedLoading,
  error: sharedError,
  lastFetchedAt,
  fetchShared,
} = useDashboardData()

// ---------- View registry ----------
type ViewId = 'exec' | 'sales' | 'products' | 'staff' | 'operations'

interface DashView {
  id: ViewId
  labelKey: string
  subtitleKey: string
  icon: string
  comp: Component
}

const DASH_VIEWS: DashView[] = [
  {
    id: 'exec',
    labelKey: 'Overview',
    subtitleKey: 'dash_subtitle_exec',
    icon: 'dashboard',
    comp: ExecutiveDashboard,
  },
  {
    id: 'sales',
    labelKey: 'Sales & Revenue',
    subtitleKey: 'dash_subtitle_sales',
    icon: 'trend',
    comp: SalesDashboard,
  },
  {
    id: 'products',
    labelKey: 'Products',
    subtitleKey: 'dash_subtitle_products',
    icon: 'box',
    comp: ProductsDashboard,
  },
  {
    id: 'staff',
    labelKey: 'Staff & Shifts',
    subtitleKey: 'dash_subtitle_staff',
    icon: 'users',
    comp: StaffDashboard,
  },
  { id: 'operations', labelKey: 'Operations', subtitleKey: 'dash_subtitle_operations', icon: 'table', comp: OperationsDashboard },
]

// ---------- State ----------
const view = ref<ViewId>('exec')
const localLoading = ref(false)
const pageRef = ref<HTMLElement | null>(null)
const { pending: requestsPending, hasFailures } = useDashboardRequests()
let sectionObserver: IntersectionObserver | undefined

// Seed a concrete 30-day window so the trigger label, the highlighted preset,
// and the fetched range all agree on first paint (was { from:'', to:'' } which
// left the picker highlighting "All time" while the label read "Last 30 days"
// and the shared fetch fell back to today).
const dateRange = ref<DateRangeValue>({ ...businessPreset('30d'), preset: '30d' })

// Loading flag the page exposes to the UI = either the hub-level shared
// fetch OR an in-flight manual refresh.
const loading = computed(() => localLoading.value || sharedLoading.value || requestsPending.value)

// ---------- Data-freshness clock ----------
// A restaurant floor manager keeps this screen up all shift, so "how old is
// this number?" matters. `now` ticks every 15s; the label recomputes off it.
const now = ref(Date.now())
let tickTimer: ReturnType<typeof setInterval> | undefined

const freshness = computed(() => {
  const at = lastFetchedAt.value
  if (!at)
    return ''
  const secs = Math.max(0, Math.round((now.value - at) / 1000))
  if (secs < 60)
    return t('Updated just now')
  const mins = Math.floor(secs / 60)
  if (mins < 60)
    return t('Updated {n} min ago', { n: mins })
  const hrs = Math.floor(mins / 60)
  return t('Updated {n} h ago', { n: hrs })
})

// ---------- Auto-refresh (live wall-board mode) ----------
// Opt-in polling so an unattended dashboard stays current without a human
// hitting Refresh. Paused while the tab is hidden to avoid burning API calls
// on a backgrounded screen; on return it catches up if the data went stale.
const AUTO_KEY = 'alphapos-dash-autorefresh'
const AUTO_INTERVAL_MS = 60_000
const autoRefresh = ref(readStoredAuto())
let autoTimer: ReturnType<typeof setInterval> | undefined

function readStoredAuto(): boolean {
  try { return localStorage.getItem(AUTO_KEY) === '1' }
  catch { return false }
}

// Silent (no toast) re-fetch used by the poller — a toast every 60s would nag.
function silentRefresh(): void {
  if (loading.value || (typeof document !== 'undefined' && document.visibilityState === 'hidden'))
    return
  loadShared()
}

function startAuto(): void {
  stopAuto()
  autoTimer = setInterval(silentRefresh, AUTO_INTERVAL_MS)
}

function stopAuto(): void {
  if (autoTimer) {
    clearInterval(autoTimer)
    autoTimer = undefined
  }
}

function toggleAuto(): void {
  autoRefresh.value = !autoRefresh.value
}

watch(autoRefresh, on => {
  try { localStorage.setItem(AUTO_KEY, on ? '1' : '0') }
  catch {}
  if (on) {
    startAuto()
    silentRefresh()
    toast.info(t('Auto-refresh on'), { description: t('Refreshing every {n}s', { n: AUTO_INTERVAL_MS / 1000 }) })
  }
  else {
    stopAuto()
  }
})

function onVisibility(): void {
  if (typeof document === 'undefined')
    return
  if (document.visibilityState === 'visible' && autoRefresh.value) {
    const at = lastFetchedAt.value
    if (!at || Date.now() - at > AUTO_INTERVAL_MS)
      silentRefresh()
  }
}

// ---------- Error surfacing ----------
// The shared fetch clears failed data. Never imply that unavailable totals are live.
const errorDismissed = ref(false)
const overviewStatus = ref<'loading' | 'ready' | 'error' | 'stale'>('loading')
function onReportStatus(section: ViewId, status: typeof overviewStatus.value) {
  if (section === 'exec')
    overviewStatus.value = status
}

watch(() => sharedError.value, e => {
  if (e)
    errorDismissed.value = false
})

// Overview owns its initial/stale recovery. A hub notice is only needed when
// its own snapshot failed while the separate Overview snapshot succeeded.
const showError = computed(() => !!sharedError.value && !errorDismissed.value && overviewStatus.value === 'ready')

// Keyboard shortcuts jump to sections; all content stays mounted and visible.
function onKey(e: KeyboardEvent): void {
  if (e.ctrlKey || e.metaKey || e.altKey)
    return
  const el = e.target as HTMLElement | null
  const tag = el?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable)
    return
  const idx = Number(e.key) - 1
  if (Number.isInteger(idx) && idx >= 0 && idx < DASH_VIEWS.length)
    selectView(DASH_VIEWS[idx].id)
}

const current = computed(() => DASH_VIEWS.find(v => v.id === view.value) ?? DASH_VIEWS[0])

// ---------- Hub-level shared fetch ----------
// Hits GET /dashboard?from&to when a range is selected, falls back to
// /dashboard/today when no range provided. Shape verified against
// alpha_pos_server/admins/services/dashboard_service.py:get_range() /
// get_today() — same `{ success, data }` envelope. Stored into the
// shared composable so any sub-dashboard can opt in via
// `useDashboardData()` without re-fetching.
async function loadShared(): Promise<boolean> {
  return fetchShared({
    from: dateRange.value?.from ?? '',
    to: dateRange.value?.to ?? '',
    preset: dateRange.value?.preset,
    fromTime: dateRange.value?.fromTime,
    toTime: dateRange.value?.toTime,
  })
}

watch(
  () => [dateRange.value?.from, dateRange.value?.to, dateRange.value?.fromTime, dateRange.value?.toTime],
  () => { loadShared() },
)

onMounted(() => {
  sectionObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting)
        view.value = entry.target.classList.contains('dashboard-header') ? 'exec' : (entry.target as HTMLElement).dataset.section as ViewId
    }
  }, { rootMargin: '-130px 0px -65% 0px', threshold: 0 })
  pageRef.value?.querySelectorAll('[data-section], .dashboard-header').forEach(section => sectionObserver?.observe(section))
  tickTimer = setInterval(() => { now.value = Date.now() }, 15_000)
  if (autoRefresh.value)
    startAuto()
  window.addEventListener('keydown', onKey)
  document.addEventListener('visibilitychange', onVisibility)
})

onUnmounted(() => {
  sectionObserver?.disconnect()
  if (tickTimer)
    clearInterval(tickTimer)
  stopAuto()
  window.removeEventListener('keydown', onKey)
  document.removeEventListener('visibilitychange', onVisibility)
})

// Seed the shared range before the child sections mount to avoid duplicate loads.
loadShared()

// Push the current dashboard context to the AI assistant so /ai/query knows
// which sub-dashboard + date range the user is looking at when they ask
// "Why did Wednesday dip?". Re-pushes on view / range change.
const aiCtx = useAIPageContext()

watch(
  () => [view.value, dateRange.value?.from, dateRange.value?.to],
  () => {
    const v = current.value

    aiCtx.set({
      route: '/dashboard',
      route_label: `${t(v.labelKey)} dashboard`,
      range_from: dateRange.value?.from || undefined,
      range_to: dateRange.value?.to || undefined,
      filters: { section: v.id, layout: 'continuous' },
      visible_data_keys: ['revenue', 'orders', 'paid_orders', 'units_sold', 'grossMargin', 'revenue30', 'expense30', 'channelDays', 'top_products', 'affinity', 'leaderboard', 'hours_worked', 'funnel', 'tableGrid'],
    })
  },
  { immediate: true },
)
onUnmounted(() => { aiCtx.clear() })

// ---------- Actions ----------
function selectView(id: ViewId) {
  view.value = id

  const section = document.getElementById(`dashboard-${id}`)

  section?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
  section?.focus({ preventScroll: true })
}

function backToTop() {
  view.value = 'exec'
  window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  pageRef.value?.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true })
}

async function refresh() {
  if (loading.value)
    return
  localLoading.value = true
  try {
    const refreshed = await loadShared()

    await nextTick()
    await settleDashboardRequests()
    if (!refreshed)
      throw new Error('Dashboard refresh failed')
    if (hasFailures.value) {
      toast.warning(t('dash_partial_refresh'), { description: t('dash_partial_refresh_body') })
      return
    }
    toast.success(t('Dashboard refreshed'), {
      description: t('Updated {datetime}', { datetime: fmtDateTime(new Date()) }),
    })
  }
  catch {
    toast.error(t('Could not refresh dashboard'), {
      id: 'dashboard-load',
      duration: 7000,
      description: t('Check your connection and try again.'),
      action: {
        label: t('Retry'),
        onClick: () => { refresh() },
      },
    })
  }
  finally {
    localLoading.value = false
  }
}

// CSV export of the current dashboard's headline metrics. Writes a UTF-8 BOM so
// Excel on Russian / Uzbek Windows opens the file with the correct encoding.
// One row per metric — keeps the file readable when copy-pasted into a chat.
function headlineRows(d: any): [string, unknown][] {
  return [
    [t('Generated'), fmtDateTime(new Date())],
    [t('Range'), d.range ? `${d.range.from ?? ''} → ${d.range.to ?? ''}` : t('Today')],
    [t('View'), t('Dashboards')],
    [t('Revenue'), d.revenue ?? d.today?.revenue ?? ''],
    [t('Orders'), d.orders ?? d.today?.orders ?? ''],
    [t('Paid orders'), d.paid_orders ?? d.today?.paid_orders ?? ''],
    [t('Cancelled orders'), d.cancelled ?? d.today?.cancelled ?? ''],
    [t('Units sold'), d.units_sold ?? d.today?.units_sold ?? ''],
  ]
}

function exportCsv() {
  const d = sharedDash.value as any
  if (!d) {
    toast.warning(t('Nothing to export yet'), { description: t('Wait for the dashboard to load first') })
    return
  }

  const rows = headlineRows(d)
  const breakdown = d.payment_breakdown ?? d.payment_breakdown_today ?? {}
  for (const [k, v] of Object.entries(breakdown).filter(([, value]) => typeof value !== 'object'))
    rows.push([`${t('Payment')} · ${k}`, v as any])
  const tops = d.top_products ?? d.top_products_today ?? []
  for (const tp of (tops as any[]).slice(0, 10))
    rows.push([`${t('Top product')} · ${tp.product_name ?? tp.name ?? ''}`, tp.revenue ?? tp.quantity ?? ''])
  const csv = `\uFEFF${rows.map(r => `"${String(r[0]).replace(/"/g, '""')}","${String(r[1] ?? '').replace(/"/g, '""')}"`).join('\n')}\n`
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const stamp = new Date().toISOString().slice(0, 10)

  a.href = url
  a.download = `dashboard-${stamp}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  toast.success(t('Exported'), { description: `dashboard-${stamp}.csv` })
}
</script>

<template>
  <div
    ref="pageRef"
    class="page dashboard-page"
  >
    <header class="dashboard-header">
      <div class="dashboard-header__intro">
        <h1 tabindex="-1">
          {{ t('Dashboards') }}
        </h1>
        <p>{{ t('dash_full_subtitle') }}</p>
      </div>
      <TodayOrdersCard />
      <div class="dashboard-header__right">
        <span
          v-if="freshness"
          class="dashboard-fresh"
          :class="{ 'is-partial': hasFailures }"
          :title="t('Last updated')"
        >
          <span class="dashboard-fresh__dot" />{{ loading ? t('dash_updating') : hasFailures ? t('dash_partial_refresh') : freshness }}
        </span>
        <div class="dashboard-header__actions">
          <Button
            variant="secondary"
            icon="refresh"
            :loading="loading"
            :aria-label="t('Refresh')"
            @click="refresh"
          >
            {{ t('Refresh') }}
          </Button>
          <Button
            variant="primary"
            icon="download"
            :disabled="loading"
            :aria-label="t('Export')"
            @click="exportCsv"
          >
            {{ t('Export') }}
          </Button>
        </div>
      </div>
    </header>

    <div class="dashboard-controls">
      <DashboardFilters v-model="dateRange" />
    </div>

    <div class="dashboard-toolbar">
      <DashboardDirectory
        :sections="DASH_VIEWS"
        :current="view"
        @select="selectView($event as ViewId)"
      />
      <span class="dashboard-toolbar__period">{{ t('dash_selected_period') }}</span>
      <Button
        variant="secondary"
        :class="cx('dashboard-auto', autoRefresh && 'is-on')"
        :icon="autoRefresh ? 'pause' : 'play'"
        :aria-pressed="autoRefresh"
        :title="autoRefresh ? t('Auto-refresh on') : t('Auto-refresh off')"
        :aria-label="autoRefresh ? t('Auto-refresh on') : t('Auto-refresh off')"
        @click="toggleAuto"
      >
        <span>{{ t('dash_auto') }}</span>
      </Button>
    </div>

    <div
      v-if="showError"
      class="dash-errbar"
      role="alert"
    >
      <DesignIcon
        name="alert"
        :size="18"
      />
      <div class="dash-errbar__body">
        <strong>{{ t('Could not load dashboard') }}</strong><p>{{ t('Check your connection and try again.') }}</p>
      </div>
      <Button
        variant="secondary"
        size="sm"
        icon="retry"
        :loading="loading"
        @click="refresh"
      >
        {{ t('Retry') }}
      </Button>
      <button
        type="button"
        class="dash-errbar__x"
        :aria-label="t('Dismiss')"
        @click="errorDismissed = true"
      >
        <DesignIcon
          name="close"
          :size="16"
        />
      </button>
    </div>

    <section
      v-for="section in DASH_VIEWS"
      :id="`dashboard-${section.id}`"
      :key="section.id"
      class="dashboard-section"
      :class="`dashboard-section--${section.id}`"
      :data-section="section.id"
      tabindex="-1"
      :aria-labelledby="`dashboard-title-${section.id}`"
    >
      <header class="dashboard-section__head">
        <div>
          <h2 :id="`dashboard-title-${section.id}`">
            {{ t(section.labelKey) }}
          </h2><p>{{ t(section.subtitleKey) }}</p>
        </div>
        <button
          class="dashboard-section__up"
          type="button"
          :aria-label="t('dash_back_to_top')"
          @click="backToTop"
        >
          <DesignIcon
            name="arrowup"
            :size="18"
          />
        </button>
      </header>
      <Component
        :is="section.comp"
        embedded
        @report-status="onReportStatus(section.id, $event)"
      />
    </section>
    <footer class="dashboard-footer">
      <span>Alpha POS</span><span>{{ t('dash_full_subtitle') }}</span><a
        href="#dashboard-exec"
        @click.prevent="backToTop"
      >{{ t('dash_back_to_top') }}<DesignIcon
        name="arrowup"
        :size="14"
      /></a>
    </footer>
  </div>
</template>

<route lang="yaml">
meta:
  action: manage
  subject: all
</route>
