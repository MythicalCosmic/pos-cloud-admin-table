<script setup lang="ts">
import DeltaBadge from './DeltaBadge.vue'
import { computeDelta, normalize } from '@/composables/useComparison'
import { abbrUZS, fmtInt, fmtUZS } from '@/composables/useCurrency'
import type { KpiCell } from '@/types/comparison'

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

const { t } = useI18n({ useScope: 'global' })

const dispA = computed(() => props.avgMode ? normalize(props.cell.a, props.daysA) : props.cell.a)
const dispB = computed(() => props.avgMode ? normalize(props.cell.b, props.daysB) : props.cell.b)

const delta = computed(() => props.avgMode
  ? computeDelta(dispA.value, dispB.value)
  : { delta: props.cell.delta, deltaPct: props.cell.delta_pct })

function fmtVal(value: number): string {
  if (props.money)
    return fmtUZS(Math.round(value))

  return Number.isInteger(value) ? fmtInt(value) : (Math.round(value * 100) / 100).toString()
}

const absoluteDelta = computed(() => {
  const value = delta.value.delta
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  const body = props.money ? abbrUZS(Math.abs(value)) : fmtInt(Math.abs(value))

  return value === 0 ? t('No change') : `${sign}${body}`
})

const scale = computed(() => Math.max(Math.abs(dispA.value), Math.abs(dispB.value), 1))
const widthA = computed(() => `${Math.max(dispA.value ? 5 : 0, Math.abs(dispA.value) / scale.value * 100)}%`)
const widthB = computed(() => `${Math.max(dispB.value ? 5 : 0, Math.abs(dispB.value) / scale.value * 100)}%`)

const sparkPath = computed(() => {
  const values = props.spark
  if (!values || values.length < 2)
    return ''

  const width = 88
  const height = 24
  const minimum = Math.min(...values)
  const maximum = Math.max(...values)
  const span = maximum - minimum || 1
  const step = width / (values.length - 1)

  return values.map((value, index) => `${index ? 'L' : 'M'}${(index * step).toFixed(1)} ${(height - ((value - minimum) / span) * height).toFixed(1)}`).join(' ')
})
</script>

<template>
  <article class="kpisc">
    <header class="kpisc__head">
      <span>{{ label }}</span>
      <span
        v-if="formula"
        class="kpisc__info"
        :title="formula"
      >?</span>
      <DeltaBadge
        class="kpisc__delta"
        :delta-pct="delta.deltaPct"
        :is-up-good="cell.is_up_good"
        size="sm"
      />
    </header>

    <div class="kpisc__current">
      <span>A</span>
      <strong>{{ fmtVal(dispA) }}</strong>
      <small v-if="unit">{{ unit }}</small>
    </div>

    <div class="kpisc__baseline">
      <span>{{ t('Baseline') }}</span>
      <strong>{{ fmtVal(dispB) }}</strong>
      <em>{{ absoluteDelta }}</em>
    </div>

    <div
      class="kpisc__tracks"
      aria-hidden="true"
    >
      <i><b :style="{ inlineSize: widthA }" /></i>
      <i><b :style="{ inlineSize: widthB }" /></i>
    </div>

    <svg
      v-if="sparkPath"
      class="kpisc__spark"
      width="88"
      height="24"
      viewBox="0 0 88 24"
      aria-hidden="true"
    >
      <path
        :d="sparkPath"
        fill="none"
        stroke="var(--color-period-a)"
        stroke-width="1.7"
        stroke-linejoin="round"
        stroke-linecap="round"
      />
    </svg>
  </article>
</template>

<style scoped>
.kpisc { position: relative; display: grid; min-inline-size: 0; min-block-size: 154px; align-content: start; gap: 10px; padding: 16px; background: var(--surface); transition: background 160ms ease; }
.kpisc:hover { background: color-mix(in srgb, var(--primary) 3%, var(--surface)); }
.kpisc__head { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 6px; }
.kpisc__head > span:first-child { min-inline-size: 0; color: var(--text-tertiary); font-size: 9px; font-weight: 780; letter-spacing: .1em; text-transform: uppercase; overflow-wrap: anywhere; }
.kpisc__info { display: grid; inline-size: 16px; block-size: 16px; place-items: center; border-radius: 50%; color: var(--text-tertiary); background: var(--surface-2); font-size: 9px; font-weight: 750; cursor: help; }
.kpisc__delta { justify-self: end; }
.kpisc__current { display: flex; align-items: baseline; min-inline-size: 0; gap: 5px; }
.kpisc__current > span { display: grid; flex: 0 0 auto; inline-size: 23px; block-size: 23px; place-items: center; border-radius: 8px; color: #fff; background: var(--color-period-a); font-family: var(--font-mono); font-size: 8px; font-weight: 800; }
.kpisc__current strong { min-inline-size: 0; font-family: var(--font-mono); font-size: clamp(18px, 1.7vw, 23px); font-weight: 720; font-variant-numeric: tabular-nums; letter-spacing: -.035em; line-height: 1.05; overflow-wrap: anywhere; }
.kpisc__current small { color: var(--text-tertiary); font-size: 9px; font-weight: 650; }
.kpisc__baseline { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: baseline; gap: 7px; color: var(--text-tertiary); font-size: 9px; }
.kpisc__baseline > span { text-transform: uppercase; letter-spacing: .08em; }
.kpisc__baseline strong,
.kpisc__baseline em { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
.kpisc__baseline strong { color: var(--text-secondary); font-size: 10px; }
.kpisc__baseline em { font-size: 9px; font-style: normal; text-align: end; }
.kpisc__tracks { display: grid; gap: 4px; }
.kpisc__tracks i { overflow: hidden; display: block; block-size: 4px; border-radius: 999px; background: var(--surface-2); }
.kpisc__tracks b { display: block; block-size: 100%; max-inline-size: 100%; border-radius: inherit; background: var(--color-period-a); }
.kpisc__tracks i + i b { background: var(--color-period-b); }
.kpisc__spark { position: absolute; opacity: .72; pointer-events: none; inset-block-end: 11px; inset-inline-end: 15px; }

@media (prefers-reduced-motion: reduce) {
  .kpisc { transition: none; }
}
</style>
