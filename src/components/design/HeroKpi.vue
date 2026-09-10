<script setup lang="ts">
/**
 * HeroKpi — large KPI tile with optional icon badge, delta pill, sub-text, and
 * sparkline. Port of `.tmp-handoff-v3/.../pages/dash/Shared.jsx` `HeroKpi`.
 *
 * Source uses a `<CountUp>` component for animating numeric values — there is
 * no CountUp in the FE yet, so we render the value directly via the project's
 * number formatters (`fmtMoneyAbbr` for money, `fmtNum` for plain numbers).
 *
 * Tone classes map to the existing `t-*` palette in `design-shell.css`:
 * `primary` | `success` | `warning` | `error`. We additionally accept the
 * source aliases `warn` -> `warning` and `danger` -> `error` so call sites
 * can use the v3 names verbatim.
 */
import Delta from './Delta.vue'
import DesignIcon from './DesignIcon.vue'
import Sparkline from '@/components/design/charts/Sparkline.vue'
import { fmtMoneyAbbr, fmtNum } from './utils/format'

export interface HeroKpiData {
  label: string
  value: number | string
  money?: boolean
  unit?: string
  icon?: string
  tone?: 'primary' | 'success' | 'warn' | 'warning' | 'danger' | 'error'
  delta?: number
  sub?: string
  spark?: number[]
}

interface Props { data: HeroKpiData }

const props = defineProps<Props>()

const tone = computed(() => {
  const t = props.data.tone || 'primary'
  if (t === 'warn')
    return 'warning'
  if (t === 'danger')
    return 'error'
  return t
})

const displayValue = computed<string>(() => {
  const raw = props.data.value
  // BE returns Decimal as string. Coerce so the formatters can group thousands.
  const n = typeof raw === 'string' ? Number(raw) : raw
  if (props.data.money)
    return fmtMoneyAbbr(typeof n === 'number' && !Number.isNaN(n) ? n : null)
  if (typeof n === 'number' && !Number.isNaN(n))
    return fmtNum(n)
  return String(raw)
})
</script>

<template>
  <div class="herokpi">
    <div class="herokpi__top">
      <span class="herokpi__label">{{ data.label }}</span>
      <span
        v-if="data.icon"
        class="herokpi__icon"
        :class="`t-${tone}`"
      >
        <DesignIcon :name="data.icon" :size="17" />
      </span>
    </div>
    <div class="herokpi__value">
      {{ displayValue }}
      <span v-if="data.unit" class="herokpi__unit">{{ data.unit }}</span>
    </div>
    <div class="herokpi__foot">
      <Delta v-if="data.delta !== null && data.delta !== undefined" :value="data.delta" />
      <span v-if="data.sub" class="herokpi__sub">{{ data.sub }}</span>
      <span v-if="data.spark && data.spark.length" style="margin-left: auto;">
        <Sparkline :data="data.spark" :width="96" :height="30" color-by-trend />
      </span>
    </div>
  </div>
</template>
