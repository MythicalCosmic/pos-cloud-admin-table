<script setup lang="ts">
import type { EChartsOption } from 'echarts'
import EChart from './EChart.vue'
import ChartCard from '@/components/design/ChartCard.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import { useEChartTheme } from '@/composables/useEChartTheme'
import { fmtInt, fmtUZS } from '@/composables/useCurrency'
import type { MixSlice } from '@/types/comparison'

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

function keyOf(slice: MixSlice) {
  return slice.method ?? slice.type ?? ''
}

function nameOf(slice: MixSlice) {
  return t(`mix_${keyOf(slice)}`)
}

const palette = computed(() => [
  tokens.value.primary,
  tokens.value.secondary,
  tokens.value.positive,
  tokens.value.expense,
  tokens.value.periodB,
])

function donut(slices: MixSlice[]): EChartsOption {
  return {
    tooltip: tooltip({
      trigger: 'item',
      formatter: (point: any) => `${point.name}<br/><b>${formatValue(Number(point.value))}</b> · ${point.percent}%`,
    }),
    series: [
      {
        type: 'pie',
        radius: ['59%', '84%'],
        center: ['50%', '50%'],
        minAngle: 3,
        padAngle: 2,
        avoidLabelOverlap: true,
        selectedMode: 'single',
        selectedOffset: 5,
        label: { show: false },
        labelLine: { show: false },
        itemStyle: {
          borderColor: tokens.value.surface,
          borderWidth: 3,
          borderRadius: 9,
        },
        emphasis: {
          scaleSize: 7,
          itemStyle: {
            shadowBlur: 16,
            shadowColor: 'rgba(15, 23, 34, .18)',
          },
        },
        data: slices.map((slice, index) => ({
          name: nameOf(slice),
          value: slice.value,
          itemStyle: { color: palette.value[index % palette.value.length] },
        })),
      },
    ],
  }
}

const optA = computed(() => donut(props.a))
const optB = computed(() => donut(props.b))
const totalA = computed(() => props.a.reduce((sum, slice) => sum + Number(slice.value || 0), 0))
const totalB = computed(() => props.b.reduce((sum, slice) => sum + Number(slice.value || 0), 0))

function formatValue(value: number): string {
  return props.kind === 'payment' ? fmtUZS(value) : fmtInt(value)
}

function boundedShare(value: number): string {
  return `${Math.max(0, Math.min(100, Number(value) || 0))}%`
}

const rows = computed(() => {
  const keys = Array.from(new Set([...props.a, ...props.b].map(keyOf)))

  return keys.map((key, index) => {
    const periodA = props.a.find(slice => keyOf(slice) === key)
    const periodB = props.b.find(slice => keyOf(slice) === key)
    const shareA = Number(periodA?.share ?? 0)
    const shareB = Number(periodB?.share ?? 0)

    return {
      key,
      name: t(`mix_${key}`),
      color: palette.value[index % palette.value.length],
      valueA: Number(periodA?.value ?? 0),
      valueB: Number(periodB?.value ?? 0),
      shareA,
      shareB,
      deltaShare: Math.round((shareA - shareB) * 10) / 10,
    }
  })
})
</script>

<template>
  <ChartCard
    class="mix-card"
    :eyebrow="eyebrow"
    :title="title"
  >
    <div class="mix">
      <div class="mix__orbits">
        <article class="mix__orbit mix__orbit--a">
          <div class="mix__chart">
            <EChart
              :option="optA"
              :height="208"
              :aria-label="`${title} · ${labelA}`"
            />
            <div class="mix__center">
              <span>A</span>
              <strong>{{ formatValue(totalA) }}</strong>
              <small>{{ kind === 'payment' ? 'UZS' : t('Orders') }}</small>
            </div>
          </div>
          <div class="mix__period-label">
            <i />
            <span><strong>{{ t('Current') }}</strong><small>{{ labelA }}</small></span>
          </div>
        </article>

        <article class="mix__orbit mix__orbit--b">
          <div class="mix__chart">
            <EChart
              :option="optB"
              :height="208"
              :aria-label="`${title} · ${labelB}`"
            />
            <div class="mix__center">
              <span>B</span>
              <strong>{{ formatValue(totalB) }}</strong>
              <small>{{ kind === 'payment' ? 'UZS' : t('Orders') }}</small>
            </div>
          </div>
          <div class="mix__period-label">
            <i />
            <span><strong>{{ t('Baseline') }}</strong><small>{{ labelB }}</small></span>
          </div>
        </article>
      </div>

      <div
        class="mix__legend"
        role="list"
        :aria-label="title"
      >
        <article
          v-for="row in rows"
          :key="row.key"
          class="mix__row"
          role="listitem"
          tabindex="0"
        >
          <div class="mix__row-head">
            <span
              class="mix__swatch"
              :style="{ background: row.color }"
            />
            <strong>{{ row.name }}</strong>
            <span
              class="mix__delta"
              :class="row.deltaShare > 0 ? 'is-up' : row.deltaShare < 0 ? 'is-down' : ''"
            >
              {{ row.deltaShare > 0 ? '+' : row.deltaShare < 0 ? '−' : '' }}{{ Math.abs(row.deltaShare) }}pp
            </span>
          </div>
          <div class="mix__compare">
            <div>
              <span>A</span>
              <i><b :style="{ inlineSize: boundedShare(row.shareA), background: row.color }" /></i>
              <strong>{{ row.shareA }}%</strong>
              <small>{{ formatValue(row.valueA) }}</small>
            </div>
            <div>
              <span>B</span>
              <i><b :style="{ inlineSize: boundedShare(row.shareB), background: row.color }" /></i>
              <strong>{{ row.shareB }}%</strong>
              <small>{{ formatValue(row.valueB) }}</small>
            </div>
          </div>
        </article>

        <div
          v-if="!rows.length"
          class="mix__empty"
        >
          <DesignIcon
            name="chart"
            :size="20"
          />
          {{ t('No comparison activity') }}
        </div>
      </div>
    </div>
  </ChartCard>
