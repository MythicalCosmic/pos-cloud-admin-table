<script setup lang="ts">
/* One KPI: Period A (large), Period B (muted "vs"), a direction-aware delta
   badge, absolute delta, optional micro-sparkline. Daily-average mode
   normalises A and B by their own day counts and RE-derives the delta (which
   differs from the total delta when the ranges are unequal length). */
import DeltaBadge from './DeltaBadge.vue'
import { computeDelta, normalize } from '@/composables/useComparison'
import { abbrUZS, fmtInt, fmtUZS } from '@/composables/useCurrency'
import type { KpiCell } from '@/types/comparison'

const { t } = useI18n({ useScope: 'global' })

interface Props {
  label: string
  formula?: string
  cell: KpiCell
  money?: boolean
  unit?: string
  spark?: number[]
  avgMode?: boolean
  daysA?: number
  daysB?: number
}
const props = withDefaults(defineProps<Props>(), {
  money: false,
  avgMode: false,
  daysA: 1,
  daysB: 1,
})

const dispA = computed(() => props.avgMode ? normalize(props.cell.a, props.daysA) : props.cell.a)
const dispB = computed(() => props.avgMode ? normalize(props.cell.b, props.daysB) : props.cell.b)
const d = computed(() => props.avgMode ? computeDelta(dispA.value, dispB.value) : {
  delta: props.cell.delta, deltaPct: props.cell.delta_pct,
})

function fmtVal(v: number): string {
  if (props.money) return fmtUZS(Math.round(v))
  // small non-money metrics (avg items/order) can be fractional
  return Number.isInteger(v) ? fmtInt(v) : (Math.round(v * 100) / 100).toString()
}
const absDelta = computed(() => {
  const val = d.value.delta
  const sign = val > 0 ? '+' : val < 0 ? '−' : ''
  const body = props.money ? abbrUZS(Math.abs(val)) : fmtInt(Math.abs(val))
  return val === 0 ? '' : `${sign}${body}`
})

// tiny sparkline path (last N of Period A)
const sparkPath = computed(() => {
  const vals = props.spark
  if (!vals || vals.length < 2) return ''
  const w = 96
  const h = 26
  let min = Infinity
  let max = -Infinity
  for (const v of vals) { if (v < min) min = v; if (v > max) max = v }
  const span = max - min || 1
  const step = w / (vals.length - 1)
  return vals.map((v, i) => `${i ? 'L' : 'M'}${(i * step).toFixed(1)} ${(h - ((v - min) / span) * h).toFixed(1)}`).join(' ')
})
</script>

<template>
  <div class="kpisc">
    <div class="kpisc__head">
      <span class="kpisc__label">{{ label }}</span>
      <span
        v-if="formula"
        class="kpisc__info"
        :title="formula"
      >?</span>
    </div>

    <div class="kpisc__value">
      {{ fmtVal(dispA) }}<span
        v-if="unit"
        class="kpisc__unit"
      >{{ unit }}</span>
    </div>

    <div class="kpisc__foot">
      <DeltaBadge :delta-pct="d.deltaPct" :is-up-good="cell.is_up_good" size="sm" />
      <span class="kpisc__vs">{{ t('vs') }} {{ fmtVal(dispB) }}</span>
      <svg
        v-if="sparkPath"
        class="kpisc__spark"
        :width="96"
        :height="26"
        viewBox="0 0 96 26"
      >
        <path
          :d="sparkPath"
          fill="none"
          stroke="var(--color-period-a)"
          stroke-width="1.6"
          stroke-linejoin="round"
          stroke-linecap="round"
        />
      </svg>
    </div>
    <div
      v-if="absDelta"
      class="kpisc__abs"
    >{{ absDelta }}</div>
  </div>
</template>

<style scoped>
.kpisc {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  padding: var(--sp-4);
  box-shadow: var(--shadow-xs);
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.kpisc__head { display: flex; align-items: center; gap: 6px; }
.kpisc__label {
  font-size: var(--fs-label);
  font-weight: var(--fw-semibold);
  letter-spacing: var(--tracking-label);
  text-transform: uppercase;
  color: var(--text-tertiary);
}
.kpisc__info {
  width: 15px; height: 15px; border-radius: 50%;
  display: grid; place-items: center;
  font-size: 10px; font-weight: 700;
  color: var(--text-tertiary); background: var(--surface-2);
  cursor: help;
}
.kpisc__value {
  font-family: var(--font-mono);
  font-weight: var(--fw-bold);
  font-size: 24px;
  color: var(--text);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
  line-height: 1.1;
}
.kpisc__unit { font-size: 12px; color: var(--text-tertiary); margin-left: 3px; font-weight: 500; }
.kpisc__foot { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.kpisc__vs { font-size: 12px; color: var(--text-tertiary); font-family: var(--font-mono); }
.kpisc__spark { margin-left: auto; }
.kpisc__abs { font-size: 12px; color: var(--text-secondary); font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
</style>
