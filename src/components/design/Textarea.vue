<script setup lang="ts">
import { fieldContextKey } from './fieldContext'
import { designId } from './ids'
import { cx } from './utils'

interface Props {
  modelValue?: string | null
  error?: boolean | string
  disabled?: boolean
  rows?: number | string
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  rows: 4,
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

defineOptions({ inheritAttrs: false })

const attrs = useAttrs()
const field = inject(fieldContextKey, null)
const textarea = ref<HTMLTextAreaElement | null>(null)

defineExpose({ focus: () => textarea.value?.focus(), select: () => textarea.value?.select() })

const errorId = designId('textarea-error')

const describedBy = computed(() => {
  const ids = [attrs['aria-describedby'], field?.descriptionId.value]
  if (typeof props.error === 'string' && props.error && !field?.descriptionId.value)
    ids.push(errorId)

  return ids.filter(Boolean).join(' ') || undefined
})

const accessibleLabel = computed(() => {
  if (attrs['aria-label'])
    return String(attrs['aria-label'])
  if (field?.labelId)
    return undefined

  return attrs.placeholder ? String(attrs.placeholder) : undefined
})

function onInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLTextAreaElement).value)
}

function nativeAttrs() {
  return Object.fromEntries(Object.entries(attrs).filter(([key]) => key !== 'class' && key !== 'style'))
}
</script>

<template>
  <div
    :class="[cx('control', 'control--textarea', error && 'is-error', disabled && 'is-disabled'), attrs.class]"
    :style="attrs.style as any"
  >
    <textarea
      ref="textarea"
      v-bind="nativeAttrs()"
      :value="modelValue ?? ''"
      :rows="Number(rows)"
      :disabled="disabled"
      :aria-label="accessibleLabel"
      :aria-labelledby="attrs['aria-label'] ? undefined : field?.labelId"
      :aria-describedby="describedBy"
      :aria-invalid="error || field?.invalid.value ? 'true' : undefined"
      @input="onInput"
    />
    <span
      v-if="typeof error === 'string' && error && !field?.descriptionId.value"
      :id="errorId"
      class="visually-hidden"
    >{{ error }}</span>
  </div>
</template>

<style scoped>
.control--textarea {
  height: auto;
  min-height: 96px;
  padding: 10px 12px;
  align-items: stretch;
}

.control--textarea textarea {
  display: block;
  width: 100%;
  min-height: 74px;
  resize: vertical;
  border: 0;
  outline: 0;
  color: inherit;
  background: transparent;
  font: inherit;
  line-height: 1.45;
}
</style>
