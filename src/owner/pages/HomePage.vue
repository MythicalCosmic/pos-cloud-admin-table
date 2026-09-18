<script setup lang="ts">
import OwnerPage from '../components/OwnerPage.vue'
import { type TodaySales, getTodaySales, getWaitingExpenses } from '../services/ownerApi'
import { REFRESH_EVENT, ownerState } from '../state'
import Card from '@/components/design/Card.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import Segmented from '@/components/design/Segmented.vue'
import Skeleton from '@/components/design/Skeleton.vue'
import OwnerMoneySummary from '@/components/dashboard/OwnerMoneySummary.vue'
import { businessPreset } from '@/composables/useBusinessDay'
import { fmtNum } from '@/components/design/utils/format'

const { t } = useI18n({ useScope: 'global' })
const { translate } = useApiError()

const period = ref<'today' | 'month' | 'prevmonth'>('today')

const periods = computed(() => [
  { value: 'today', label: t('owner_app_period_today') },
  { value: 'month', label: t('owner_app_period_month') },
  { value: 'prevmonth', label: t('owner_app_period_last_month') },
])

const range = computed(() => businessPreset(period.value))

const sales = ref<TodaySales | null>(null)
const salesError = ref('')
const refreshing = ref(false)
const summaryKey = ref(0)

async function load() {
  salesError.value = ''
  try {
    const [today, waiting] = await Promise.all([getTodaySales(), getWaitingExpenses()])

    sales.value = today
    ownerState.pendingApprovals = waiting.pending.length + waiting.approved.length
  }
  catch (e) {
    salesError.value = translate(e)
  }
}

async function refresh() {
  refreshing.value = true
  summaryKey.value += 1
  await load()
  refreshing.value = false
}

const tenders = computed(() => {
  const p = sales.value?.payments

  return p
    ? [
      { key: 'cash', label: t('payment_method_CASH'), value: p.cash },
      { key: 'card', label: t('owner_app_card'), value: p.card },
      { key: 'payme', label: t('payment_method_PAYME'), value: p.payme },
    ]
    : []
})

const tenderTotal = computed(() => tenders.value.reduce((sum, row) => sum + row.value, 0) || 1)

onMounted(load)
useEventListener(window, REFRESH_EVENT, refresh)
</script>

<template>
  <OwnerPage
    :title="t('owner_app_tab_home')"
    :refreshing="refreshing"
    @refresh="refresh"
  >
    <Card class-name="owner-today">
      <div class="owner-today__head">
        <span class="owner-eyebrow">{{ t('owner_app_today_sales') }}</span>
        <RouterLink
          v-if="ownerState.pendingApprovals"
          to="/approvals"
          class="owner-today__pending"
        >
          <DesignIcon
            name="checkcircle"
            :size="15"
          />
          {{ t('owner_app_waiting_count', { n: ownerState.pendingApprovals }) }}
        </RouterLink>
      </div>
      <template v-if="sales">
        <strong class="owner-today__value">{{ fmtNum(Number(sales.revenue)) }} <small>UZS</small></strong>
        <div class="owner-today__stats">
          <span>{{ t('owner_app_paid_orders', { n: sales.paid_orders }) }}</span>
          <span v-if="sales.open">{{ t('owner_app_open_orders', { n: sales.open }) }}</span>
        </div>
        <div
          class="owner-today__bar"
          role="img"
          :aria-label="tenders.map(row => `${row.label} ${fmtNum(row.value)}`).join(', ')"
        >
          <span
            v-for="row in tenders"
            :key="row.key"
            :class="`is-${row.key}`"
            :style="{ width: `${(row.value / tenderTotal) * 100}%` }"
          />
        </div>
        <ul class="owner-today__legend">
          <li
            v-for="row in tenders"
            :key="row.key"
          >
            <i :class="`is-${row.key}`" />{{ row.label }} <b>{{ fmtNum(row.value) }}</b>
          </li>
        </ul>
      </template>
      <p
        v-else-if="salesError"
        class="owner-error"
        role="alert"
      >
        {{ salesError }}
      </p>
      <div
        v-else
        class="owner-today__loading"
      >
        <Skeleton
          w="60%"
          h="34"
        />
        <Skeleton
          w="100%"
          h="10"
        />
      </div>
    </Card>

    <div class="owner-period">
      <Segmented
        v-model="period"
        :options="periods"
      />
    </div>

    <OwnerMoneySummary
      :key="summaryKey"
      :range="range"
    />
  </OwnerPage>
</template>

<style scoped>
.owner-today { padding: 18px; display: grid; gap: 10px; }
.owner-today__head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.owner-today__pending { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 999px; background: var(--warning-weak); color: var(--warning-strong); font-size: 13px; font-weight: 600; text-decoration: none; }
.owner-today__value { color: var(--text); font-size: 32px; font-weight: 700; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; line-height: 1.1; }
.owner-today__value small { font-size: 14px; font-weight: 600; color: var(--text-secondary); }
.owner-today__stats { display: flex; flex-wrap: wrap; gap: 6px 14px; color: var(--text-secondary); font-size: 14px; }
.owner-today__bar { display: flex; height: 10px; overflow: hidden; border-radius: 999px; background: var(--surface-2); }
.owner-today__bar span { min-width: 0; }
.is-cash { background: var(--c1, var(--primary)); }
.is-card { background: var(--c2, var(--info)); }
.is-payme { background: var(--c3, var(--success)); }
.owner-today__legend { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; font-size: 14px; }
.owner-today__legend li { display: flex; align-items: center; gap: 8px; color: var(--text-secondary); }
.owner-today__legend li b { margin-left: auto; color: var(--text); font-variant-numeric: tabular-nums; }
.owner-today__legend i { width: 10px; height: 10px; border-radius: 3px; }
.owner-today__loading { display: grid; gap: 10px; }
.owner-period { margin: 16px 0 12px; display: flex; }
.owner-period :deep(.seg) { width: 100%; }
</style>
