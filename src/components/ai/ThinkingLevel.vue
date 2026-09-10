<script setup lang="ts">
import { designId } from '@/components/design/ids'

// Preview preference only. No model/effort field is sent before a backend contract exists.
const props = defineProps<{ modelValue: number; inDialog?: boolean }>()
const emit = defineEmits<{ (event: 'update:modelValue', value: number): void }>()
const { t } = useI18n({ useScope: 'global' })
const level = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) })
const inputId = designId('thinking-level')
const levels = ['low', 'medium', 'high', 'max']
</script>

<template>
  <div
    class="thinking-level"
    :class="{ 'thinking-level--dialog': inDialog }"
  >
    <header>
      <label
        :for="inputId"
        :class="{ 'sr-only': inDialog }"
      >{{ t('ai_thinking_level') }}</label><span>{{ t('ai_thinking_preview') }}</span>
    </header>
    <div class="thinking-level__input">
      <div
        class="thinking-level__track"
        aria-hidden="true"
      >
        <span :style="{ width: `${level / 3 * 100}%` }" /><i
          v-for="step in 4"
          :key="step"
          :style="{ left: `${(step - 1) / 3 * 100}%` }"
        />
      </div>
      <input
        :id="inputId"
        v-model.number="level"
        type="range"
        min="0"
        max="3"
        step="1"
        :aria-valuetext="t(`ai_thinking_${levels[level]}`)"
        :aria-describedby="`${inputId}-note`"
      >
    </div>
    <div class="thinking-level__labels">
      <button
        v-for="(value, index) in levels"
        :key="value"
        type="button"
        :aria-pressed="level === index"
        @click="level = index"
      >
        {{ t(`ai_thinking_${value}`) }}
      </button>
    </div>
    <p :id="`${inputId}-note`">
      {{ t('ai_thinking_not_connected') }}
    </p>
  </div>
</template>

<style scoped>
.thinking-level { padding: 14px 16px 10px; border-top: 1px solid var(--assistant-edge, var(--border)); background: var(--surface); }
.thinking-level header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.thinking-level label { font-size: 12px; font-weight: 600; }
.thinking-level header > span { padding: 3px 6px; border-radius: 5px; font-size: 9px; color: var(--text-secondary); background: var(--surface-2); }
.thinking-level__input { position: relative; margin-inline: 10px; height: 36px; }
.thinking-level__track { position: absolute; top: 17px; left: 0; right: 0; height: 4px; border-radius: 3px; background: var(--surface-inset); }
.thinking-level__track > span { display: block; height: 100%; background: linear-gradient(90deg, var(--primary), var(--c4)); border-radius: inherit; }
.thinking-level__track i { position: absolute; top: -1px; width: 6px; height: 6px; margin-left: -3px; border-radius: 50%; background: var(--border-strong); }
.thinking-level input { appearance: none; position: relative; width: 100%; height: 36px; margin: 0; outline: none; background: transparent; cursor: pointer; }
.thinking-level input::-webkit-slider-runnable-track { height: 4px; background: transparent; }
.thinking-level input::-moz-range-track { height: 4px; background: transparent; }
.thinking-level input::-webkit-slider-thumb { appearance: none; width: 18px; height: 18px; margin-top: -7px; border: 3px solid var(--surface); border-radius: 50%; background: var(--primary); box-shadow: 0 0 0 1px var(--primary), 0 2px 4px #15162520; }
.thinking-level input::-moz-range-thumb { width: 12px; height: 12px; border: 3px solid var(--surface); border-radius: 50%; background: var(--primary); box-shadow: 0 0 0 1px var(--primary); }
.thinking-level input:focus-visible { outline: 2px solid var(--primary); outline-offset: 3px; border-radius: 6px; }
.thinking-level__labels { display: flex; justify-content: space-between; gap: 4px; }
.thinking-level__labels button { padding: 3px 4px; color: var(--text-secondary); font-size: 10px; min-height: 28px; }
.thinking-level__labels button[aria-pressed="true"] { color: var(--primary); font-weight: 600; }
.thinking-level p { font-size: 10px; line-height: 1.5; margin: 6px 0 0; color: var(--text-secondary); }
@media (max-width: 1100px) { .thinking-level { border: 1px solid var(--border); border-radius: 12px; padding: 14px; } .thinking-level__input { height: 44px; } .thinking-level__track { top: 21px; } .thinking-level input { height: 44px; } .thinking-level__labels button { min-height: 36px; } }
.thinking-level--dialog { padding: 0 4px 8px; border: 0; background: transparent; }
.thinking-level--dialog header { justify-content: flex-end; }
.thinking-level--dialog .thinking-level__labels button { min-height: 44px; }
.thinking-level .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; padding: 0; border: 0; }
</style>
