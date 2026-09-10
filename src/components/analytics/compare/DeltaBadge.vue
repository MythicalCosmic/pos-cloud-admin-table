<script setup lang="ts">
/* Directional delta pill. Colour = direction × isUpGood (a rise in refunds is
   bad, so we never colour by raw sign). deltaPct===null means "New" (B was 0). */
import { badgeColor, type DeltaDirection } from '@/composables/useComparison'

const { t } = useI18n({ useScope: 'global' })

interface Props {
  deltaPct: number | null
  isUpGood?: boolean
  size?: 'sm' | 'md'
}
const props = withDefaults(defineProps<Props>(), {
  isUpGood: true,
  size: 'md',
})

const direction = computed<DeltaDirection>(() => {
  if (props.deltaPct === null) return 'new'
  if (props.deltaPct > 0) return 'up'
  if (props.deltaPct < 0) return 'down'
  return 'flat'
})
const tone = computed(() => badgeColor(direction.value, props.isUpGood))
const glyph = computed(() => {
  if (direction.value === 'up' || direction.value === 'new') return '▲'
  if (direction.value === 'down') return '▼'
  return '—'
})
const label = computed(() => {
  if (direction.value === 'new') return t('New')
  if (direction.value === 'flat') return '—'
  const v = Math.abs(Math.round(props.deltaPct! * 10) / 10).toFixed(1)
  return `${v}%`
})
const aria = computed(() => {
  if (direction.value === 'new') return t('New — no value in the baseline period')
  if (direction.value === 'flat') return t('No change')
  const dir = direction.value === 'up' ? t('up') : t('down')
  return `${dir} ${label.value}`
})
</script>

<template>
  <span
    class="deltabadge"
    :class="[`tone-${tone}`, `sz-${size}`]"
    :aria-label="aria"
  >
    <span
      v-if="direction !== 'flat'"
      class="deltabadge__glyph"
      aria-hidden="true"
    >{{ glyph }}</span>
    <span class="deltabadge__val">{{ label }}</span>
  </span>
</template>

<style scoped>
.deltabadge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  border-radius: 99px;
  font-family: var(--font-mono);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  white-space: nowrap;
}
.sz-md { font-size: 12px; padding: 4px 8px; }
.sz-sm { font-size: 11px; padding: 3px 7px; }
.deltabadge__glyph { font-size: 0.85em; }
.tone-positive { color: var(--color-positive); background: color-mix(in srgb, var(--color-positive) 12%, transparent); }
.tone-negative { color: var(--color-negative); background: color-mix(in srgb, var(--color-negative) 12%, transparent); }
.tone-neutral { color: var(--text-tertiary); background: var(--surface-2); }
</style>
