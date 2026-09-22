<script setup lang="ts">
import Button from '@/components/design/Button.vue'
import Card from '@/components/design/Card.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import Skeleton from '@/components/design/Skeleton.vue'
import { buildDateParams, businessPreset } from '@/composables/useBusinessDay'
import { useApiError } from '@/composables/useApiError'
import { useFormatters } from '@/composables/useFormatters'
import { type OwnerSummary, getOwnerSummary } from '@/services/ownerSummaryApi'

type DateRangeInput = Parameters<typeof buildDateParams>[0]

const props = defineProps<{ range?: DateRangeInput }>()

const { t } = useI18n({ useScope: 'global' })
const { formatCurrency } = useFormatters()
const { translate: translateError } = useApiError()

const summary = shallowRef<OwnerSummary | null>(null)
const loading = ref(false)
const loadError = shallowRef<unknown>(null)
let requestId = 0

const params = computed(() => buildDateParams(
  (props.range && 'from' in props.range && props.range.from && props.range.to) ? props.range : businessPreset('30d'),
))

async function load() {
  const current = ++requestId

  loading.value = true
  loadError.value = null
  try {
    const result = await getOwnerSummary(params.value)
    if (current === requestId)
      summary.value = result
  }
  catch (error) {
    if (current === requestId)
      loadError.value = error
  }
  finally {
    if (current === requestId)
      loading.value = false
  }
}

watch(() => JSON.stringify(params.value), load, { immediate: true })

const steps = computed(() => {
  const data = summary.value
  if (!data)
    return []

  return [
    { key: 'sales', label: t('owner_net_sales'), value: data.sales.net_sales_uzs, sign: '', icon: 'wallet', tone: 'is-income' },
    {
      key: 'suppliers',
      label: t('owner_supplier_costs'),
      value: data.costs.suppliers.total_uzs,
      sign: '−',
      icon: 'package',
      tone: 'is-cost',
      detail: data.costs.suppliers.from_supplier_payments_uzs
        ? `${t('owner_from_expenses', { amount: formatCurrency(data.costs.suppliers.from_expenses_uzs) })} · ${t('owner_from_ledger', { amount: formatCurrency(data.costs.suppliers.from_supplier_payments_uzs) })}`
        : '',
    },
    { key: 'operating', label: t('owner_operating_costs'), value: data.costs.operating.total_uzs, sign: '−', icon: 'receipt', tone: 'is-cost' },
    {
      key: 'payroll',
      label: t('owner_payroll_costs'),
      value: data.costs.payroll.total_uzs,
      sign: '−',
      icon: 'users',
      tone: 'is-cost',
      detail: data.costs.payroll.from_salary_payments_uzs
        ? `${t('owner_from_expenses', { amount: formatCurrency(data.costs.payroll.from_expenses_uzs) })} · ${t('owner_from_salaries', { amount: formatCurrency(data.costs.payroll.from_salary_payments_uzs) })}`
        : '',
    },
  ]
})

const profitTone = computed(() => {
  const value = summary.value?.profit.raw_profit_uzs ?? 0

  return value > 0 ? 'is-positive' : value < 0 ? 'is-negative' : ''
})

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function monthLabel(yearMonth: string | null | undefined) {
  const month = Number(yearMonth?.split('-')[1])

  return (month >= 1 && month <= 12) ? t(MONTHS[month - 1]) : ''
}

function dayLabel(isoDate: string) {
  const [, month, day] = isoDate.split('-').map(Number)

  return (month >= 1 && month <= 12) ? `${day} ${t(MONTHS[month - 1])}` : isoDate
}