</template>

<style scoped>
.mix { display: grid; gap: 18px; }
.mix__orbits { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.mix__orbit { min-inline-size: 0; padding: 12px 12px 13px; border: 1px solid color-mix(in srgb, var(--color-period-a) 20%, var(--border)); border-radius: 18px; background: linear-gradient(145deg, color-mix(in srgb, var(--color-period-a) 7%, var(--surface)), var(--surface)); }
.mix__orbit--b { border-color: color-mix(in srgb, var(--color-period-b) 28%, var(--border)); background: linear-gradient(145deg, color-mix(in srgb, var(--color-period-b) 9%, var(--surface)), var(--surface)); }
.mix__chart { position: relative; min-inline-size: 0; }
.mix__center { position: absolute; display: grid; inline-size: 108px; place-items: center; text-align: center; pointer-events: none; inset-block-start: 50%; inset-inline-start: 50%; transform: translate(-50%, -50%); }
.mix__center > span { display: grid; inline-size: 24px; block-size: 24px; place-items: center; margin-block-end: 5px; border-radius: 8px; color: #fff; background: var(--color-period-a); font-family: var(--font-mono); font-size: 9px; font-weight: 800; }
.mix__orbit--b .mix__center > span { background: var(--color-period-b); }
.mix__center strong { max-inline-size: 100%; font-family: var(--font-mono); font-size: 15px; font-variant-numeric: tabular-nums; letter-spacing: -.03em; overflow-wrap: anywhere; }
.mix__center small { margin-block-start: 1px; color: var(--text-tertiary); font-size: 8px; font-weight: 750; letter-spacing: .08em; text-transform: uppercase; }
.mix__period-label { display: flex; justify-content: center; align-items: flex-start; gap: 7px; margin-block-start: -2px; }
.mix__period-label > i { inline-size: 7px; block-size: 7px; margin-block-start: 4px; border-radius: 50%; background: var(--color-period-a); }
.mix__orbit--b .mix__period-label > i { background: var(--color-period-b); }
.mix__period-label > span { display: grid; min-inline-size: 0; }
.mix__period-label strong { font-size: 10px; }
.mix__period-label small { max-inline-size: 150px; color: var(--text-tertiary); font-size: 9px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.mix__legend { display: grid; gap: 7px; }
.mix__row { display: grid; gap: 9px; padding: 11px 12px; border: 1px solid var(--border); border-radius: 13px; background: var(--surface-2); transition: border-color 160ms ease, background 160ms ease, transform 160ms ease; }
.mix__row:hover,
.mix__row:focus-visible { border-color: color-mix(in srgb, var(--primary) 34%, var(--border)); background: var(--surface); transform: translateY(-1px); outline: none; }
.mix__row-head { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 7px; }
.mix__swatch { inline-size: 10px; block-size: 10px; border-radius: 4px; box-shadow: 0 0 0 3px color-mix(in srgb, currentColor 8%, transparent); }
.mix__row-head > strong { min-inline-size: 0; font-size: 12px; overflow-wrap: anywhere; }
.mix__delta { padding: 3px 6px; border-radius: 999px; color: var(--text-tertiary); background: var(--surface); font-family: var(--font-mono); font-size: 9px; font-weight: 700; }
.mix__delta.is-up { color: var(--color-positive); background: color-mix(in srgb, var(--color-positive) 10%, var(--surface)); }
.mix__delta.is-down { color: var(--color-negative); background: color-mix(in srgb, var(--color-negative) 10%, var(--surface)); }
.mix__compare { display: grid; gap: 6px; }
.mix__compare > div { display: grid; grid-template-columns: 14px minmax(40px, 1fr) 42px minmax(62px, auto); align-items: center; gap: 7px; }
.mix__compare span { color: var(--text-tertiary); font-family: var(--font-mono); font-size: 9px; font-weight: 800; }
.mix__compare i { overflow: hidden; block-size: 5px; border-radius: 999px; background: var(--surface); }
.mix__compare b { display: block; block-size: 100%; max-inline-size: 100%; border-radius: inherit; opacity: .9; }
.mix__compare strong,
.mix__compare small { font-family: var(--font-mono); font-variant-numeric: tabular-nums; text-align: end; }
.mix__compare strong { font-size: 10px; }
.mix__compare small { color: var(--text-tertiary); font-size: 9px; }
.mix__empty { display: flex; align-items: center; justify-content: center; gap: 7px; min-block-size: 120px; color: var(--text-tertiary); font-size: 12px; }

@media (max-width: 620px) {
  .mix__orbits { grid-template-columns: minmax(0, 1fr); }
  .mix__compare > div { grid-template-columns: 14px minmax(40px, 1fr) 38px minmax(58px, auto); }
}

@media (prefers-reduced-motion: reduce) {
  .mix__row { transition: none; }
}
</style>
