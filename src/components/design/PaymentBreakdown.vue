<script setup lang="ts">
import { fmtPct } from '@/components/design/utils/format'
import { groupPaymentMethods, paymentMethodColors, paymentMethodNames } from '@/utils/paymentBreakdown'

interface Method {
  type: string
  amount: number | string
}
interface Props {
  methods: Method[]
  total: number
}

const props = defineProps<Props>()

const { t } = useI18n({ useScope: 'global' })
const { formatCurrency } = useFormatters()

function colorFor(type: string) {
  return paymentMethodColors[type.toUpperCase()] ?? 'var(--c5)'
}
function nameFor(type: string) {
  const key = type.toUpperCase()
  return paymentMethodNames[key] ? t(paymentMethodNames[key]) : type
}

const methods = computed(() => groupPaymentMethods(props.methods ?? []))

const safeTotal = computed(() => {
  const n = Number(props.total) || 0
  if (n > 0)
    return n
  return methods.value.reduce((a, m) => a + m.amount, 0)
})

const mixed = computed(() => methods.value.length > 1)

function pct(amount: number | string) {
  const n = Number(amount) || 0
  return fmtPct(safeTotal.value > 0 ? n / safeTotal.value * 100 : 0, 2)
}
</script>

<template>
  <div class="paybreak">
    <div class="paybreak__head">
      <strong>{{ formatCurrency(safeTotal) }}<small>UZS</small></strong><span v-if="mixed">{{ t('Mixed') }} · {{ methods.length }}</span>
    </div>
    <div
      class="paybreak__bar"
      aria-hidden="true"
    >
      <span
        v-for="method in methods"
        :key="method.type"
        :style="{ 'width': `${Number(method.amount) / safeTotal * 100}%`, '--tender-color': colorFor(method.type) }"
      />
    </div>
    <div class="paybreak__list">
      <div
        v-for="method in methods"
        :key="method.type"
        class="paybreak__row"
      >
        <span
          class="paybreak__swatch"
          :style="{ background: colorFor(method.type) }"
        /><span>{{ nameFor(method.type) }}</span>
        <strong>{{ formatCurrency(method.amount) }}</strong><small>{{ pct(method.amount) }}</small>
      </div>
    </div>
  </div>
</template>

<style scoped>
.paybreak { padding: 0; border: 0; border-radius: 0; background: transparent; }
.paybreak__head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 14px; }
.paybreak__head strong { font: 600 22px/1.3 var(--font-sans); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.paybreak__head small { color: var(--text-secondary); margin-left: 5px; font-size: 9px; font-weight: 400; }
.paybreak__head > span { font-size: 10px; white-space: nowrap; padding: 4px 7px; border-radius: 6px; color: var(--primary); background: var(--primary-weak); }
.paybreak__bar { display: flex; height: 14px; gap: 2px; overflow: hidden; border-radius: 5px; background: var(--surface-2); }
.paybreak__bar > span { height: 100%; background: linear-gradient(135deg, color-mix(in srgb, var(--tender-color) 60%, white), var(--tender-color)); }
.paybreak__list { display: grid; gap: 0; margin-top: 12px; }
.paybreak__row { display: grid; grid-template-columns: 7px 1fr auto; gap: 3px 8px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 11px; }
.paybreak__row:last-child { border-bottom: 0; }
.paybreak__swatch { width: 7px; height: 7px; border-radius: 2px; }
.paybreak__row strong { font-size: 12px; font-weight: 500; font-variant-numeric: tabular-nums; }
.paybreak__row small { grid-column: 3; color: var(--text-secondary); font-size: 10px; text-align: end; font-variant-numeric: tabular-nums; }
</style>