// Costs the period will still carry but that nobody has typed in yet. When
// any are expected, the headline profit is the estimate (closer to reality);
// the recorded profit stays visible as the first line of the bridge.
const expected = computed(() => {
  const data = summary.value?.expected
  if (!data || data.total_remaining_uzs <= 0)
    return null

  const lines: Array<{ key: string; label: string; value: number; detail: string; estimate?: boolean }> = []
  if (data.salaries.basis && data.salaries.remaining_uzs > 0) {
    lines.push({
      key: 'salaries',
      label: t('owner_expected_salaries'),
      value: data.salaries.remaining_uzs,
      detail: t('owner_expected_salaries_detail', {
        plan: formatCurrency(data.salaries.monthly_plan_uzs),
        recorded: formatCurrency(data.salaries.recorded_uzs),
      }),
    })
  }
  for (const bill of data.bills) {
    if (!bill.basis || bill.remaining_uzs <= 0)
      continue
    lines.push({
      key: `bill-${bill.reporting_group}`,
      label: t(`owner_expected_bill_${bill.reporting_group}`),
      value: bill.remaining_uzs,
      detail: t(`owner_expected_bill_${bill.basis}`, {
        month: monthLabel(bill.reference_month),
        amount: formatCurrency(bill.monthly_plan_uzs),
        recorded: formatCurrency(bill.recorded_uzs),
      }),
    })
  }
  if (data.suppliers && data.suppliers.remaining_uzs > 0) {
    lines.push({
      key: 'suppliers',
      label: t('owner_expected_suppliers'),
      value: data.suppliers.remaining_uzs,
      detail: t('owner_expected_suppliers_detail', {
        pct: data.suppliers.reference_share_pct,
        month: monthLabel(data.suppliers.reference_month),
        recorded: formatCurrency(data.suppliers.recorded_uzs),
      }),
      estimate: true,
    })
  }

  return {
    lines,
    subtitle: t('owner_expected_subtitle', { days: data.covered_days, date: dayLabel(data.as_of) }),
    estimated: data.estimated_profit_uzs,
    afterOwner: data.estimated_after_owner_withdrawals_uzs,
    notIncluded: data.not_included,
  }
})

function tone(value: number) {
  return value > 0 ? 'is-positive' : value < 0 ? 'is-negative' : ''
}

// The three numbers the owner actually looks for, each given equal weight:
// what the business earned, what the owner took out, and what is left.
const outcomes = computed(() => {
  const data = summary.value
  if (!data)
    return []

  const estimate = expected.value
  const left = estimate ? estimate.afterOwner : data.profit.after_owner_withdrawals_uzs

  return [
    estimate
      ? {
        key: 'profit',
        label: t('owner_estimated_profit'),
        value: estimate.estimated,
        icon: 'trend',
        tone: tone(estimate.estimated),
        detail: t('owner_estimated_profit_hint', { amount: signed(data.profit.raw_profit_uzs) }),
      }
      : {
        key: 'profit',
        label: t('owner_raw_profit'),
        value: data.profit.raw_profit_uzs,
        icon: 'trend',
        tone: profitTone.value,
        detail: data.profit.raw_margin_pct !== null ? t('owner_margin', { pct: data.profit.raw_margin_pct }) : '',
      },
    {
      key: 'withdrawals',
      label: t('owner_withdrawals_taken'),
      value: data.outside_profit.owner_withdrawals.total_uzs,
      icon: 'wallet',
      tone: 'is-withdrawal',
      detail: t('owner_withdrawals_count', { count: data.outside_profit.owner_withdrawals.count }),
    },
    {
      key: 'left',
      label: t('owner_money_left'),
      value: left,
      icon: 'coins',
      tone: tone(left),
      detail: estimate ? t('owner_money_left_estimated_hint') : t('owner_money_left_hint'),
    },
  ]
})

function signed(value: number) {
  return `${value < 0 ? '−' : ''}${formatCurrency(Math.abs(value))}`
}

// Warnings that make the profit figure itself incomplete. The rest describe
// how data is recorded and link to the page where it can be tidied.
const PROVISIONAL_WARNINGS = ['SALARY_RECORDS_MISSING', 'PAYROLL_RECORDED_AS_EXPENSES', 'SUPPLIER_LEDGER_OVERLAP_POSSIBLE']
const provisional = computed(() => !!summary.value?.warnings.some(warning => PROVISIONAL_WARNINGS.includes(warning.code)))

function warningLink(code: string) {
  const range = summary.value?.range
  const period = range ? { from: range.from, to: range.to } : {}
  switch (code) {
    case 'SALARY_RECORDS_MISSING':
    case 'PAYROLL_RECORDED_AS_EXPENSES':
      return { path: '/hr-salaries' }
    case 'SUPPLIER_PURCHASES_RECORDED_AS_EXPENSES':
    case 'SUPPLIER_LEDGER_OVERLAP_POSSIBLE':
      return { path: '/stock/suppliers' }
    case 'UNCLASSIFIED_EXPENSES':
      return { path: '/hr-expenses', query: { ...period, group: 'REVIEW' } }
    case 'EXPENSES_NOT_PAID_THROUGH_TREASURY':
      return { path: '/hr-expenses', query: { ...period, status: 'PENDING' } }
    default:
      return null
  }
}

