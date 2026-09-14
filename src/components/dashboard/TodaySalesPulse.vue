<script setup lang="ts">
import Button from '@/components/design/Button.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import { fmtNum } from '@/components/design/utils/format'
import { useDashboardData } from '@/composables/useDashboardData'
import { useFormatters } from '@/composables/useFormatters'

const { t } = useI18n({ useScope: 'global' })
const { formatCurrency } = useFormatters()
const { today, todayLoading, todayError, fetchToday } = useDashboardData()

function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === '')
    return null
  const result = Number(value)

  return (Number.isFinite(result) && result >= 0) ? result : null
}

const todayOrders = computed(() => optionalNumber(today.value?.today?.orders))

const peak = computed(() => {
  const raw = today.value?.today?.peak_hour
  if (raw !== null && typeof raw === 'object') {
    return {
      hour: optionalNumber(raw.hour),
      orders: optionalNumber(raw.orders),
      revenue: optionalNumber(raw.revenue),
    }
  }

  return { hour: optionalNumber(raw), orders: null, revenue: null }
})

const peakWindow = computed(() => {
  if (peak.value.hour === null)
    return null
  const hour = Math.min(23, Math.floor(peak.value.hour))

  return `${String(hour).padStart(2, '0')}:00–${String((hour + 1) % 24).padStart(2, '0')}:00`
})

const bestProduct = computed(() => {
  const row = today.value?.top_products_today?.[0]
  const name = String(row?.product_name ?? '').trim()
  if (!row || !name)
    return null

  return {
    name,
    quantity: optionalNumber(row.quantity ?? row.qty_sold),
    revenue: optionalNumber(row.revenue),
  }
})

const hasNoSales = computed(() => todayOrders.value === 0)

const peakNote = computed(() => {
  if (peak.value.orders !== null && peak.value.revenue !== null)
    return t('{orders} orders · {revenue} UZS', { orders: fmtNum(peak.value.orders), revenue: formatCurrency(peak.value.revenue) })
  if (peak.value.orders !== null)
    return t('{count} orders', { count: fmtNum(peak.value.orders) })
  if (peak.value.revenue !== null)
    return `${formatCurrency(peak.value.revenue)} UZS`
  if (hasNoSales.value)
    return t('No completed sales yet today')
  return peakWindow.value ? t('Busiest sales window today') : t('Peak hour is unavailable')
})

const productNote = computed(() => {
  if (!bestProduct.value)
    return hasNoSales.value ? t('No completed sales yet today') : t('Best product is unavailable')

  const details = []
  if (bestProduct.value.quantity !== null)
    details.push(t('{count} sold', { count: fmtNum(bestProduct.value.quantity) }))
  if (bestProduct.value.revenue !== null)
    details.push(`${formatCurrency(bestProduct.value.revenue)} UZS`)

  return details.join(' · ') || t('Best-selling product today')
})
</script>

<template>
  <section
    class="today-pulse"
    :aria-label="t('Today at a glance')"
    :aria-busy="todayLoading"
  >
    <header class="today-pulse__head">
      <span class="today-pulse__symbol"><DesignIcon
        name="sparkle"
        :size="19"
      /></span>
      <div>
        <p>{{ t('Live today') }}</p>
        <h2>{{ t('Today at a glance') }}</h2>
      </div>
      <span class="today-pulse__scope"><i />{{ t('Business day') }}</span>
    </header>

    <div
      v-if="todayLoading && !today"
      class="today-pulse__loading"
      role="status"
      :aria-label="t('Loading')"
    >
      <span /><span />
    </div>

    <div
      v-else
      class="today-pulse__grid"
    >
      <article class="today-pulse__insight today-pulse__insight--peak">
        <span class="today-pulse__icon"><DesignIcon
          name="clock"
          :size="21"
        /></span>
        <div class="today-pulse__body">
          <span>{{ t('Peak sales hour') }}</span>
          <strong>{{ peakWindow ?? '—' }}</strong>
          <p>{{ peakNote }}</p>
        </div>
        <span
          v-if="peakWindow"
          class="today-pulse__tag"
        >{{ t('Peak') }}</span>
      </article>

      <article class="today-pulse__insight today-pulse__insight--product">
        <span class="today-pulse__icon"><DesignIcon
          name="star"
          :size="21"
        /></span>
        <div class="today-pulse__body">
          <span>{{ t('Best-selling product today') }}</span>
          <strong>{{ bestProduct?.name ?? '—' }}</strong>
          <p>{{ productNote }}</p>
        </div>
        <RouterLink
          to="/analytics/product-statistics"
          :aria-label="t('Open product analytics')"
        >
          <DesignIcon
            name="arrowright"
            :size="17"
          />
        </RouterLink>
      </article>
    </div>

    <div
      v-if="todayError"
      class="today-pulse__error"
      role="alert"
    >
      <DesignIcon
        name="alert"
        :size="16"
      />
      <span>{{ t('Today’s sales insights are unavailable') }}</span>
      <Button
        size="sm"
        :loading="todayLoading"
        @click="fetchToday"
      >
        {{ t('Retry') }}
      </Button>
    </div>
  </section>
