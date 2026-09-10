<script setup lang="ts">
import Switch from './Switch.vue'

const props = defineProps<{ modelValue?: boolean; label?: string; disabled?: boolean; readonly?: boolean; hint?: string; color?: string; density?: string; hideDetails?: boolean | string; inset?: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: boolean): void }>()
</script>

<template>
  <label class="form-switch">
    <span class="form-switch__copy"><span>{{ label }}</span><small v-if="hint">{{ hint }}</small></span>
    <Switch
      :model-value="props.modelValue"
      :disabled="disabled || readonly"
      :aria-label="label || ($attrs['aria-label'] as string)"
      @update:model-value="emit('update:modelValue', $event)"
    />
  </label>
</template>
