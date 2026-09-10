<script setup lang="ts">
import DesignIcon from './DesignIcon.vue'
import DateInput from './DateInput.vue'
import { fieldContextKey } from './fieldContext'
import { designId } from './ids'
import { cx } from './utils'

interface Props {
  modelValue?: string | number | null
  icon?: string
  error?: boolean | string
  disabled?: boolean
  type?: string
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  type: 'text',
})

const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void
}>()

defineOptions({ inheritAttrs: false })

const attrs = useAttrs()
const field = inject(fieldContextKey, null)

const input = ref<HTMLInputElement | null>(null)
const dateInput = ref<{ focus: () => void } | null>(null)
const pickerType = computed(() => props.type as 'date' | 'time' | 'month' | 'datetime-local')
const dateType = computed(() => ['date', 'month', 'time', 'datetime-local'].includes(props.type))
function focus() { dateType.value ? dateInput.value?.focus() : input.value?.focus() }
function select() { input.value?.select() }
defineExpose({ focus, select })

const errorId = designId('input-error')

const describedBy = computed(() => {
  const ids = [attrs['aria-describedby'], field?.descriptionId.value]
  if (typeof props.error === 'string' && props.error && !field?.descriptionId.value)
    ids.push(errorId)
  return ids.filter(Boolean).join(' ') || undefined
})

const invalid = computed(() => !!props.error || !!field?.invalid.value)

const accessibleLabel = computed(() => {
  if (attrs['aria-label'])
    return String(attrs['aria-label'])
  if (field?.labelId)
    return undefined
  return attrs.placeholder ? String(attrs.placeholder) : undefined
})

const klass = computed(() =>
  cx('control', props.error && 'is-error', props.disabled && 'is-disabled'),
)

function onInput(ev: Event) {
  emit('update:modelValue', (ev.target as HTMLInputElement).value)
}

// Vue merges class/style bindings, so binding undefined does not remove them.
// Layout attributes belong to the wrapper; native field attributes stay intact.
function nativeAttrs() {
  return Object.fromEntries(Object.entries(attrs).filter(([key]) => key !== 'class' && key !== 'style'))
}
</script>

<template>
  <DateInput
    v-if="dateType"
    ref="dateInput"
    v-bind="$attrs"
    :type="pickerType"
    :model-value="modelValue"
    :disabled="disabled"
    :error="error"
    @update:model-value="emit('update:modelValue', $event)"
  />
  <div
    v-else
    :class="[klass, attrs.class]"
    :style="attrs.style as any"
  >
    <DesignIcon
      v-if="icon"
      :name="icon"
      :size="18"
    />
    <input
      ref="input"
      v-bind="nativeAttrs()"
      :type="type"
      :value="modelValue ?? ''"
      :disabled="disabled"
      :aria-label="accessibleLabel"
      :aria-labelledby="attrs['aria-label'] ? undefined : field?.labelId"
      :aria-describedby="describedBy"
      :aria-invalid="invalid ? 'true' : undefined"
      @input="onInput"
    >
    <span
      v-if="typeof error === 'string' && error && !field?.descriptionId.value"
      :id="errorId"
      class="visually-hidden"
    >{{ error }}</span>
  </div>
</template>
