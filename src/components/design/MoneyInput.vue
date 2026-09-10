<script setup lang="ts">
import DesignIcon from './DesignIcon.vue'
import { fieldContextKey } from './fieldContext'
import { designId } from './ids'
import { cx } from './utils'
import { caretAfterDigitCount, formatMoneyInput, parseMoneyInput } from '@/utils/moneyInput'

interface Props {
  modelValue?: number | null
  icon?: string
  error?: boolean | string
  disabled?: boolean
  allowFraction?: boolean
  maxFractionDigits?: number
  nullable?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: 0,
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: number | null): void
}>()

defineOptions({ inheritAttrs: false })

const attrs = useAttrs()
const field = inject(fieldContextKey, null)
const errorId = designId('money-input-error')
const displayValue = ref('')
const focused = ref(false)

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

function setDisplay(value: number | null | undefined) {
  const hasValue = value !== null && value !== undefined
  const shouldDisplay = hasValue && (props.nullable || Number(value) > 0)

  displayValue.value = shouldDisplay ? formatMoneyInput(String(value), props) : ''
}

watch(() => props.modelValue, value => {
  if (!focused.value)
    setDisplay(value)
}, { immediate: true })

function onInput(event: Event) {
  const input = event.target as HTMLInputElement
  const caretDigits = input.value.slice(0, input.selectionStart ?? input.value.length).replace(/\D/g, '').length
  const formatted = formatMoneyInput(input.value, props)
  const parsedAmount = parseMoneyInput(formatted, props)
  const amount = props.nullable ? parsedAmount : parsedAmount ?? 0

  displayValue.value = formatted
  emit('update:modelValue', amount)

  nextTick(() => {
    const caret = caretAfterDigitCount(formatted, caretDigits)

    input.setSelectionRange(caret, caret)
  })
}

function onFocus() {
  focused.value = true
}

function onBlur() {
  focused.value = false
  setDisplay(props.modelValue)
}
</script>

<template>
  <div :class="klass">
    <DesignIcon
      v-if="icon"
      :name="icon"
      :size="18"
    />
    <input
      v-bind="$attrs"
      :value="displayValue"
      type="text"
      :inputmode="allowFraction ? 'decimal' : 'numeric'"
      :disabled="disabled"
      :aria-label="accessibleLabel"
      :aria-labelledby="attrs['aria-label'] ? undefined : field?.labelId"
      :aria-describedby="describedBy"
      :aria-invalid="invalid ? 'true' : undefined"
      @input="onInput"
      @focus="onFocus"
      @blur="onBlur"
    >
    <span
      v-if="typeof error === 'string' && error && !field?.descriptionId.value"
      :id="errorId"
      class="visually-hidden"
    >{{ error }}</span>
  </div>
</template>
