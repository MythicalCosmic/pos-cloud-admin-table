<script setup lang="ts">
import type { EChartsOption } from 'echarts'
import EChart from './EChart.vue'
import ChartCard from '@/components/design/ChartCard.vue'
import { useEChartTheme } from '@/composables/useEChartTheme'
import { fmtUZS } from '@/composables/useCurrency'
import type { MixSlice } from '@/types/comparison'

// A pair of donuts (Period A + Period B) for a categorical mix — payment
// methods or order types — plus a compact table of amount / share / Δ share.

const props = defineProps<Props>()
const { t } = useI18n({ useScope: 'global' })
const { tokens, tooltip } = useEChartTheme()

interface Props {
  a: MixSlice[]
  b: MixSlice[]
  labelA: string
  labelB: string
  eyebrow: string
  title: string
  kind: 'payment' | 'order_type'
}
const PALETTE = ['--c1', '--c2', '--c3', '--c4', '--c5']
function colorAt(i: number) {
  return getComputedStyle(document.documentElement).getPropertyValue(PALETTE[i % PALETTE.length]).trim() || tokens.value.primary
}
function keyOf(s: MixSlice) { return s.method ?? s.type ?? '' }
function nameOf(s: MixSlice) { return t(`mix_${keyOf(s)}`) }

function donut(slices: MixSlice[]): EChartsOption {
  return {
    tooltip: tooltip({ trigger: 'item', formatter: (p: any) => `${p.name}<br/><b>${fmtUZS(p.value)}</b> · ${p.percent}%` }),
    series: [{
      type: 'pie',
      radius: ['58%', '82%'],
      avoidLabelOverlap: true,
      label: { show: false },
      data: slices.map((s, i) => ({ name: nameOf(s), value: s.value, itemStyle: { color: colorAt(i) } })),
    }],
  }
}
const optA = computed(() => donut(props.a))
const optB = computed(() => donut(props.b))

// combined table: share A, share B, Δ share (pp)
const rows = computed(() => {
  const keys = Array.from(new Set([...props.a, ...props.b].map(keyOf)))
  return keys.map((k, i) => {
    const sa = props.a.find(s => keyOf(s) === k)
    const sb = props.b.find(s => keyOf(s) === k)
    const shareA = sa?.share ?? 0
    const shareB = sb?.share ?? 0
    return { key: k, name: t(`mix_${k}`), color: colorAt(i), valueA: sa?.value ?? 0, shareA, shareB, dShare: Math.round((shareA - shareB) * 10) / 10 }
  })
})
</script>

<template>
  <ChartCard
    :eyebrow="eyebrow"
    :title="title"
  >
    <div class="mix">
      <div class="mix__donuts">
        <div class="mix__d">
          <EChart
            :option="optA"
            :height="150"
            :aria-label="`${title} · ${labelA}`"
          />
          <span class="mix__cap">{{ labelA }}</span>
        </div>
        <div class="mix__d">
          <EChart
            :option="optB"
            :height="150"
            :aria-label="`${title} · ${labelB}`"
          />
          <span class="mix__cap">{{ labelB }}</span>
        </div>
      </div>
      <div
        class="tablewrap"
        tabindex="0"
        :aria-label="title"
      >
        <table class="mix__tbl">
          <thead>
            <tr>
              <th>{{ kind === 'payment' ? t('Method') : t('Type') }}</th>
              <th class="num">
                {{ labelA }}
              </th>
              <th class="num">
                {{ t('Share') }}
              </th>
              <th class="num">
                {{ t('Δ share') }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="r in rows"
              :key="r.key"
            >
              <td>
                <span
                  class="mix__dot"
                  :style="{ background: r.color }"
                />{{ r.name }}
              </td>
              <td class="num mono">
                {{ fmtUZS(r.valueA) }}
              </td>
              <td class="num mono">
                {{ r.shareA }}%
              </td>
              <td
                class="num mono"
                :class="r.dShare > 0 ? 'up' : r.dShare < 0 ? 'down' : ''"
              >
                {{ r.dShare > 0 ? '+' : r.dShare < 0 ? '−' : '' }}{{ Math.abs(r.dShare) }}pp
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </ChartCard>
</template>

<style scoped>
.mix { display: flex; flex-direction: column; gap: var(--sp-3); }
.mix__donuts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--sp-2); }
.mix__d { position: relative; text-align: center; min-width: 0; }
.mix__cap { font-size: 12px; color: var(--text-tertiary); font-family: var(--font-mono); }
.mix__tbl { width: 100%; border-collapse: collapse; font-size: 13px; }
.mix__tbl th { text-align: left; font-size: var(--fs-label); text-transform: uppercase; letter-spacing: var(--tracking-label); color: var(--text-tertiary); font-weight: 600; padding: 6px 8px; border-bottom: 1px solid var(--border); }
.mix__tbl td { padding: 7px 8px; border-bottom: 1px solid var(--border-soft, var(--border)); color: var(--text); }
.mix__tbl .num { text-align: right; }
.mix__tbl .mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
.mix__dot { display: inline-block; width: 9px; height: 9px; border-radius: 2px; margin-right: 7px; vertical-align: middle; }
.up { color: var(--color-positive); }
.down { color: var(--color-negative); }
</style>