function warningText(warning: OwnerSummary['warnings'][number]) {
  return t(`owner_warning_${warning.code}`, {
    count: warning.count ?? 0,
    amount: `${formatCurrency(warning.amount_uzs ?? 0)} UZS`,
  })
}
</script>

<template>
  <Card
    class="owner-money"
    aria-labelledby="owner-money-title"
  >
    <header class="owner-money__head">
      <div>
        <h2 id="owner-money-title">
          {{ t('owner_summary_title') }}
        </h2>
        <p>{{ t('owner_summary_subtitle') }}</p>
      </div>
      <span
        v-if="loading && summary"
        class="owner-money__updating"
        role="status"
      >{{ t('Loading') }}</span>
    </header>

    <div
      v-if="loadError && !summary"
      class="owner-money__error"
      role="alert"
    >
      <DesignIcon
        name="alert"
        :size="18"
      />
      <span>{{ t('owner_summary_error') }}: {{ translateError(loadError) }}</span>
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
      v-else-if="!summary"
      class="owner-money__flow"
      aria-hidden="true"
    >
      <Skeleton
        v-for="index in 5"
        :key="index"
        class="owner-money__skeleton"
      />
    </div>

    <template v-else>
      <div class="owner-money__flow">
        <div
          v-for="step in steps"
          :key="step.key"
          class="owner-step"
          :class="step.tone"
          :data-step="step.key"
        >
          <span class="owner-step__label">
            <DesignIcon
              :name="step.icon"
              :size="15"
            />{{ step.label }}
          </span>
          <strong class="owner-step__value"><span v-if="step.sign">{{ step.sign }}</span>{{ formatCurrency(step.value) }}</strong>
          <small
            v-if="step.detail"
            class="owner-step__detail"
          >{{ step.detail }}</small>
        </div>
      </div>

      <section
        v-if="expected"
        class="owner-bridge"
        aria-labelledby="owner-bridge-title"
      >
        <header class="owner-bridge__head">
          <h3 id="owner-bridge-title">
            <DesignIcon
              name="hourglass"
              :size="16"
            />{{ t('owner_expected_title') }}
          </h3>
          <p>{{ expected.subtitle }}</p>
        </header>
        <ol class="owner-bridge__rows">
          <li class="owner-bridge__row is-start">
            <span class="owner-bridge__label">{{ t('owner_expected_recorded_profit') }}</span>
            <strong class="owner-bridge__value">{{ signed(summary.profit.raw_profit_uzs) }}</strong>
          </li>
          <li
            v-for="line in expected.lines"
            :key="line.key"
            class="owner-bridge__row"
            :class="{ 'is-estimate': line.estimate }"
          >
            <span class="owner-bridge__label">
              {{ line.label }}
              <small>{{ line.detail }}</small>
            </span>
            <strong class="owner-bridge__value">−{{ formatCurrency(line.value) }}</strong>
          </li>
          <li
            class="owner-bridge__row is-total"
            :class="tone(expected.estimated)"
          >
            <span class="owner-bridge__label">{{ t('owner_expected_total') }}</span>
            <strong class="owner-bridge__value">{{ signed(expected.estimated) }}</strong>
          </li>
          <li class="owner-bridge__row is-after">
            <span class="owner-bridge__label">{{ t('owner_expected_after_owner') }}</span>
            <strong class="owner-bridge__value">{{ signed(expected.afterOwner) }}</strong>
          </li>
        </ol>
        <div
          v-if="expected.notIncluded.length"
          class="owner-bridge__missing"
        >
          <strong>{{ t('owner_expected_not_included') }}:</strong>
          <ul>
            <li
              v-for="code in expected.notIncluded"
              :key="code"
            >
              {{ t(`owner_expected_missing_${code}`) }}
            </li>
          </ul>
        </div>
      </section>

      <div class="owner-money__outcome">
        <div
          v-for="outcome in outcomes"
          :key="outcome.key"
          class="owner-step owner-step--result"
          :class="outcome.tone"
          :data-step="outcome.key"
        >
          <span class="owner-step__label">
            <DesignIcon
              :name="outcome.icon"
              :size="15"
            />{{ outcome.label }}
            <span
              v-if="provisional && outcome.key === 'profit'"
              class="badge t-warning"
            >{{ t('owner_profit_provisional') }}</span>
          </span>
          <strong class="owner-step__value">{{ signed(outcome.value) }}</strong>
          <small
            v-if="outcome.detail"
            class="owner-step__detail"
          >{{ outcome.detail }}</small>
        </div>
      </div>

      <div
        class="owner-money__balances"
        :aria-label="t('owner_balances_now')"
      >
        <span class="owner-money__balances-title">{{ t('owner_balances_now') }}</span>
        <div><span>{{ t('owner_safe') }}</span><strong>{{ formatCurrency(summary.balances.safe_uzs) }}</strong></div>
        <div><span>{{ t('owner_bank') }}</span><strong>{{ formatCurrency(summary.balances.bank_uzs) }}</strong></div>
        <div class="is-debt">
          <span>{{ t('owner_supplier_debt') }}</span><strong>{{ formatCurrency(summary.balances.supplier_debt_uzs) }}</strong>
        </div>
      </div>

      <details
        v-if="summary.warnings.length"
        class="owner-money__notes"
      >
        <summary>
          <DesignIcon
            name="warning"
            :size="15"
          />{{ t('owner_data_notes') }} · {{ summary.warnings.length }}
        </summary>
        <ul>
          <li
            v-for="warning in summary.warnings"
            :key="warning.code"
          >
            <span>{{ warningText(warning) }}</span>
            <RouterLink
              v-if="warningLink(warning.code)"
              :to="warningLink(warning.code)!"
              class="owner-money__fix"
            >
              {{ t(`owner_warning_action_${warning.code}`) }}
            </RouterLink>
          </li>
        </ul>
      </details>
    </template>
  </Card>
