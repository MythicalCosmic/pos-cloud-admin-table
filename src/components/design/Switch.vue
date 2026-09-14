<script setup lang="ts">
import { fieldContextKey } from './fieldContext'
import { cx } from './utils'

interface Props {
  modelValue?: boolean
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: false,
})

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'change', v: boolean): void
}>()

defineOptions({ inheritAttrs: false })

const attrs = useAttrs()
const field = inject(fieldContextKey, null)

const klass = computed(() => cx(
  'switch',
  props.modelValue && 'is-on',
  props.disabled && 'is-disabled',
))

function toggle() {
  if (props.disabled)
    return
  const next = !props.modelValue

  emit('update:modelValue', next)
  emit('change', next)
}
</script>

<template>
  <button
    v-bind="$attrs"
    type="button"
    :class="klass"
    role="switch"
    :aria-checked="modelValue"
    :aria-labelledby="attrs['aria-label'] || attrs['aria-labelledby'] ? undefined : field?.labelId"
    :disabled="disabled"
    @click.stop="toggle"
  />
</template>
