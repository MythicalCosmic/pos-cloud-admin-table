<script setup lang="ts">
import Button from '@/components/design/Button.vue'
import Card from '@/components/design/Card.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import Skeleton from '@/components/design/Skeleton.vue'
import { useApiError } from '@/composables/useApiError'
import { useFormatters } from '@/composables/useFormatters'
import { fetchCashPosition } from '@/services/moneyControlApi'
import type { CashPosition, CashPositionMonthlyCostRow } from '@/types/moneyControl'

const { t, locale } = useI18n({ useScope: 'global' })
const { formatCurrency } = useFormatters()
const { translate: translateError } = useApiError()

const position = shallowRef<CashPosition | null>(null)
const loading = ref(false)
const loadError = shallowRef<unknown>(null)

const GROUPS: Record<string, { label: string; icon: string; tone: string }> = {
  RENT: { label: 'moneyControl.costGroupRent', icon: 'bxs-building-house', tone: 'rent' },
  UTILITIES: { label: 'moneyControl.costGroupUtilities', icon: 'bxs-bulb', tone: 'utilities' },
  TAXES: { label: 'moneyControl.costGroupTaxes', icon: 'document', tone: 'taxes' },
  OPERATING: { label: 'moneyControl.costGroupOperating', icon: 'settings', tone: 'operating' },
}

async function load() {
  loading.value = true
  loadError.value = null
  try {
    position.value = await fetchCashPosition()
  }
  catch (error) {
    loadError.value = error
  }
  finally {
    loading.value = false
  }
}

onMounted(load)

function num(value: unknown): number {
  return typeof value === 'number' ? value : (Number(value ?? 0) || 0)
}

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.max(0, Math.min(100, (part / whole) * 100)) : 0
}

const LOCALE_TAGS: Record<string, string> = { en: 'en-GB', ru: 'ru-RU', uz: 'uz-Latn-UZ' }

/** "September" for a YYYY-MM-DD date, in the interface language. */
function monthName(isoDate: string | null | undefined): string {
  if (!isoDate)
    return ''
  const [year, month] = isoDate.split('-').map(Number)
  if (!year || !month)
    return ''

  const name = new Intl.DateTimeFormat(LOCALE_TAGS[String(locale.value)] ?? 'en-GB', { month: 'long', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, 1)))

  return name.charAt(0).toLocaleUpperCase() + name.slice(1)
}

const days = computed(() => {
  const calculation = position.value?.calculation
  const elapsed = calculation?.elapsedDays ?? 0
  const total = calculation?.currentMonthDays ?? 0

  return { elapsed, total, left: Math.max(total - elapsed, 0), share: pct(elapsed, total) }
})

const currentMonth = computed(() => monthName(position.value?.calculation?.asOfDate ?? position.value?.asOf?.slice(0, 10)))

/** Where a bill's plan comes from, in words the owner can check. */
function planSource(rows: CashPositionMonthlyCostRow[]): string {
  const history = rows.filter(row => row.basis === 'PREVIOUS_MONTH_ACTUAL')
  const fixed = rows.length - history.length
  const month = monthName(history[0]?.startDate)
  if (!history.length)
    return t('bills_source_fixed')
  if (!fixed)
    return t('bills_source_last_month', { month })

  return t('bills_source_mixed', { month })
}

type BillStatus = 'paid' | 'partial' | 'unpaid'

