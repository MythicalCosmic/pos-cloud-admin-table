<script setup lang="ts">
import Input from './Input.vue'
import { fieldContextKey } from './fieldContext'
import { cx } from './utils'

interface Props {
  value?: string
  disabled?: boolean
  size?: 'sm'
  icon?: string
  step?: number
  label?: string
  error?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  value: '',
  step: 300,
})

const emit = defineEmits<{
  (e: 'update:value', v: string): void
}>()

defineOptions({ inheritAttrs: false })

const attrs = useAttrs()
const field = inject(fieldContextKey, null)
const ariaLabel = computed(() => props.label || (attrs['aria-label'] as string | undefined))

const describedBy = computed(() => {
  const ids = [attrs['aria-describedby'], field?.descriptionId.value]
  return ids.filter(Boolean).join(' ') || undefined
})

const klass = computed(() =>
  cx(
    'control',
    'control--time',
    props.size === 'sm' && 'control--sm',
    (props.error || field?.invalid.value) && 'is-error',
    props.disabled && 'is-disabled',
  ),
)
</script>

<template>
  <Input
    v-bind="$attrs"
    type="time"
    :model-value="value"
    :disabled="disabled"
    :step="step"
    :aria-label="ariaLabel"
    :aria-labelledby="ariaLabel ? undefined : field?.labelId"
    :aria-describedby="describedBy"
    :error="error"
    :class="klass"
    @update:model-value="emit('update:value', $event)"
  />
</template>
