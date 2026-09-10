<script setup lang="ts">
import { caretAfterDigitCount, formatMoneyInput, parseMoneyInput } from '@/utils/moneyInput'
const props = withDefaults(defineProps<{
  modelValue: number | null
  label?: string
  placeholder?: string
  density?: 'default' | 'comfortable' | 'compact'
  hideDetails?: boolean | 'auto'
  suffix?: string
  disabled?: boolean
  readonly?: boolean
}>(), {
  label: '',
  placeholder: '',
  density: 'compact',
  hideDetails: false,
  suffix: '',
  disabled: false,
  readonly: false,
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: number): void
}>()

// Format number with space as thousands separator: 1234567 → "1 234 567"
function formatWithSpaces(val: number | null): string {
  if (val === null || val === undefined)
    return ''
  return formatMoneyInput(String(val))
}

// Parse formatted string back to number: "1 234 567" → 1234567
function parseSpaces(val: string): number {
  return parseMoneyInput(val) ?? 0
}

const displayValue = ref(formatWithSpaces(props.modelValue))
const isFocused = ref(false)

// Sync from parent
watch(() => props.modelValue, newVal => {
  if (!isFocused.value)
    displayValue.value = formatWithSpaces(newVal)
})

function onInput(e: Event) {
  const input = e.target as HTMLInputElement
  const cursorPos = input.selectionStart ?? 0

  const oldVal = input.value
  const digitsBeforeCaret = oldVal.slice(0, cursorPos).replace(/\D/g, '').length
  const formatted = formatMoneyInput(oldVal)
  const num = parseMoneyInput(formatted) ?? 0

  displayValue.value = formatted
  emit('update:modelValue', num)

  nextTick(() => {
    const caret = caretAfterDigitCount(formatted, digitsBeforeCaret)
    input.setSelectionRange(caret, caret)
  })
}

function onFocus() {
  isFocused.value = true

  // If value is 0, clear input for easier typing
  if (props.modelValue === 0)
    displayValue.value = ''
}

function onBlur() {
  isFocused.value = false

  const num = parseSpaces(displayValue.value)

  displayValue.value = formatWithSpaces(num)
  emit('update:modelValue', num)
}

// Handle paste — clean and format
function onPaste(e: ClipboardEvent) {
  e.preventDefault()

  const pasted = e.clipboardData?.getData('text') ?? ''
  const formatted = formatMoneyInput(pasted)
  displayValue.value = formatted
  emit('update:modelValue', parseMoneyInput(formatted) ?? 0)
}

// Prevent non-numeric keys (allow navigation, backspace, delete, dot)
function onKeydown(e: KeyboardEvent) {
  const allowed = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab', 'Home', 'End']
  if (allowed.includes(e.key))
    return
  if (e.ctrlKey || e.metaKey)
    return // allow Ctrl+A, Ctrl+C, etc.
  if (!/^\d$/.test(e.key))
    e.preventDefault()
}
</script>

<template>
  <VTextField
    :model-value="displayValue"
    :label="props.label"
    :placeholder="props.placeholder"
    :density="props.density"
    :hide-details="props.hideDetails"
    :suffix="props.suffix"
    :disabled="props.disabled"
    :readonly="props.readonly"
    inputmode="numeric"
    @input="onInput"
    @focus="onFocus"
    @blur="onBlur"
    @paste="onPaste"
    @keydown="onKeydown"
  />
</template>