</template>

<style scoped>
.owner-money { display: grid; gap: 16px; padding: 20px; }
.owner-money__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.owner-money__head h2 { margin: 0; font-size: 17px; font-weight: 650; }
.owner-money__head p { margin: 3px 0 0; color: var(--text-secondary); font-size: 12px; line-height: 1.45; }
.owner-money__updating { color: var(--text-tertiary); font-size: 11px; }
.owner-money__error { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 12px; border: 1px solid var(--error-border); border-radius: 12px; background: var(--error-weak); color: var(--error-strong); font-size: 13px; }
.owner-money__error span { flex: 1; min-width: 200px; }

.owner-money__flow { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.owner-money__outcome { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.owner-money__skeleton { min-height: 96px; border-radius: 14px; }
.owner-step { display: grid; align-content: start; min-width: 0; gap: 6px; padding: 14px; border: 1px solid var(--border); border-radius: 14px; background: var(--surface-2); }
.owner-step__label { display: inline-flex; align-items: center; gap: 6px; color: var(--text-secondary); font-size: 11px; font-weight: 650; letter-spacing: .03em; text-transform: uppercase; }
.owner-step__value { color: var(--text); font-family: var(--font-mono); font-size: 20px; font-variant-numeric: tabular-nums; letter-spacing: -.03em; overflow-wrap: anywhere; }
.owner-step__detail { color: var(--text-tertiary); font-size: 11px; line-height: 1.4; overflow-wrap: anywhere; }
.owner-step.is-income .owner-step__label svg { color: var(--color-positive); }
.owner-step.is-cost .owner-step__label svg { color: var(--warning-strong); }
.owner-step--result { padding: 18px; border-color: var(--primary-border); background: var(--primary-weak); }
.owner-step--result .owner-step__label { font-size: 12px; }
.owner-step--result .owner-step__value { font-size: 30px; font-weight: 600; }
.owner-step--result.is-withdrawal { border-color: var(--warning-border); background: var(--warning-weak); }
.owner-step--result.is-withdrawal .owner-step__value { color: var(--warning-strong); }
.owner-step--result.is-withdrawal .owner-step__label svg { color: var(--warning-strong); }
.owner-step--result.is-positive .owner-step__value { color: var(--color-positive); }
.owner-step--result.is-negative .owner-step__value { color: var(--color-negative); }

.owner-money__balances { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 22px; padding: 12px 14px; border-radius: 12px; background: var(--surface-inset); }
.owner-money__balances-title { color: var(--text-tertiary); font-size: 11px; font-weight: 650; letter-spacing: .04em; text-transform: uppercase; }
.owner-money__balances > div { display: flex; align-items: baseline; gap: 8px; }
.owner-money__balances > div span { color: var(--text-secondary); font-size: 12px; }
.owner-money__balances > div strong { font-family: var(--font-mono); font-size: 15px; font-variant-numeric: tabular-nums; }
.owner-money__balances > div.is-debt strong { color: var(--warning-strong); }

.owner-money__notes { border: 1px solid var(--warning-border); border-radius: 12px; background: color-mix(in srgb, var(--warning-weak) 60%, var(--surface)); }
.owner-money__notes summary { display: flex; align-items: center; gap: 7px; min-height: 44px; padding: 0 14px; color: var(--warning-strong); cursor: pointer; font-size: 13px; font-weight: 600; }
.owner-money__notes summary:focus-visible { outline: none; box-shadow: var(--shadow-focus); border-radius: 12px; }
.owner-money__notes ul { display: grid; gap: 6px; margin: 0; padding: 0 14px 14px 36px; color: var(--text-secondary); font-size: 12px; line-height: 1.5; }
.owner-money__fix { margin-left: 6px; color: var(--primary); font-weight: 600; text-decoration: none; white-space: nowrap; }
.owner-money__fix:hover { text-decoration: underline; }
.owner-money__fix:focus-visible { outline: none; box-shadow: var(--shadow-focus); border-radius: 4px; }

.owner-bridge { display: grid; gap: 12px; padding: 16px; border: 1px solid var(--border); border-radius: 14px; background: var(--surface-2); }
.owner-bridge__head h3 { display: flex; align-items: center; gap: 7px; margin: 0; font-size: 14px; font-weight: 650; }
.owner-bridge__head h3 svg { color: var(--warning-strong); }
.owner-bridge__head p { margin: 3px 0 0; color: var(--text-secondary); font-size: 12px; }
.owner-bridge__rows { display: grid; margin: 0; padding: 0; list-style: none; }
.owner-bridge__row { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; padding: 9px 0; border-top: 1px dashed var(--border); }
.owner-bridge__row:first-child { border-top: 0; }
.owner-bridge__label { display: grid; gap: 2px; min-width: 0; color: var(--text); font-size: 13px; }
.owner-bridge__label small { color: var(--text-tertiary); font-size: 11px; line-height: 1.4; }
.owner-bridge__value { flex: none; font-family: var(--font-mono); font-size: 15px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.owner-bridge__row:not(.is-start):not(.is-total):not(.is-after) .owner-bridge__value { color: var(--warning-strong); }
.owner-bridge__row.is-estimate .owner-bridge__label { font-style: italic; }
.owner-bridge__row.is-start .owner-bridge__label { color: var(--text-secondary); }
.owner-bridge__row.is-total { margin-top: 4px; padding: 12px 14px; border: 1px solid var(--primary-border); border-radius: 12px; background: var(--primary-weak); }
.owner-bridge__row.is-total .owner-bridge__label { font-weight: 650; }
.owner-bridge__row.is-total .owner-bridge__value { font-size: 22px; font-weight: 650; }
.owner-bridge__row.is-total.is-positive .owner-bridge__value { color: var(--color-positive); }
.owner-bridge__row.is-total.is-negative .owner-bridge__value { color: var(--color-negative); }
.owner-bridge__row.is-total + .owner-bridge__row { border-top: 0; }
.owner-bridge__row.is-after .owner-bridge__label { color: var(--text-secondary); }
.owner-bridge__missing { padding: 10px 12px; border-radius: 10px; background: var(--surface-inset); color: var(--text-secondary); font-size: 12px; line-height: 1.5; }
.owner-bridge__missing strong { color: var(--text); }
.owner-bridge__missing ul { margin: 4px 0 0; padding-left: 18px; }

@media (max-width: 1200px) {
  .owner-money__flow { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .owner-money__outcome { grid-template-columns: minmax(0, 1fr); }
}

@media (max-width: 560px) {
  .owner-money { padding: 16px 14px; }
  .owner-money__flow { grid-template-columns: minmax(0, 1fr); }
  .owner-step__value { font-size: 18px; }
  .owner-step--result .owner-step__value { font-size: 26px; }
}
</style>
