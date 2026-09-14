<script setup lang="ts">
import DesignIcon from './DesignIcon.vue'
import Delta from './Delta.vue'
import { fmtAbbr, fmtNum, useFormatMode } from './utils/format'
import { type Tone, cx } from './utils'
import { workspaceContext } from './workspace/context'

const props = defineProps<Props>()

const workspace = inject(workspaceContext, false)

interface KpiData {
  label: string
  value: number | string | null
  icon?: string
  tone?: Tone
  money?: boolean
  delta?: number | null
  deltaLabel?: string
  sub?: string
}

interface Props {
  data: KpiData
}

const tone = computed<Tone>(() => props.data.tone || 'primary')

const { mode } = useFormatMode()

const display = computed<{ text: string; unit?: string }>(() => {
  const raw = props.data.value
  if (raw === null || raw === undefined)
    return { text: '—' }
  const n = typeof raw === 'string' ? Number(raw) : raw
  if (typeof n !== 'number' || Number.isNaN(n))
    return { text: String(raw) }
  if (props.data.money) {
    const fmt = mode.value === 'short' ? fmtAbbr(n) : fmtNum(n)
    return { text: fmt, unit: 'UZS' }
  }
  return { text: (mode.value === 'short' && Math.abs(n) >= 10000) ? fmtAbbr(n) : fmtNum(n) }
})
</script>

<template>
  <div
    class="kpi kpi--workspace"
    :class="{ 'workspace-metric': workspace }"
    :data-tone="workspace ? tone : undefined"
  >
    <div class="kpi__top">
      <div
        v-if="data.icon"
        :class="cx('kpi__icon', `t-${tone}`)"
      >
        <DesignIcon
          :name="data.icon"
          :size="20"
        />
      </div>
      <div class="kpi__label">
        {{ data.label }}
      </div>
    </div>
    <div class="kpi__value">
      {{ display.text }}<span
        v-if="display.unit"
        class="kpi__unit"
      >{{ display.unit }}</span>
    </div>
    <div
      v-if="data.delta !== null && data.delta !== undefined || data.sub || data.deltaLabel"
      class="kpi__foot"
    >
      <Delta
        v-if="data.delta !== null && data.delta !== undefined"
        :value="data.delta"
      />
      <span
        v-if="data.sub"
        class="kpi__subtext"
      >{{ data.sub }}</span>
      <span
        v-if="data.deltaLabel"
        class="kpi__subtext"
      >{{ data.deltaLabel }}</span>
    </div>
  </div>
</template>