/** Every monthly bill as a balance: planned, already paid, still to pay. */
const bills = computed(() => {
  const costs = position.value?.monthlyCosts
  if (!costs)
    return []

  return costs.groups.map(group => {
    const meta = GROUPS[group.reportingGroup] ?? GROUPS.OPERATING
    const planned = num(group.plannedMonthlyUzs)
    const paid = num(group.paidCurrentPeriodUzs)
    const rows = costs.rows.filter(row => group.rowKeys.includes(row.rowKey))
    const status: BillStatus = (planned > 0 && paid >= planned) ? 'paid' : (paid > 0 ? 'partial' : 'unpaid')

    return {
      key: group.reportingGroup,
      label: t(meta.label),
      icon: meta.icon,
      tone: meta.tone,
      planned,
      paid,
      left: num(group.remainingUzs),
      byToday: num(group.accruedToDateUzs),
      paidShare: pct(paid, planned),
      status,
      source: planSource(rows),
      items: rows
        .map(row => ({ key: row.rowKey, name: row.name, monthly: num(row.monthlyBaselineUzs) }))
        .sort((a, b) => b.monthly - a.monthly),
    }
  })
})

const totals = computed(() => ({
  planned: bills.value.reduce((sum, bill) => sum + bill.planned, 0),
  paid: bills.value.reduce((sum, bill) => sum + bill.paid, 0),
  left: bills.value.reduce((sum, bill) => sum + bill.left, 0),
}))

const STATUS_LABELS: Record<BillStatus, string> = {
  paid: 'bills_status_paid',
  partial: 'bills_status_partial',
  unpaid: 'bills_status_unpaid',
}
</script>

<template>
  <Card
    class="bills"
    aria-labelledby="bills-title"
  >
    <header class="bills__head">
      <span class="bills__symbol">
        <DesignIcon
          name="receipt"
          :size="20"
        />
      </span>
      <div class="bills__heading">
        <h2 id="bills-title">
          {{ t('bills_title') }}<template v-if="currentMonth">
            · {{ currentMonth }}
          </template>
        </h2>
        <p v-if="days.total">
          {{ t('bills_month_progress', { elapsed: days.elapsed, total: days.total, left: days.left }) }}
        </p>
      </div>
      <RouterLink
        class="bills__manage"
        to="/money-control"
      >
        {{ t('bills_set_fixed') }}
        <DesignIcon
          name="chevright"
          :size="14"
        />
      </RouterLink>
    </header>

    <div
      v-if="days.total"
      class="bills__month"
      role="progressbar"
      :aria-valuenow="days.elapsed"
      :aria-valuemin="0"
      :aria-valuemax="days.total"
      :aria-label="t('bills_month_progress', { elapsed: days.elapsed, total: days.total, left: days.left })"
    >
      <i :style="{ width: `${days.share}%` }" />
    </div>

    <div
      v-if="loadError && !position"
      class="bills__error"
      role="alert"
    >
      <DesignIcon
        name="alert"
        :size="18"
      />
      <span>{{ translateError(loadError) }}</span>
      <Button
        size="sm"
        icon="retry"
        :loading="loading"
        @click="load"
      >
        {{ t('Retry') }}
      </Button>
    </div>

    <div
      v-else-if="!position"
      class="bills__grid"
      aria-hidden="true"
    >
      <Skeleton
        v-for="index in 3"
        :key="index"
        class="bills__skeleton"
      />
    </div>

    <div
      v-else-if="!bills.length"
      class="bills__empty"
    >
      <p>{{ t('bills_empty') }}</p>
      <RouterLink to="/money-control">
        {{ t('bills_add') }}
      </RouterLink>
    </div>

    <template v-else>
      <dl class="bills__summary">
        <div>
          <dt>{{ t('bills_total_planned') }}</dt>
          <dd>{{ formatCurrency(totals.planned) }}</dd>
        </div>
        <div class="is-paid">
          <dt>{{ t('bills_total_paid') }}</dt>
          <dd>{{ formatCurrency(totals.paid) }}</dd>
        </div>
        <div class="is-left">
          <dt>{{ t('bills_total_left') }}</dt>
          <dd>{{ formatCurrency(totals.left) }}</dd>
        </div>
      </dl>

      <ul class="bills__grid">
        <li
          v-for="bill in bills"
          :key="bill.key"
          class="bill"
          :class="[`tone-${bill.tone}`, `is-${bill.status}`]"
        >
          <div class="bill__head">
            <span class="bill__icon">
              <DesignIcon
                :name="bill.icon"
                :size="18"
              />
            </span>
            <div class="bill__title">
              <strong>{{ bill.label }}</strong>
              <span>{{ bill.source }}</span>
            </div>
            <span class="bill__chip">{{ t(STATUS_LABELS[bill.status]) }}</span>
          </div>

          <div class="bill__amount">
            <span>{{ t('bills_total_left') }}</span>
            <strong>{{ formatCurrency(bill.left) }}</strong>
          </div>

          <div
            class="bill__track"
            role="progressbar"
            :aria-valuenow="Math.round(bill.paidShare)"
            :aria-valuemin="0"
            :aria-valuemax="100"
            :aria-label="t('bills_paid_of', { paid: formatCurrency(bill.paid), planned: formatCurrency(bill.planned) })"
          >
            <i :style="{ width: `${bill.paidShare}%` }" />
            <b
              v-if="days.total"
              :style="{ left: `${days.share}%` }"
              :title="t('bills_today_marker', { amount: formatCurrency(bill.byToday) })"
            />
          </div>
          <p class="bill__meta">
            {{ t('bills_paid_of', { paid: formatCurrency(bill.paid), planned: formatCurrency(bill.planned) }) }}
          </p>

          <ul
            v-if="bill.items.length"
            class="bill__items"
          >
            <li
              v-for="item in bill.items"
              :key="item.key"
            >
              <span>{{ item.name }}</span>
              <span>{{ formatCurrency(item.monthly) }}</span>
            </li>
          </ul>
        </li>
      </ul>

      <p class="bills__note">
        <DesignIcon
          name="info"
          :size="14"
        />
        <span>{{ t('bills_explain') }}</span>
      </p>
    </template>
  </Card>
