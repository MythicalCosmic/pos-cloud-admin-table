<script setup lang="ts">
import { fmtAbbr } from '@/components/design/utils/format'
import Skeleton from '@/components/design/Skeleton.vue'
import StateFill from '@/components/design/StateFill.vue'

const { t } = useI18n({ useScope: 'global' })

interface HBarPoint {
  name: string
  value: number
  units?: number
}

interface Props {
  data: HBarPoint[]
  valueFormat?: (n: number) => string
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {})

const hover = ref<number | null>(null)

const fmt = computed(() => props.valueFormat ?? fmtAbbr)

const maxV = computed(() => {
  let m = 0
  for (const d of props.data) {
    if (d.value > m)
      m = d.value
  }

  return m || 1
})
</script>

<template>
  <div
    v-if="loading"
    style="display: flex; flex-direction: column; gap: 16px;"
  >
    <Skeleton
      v-for="i in 5"
      :key="i"
      :h="26"
    />
  </div>
  <StateFill
    v-else-if="!data.length"
    icon="bx-bar-chart"
    :title="t('No data for this range')"
  />
  <div
    v-else
    style="display: flex; flex-direction: column; gap: 14px;"
  >
    <div
      v-for="(d, i) in data"
      :key="i"
      @mouseenter="hover = i"
      @mouseleave="hover = null"
    >
      <div class="hbar-head">
        <span class="hbar-name">
          <svg
            v-if="i === 0"
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="currentColor"
            style="color: rgb(var(--v-theme-warning));"
          >
            <path d="M12 2 L14.6 8.6 L21.5 9.1 L16.2 13.5 L17.8 20.3 L12 16.7 L6.2 20.3 L7.8 13.5 L2.5 9.1 L9.4 8.6 Z" />
          </svg>
          {{ d.name }}
          <span
            v-if="d.units !== undefined"
            class="hbar-units"
          >· {{ d.units }} units</span>
        </span>
        <span class="hbar-val">{{ fmt(d.value) }}</span>
      </div>
      <div class="hbar-track">
        <div
          class="hbar-fill"
          :style="{
            width: `${(d.value / maxV) * 100}%`,
            background: i === 0
              ? `rgb(var(--v-theme-chart-revenue))`
              : `rgb(var(--v-theme-c4))`,
            opacity: hover !== null && hover !== i ? 0.6 : 1,
          }"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.hbar-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.hbar-name {
  font-weight: 500;
  font-size: var(--fs-sm);
  display: flex;
  align-items: center;
  gap: 7px;
  color: rgb(var(--v-theme-on-surface));
}
.hbar-units {
  font-size: var(--fs-label);
  color: rgb(var(--v-theme-text-tertiary));
}
.hbar-val {
  font-family: var(--font-mono);
  font-feature-settings: "tnum" 1;
  font-weight: 700;
  font-size: var(--fs-sm);
  color: rgb(var(--v-theme-on-surface));
}
.hbar-track {
  height: 10px;
  border-radius: 99px;
  background: rgb(var(--v-theme-chart-track));
  overflow: hidden;
}
.hbar-fill {
  height: 100%;
  border-radius: 99px;
  transition: width .5s cubic-bezier(.2,.8,.3,1), opacity .12s;
}
</style>