</template>

<style scoped>
.today-pulse { overflow: hidden; border: 1px solid color-mix(in srgb, var(--primary) 24%, var(--dash-edge)); border-radius: 20px; background: var(--surface); box-shadow: var(--dash-shadow); }
.today-pulse__head { display: flex; align-items: center; gap: 11px; padding: 15px 17px; border-bottom: 1px solid var(--dash-edge); }
.today-pulse__symbol { display: grid; flex: 0 0 38px; inline-size: 38px; block-size: 38px; place-items: center; border-radius: 12px; color: var(--primary); background: var(--primary-weak); }
.today-pulse__head > div { min-inline-size: 0; }
.today-pulse__head p, .today-pulse__head h2 { margin: 0; }
.today-pulse__head p { color: var(--primary); font-size: 9px; font-weight: 800; letter-spacing: .13em; text-transform: uppercase; }
.today-pulse__head h2 { margin-block-start: 2px; font-size: 16px; font-weight: 650; letter-spacing: -.02em; }
.today-pulse__scope { display: inline-flex; align-items: center; gap: 6px; margin-inline-start: auto; color: var(--text-secondary); font-size: 11px; }
.today-pulse__scope i { inline-size: 6px; block-size: 6px; border-radius: 50%; background: var(--success); box-shadow: 0 0 0 4px var(--success-weak); }
.today-pulse__grid, .today-pulse__loading { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.today-pulse__insight { position: relative; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 13px; min-inline-size: 0; padding: 20px 18px; }
.today-pulse__insight + .today-pulse__insight { border-inline-start: 1px solid var(--dash-edge); }
.today-pulse__icon { display: grid; inline-size: 44px; block-size: 44px; place-items: center; border-radius: 14px; color: var(--c4); background: color-mix(in srgb, var(--c4) 11%, var(--surface)); }
.today-pulse__insight--product .today-pulse__icon { color: var(--primary); background: var(--primary-weak); }
.today-pulse__body { display: grid; min-inline-size: 0; gap: 3px; }
.today-pulse__body > span { color: var(--text-secondary); font-size: 11px; font-weight: 560; }
.today-pulse__body strong { max-inline-size: 100%; font-size: clamp(21px, 2.1vw, 30px); font-weight: 650; letter-spacing: -.035em; line-height: 1.2; overflow-wrap: anywhere; }
.today-pulse__insight--peak .today-pulse__body strong { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
.today-pulse__body p { margin: 0; color: var(--text-tertiary); font-size: 10px; line-height: 1.5; }
.today-pulse__tag { align-self: start; padding: 5px 8px; border-radius: 9px; color: var(--warning-strong); background: var(--warning-weak); font-size: 9px; font-weight: 750; letter-spacing: .08em; text-transform: uppercase; }
.today-pulse__insight > a { display: grid; inline-size: 40px; block-size: 40px; place-items: center; border-radius: 12px; color: var(--primary); text-decoration: none; }
.today-pulse__insight > a:hover { background: var(--primary-weak); }
.today-pulse__insight > a:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
.today-pulse__loading { gap: 1px; background: var(--dash-edge); }
.today-pulse__loading span { position: relative; overflow: hidden; block-size: 104px; background: var(--surface-2); }
.today-pulse__loading span::after { position: absolute; background: color-mix(in srgb, var(--surface) 58%, transparent); content: ''; inset: 0; animation: pulse-loading 1.3s ease-in-out infinite; }
.today-pulse__error { display: flex; align-items: center; gap: 8px; padding: 10px 17px; border-top: 1px solid var(--error-border); color: var(--error-strong); background: var(--error-weak); font-size: 11px; }
.today-pulse__error span { flex: 1; }
@keyframes pulse-loading { 50% { opacity: .35; } }
@media (max-width: 720px) {
  .today-pulse__grid, .today-pulse__loading { grid-template-columns: minmax(0, 1fr); }
  .today-pulse__insight + .today-pulse__insight { border-block-start: 1px solid var(--dash-edge); border-inline-start: 0; }
  .today-pulse__insight { padding: 16px; }
  .today-pulse__body strong { font-size: 22px; }
  .today-pulse__error { align-items: flex-start; flex-wrap: wrap; }
  .today-pulse__error :deep(.btn) { inline-size: 100%; }
}
@media (prefers-reduced-motion: reduce) { .today-pulse__loading span::after { animation: none; } }
</style>