</template>

<style scoped>
.bills { display: grid; gap: 16px; padding: 20px; }

.bills__head { display: flex; align-items: center; gap: 12px; }
.bills__symbol { display: grid; flex: none; place-items: center; width: 40px; height: 40px; border-radius: var(--r-md); background: var(--primary); color: var(--on-primary, #fff); }
.bills__heading { flex: 1; min-width: 0; }
.bills__heading h2 { margin: 0; font-size: 17px; font-weight: 650; line-height: 1.3; }
.bills__heading p { margin: 2px 0 0; color: var(--text-secondary); font-size: 12px; }
.bills__manage { display: inline-flex; flex: none; align-items: center; gap: 2px; min-height: 32px; padding: 0 10px; border: 1px solid var(--border); border-radius: var(--r-pill); color: var(--primary); font-size: 12px; font-weight: 600; text-decoration: none; }
.bills__manage:hover { border-color: var(--primary); background: var(--primary-weak); }
.bills__manage:focus-visible { outline: none; box-shadow: var(--shadow-focus); }

.bills__month { height: 6px; border-radius: var(--r-pill); background: var(--surface-inset); overflow: hidden; }
.bills__month > i { display: block; height: 100%; border-radius: inherit; background: color-mix(in srgb, var(--primary) 55%, transparent); }

.bills__error { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 12px; border: 1px solid var(--error-border); border-radius: var(--r-lg); background: var(--error-weak); color: var(--error-strong); font-size: 13px; }
.bills__error span { flex: 1; min-width: 200px; }
.bills__empty { display: grid; gap: 6px; padding: 16px; border: 1px dashed var(--border); border-radius: var(--r-lg); color: var(--text-secondary); font-size: 13px; }
.bills__empty p { margin: 0; }
.bills__empty a { color: var(--primary); font-weight: 600; text-decoration: none; }

.bills__summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin: 0; border: 1px solid var(--border); border-radius: var(--r-lg); background: var(--surface-2); overflow: hidden; }
.bills__summary > div { display: grid; gap: 4px; padding: 12px 14px; min-width: 0; }
.bills__summary > div + div { border-left: 1px solid var(--border); }
.bills__summary dt { color: var(--text-secondary); font-size: 12px; font-weight: 500; }
.bills__summary dd { margin: 0; font-family: var(--font-mono); font-size: 18px; font-weight: 650; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.bills__summary .is-paid dd { color: var(--success-strong, var(--success)); }
.bills__summary .is-left { background: var(--warning-weak); }
.bills__summary .is-left dd { color: var(--warning-strong); font-size: 20px; }

.bills__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 12px; margin: 0; padding: 0; list-style: none; }
.bills__skeleton { min-height: 150px; border-radius: var(--r-lg); }

.bill { --tone: var(--c1); display: flex; flex-direction: column; gap: 10px; padding: 14px; border: 1px solid var(--border); border-radius: var(--r-lg); background: var(--surface); box-shadow: var(--shadow-xs); }
.bill.tone-utilities { --tone: var(--c4); }
.bill.tone-taxes { --tone: var(--c3); }
.bill.tone-operating { --tone: var(--c2); }

.bill__head { display: flex; align-items: flex-start; gap: 10px; }
.bill__icon { display: grid; flex: none; place-items: center; width: 34px; height: 34px; border-radius: var(--r-md); background: color-mix(in srgb, var(--tone) 16%, var(--surface)); color: var(--tone); }
.bill__title { display: grid; flex: 1; min-width: 0; gap: 1px; }
.bill__title strong { font-size: 14px; font-weight: 650; }
.bill__title span { color: var(--text-tertiary); font-size: 11px; line-height: 1.35; }
.bill__chip { flex: none; padding: 3px 8px; border-radius: var(--r-pill); font-size: 11px; font-weight: 600; white-space: nowrap; }
.bill.is-paid .bill__chip { background: var(--success-weak); color: var(--success-strong, var(--success)); }
.bill.is-partial .bill__chip { background: var(--primary-weak); color: var(--primary); }
.bill.is-unpaid .bill__chip { background: var(--warning-weak); color: var(--warning-strong); }

.bill__amount { display: grid; gap: 1px; }
.bill__amount span { color: var(--text-secondary); font-size: 11px; }
.bill__amount strong { font-family: var(--font-mono); font-size: 20px; font-weight: 650; font-variant-numeric: tabular-nums; }
.bill.is-paid .bill__amount strong { color: var(--success-strong, var(--success)); }

.bill__track { position: relative; height: 8px; border-radius: var(--r-pill); background: var(--surface-inset); }
.bill__track > i { display: block; height: 100%; border-radius: inherit; background: var(--tone); }
.bill.is-paid .bill__track > i { background: var(--success); }
.bill__track > b { position: absolute; top: -3px; bottom: -3px; width: 2px; margin-left: -1px; border-radius: 1px; background: var(--text); opacity: 0.55; }
.bill__meta { margin: 0; color: var(--text-secondary); font-size: 12px; font-variant-numeric: tabular-nums; }

.bill__items { display: grid; gap: 4px; margin: 2px 0 0; padding: 10px 0 0; border-top: 1px dashed var(--border); list-style: none; }
.bill__items li { display: flex; justify-content: space-between; gap: 12px; color: var(--text-secondary); font-size: 12px; }
.bill__items li span:last-child { color: var(--text); font-family: var(--font-mono); font-variant-numeric: tabular-nums; white-space: nowrap; }

.bills__note { display: flex; align-items: flex-start; gap: 6px; margin: 0; color: var(--text-tertiary); font-size: 12px; line-height: 1.45; }
.bills__note :deep(svg) { flex: none; margin-top: 2px; }

@media (max-width: 560px) {
  .bills { padding: 16px 14px; }
  .bills__head { flex-wrap: wrap; }
  .bills__manage { order: 3; }
  .bills__summary { grid-template-columns: 1fr; }
  .bills__summary > div + div { border-left: 0; border-top: 1px solid var(--border); }
  .bills__summary > div { grid-template-columns: 1fr auto; align-items: baseline; }
}
</style>
