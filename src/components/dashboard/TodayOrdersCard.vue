<script setup lang="ts">
import DesignIcon from '@/components/design/DesignIcon.vue'
import { fmtNum } from '@/components/design/utils/format'
import { useDashboardData } from '@/composables/useDashboardData'

const { t } = useI18n({ useScope: 'global' })
const { today, todayLoading, todayError, fetchToday } = useDashboardData()

const count = computed(() => {
  const raw = today.value?.today?.orders

  if (raw === undefined || raw === null || String(raw).trim() === '')
    return null
  const value = Number(raw)

  return (Number.isSafeInteger(value) && value >= 0) ? value : null
})
</script>

<template>
  <aside
    class="today-orders"
    :aria-label="t(`Today's Orders`)"
    :aria-busy="todayLoading"
  >
    <span class="today-orders__icon"><DesignIcon
      name="receipt"
      :size="20"
    /></span>
    <div class="today-orders__body">
      <span class="today-orders__label">{{ t(`Today's Orders`) }}</span>
      <span
        v-if="todayLoading && count === null"
        class="today-orders__skeleton"
        :aria-label="t('Loading')"
      />
      <strong
        v-else
        class="today-orders__count"
      >{{ count === null ? '—' : fmtNum(count) }}</strong>
      <span class="today-orders__note">{{ todayError ? t('dash_today_unavailable') : count === null && !todayLoading ? t('No data') : t('dash_today_business_day') }}</span>
    </div>
    <button
      v-if="!todayLoading && (todayError || count === null)"
      type="button"
      :aria-label="t('Retry')"
      @click="fetchToday"
    >
      <DesignIcon
        name="refresh"
        :size="16"
      />
    </button>
  </aside>
</template>

<style scoped>
.today-orders { display: flex; align-items: center; gap: 12px; min-inline-size: 230px; padding: 12px 16px; border: 1px solid var(--dash-edge, var(--border)); border-radius: 16px; background: var(--surface); box-shadow: var(--dash-shadow, var(--shadow-xs)); }
.today-orders__icon { display: flex; color: var(--primary); flex-shrink: 0; }
.today-orders__body { flex: 1; min-inline-size: 0; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 16px; align-items: center; }
.today-orders__label { font-size: 12px; font-weight: 600; color: var(--text); }
.today-orders__count { grid-column: 2; grid-row: 1 / 3; font: 600 30px/1.15 var(--font-sans); letter-spacing: -.03em; font-variant-numeric: tabular-nums; color: var(--text); }
.today-orders__note { grid-column: 1; font-size: 10px; color: var(--text-secondary); line-height: 1.5; }
.today-orders__skeleton { grid-column: 2; grid-row: 1 / 3; display: block; block-size: 32px; inline-size: 48px; border-radius: 6px; background: var(--surface); }
.today-orders > button { display: grid; place-items: center; flex: 0 0 44px; block-size: 44px; border-radius: 8px; color: var(--primary); margin-inline-end: -8px; }
.today-orders > button:hover { background: var(--surface); }
.today-orders > button:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
@media (max-width: 650px) { .today-orders { min-inline-size: 0; padding: 10px 14px; } .today-orders__count { font-size: 25px; } }
</style>
